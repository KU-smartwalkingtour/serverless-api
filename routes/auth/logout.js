const express = require('express');
const router = express.Router();
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈
const dynamoDB = require('../../config/dynamodb');
const { QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 사용자 로그아웃
 *     description: 액세스 토큰을 통해 인증된 사용자의 모든 리프레시 토큰을 무효화합니다.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그아웃이 성공적으로 완료되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *       401:
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 접근 거부
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. 해당 유저의 유효한(아직 revoked 안 된) 리프레시 토큰 목록 조회
    // PK: user_id, SK: TOKEN# 으로 시작하는 모든 항목
    const queryParams = {
      TableName: 'AUTH_DATA_TABLE',
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      FilterExpression: 'attribute_not_exists(revoked_at)', // 이미 취소된 건 제외
      ExpressionAttributeValues: {
        ':uid': userId,
        ':prefix': 'TOKEN#',
      },
    };

    const { Items: activeTokens } = await dynamoDB.send(new QueryCommand(queryParams));

    let invalidatedCount = 0;

    // 2. 조회된 토큰들을 하나씩 무효화 (Update)
    if (activeTokens && activeTokens.length > 0) {
      // 병렬 처리로 속도 향상
      const updatePromises = activeTokens.map((token) => {
        return dynamoDB.send(new UpdateCommand({
          TableName: 'AUTH_DATA_TABLE',
          Key: {
            user_id: userId,
            sort_key: token.sort_key, // 쿼리로 가져온 정확한 sort_key 사용
          },
          UpdateExpression: 'set revoked_at = :now',
          ExpressionAttributeValues: {
            ':now': new Date().toISOString(),
          },
        }));
      });

      await Promise.all(updatePromises);
      invalidatedCount = activeTokens.length;
    }

    logger.info(
      `사용자 로그아웃 처리 완료 - 사용자 ID: ${userId}, 무효화된 토큰 수: ${invalidatedCount}`,
    );
    res.status(200).json({ message: '로그아웃이 성공적으로 완료되었습니다.' });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`로그아웃 처리 중 오류: ${error.message}`, { userId: req.user.id });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
