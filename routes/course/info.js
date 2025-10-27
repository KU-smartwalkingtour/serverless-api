const express = require('express');
const router = express.Router();
const { getCourseCoordinates } = require('@utils/course/course-gpx');
const { getCourseMetadata } = require('@utils/course/course-metadata');
const { getProviderFromCourseId, logCourseView } = require('@utils/course/course-helpers');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /course/metadata:
 *   get:
 *     summary: 특정 코스의 메타데이터 조회
 *     description: 코스 ID로 코스의 상세 메타데이터를 조회합니다.
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
 *         description: 코스 메타데이터
 *       400:
 *         description: courseId 파라미터가 누락되었습니다.
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스 파일을 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.get('/metadata', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId는 필수 쿼리 파라미터입니다.' });
    }
    const metadata = await getCourseMetadata(courseId);
    if (!metadata) {
      return res.status(404).json({ error: '코스를 찾을 수 없습니다.' });
    }
    res.json(metadata);

    // provider를 courseId 기반으로 동적으로 결정
    const provider = getProviderFromCourseId(courseId);
    logCourseView(req.user.id, courseId, provider);
  } catch (error) {
    logger.error(`코스 메타데이터 조회 오류: ${error.message}`);
    res.status(500).json({ error: '코스 메타데이터를 조회하는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/coordinates:
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
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스 파일을 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.get('/coordinates', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId는 필수 쿼리 파라미터입니다.' });
    }
    const coordinates = await getCourseCoordinates(courseId);
    if (!coordinates) {
      return res.status(404).json({ error: '코스 파일을 찾을 수 없거나 좌표를 읽을 수 없습니다.' });
    }
    res.json(coordinates);

    // provider를 courseId 기반으로 동적으로 결정
    const provider = getProviderFromCourseId(courseId);
    logCourseView(req.user.id, courseId, provider);
  } catch (error) {
    logger.error(`코스 좌표 조회 오류: ${error.message}`);
    res.status(500).json({ error: '코스 좌표를 조회하는 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
