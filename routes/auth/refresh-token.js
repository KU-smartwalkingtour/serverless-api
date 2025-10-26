const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const { User, AuthRefreshToken } = require('@models');
const { validate, refreshTokenSchema } = require('@utils/validation');

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
 *       403:
 *         description: 유효하지 않거나 만료된 리프레시 토큰
 *       500:
 *         description: 서버 오류
 */
router.post('/', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // 토큰 해시 생성 및 검증
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await AuthRefreshToken.findOne({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { [Sequelize.Op.gt]: new Date() },
      },
    });

    if (!storedToken) {
      return res.status(403).json({ error: '유효하지 않거나 만료된 리프레시 토큰입니다.' });
    }

    // 사용자 조회
    const user = await User.findByPk(storedToken.user_id);
    if (!user) {
      return res.status(403).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 새 액세스 토큰 발급
    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({ accessToken });
  } catch (error) {
    logger.error(`토큰 갱신 중 오류 발생: ${error.message}`);
    res.status(500).json({ error: '토큰 갱신 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
