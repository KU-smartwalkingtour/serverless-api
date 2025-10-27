const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const summaryRouter = require('./summary');
const airQualityRouter = require('./airQuality');

// 라우트 등록
router.use('/', summaryRouter);
router.use('/', airQualityRouter);

module.exports = router;
