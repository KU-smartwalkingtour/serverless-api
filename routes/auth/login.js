const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { generateTokens } = require('@utils/auth');
const { validate, loginSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 관련 모듈
const dynamoDB = require('../../config/dynamoDB');
const { QueryCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * 사용자 정보를 안전한 형태로 변환
 * @param {Object} user - Sequelize 사용자 객체
 * @returns {Object} 클라이언트에 반환할 사용자 정보
 */
const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     description: 이메일과 비밀번호로 로그인하고 액세스 토큰을 발급받습니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 사용자 이메일
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 비밀번호
 *                 example: password123
 *     responses:
 *       200:
 *         description: 로그인 성공. 토큰과 사용자 정보가 반환됩니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: 입력값이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 이메일 또는 비밀번호가 일치하지 않음
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
router.post('/', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. 이메일로 사용자 찾기 (USER_TABLE -> EmailIndex 사용)
    const userQuery = {
      TableName: 'USER_TABLE',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    };

    const { Items: users } = await dynamoDB.send(new QueryCommand(userQuery));
    const userProfile = users && users.length > 0 ? users[0] : null;

    // 유저가 없거나 비활성 상태면 에러
    if (!userProfile || userProfile.is_active === false) {
      logger.warn('로그인 실패: 사용자를 찾을 수 없거나 비활성 상태', { email });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    const userId = userProfile.user_id;

    // 2. 비밀번호 가져오기 (AUTH_DATA_TABLE -> PASSWORD_ITEM 조회)
    // ★ 중요: 비밀번호는 별도 테이블(AUTH_DATA_TABLE)에 있습니다!
    const passwordQuery = {
      TableName: 'AUTH_DATA_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'PASSWORD_ITEM',
      },
    };

    const { Item: authData } = await dynamoDB.send(new GetCommand(passwordQuery));

    if (!authData || !authData.password_hash) {
      logger.warn('로그인 실패: 비밀번호 정보 없음 (소셜 로그인 유저?)', { userId });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // 3. 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, authData.password_hash);
    if (!isPasswordValid) {
      logger.warn('로그인 실패: 비밀번호 불일치', { userId, email });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // 4. 새 토큰 발급 및 저장
    // generateTokens가 payload까지 다 만들어줍니다.
    const { accessToken, refreshToken, refreshTokenPayload } = await generateTokens({
      id: userId,
      email: userProfile.email,
      nickname: userProfile.nickname,
    });

    // 5. 리프레시 토큰 DynamoDB에 저장 (AUTH_DATA_TABLE)
    // 기존 SQL 로직은 "모든 토큰 폐기"였으나, NoSQL에서는 보통 "새 토큰 추가"로 처리합니다.
    // (모든 토큰 폐기는 비용이 크기 때문)
    await dynamoDB.send(new PutCommand({
      TableName: 'AUTH_DATA_TABLE',
      Item: refreshTokenPayload
    }));

    logger.info('사용자 로그인 성공', { userId, email });

    res.status(200).json({
      accessToken,
      refreshToken,
      user: sanitizeUser(userProfile),
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('로그인 중 예상치 못한 오류', { error: error.message });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
