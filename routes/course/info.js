const express = require('express');
const router = express.Router();
const { getCourseCoordinates } = require('@utils/course/course-gpx');
const { getProviderFromCourseId, logCourseView } = require('@utils/course/course-helpers');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /courses/coordinates:
 *   get:
 *     summary: 특정 코스의 GPS 좌표 조회
 *     description: 코스 ID로 코스 경로의 모든 GPS 좌표를 조회합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 코스의 제공자별 고유 ID
 *         example: seoultrail_1
 *     responses:
 *       200:
 *         description: 코스 경로의 좌표 배열
 *       400:
 *         description: courseId 파라미터가 누락되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스 파일을 찾을 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/coordinates', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }
    const coordinates = await getCourseCoordinates(courseId);
    if (!coordinates) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }
    res.json(coordinates);

    // provider를 courseId 기반으로 동적으로 결정
    const provider = getProviderFromCourseId(courseId);
    logCourseView(req.user.id, courseId, provider);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`코스 좌표 조회 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
