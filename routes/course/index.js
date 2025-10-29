const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const searchRouter = require('./search');
const infoRouter = require('./info');
const savedRouter = require('./saved');
const homeRouter = require('./home');
const listRouter = require('./list');
const detailRouter = require('./detail');
const coursesRouter = require('./courses');


// 라우트 등록
router.use('/', searchRouter);
router.use('/', infoRouter);
router.use('/', savedRouter);

router.use('/home', homeRouter);
router.use('/courses', coursesRouter);
router.use('/', detailRouter);
router.use('/', listRouter);


module.exports = router;
