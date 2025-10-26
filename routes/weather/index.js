const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Weather
 *   description: 날씨 정보
 */

// 라우트 핸들러 가져오기
const summaryRouter = require('./summary');
const airQualityRouter = require('./air-quality');

// 라우트 등록
router.use('/', summaryRouter);
router.use('/', airQualityRouter);

module.exports = router;
