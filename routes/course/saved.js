// const express = require('express');
// const router = express.Router();
// const { UserSavedCourse, UserCourseHistory } = require('@models');
// const { logger } = require('@utils/logger');
// const { authenticateToken } = require('@middleware/auth');
// const { ServerError, ERROR_CODES } = require('@utils/error');

// module.exports = router;
// routes/course/saved.js
// Revised to use DynamoDB instead of RDB

const express = require('express');
const router = express.Router();
const {
  getUserSavedCourses,
  saveCourse,
  unsaveCourse,
  getCourseDetail,
} = require('../../services/courseService');
const { logger } = require('../../utils/logger');
const { authenticateToken } = require('../../middleware/auth');
const { ServerError, ERROR_CODES } = require('../../utils/error');

/**
 * @swagger
 * /courses/saved:
 *   get:
 *     summary: 사용자의 저장된 코스 목록 조회
 *     description: 사용자가 저장한 코스를 저장 최신순으로 조회합니다. 각 코스는 상세 메타데이터와 saved_at 필드를 포함합니다.
 *     tags: [Course]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 저장된 코스 목록 (저장 최신순)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Course'
 *                   - type: object
 *                     properties:
 *                       saved_at:
 *                         type: string
 *                         format: date-time
 *                         description: 코스가 저장된 시각
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    logger.info(`[DynamoDB] 저장된 코스 목록 조회 요청: userId=${userId}`);

    // 1. 저장된 코스 기본 정보들 조회 (SAVED# 아이템들)
    const savedItems = await getUserSavedCourses(userId);

    if (savedItems.length === 0) {
      return res.json([]);
    }

    // 2. 각 코스의 상세 정보 병합 + saved_at 추가
    const coursesWithDetail = await Promise.all(
      savedItems.map(async (item) => {
        const detail = await getCourseDetail(item.course_id);
        if (!detail) {
          logger.warn(`[DynamoDB] 저장된 코스인데 상세 정보를 찾을 수 없음: courseId=${item.course_id}`);
          return null;
        }
        return {
          ...detail,
          saved_at: item.saved_at, // 저장 시각 추가
        };
      })
    );

    // 3. null 제거 (코스가 삭제된 경우 등)
    const validCourses = coursesWithDetail.filter(c => c !== null);

    // 4. 저장 시각 기준 내림차순 정렬 (최신 저장된 코스가 위로)
    validCourses.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));

    logger.info(`[DynamoDB] 저장된 코스 목록 반환: ${validCourses.length}개`);
    res.json(validCourses);
  } catch (error) {
    logger.error('[DynamoDB] 저장된 코스 목록 조회 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /courses/saved/{courseId}:
 *   post:
 *     summary: 코스 저장 (찜하기)
 *     description: 해당 코스를 사용자의 저장 목록에 추가합니다. 이미 저장되어 있으면 saved_at만 갱신됩니다.
 *     tags: [Course]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 저장할 코스 ID
 *     responses:
 *       201:
 *         description: 코스 저장 성공
 *       404:
 *         description: 코스를 찾을 수 없음
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.post('/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    logger.info(`[DynamoDB] 코스 저장 요청: userId=${userId}, courseId=${courseId}`);

    // 코스 존재 여부 및 최소 정보 확인
    const courseData = await getCourseDetail(courseId);
    if (!courseData) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    await saveCourse(userId, courseData);

    logger.info(`[DynamoDB] 코스 저장 완료: userId=${userId}, courseId=${courseId}`);
    res.status(201).json({ message: '코스가 저장되었습니다.' });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error('[DynamoDB] 코스 저장 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /courses/saved/{courseId}:
 *   delete:
 *     summary: 저장된 코스 삭제 (찜 해제)
 *     description: 사용자의 저장 목록에서 해당 코스를 제거합니다.
 *     tags: [Course]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 저장 해제할 코스 ID
 *     responses:
 *       200:
 *         description: 코스 저장 해제 성공
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.delete('/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    logger.info(`[DynamoDB] 코스 저장 해제 요청: userId=${userId}, courseId=${courseId}`);

    await unsaveCourse(userId, courseId);

    logger.info(`[DynamoDB] 코스 저장 해제 완료: userId=${userId}, courseId=${courseId}`);
    res.json({ message: '코스 저장이 해제되었습니다.' });
  } catch (error) {
    logger.error('[DynamoDB] 코스 저장 해제 오류:', error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;