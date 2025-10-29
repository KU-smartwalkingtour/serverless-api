const express = require('express');
const router = express.Router();
const { Course } = require('@models');
const { getCourseMetadata } = require('@utils/course/course-metadata');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logCourseView, getProviderFromCourseId } = require('@utils/course/course-helpers');

/**
 * @swagger
 * /courses/{courseId}:
 *   get:
 *     summary: 코스 상세 메타데이터 조회
 *     description: 코스 ID로 코스의 상세 메타데이터를 조회하고, 최근 본 코스에 추가합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 코스의 제공자별 고유 ID
 *         example: seoultrail_1
 *     responses:
 *       200:
 *         description: 코스 메타데이터 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       401:
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 코스를 찾을 수 없습니다.
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
router.get('/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    logger.info(`코스 메타데이터 조회: courseId=${courseId}`);

    // DB에서 코스 메타데이터 조회
    const metadata = await getCourseMetadata(courseId);
    if (!metadata) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    res.json(metadata);

    // 비동기로 코스 조회 기록 (응답 후 실행)
    const provider = getProviderFromCourseId(courseId);
    logCourseView(userId, courseId, provider);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`코스 메타데이터 조회 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
