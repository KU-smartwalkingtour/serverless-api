const express = require('express');
const router = express.Router();
const { Course } = require('@models');
const { findNClosestCourses } = require('@utils/course/closest-course');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { formatDuration, mapDifficulty } = require('@utils/course/course-helpers');

/**
 * @swagger
 * /courses/home:
 *   get:
 *     summary: 홈 탭에서 가까운 코스 목록 조회
 *     description: 현재 위치를 기준으로 가까운 순서대로 N개의 코스를 조회합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, format: float }
 *         description: 사용자의 위도
 *         example: 37.5665
 *       - in: query
 *         name: lon
 *         required: true
 *         schema: { type: number, format: float }
 *         description: 사용자의 경도
 *         example: 126.9780
 *       - in: query
 *         name: n
 *         required: true
 *         schema: { type: integer }
 *         description: 조회할 코스의 개수
 *         example: 5
 *     responses:
 *       200:
 *         description: 가까운 코스 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   course_name: { type: string }
 *                   course_difficulty: { type: string }
 *                   course_discription: { type: string }
 *                   course_length: { type: string }
 *                   course_duration: { type: string }
 *                   course_type: { type: string }
 *       400:
 *         description: 잘못된 요청 파라미터
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { lat, lon, n } = req.query;

    if (!lat || !lon || !n) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    const courseIds = await findNClosestCourses(parseFloat(lat), parseFloat(lon), parseInt(n));

    const courses = await Course.findAll({
      where: {
        course_id: courseIds,
      },
    });

    const formattedCourses = courses.map(course => ({
      course_name: course.course_name,
      course_difficulty: mapDifficulty(course.course_difficulty),
      course_discription: course.course_description,
      course_length: course.course_length,
      course_duration: formatDuration(course.course_duration),
      course_type: course.course_type,
    }));

    res.json(formattedCourses);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('가까운 코스 목록 조회 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
