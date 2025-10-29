const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const infoRouter = require('./info');
const savedRouter = require('./saved');
const homeRouter = require('./home');
const detailRouter = require('./detail');
const coursesListRouter = require('./courses');


// 라우트 등록
router.use('/', infoRouter);
router.use('/', savedRouter);

router.use('/home', homeRouter);
router.use('/', coursesListRouter);  // /courses → /courses/ (중복 제거)
router.use('/', detailRouter);


module.exports = router;
