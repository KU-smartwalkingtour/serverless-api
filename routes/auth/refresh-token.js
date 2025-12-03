const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { User, AuthRefreshToken } = require('@models');
const { generateTokens, hashToken } = require('@utils/auth');
const { validate, refreshTokenSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈
const dynamoDB = require('../../config/dynamoDB');
const { QueryCommand, GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: 리프레시 토큰으로 새 액세스 토큰 발급
 *     description: 유효한 리프레시 토큰을 사용하여 새로운 액세스 토큰을 발급받습니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: 리프레시 토큰
 *     responses:
 *       200:
 *         description: 새 액세스 토큰 및 리프레시 토큰이 성공적으로 발급되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: 새로 발급된 JWT 액세스 토큰
 *                 refreshToken:
 *                   type: string
 *                   description: 새로 발급된 리프레시 토큰 (Refresh Token Rotation)
 *       400:
 *         description: 입력값이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 유효하지 않거나 만료된 리프레시 토큰
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
router.post('/', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // 1. 토큰 해시 생성
    const requestTokenHash = hashToken(refreshToken);

    // 2. GSI를 사용하여 토큰 주인 찾기 (AUTH_DATA_TABLE -> TokenHashIndex)
    // 조건: 해시값이 같고, revoked_at이 없으며(유효), 만료시간(expires_at)이 미래인 것
    const tokenQueryParams = {
      TableName: 'AUTH_DATA_TABLE',
      IndexName: 'TokenHashIndex', // ★ 중요: 아까 만든 인덱스 이름
      KeyConditionExpression: 'token_hash = :hash',
      FilterExpression: 'attribute_not_exists(revoked_at) AND expires_at > :now',
      ExpressionAttributeValues: {
        ':hash': requestTokenHash,
        ':now': new Date().toISOString(),
      },
    };

    const { Items: tokens } = await dynamoDB.send(new QueryCommand(tokenQueryParams));
    const storedToken = tokens && tokens.length > 0 ? tokens[0] : null;

    if (!storedToken) {
      logger.warn('리프레시 토큰 검증 실패: 토큰을 찾을 수 없거나 만료됨/폐기됨');
      throw new ServerError(ERROR_CODES.TOKEN_EXPIRED, 403);
    }

    const userId = storedToken.user_id;

    // 3. 유저 정보 확인 (USER_TABLE)
    // 토큰은 있는데 유저가 탈퇴했거나 정지된 상태일 수 있으므로 확인 필수
    const userQueryParams = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_INFO_ITEM',
      },
    };

    const { Item: userProfile } = await dynamoDB.send(new GetCommand(userQueryParams));

    if (!userProfile || userProfile.is_active === false) {
      logger.warn('토큰 갱신 실패: 사용자를 찾을 수 없거나 비활성 상태', { userId });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 403);
    }

    // 4. 새 토큰 생성 (Rotation)
    // id 필드 이름을 맞춰서 넘겨줘야 합니다. (DynamoDB: user_id -> JWT: id)
    const { 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken, 
      refreshTokenPayload 
    } = await generateTokens({
      id: userProfile.user_id,
      email: userProfile.email,
      nickname: userProfile.nickname
    });

    // 5. 트랜잭션 실행 (기존 토큰 폐기 + 새 토큰 저장)
    const transactItems = [
      {
        // [A] 기존 토큰 폐기 (Update)
        Update: {
          TableName: 'AUTH_DATA_TABLE',
          Key: {
            user_id: userId,
            sort_key: storedToken.sort_key, // GSI 조회로 알아낸 원본 SK (TOKEN#...)
          },
          UpdateExpression: 'set revoked_at = :now',
          ExpressionAttributeValues: {
            ':now': new Date().toISOString(),
          },
        },
      },
      {
        // [B] 새 토큰 저장 (Put)
        Put: {
          TableName: 'AUTH_DATA_TABLE',
          Item: refreshTokenPayload,
        },
      },
    ];

    await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }));

    logger.info('토큰 갱신 완료 (Refresh Token Rotation)', { userId });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('토큰 갱신 중 예상치 못한 오류', { error: error.message });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
