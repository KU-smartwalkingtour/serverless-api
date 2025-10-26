const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { AuthRefreshToken } = require('@models');
const { validate, refreshTokenSchema } = require('@utils/validation');

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 사용자 로그아웃
 *     description: 리프레시 토큰을 무효화하여 사용자를 로그아웃 처리합니다.
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
 *                 description: 무효화할 리프레시 토큰
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
 *       400:
 *         description: 입력값이 유효하지 않음
 */
router.post('/', validate(refreshTokenSchema), async (req, res) => {
  const { refreshToken } = req.body;

  // 리프레시 토큰 무효화
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await AuthRefreshToken.update(
    { revoked_at: new Date() },
    {
      where: { token_hash: tokenHash },
    },
  );

  logger.info('사용자 로그아웃 처리 완료');
  res.status(200).json({ message: '로그아웃이 성공적으로 완료되었습니다.' });
});

module.exports = router;
