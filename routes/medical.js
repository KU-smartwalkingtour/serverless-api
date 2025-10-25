// routes/medical.js

const express = require('express');
const router = express.Router();
// 💡 utils/medical.js 파일에서 로직을 가져옵니다.
const { fetchNearbyFacilities } = require('../utils/medical'); 
// MedicalError가 있다면 사용, 없다면 다른 에러 클래스를 가정합니다.
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


router.get('/nearby', authenticateToken, async (req, res) => {
    try {
        const { lon, lat } = req.query;

        if (!lon || !lat) {
            return res.status(400).json({ 
                error: 'Latitude(lat) and Longitude(lon) are required query parameters.' 
            });
        }

        // 💡 utils/medical의 통신 함수를 호출합니다.
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
});


module.exports = router;