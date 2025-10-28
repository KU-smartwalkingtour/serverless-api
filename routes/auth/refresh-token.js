const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const { User, AuthRefreshToken } = require('@models');
const { validate, refreshTokenSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// 상수 정의
const ACCESS_TOKEN_EXPIRY = '15m';

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
 *         description: 새 액세스 토큰이 성공적으로 발급되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: 새로 발급된 JWT 액세스 토큰
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

    // 새 액세스 토큰 발급
    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    logger.info('액세스 토큰 갱신 완료', {
      userId: user.id,
    });

    res.json({ accessToken });
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
