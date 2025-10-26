const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and authorization
 */

// Import route handlers
const registerRouter = require('./register');
const loginRouter = require('./login');
const refreshTokenRouter = require('./refresh-token');
const logoutRouter = require('./logout');
const forgotPasswordRouter = require('./forgot-password');
const resetPasswordRouter = require('./reset-password');

// Register routes
router.use('/register', registerRouter);
router.use('/login', loginRouter);
router.use('/refresh-token', refreshTokenRouter);
router.use('/logout', logoutRouter);
router.use('/forgot-password', forgotPasswordRouter);
router.use('/reset-password', resetPasswordRouter);

module.exports = router;
