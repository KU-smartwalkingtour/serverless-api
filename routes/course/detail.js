const express = require('express');
const router = express.Router();
const { Course } = require('@models');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { formatDuration, mapDifficulty, logCourseView, getProviderFromCourseId } = require('@utils/course/course-helpers');

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: 코스 상세 정보 조회
 *     description: 특정 코스의 상세 정보를 조회하고, 최근 본 코스에 추가합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 조회할 코스의 ID
 *         example: seoultrail_1-1
 *     responses:
 *       200:
 *         description: 코스 상세 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 course_name: { type: string }
 *                 course_length: { type: string }
 *                 course_duration: { type: string }
 *                 course_difficulty: { type: string }
 *                 course_discription: { type: string }
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const course = await Course.findByPk(id);
    console.log(course);

    if (!course) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    const provider = getProviderFromCourseId(id);
    await logCourseView(userId, id, provider);

    const formattedCourse = {
      course_name: course.course_name,
      course_length: course.course_length,
      course_duration: formatDuration(course.course_duration),
      course_difficulty: mapDifficulty(course.course_difficulty),
      course_discription: course.course_description,
    };

    res.json(formattedCourse);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('코스 상세 정보 조회 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
