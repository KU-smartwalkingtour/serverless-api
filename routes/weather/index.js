const express = require('express');
const router = express.Router();
const { getWeatherSummary, getAirQualitySummary } = require('@utils/weather');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

// 라우트 핸들러 가져오기
const summaryRouter = require('./summary');
const airQualityRouter = require('./airQuality');

/**
 * @swagger
 * /weather:
 *   get:
 *     summary: 날씨 및 대기질 통합 정보 조회
 *     description: 주어진 위도와 경도에 대한 날씨와 대기질 정보를 통합하여 조회합니다.
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
 *         description: 날씨 및 대기질 정보가 성공적으로 조회되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 weather:
 *                   type: object
 *                   description: 날씨 정보
 *                 airQuality:
 *                   type: object
 *                   description: 대기질 정보
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
 *         description: 데이터를 조회하는 중 오류가 발생했습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;

    if (!lon || !lat) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    logger.info(`날씨 및 대기질 통합 정보 조회 요청: lat=${lat}, lon=${lon}`);

    // 날씨와 대기질 정보를 병렬로 조회
    const [weatherData, airQualityData] = await Promise.allSettled([
      getWeatherSummary(lon, lat),
      getAirQualitySummary(lon, lat),
    ]);

    // 응답 데이터 구성
    const response = {
      weather: weatherData.status === 'fulfilled' ? weatherData.value : null,
      airQuality: airQualityData.status === 'fulfilled' ? airQualityData.value : null,
    };

    // 날씨 조회 실패 시 경고 로그
    if (weatherData.status === 'rejected') {
      logger.warn(`날씨 정보 조회 실패: ${weatherData.reason?.message}`, {
        lat,
        lon,
        error: weatherData.reason?.message,
      });
    }

    // 대기질 조회 실패 시 경고 로그
    if (airQualityData.status === 'rejected') {
      logger.warn(`대기질 정보 조회 실패: ${airQualityData.reason?.message}`, {
        lat,
        lon,
        error: airQualityData.reason?.message,
      });
    }

    // 둘 다 실패한 경우에만 500 에러 반환
    if (weatherData.status === 'rejected' && airQualityData.status === 'rejected') {
      logger.error('날씨 및 대기질 정보 조회 모두 실패', { lat, lon });
      throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500);
    }

    res.json(response);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`날씨 및 대기질 통합 조회 오류: ${error.message}`, { error: error.message });
    const serverError = new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

// 개별 라우트 등록 (하위 경로)
router.use('/', summaryRouter);
router.use('/', airQualityRouter);

module.exports = router;
