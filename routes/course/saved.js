const express = require('express');
const router = express.Router();
const { UserSavedCourse, UserCourseHistory } = require('@models');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');


module.exports = router;
