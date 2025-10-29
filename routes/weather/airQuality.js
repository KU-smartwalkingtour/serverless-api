const express = require('express');
const router = express.Router();
const { getAirQualitySummary } = require('@utils/weather');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /weather/airquality:
 *   get:
 *     summary: 대기질 정보 조회
 *     description: 주어진 위도와 경도에 대한 대기질 정보를 조회합니다.
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
 *       '200':
 *         description: Successful response with air quality data
 *       '400':
 *         description: Latitude(lat) and Longitude(lon) are required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: 인증되지 않음 (토큰 미제공)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: 접근 거부 (유효하지 않은 토큰)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Could not find nearest station or air quality data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: An error occurred while fetching data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/airquality', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    // 새로 만든 getAirQualitySummary 함수를 호출합니다.
    const airQualityData = await getAirQualitySummary(lon, lat);

    if (airQualityData === null) {
      // getAirQualitySummary 내부에서 null을 반환한 경우 (API 실패 등)
      throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, 404);
    }

    res.json(airQualityData); // 성공 시 대기 질 데이터 반환
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`대기질 데이터 조회 오류: ${error.message}`, { error: error.message });
    const serverError = new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
