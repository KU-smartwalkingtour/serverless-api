const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const searchRouter = require('./search');
const infoRouter = require('./info');
const savedRouter = require('./saved');

// 라우트 등록
router.use('/', searchRouter);
router.use('/', infoRouter);
router.use('/', savedRouter);

module.exports = router;
