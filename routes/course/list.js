const express = require('express');
const router = express.Router();
const { Course } = require('@models');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { formatDuration, mapDifficulty } = require('@utils/course/course-helpers');
const { getDistance } = require('@utils/course/closest-course');

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: 코스 탭에서 코스 목록 조회
 *     description: 현재 위치를 기준으로 N개의 코스를 조회하며, 정렬 기준을 적용할 수 있습니다.
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
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [difficulty, distance, length] }
 *         description: 정렬 기준 (difficulty, distance, length)
 *         example: distance
 *     responses:
 *       200:
 *         description: 코스 목록 조회 성공
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
    const { lat, lon, n, sortBy } = req.query;

    if (!lat || !lon || !n) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    let courses = await Course.findAll();

    if (sortBy === 'distance') {
      courses.sort((a, b) => {
        const distanceA = getDistance(lat, lon, a.start_lat, a.start_lon);
        const distanceB = getDistance(lat, lon, b.start_lat, b.start_lon);
        return distanceA - distanceB;
      });
    } else if (sortBy === 'length') {
      courses.sort((a, b) => b.course_length - a.course_length);
    } else if (sortBy === 'difficulty') {
        const difficultyOrder = { '하': 1, '중': 2, '상': 3 };
        courses.sort((a, b) => difficultyOrder[a.course_difficulty] - difficultyOrder[b.course_difficulty]);
    }

    const paginatedCourses = courses.slice(0, parseInt(n));

    const formattedCourses = paginatedCourses.map(course => ({
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

    logger.error('코스 목록 조회 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
