const express = require('express');
const router = express.Router();
const { UserSavedCourse, UserCourseHistory } = require('@models');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /course/saved:
 *   get:
 *     summary: 사용자가 저장한 모든 코스 조회
 *     description: 사용자가 저장한 코스 목록을 최신순으로 조회합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 저장된 코스 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSavedCourse'
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const savedCourses = await UserSavedCourse.findAll({
      where: { user_id: req.user.id },
      order: [['saved_at', 'DESC']],
    });
    res.json(savedCourses);
  } catch (error) {
    logger.error(`저장된 코스 조회 오류: ${error.message}`);
    res.status(500).json({ error: '저장된 코스를 조회하는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/history:
 *   get:
 *     summary: 사용자의 최근 코스 조회 히스토리
 *     description: 사용자가 최근에 조회한 코스 히스토리를 최신순으로 조회합니다 (최대 50개).
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 최근 조회한 코스 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserCourseHistory'
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const history = await UserCourseHistory.findAll({
      where: { user_id: req.user.id },
      order: [['viewed_at', 'DESC']],
      limit: 50,
    });
    res.json(history);
  } catch (error) {
    logger.error(`코스 히스토리 조회 오류: ${error.message}`);
    res.status(500).json({ error: '코스 히스토리를 조회하는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/save:
 *   post:
 *     summary: 코스를 사용자 목록에 저장
 *     description: 지정된 코스를 사용자의 저장 목록에 추가합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, courseId]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [seoul_trail, durunubi]
 *                 description: 코스의 제공자
 *                 example: seoul_trail
 *               courseId:
 *                 type: string
 *                 description: 저장할 코스의 제공자별 고유 ID
 *                 example: seoul_trail_001
 *     responses:
 *       201:
 *         description: 코스가 성공적으로 저장되었습니다.
 *       200:
 *         description: 코스가 이미 저장되어 있습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.post('/save', authenticateToken, async (req, res) => {
  try {
    const { provider, courseId } = req.body;
    if (!courseId || !provider) {
      return res.status(400).json({ error: 'provider와 courseId는 필수입니다.' });
    }

    if (!['seoul_trail', 'durunubi'].includes(provider)) {
      return res
        .status(400)
        .json({ error: "제공자는 'seoul_trail' 또는 'durunubi' 중 하나여야 합니다." });
    }

    const [savedCourse, created] = await UserSavedCourse.findOrCreate({
      where: {
        user_id: req.user.id,
        provider: provider,
        provider_course_id: courseId.toString(),
      },
    });

    if (created) {
      res.status(201).json({ message: '코스가 성공적으로 저장되었습니다.', data: savedCourse });
    } else {
      res.status(200).json({ message: '코스가 이미 저장되어 있습니다.', data: savedCourse });
    }
  } catch (error) {
    logger.error(`코스 저장 오류: ${error.message}`);
    res.status(500).json({ error: '코스를 저장하는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/unsave:
 *   post:
 *     summary: 코스를 사용자 목록에서 삭제
 *     description: 저장된 코스를 사용자의 저장 목록에서 제거합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, courseId]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [seoul_trail, durunubi]
 *                 description: 코스의 제공자
 *                 example: seoul_trail
 *               courseId:
 *                 type: string
 *                 description: 삭제할 코스의 제공자별 고유 ID
 *                 example: seoul_trail_001
 *     responses:
 *       200:
 *         description: 코스가 성공적으로 삭제되었습니다.
 *       404:
 *         description: 저장 목록에서 코스를 찾을 수 없습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.post('/unsave', authenticateToken, async (req, res) => {
  try {
    const { provider, courseId } = req.body;
    if (!courseId || !provider) {
      return res.status(400).json({ error: 'provider와 courseId는 필수입니다.' });
    }

    if (!['seoul_trail', 'durunubi'].includes(provider)) {
      return res
        .status(400)
        .json({ error: "제공자는 'seoul_trail' 또는 'durunubi' 중 하나여야 합니다." });
    }

    const deletedCount = await UserSavedCourse.destroy({
      where: {
        user_id: req.user.id,
        provider: provider,
        provider_course_id: courseId.toString(),
      },
    });

    if (deletedCount > 0) {
      res.status(200).json({ message: '코스가 성공적으로 삭제되었습니다.' });
    } else {
      res.status(404).json({ message: '저장 목록에서 코스를 찾을 수 없습니다.' });
    }
  } catch (error) {
    logger.error(`코스 삭제 오류: ${error.message}`);
    res.status(500).json({ error: '코스를 삭제하는 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
