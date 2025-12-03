// const express = require('express');
// const router = express.Router();

// // 라우트 핸들러 가져오기
// const infoRouter = require('./info');
// const savedRouter = require('./saved');
// const homeRouter = require('./home');
// const detailRouter = require('./detail');
// const coursesListRouter = require('./courses');

// // 라우트 등록
// router.use('/', infoRouter);
// router.use('/', savedRouter);

// router.use('/home', homeRouter);
// router.use('/', coursesListRouter);  // /courses → /courses/ (중복 제거)
// router.use('/', detailRouter);

// module.exports = router;

//-----------------------------------------------------------------------------
// 여기서부터는 Revised to use DynamoDB instead of RDB
const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const infoRouter = require('./info');
const homeRouter = require('./home');
const detailRouter = require('./detail');
const coursesListRouter = require('./courses');
const savedRouter = require('./saved');

// 라우트 등록
router.use('/', infoRouter);        // GPS 좌표 등 (기존 유지)
router.use('/home', homeRouter);    // 홈 화면 (DynamoDB 적용됨)
router.use('/', coursesListRouter); // 목록 조회 (DynamoDB 적용됨)
router.use('/', detailRouter);      // 상세 조회 (DynamoDB 적용됨)
router.use('/saved', savedRouter);

module.exports = router;
