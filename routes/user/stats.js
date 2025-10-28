const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { UserStat } = require('@models');
const { validate, logWalkSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /user/stats:
 *   get:
 *     summary: 사용자의 통계 조회
 *     description: 인증된 사용자의 걷기 통계 정보를 조회합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 사용자의 통계 정보
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStat'
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // 사용자 통계 조회 또는 생성
    const [stats] = await UserStat.findOrCreate({
      where: { user_id: req.user.id },
    });
    res.json(stats);
  } catch (error) {
    logger.error(`사용자 통계 조회 중 오류 발생: ${error.message}`);
    res.status(500).json({ error: '통계 조회 처리 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /user/stats/walk:
 *   post:
 *     summary: 사용자의 총 걷기 거리에 거리 추가
 *     description: 새로 걸은 거리를 기록하여 사용자의 총 걷기 거리에 추가합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [distance_km]
 *             properties:
 *               distance_km:
 *                 type: number
 *                 format: float
 *                 description: 걸은 거리 (킬로미터, 양수)
 *                 example: 5.2
 *     responses:
 *       200:
 *         description: 걷기 거리가 성공적으로 기록되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *                 new_total:
 *                   type: number
 *                   description: 업데이트된 총 걷기 거리 (km)
 *       400:
 *         description: 입력값이 유효하지 않음
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.post('/walk', authenticateToken, validate(logWalkSchema), async (req, res) => {
  try {
    const { distance_km } = req.body;

    // 사용자 통계 조회 또는 생성
    const [stats] = await UserStat.findOrCreate({
      where: { user_id: req.user.id },
    });

    // 걷기 거리 증가
    await stats.increment('total_walk_distance_km', { by: distance_km });

    const newTotal = parseFloat(stats.total_walk_distance_km) + parseFloat(distance_km);

    logger.info(`${distance_km}km 걷기 기록: ${req.user.email}`);
    res
      .status(200)
      .json({ message: '걷기 거리가 성공적으로 기록되었습니다.', new_total: newTotal });
  } catch (error) {
    logger.error(`걷기 거리 기록 중 오류 발생: ${error.message}`);
    res.status(500).json({ error: '걷기 거리 기록 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
