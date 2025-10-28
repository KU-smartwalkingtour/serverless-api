const express = require('express');
const router = express.Router();
const { fetchNearbyFacilities } = require('@utils/medical');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /medical/nearby:
 *   get:
 *     tags:
 *       - Medical
 *     summary: 주변 병원/약국 조회
 *     description: 주어진 위도와 경도를 기준으로 주변 병원 및 약국 정보를 조회합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: string
 *         required: true
 *         description: WGS84_Y (위도)
 *         example: "37.5665"
 *       - in: query
 *         name: lon
 *         schema:
 *           type: string
 *         required: true
 *         description: WGS84_X (경도)
 *         example: "126.9780"
 *     responses:
 *       '200':
 *         description: 주변 병원/약국 목록이 성공적으로 조회되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       '400':
 *         description: 위도와 경도는 필수 파라미터입니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: 인증되지 않음
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
 *       '500':
 *         description: 병원/약국 데이터를 조회하는 중 오류가 발생했습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

router.get('/nearby', authenticateToken, async (req, res) => {
  try {
    let { lon, lat } = req.query;

    if (!lon || !lat) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    // 위도와 경도가 뒤바뀐 경우 자동 교정
    const isLatSwapped = parseFloat(lat) > 90 && parseFloat(lon) < 90;
    if (isLatSwapped) {
      const temp = lat;
      lat = lon;
      lon = temp;
    }

    const medicalFacilities = await fetchNearbyFacilities(lat, lon);
    res.json(medicalFacilities);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`병원/약국 데이터 조회 오류: ${error.message}`, { error: error.message });
    const serverError = new ServerError(ERROR_CODES.MEDICAL_API_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
