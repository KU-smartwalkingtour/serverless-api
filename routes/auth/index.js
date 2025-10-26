const express = require('express');
const router = express.Router();

// 라우트 핸들러 가져오기
const registerRouter = require('./register');
const loginRouter = require('./login');
const refreshTokenRouter = require('./refresh-token');
const logoutRouter = require('./logout');
const forgotPasswordRouter = require('./forgot-password');

// 라우트 등록
router.use('/register', registerRouter);
router.use('/login', loginRouter);
router.use('/refresh-token', refreshTokenRouter);
router.use('/logout', logoutRouter);
router.use('/forgot-password', forgotPasswordRouter);

module.exports = router;
