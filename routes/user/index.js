const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User
 *   description: User profile, stats, and location
 */

// Import route handlers
const profileRouter = require('./profile');
const locationRouter = require('./location');
const statsRouter = require('./stats');

// Register routes
router.use('/profile', profileRouter);
router.use('/location', locationRouter);
router.use('/stats', statsRouter);

module.exports = router;
