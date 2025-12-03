const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈 (경로: ../../)
const dynamoDB = require('../../config/dynamoDB');
const { GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: 현재 사용자 프로필 조회
 *     description: 인증된 사용자의 프로필 정보를 조회합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 사용자의 프로필 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: 이메일 주소
 *                 nickname:
 *                   type: string
 *                   description: 닉네임
 *                 language:
 *                   type: string
 *                   description: 선호 언어
 *                 distance_unit:
 *                   type: string
 *                   enum: [km, mi]
 *                   description: 거리 단위
 *                 is_dark_mode_enabled:
 *                   type: boolean
 *                   description: 다크 모드 활성화 여부
 *                 allow_location_storage:
 *                   type: boolean
 *                   description: 위치 정보 저장 허용 여부
 *                 saved_courses_count:
 *                   type: integer
 *                   description: 저장한 코스 개수
 *                 recent_courses_count:
 *                   type: integer
 *                   description: 최근 본 코스 개수
 *       401:
 *         description: 인증되지 않음
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // middleware/auth.js에서 user_id를 매핑해줬으므로 req.user.id 사용 가능
    const userId = req.user.id;

    // 1. 기본 프로필 정보 가져오기 (USER_TABLE)
    const userParams = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_INFO_ITEM',
      },
    };

    const userResult = await dynamoDB.send(new GetCommand(userParams));
    
    if (!userResult.Item) {
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    const user = userResult.Item;

    // 2. 저장된 코스 개수 카운트 (USER_COURSE_TABLE -> SAVED#)
    const savedCoursesParams = {
      TableName: 'USER_COURSE_TABLE',
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :sk)',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':sk': 'SAVED#',
      },
      Select: 'COUNT', // 데이터 대신 개수만 가져옴 (비용 절약)
    };
    
    // 3. 최근 본 코스 개수 카운트 (USER_COURSE_TABLE -> RECENT#)
    const recentCoursesParams = {
      TableName: 'USER_COURSE_TABLE',
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :sk)',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':sk': 'RECENT#', 
      },
      Select: 'COUNT',
    };

    // 병렬로 요청하여 속도 향상
    const [savedCountResult, recentCountResult] = await Promise.all([
        dynamoDB.send(new QueryCommand(savedCoursesParams)),
        dynamoDB.send(new QueryCommand(recentCoursesParams))
    ]);

    res.json({
      email: user.email,
      nickname: user.nickname,
      language: user.language || 'ko',
      distance_unit: user.distance_unit || 'km',
      is_dark_mode_enabled: user.is_dark_mode_enabled || false,
      allow_location_storage: user.allow_location_storage || false,
      saved_courses_count: savedCountResult.Count || 0,
      recent_courses_count: recentCountResult.Count || 0,
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`Error fetching user profile: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/withdraw:
 *   delete:
 *     summary: 사용자 회원탈퇴 (Soft Delete)
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 회원탈퇴 처리가 완료되었습니다.
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: 사용자를 찾을 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/withdraw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();

    // 1. USER_TABLE에서 is_active=false, deleted_at 업데이트 (Soft Delete)
    const updateProfileParams = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_INFO_ITEM',
      },
      UpdateExpression: 'set is_active = :active, deleted_at = :deletedAt',
      ExpressionAttributeValues: {
        ':active': false,
        ':deletedAt': now,
      },
      ConditionExpression: 'attribute_exists(user_id)',
    };

    await dynamoDB.send(new UpdateCommand(updateProfileParams));

    // 2. [추가된 로직] 토큰 무효화 (Logout과 동일한 로직)
    // 2-1. 유효한 토큰 조회
    const tokenQueryParams = {
      TableName: 'AUTH_DATA_TABLE',
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      FilterExpression: 'attribute_not_exists(revoked_at)', // 아직 살아있는 것만
      ExpressionAttributeValues: {
        ':uid': userId,
        ':prefix': 'TOKEN#',
      },
    };

    const { Items: activeTokens } = await dynamoDB.send(new QueryCommand(tokenQueryParams));

    let revokedCount = 0;

    // 2-2. 조회된 토큰들 무효화 처리
    if (activeTokens && activeTokens.length > 0) {
      const updatePromises = activeTokens.map((token) => {
        return dynamoDB.send(new UpdateCommand({
          TableName: 'AUTH_DATA_TABLE',
          Key: {
            user_id: userId,
            sort_key: token.sort_key,
          },
          UpdateExpression: 'set revoked_at = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        }));
      });

      await Promise.all(updatePromises);
      revokedCount = activeTokens.length;
    }

    logger.info(`User soft deleted: ${req.user.email} (토큰 ${revokedCount}개 무효화)`);
    res.status(200).json({ message: '회원탈퇴 처리가 완료되었습니다.' });

  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
        const notFoundError = new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
        return res.status(notFoundError.statusCode).json(notFoundError.toJSON());
    }
    
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`Error deleting user: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
