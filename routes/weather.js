const express = require('express');
const router = express.Router();
const { getWeatherSummary, getAirQualitySummary } = require('../utils/weather');
const WeatherError = require('../utils/error');
const { log } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Weather
 *   description: Weather information
 */

/**
 * @swagger
 * /weather/summary:
 *   get:
 *     summary: Get weather summary
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lon
 *         schema:
 *           type: string
 *         required: true
 *         description: Longitude
 *       - in: query
 *         name: lat
 *         schema:
 *           type: string
 *         required: true
 *         description: Latitude
 *     responses:
 *       200:
 *         description: Successful response with weather summary
 *       400:
 *         description: Latitude(lat) and Longitude(lon) are required
 *       401:
 *         description: Unauthorized (token not provided)
 *       403:
 *         description: Forbidden (invalid token)
 *       500:
 *         description: An error occurred while fetching weather data
 */

router.get('/summary', authenticateToken, async (req, res) => { // Add authenticateToken middleware here
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      return res.status(400).json({ 
        error: 'Latitude(lat) and Longitude(lon) are required query parameters.' 
      });
    }

    const weatherSummary = await getWeatherSummary(lon, lat);
    res.json(weatherSummary);

  } catch (error) {
    if (error instanceof WeatherError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      log('error', `Error fetching weather data: ${error.message}`);
      res.status(500).json({ error: 'An error occurred while fetching weather data.' });
    }
  }
});

/**
 * @swagger
 * /weather/airquality:
 *   get:
 *     summary: Get current air quality by coordinates
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
                error: 'Latitude(lat) and Longitude(lon) are required query parameters.'
            });
        }

        // 새로 만든 getAirQualitySummary 함수를 호출합니다.
        const airQualityData = await getAirQualitySummary(lon, lat);

        if (airQualityData === null) {
            // getAirQualitySummary 내부에서 null을 반환한 경우 (API 실패 등)
            return res.status(404).json({ error: 'Air quality data is currently unavailable for this location.' });
        }

        res.json(airQualityData); // 성공 시 대기 질 데이터 반환

    } catch (error) {
        // getNearestStationName에서 발생한 에러 등 처리
        const statusCode = error instanceof WeatherError ? error.statusCode : 500;
        const message = error.message || 'An error occurred while fetching air quality data.';
        log('error', `Error fetching air quality: ${message}`);
        res.status(statusCode).json({ error: message });
    }
});

module.exports = router;