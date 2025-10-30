const express = require('express');
const router = express.Router();
const { getWeatherSummary } = require('@utils/weather');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /weather/summary:
 *   get:
 *     summary: 날씨 요약 정보 조회
 *     description: 주어진 위도와 경도에 대한 현재 날씨 요약 정보를 조회합니다.
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lon
 *         schema:
 *           type: string
 *         required: true
 *         description: 경도
 *         example: "126.9780"
 *       - in: query
 *         name: lat
 *         schema:
 *           type: string
 *         required: true
 *         description: 위도
 *         example: "37.5665"
 *     responses:
 *       200:
 *         description: 날씨 요약 정보가 성공적으로 조회되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IntegratedWeatherResponse'
 *       400:
 *         description: 위도와 경도는 필수 파라미터입니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증되지 않음 (토큰 미제공)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 접근 거부 (유효하지 않은 토큰)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 날씨 데이터를 조회하는 중 오류가 발생했습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    const weatherSummary = await getWeatherSummary(lon, lat);
    res.json(weatherSummary);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`날씨 데이터 조회 오류: ${error.message}`, { error: error.message });
    const serverError = new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
