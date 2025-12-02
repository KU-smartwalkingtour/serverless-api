const express = require('express');
const router = express.Router();
const { UserSavedCourse, UserCourseHistory } = require('@models');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');

module.exports = router;