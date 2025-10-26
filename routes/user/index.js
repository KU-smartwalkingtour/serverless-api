const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const profileRouter = require('./profile'); 
const locationRouter = require('./location');
const statsRouter = require('./stats');
const settingsRouter = require('./settings'); 

const savedCoursesRouter = require('./savedCourses'); 
const historyRouter = require('./history');       

// 라우트 등록
router.use('/', profileRouter); 
router.use('/coordinates', locationRouter);
router.use('/stats', statsRouter);
router.use('/settings', settingsRouter);
router.use('/courses/saved', savedCoursesRouter);
router.use('/courses/history', historyRouter);

module.exports = router;