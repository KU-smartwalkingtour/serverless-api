const express = require('express');
const router = express.Router();
const { getWeatherSummary, getAirQualitySummary } = require('@utils/weather');
const WeatherError = require('@utils/error');
const { logger } = require('@utils/logger'); // master의 'logger'로 변경
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Weather
 *   description: 날씨 정보
 */

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
 *       400:
 *         description: 위도와 경도는 필수 파라미터입니다.
 *       401:
 *         description: 인증되지 않음 (토큰 미제공)
 *       403:
 *         description: 접근 거부 (유효하지 않은 토큰)
 *       500:
 *         description: 날씨 데이터를 조회하는 중 오류가 발생했습니다.
 */

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      return res.status(400).json({
        error: '위도(lat)와 경도(lon)는 필수 쿼리 파라미터입니다.',
      });
    }

    const weatherSummary = await getWeatherSummary(lon, lat);
    res.json(weatherSummary);
  } catch (error) {
    if (error instanceof WeatherError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error(`날씨 데이터 조회 오류: ${error.message}`);
      res.status(500).json({ error: '날씨 데이터를 조회하는 중 오류가 발생했습니다.' });
    }
  }
});

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
 *         type: string
 *         required: true
 *         description: Longitude
 *       - in: query
 *         name: lat
 *         schema:
 *           type: string
 *         required: true
 *         description: Latitude
 *     responses:
 *       '200':
 *         description: Successful response with air quality data
 *       '400':
 *         description: Latitude(lat) and Longitude(lon) are required
 *       '404':
 *         description: Could not find nearest station or air quality data
 *       '500':
 *         description: An error occurred while fetching data
 */
router.get('/airquality', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      return res.status(400).json({
        error: 'Latitude(lat) and Longitude(lon) are required query parameters.',
      });
    }

    // 새로 만든 getAirQualitySummary 함수를 호출합니다.
    const airQualityData = await getAirQualitySummary(lon, lat);

    if (airQualityData === null) {
      // getAirQualitySummary 내부에서 null을 반환한 경우 (API 실패 등)
      return res
        .status(404)
        .json({ error: 'Air quality data is currently unavailable for this location.' });
    }

    res.json(airQualityData); // 성공 시 대기 질 데이터 반환
  } catch (error) {
    // getNearestStationName에서 발생한 에러 등 처리
    const statusCode = error instanceof WeatherError ? error.statusCode : 500;
    const message = error.message || 'An error occurred while fetching air quality data.';
    logger.error(`Error fetching air quality: ${message}`);
    res.status(statusCode).json({ error: message });
  }
});

module.exports = router;
