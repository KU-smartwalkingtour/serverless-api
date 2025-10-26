const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { UserLocation } = require('@models');
const { validate, updateLocationSchema } = require('@utils/validation');

/**
 * @swagger
 * /user/coordinates:
 *   put:
 *     summary: 사용자의 마지막 위치 업데이트
 *     description: 인증된 사용자의 현재 위치 정보(위도, 경도)를 업데이트합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *                 format: float
 *                 description: 위도 (-90 ~ 90)
 *                 example: 37.5665
 *               longitude:
 *                 type: number
 *                 format: float
 *                 description: 경도 (-180 ~ 180)
 *                 example: 126.9780
 *     responses:
 *       '200':
 *         description: 위치가 성공적으로 업데이트되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *       '400':
 *         description: 입력값이 유효하지 않음
 *       '401':
 *         description: 인증되지 않음
 *       '500':
 *         description: 서버 오류
 */
router.put('/', authenticateToken, validate(updateLocationSchema), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    // 사용자 위치 업데이트 또는 생성
    await UserLocation.upsert({
      user_id: req.user.id,
      latitude,
      longitude,
    });

    res.status(200).json({ message: '위치가 성공적으로 업데이트되었습니다.' });
  } catch (error) {
    logger.error(`사용자 위치 업데이트 중 오류 발생: ${error.message}`);
    res.status(500).json({ error: '위치 업데이트 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
