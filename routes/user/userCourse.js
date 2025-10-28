const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { UserSavedCourse, UserCourseHistory } = require('@models');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * tags:
 *   name: User Courses
 *   description: 사용자 저장 코스 및 히스토리 관리 (User 도메인 하위)
 */

/**
 * @swagger
 * /user/courses/saved:
 *   get:
 *     summary: 사용자 저장된 코스 목록 조회
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 저장된 코스 목록 (최신순)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSavedCourse'
 *       '401':
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const savedCourses = await UserSavedCourse.findAll({
      where: { user_id: userId },
      order: [['saved_at', 'DESC']], // 저장된 시간 최신순 정렬
    });

    res.json(savedCourses);
  } catch (error) {
    logger.error(`저장된 코스 조회 중 오류 (user: ${req.user.id}): ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/history:
 *   get:
 *     summary: 사용자 최근 본 코스 목록 조회
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 최근 본 코스 목록 (최신순, 최대 50개)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserCourseHistory'
 *       '401':
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await UserCourseHistory.findAll({
      where: { user_id: userId },
      order: [['viewed_at', 'DESC']], // 본 시간 최신순 정렬
      limit: 50, // 최근 50개 제한
    });

    res.json(history);
  } catch (error) {
    logger.error(`코스 히스토리 조회 중 오류 (user: ${req.user.id}): ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
