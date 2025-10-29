const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const sequelize = require('@config/database');
const { User, AuthRefreshToken } = require('@models');
const { generateTokens } = require('@utils/auth');
const { validate, refreshTokenSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * 리프레시 토큰을 SHA256 해시로 변환
 * @param {string} token - 원본 리프레시 토큰
 * @returns {string} SHA256 해시 문자열
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

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

    // 토큰 해시 생성
    const tokenHash = hashToken(refreshToken);

    // 데이터베이스에서 유효한 리프레시 토큰 조회
    const storedToken = await AuthRefreshToken.findOne({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { [Sequelize.Op.gt]: new Date() },
      },
    });

    if (!storedToken) {
      logger.warn('리프레시 토큰 검증 실패: 토큰을 찾을 수 없거나 만료됨');
      throw new ServerError(ERROR_CODES.TOKEN_EXPIRED, 403);
    }

    // 활성 사용자 조회
    const user = await User.findOne({
      where: { id: storedToken.user_id, is_active: true },
    });

    if (!user) {
      logger.warn('토큰 갱신 실패: 사용자를 찾을 수 없거나 비활성 상태', {
        userId: storedToken.user_id,
      });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 403);
    }

    // Refresh Token Rotation: 트랜잭션으로 기존 토큰 폐기 + 새 토큰 발급
    let newAccessToken, newRefreshToken;

    await sequelize.transaction(async (t) => {
      // 1. 기존 리프레시 토큰 폐기
      await storedToken.update({ revoked_at: new Date() }, { transaction: t });

      logger.info('기존 리프레시 토큰 폐기 완료', {
        userId: user.id,
        tokenId: storedToken.id,
      });

      // 2. 새 액세스 토큰 및 리프레시 토큰 발급
      const tokens = await generateTokens(user);
      newAccessToken = tokens.accessToken;
      newRefreshToken = tokens.refreshToken;
    });

    logger.info('토큰 갱신 완료 (Refresh Token Rotation)', {
      userId: user.id,
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('토큰 갱신 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
