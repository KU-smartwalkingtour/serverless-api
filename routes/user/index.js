const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const profileRouter = require('./profile');
const locationRouter = require('./location');
const statsRouter = require('./stats');
const passwordRouter = require('./password');

// 라우트 등록
router.use('/profile', profileRouter);
router.use('/location', locationRouter);
router.use('/stats', statsRouter);
router.use('/password', passwordRouter);

module.exports = router;
