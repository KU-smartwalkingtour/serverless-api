const express = require('express');
const router = express.Router();
const { getWeatherSummary } = require('../utils/weather');
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
 * /api/weather/summary:
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

module.exports = router;