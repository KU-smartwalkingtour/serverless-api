// routes/medical.js

const express = require('express');
const router = express.Router();
const { fetchNearbyFacilities } = require('../utils/medical');
const MedicalError = require('../utils/error');
const { log } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Medical
 *     description: 병원 및 약국 안전 정보
 */

/**
 * @swagger
 * /medical/nearby:
 *   get:
 *     tags:
 *       - Medical
 *     summary: 주변 병원/약국 조회
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: string
 *         required: true
 *         description: WGS84_Y (위도)
 *       - in: query
 *         name: lon
 *         schema:
 *           type: string
 *         required: true
 *         description: WGS84_X (경도)
 *     responses:
 *       '200':
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */

router.get(
  '/nearby',
  /* authenticateToken, */ async (req, res) => {
    try {
      let { lon, lat } = req.query;

      if (!lon || !lat) {
        return res.status(400).json({
          error: 'Latitude(lat) and Longitude(lon) are required query parameters.',
        });
      }
      const isLatSwapped = parseFloat(lat) > 90 && parseFloat(lon) < 90;

      if (isLatSwapped) {
        // 값이 뒤바뀌었으면 임시 변수를 이용해 교정합니다.
        const temp = lat;
        lat = lon;
        lon = temp;
      }

      const medicalFacilities = await fetchNearbyFacilities(lat, lon);

      res.json(medicalFacilities);
    } catch (error) {
      if (error instanceof MedicalError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        log('error', `Error fetching medical data: ${error.message}`);
        res.status(500).json({ error: 'An error occurred while fetching medical data.' });
      }
    }
  },
);

module.exports = router;
