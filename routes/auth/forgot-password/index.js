const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const sendRouter = require('./send');
const verifyRouter = require('./verify');

// 라우트 등록
router.use('/send', sendRouter);
router.use('/verify', verifyRouter);

module.exports = router;
