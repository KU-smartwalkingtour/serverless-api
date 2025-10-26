const express = require('express');
const router = express.Router();
const { logger } = require('@utils/logger');
const { AuthRefreshToken } = require('@models');
const { authenticateToken } = require('@middleware/auth');

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
 *       403:
 *         description: 접근 거부
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    // 인증된 사용자의 모든 리프레시 토큰 무효화
    const result = await AuthRefreshToken.update(
      { revoked_at: new Date() },
      {
        where: {
          user_id: req.user.id,
          revoked_at: null, // 아직 무효화되지 않은 토큰만
        },
      },
    );

    logger.info(`사용자 로그아웃 처리 완료 - 사용자 ID: ${req.user.id}, 무효화된 토큰 수: ${result[0]}`);
    res.status(200).json({ message: '로그아웃이 성공적으로 완료되었습니다.' });
  } catch (error) {
    logger.error(`로그아웃 처리 중 오류: ${error.message}`, { userId: req.user.id });
    res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
