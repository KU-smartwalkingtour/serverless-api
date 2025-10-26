const express = require('express');
const router = express.Router();
const { findClosestCourse, findNClosestCourses } = require('@utils/course/closest-course');
const { getRandomCourses } = require('@utils/course/random-course');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

/**
 * @swagger
 * /course/find-closest:
 *   get:
 *     summary: 현재 위치에서 가장 가까운 산책 코스 찾기
 *     description: 주어진 위도와 경도를 기준으로 가장 가까운 산책 코스를 검색합니다.
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
 *     responses:
 *       200:
 *         description: 가장 가까운 코스를 찾았습니다.
 *       400:
 *         description: 위도 또는 경도 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스를 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.get('/find-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat } = req.query;
    if (lon == null || lat == null) {
      return res.status(400).json({ error: '경도(lon)와 위도(lat)는 필수 쿼리 파라미터입니다.' });
    }
    const closestCourse = await findClosestCourse(parseFloat(lat), parseFloat(lon));
    if (closestCourse) {
      res.json({ closestCourse });
    } else {
      res
        .status(404)
        .json({ error: '코스를 찾을 수 없거나 가장 가까운 코스를 결정할 수 없습니다.' });
    }
  } catch (error) {
    logger.error(`가장 가까운 코스 찾기 오류: ${error.message}`);
    res.status(500).json({ error: '가장 가까운 코스를 찾는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/find-n-closest:
 *   get:
 *     summary: 현재 위치에서 가까운 N개의 산책 코스 찾기
 *     description: 주어진 위도와 경도를 기준으로 가까운 N개의 산책 코스를 검색합니다.
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
 *         description: 찾을 코스의 개수
 *         example: 5
 *     responses:
 *       200:
 *         description: 가까운 N개의 코스 목록
 *       400:
 *         description: 위도, 경도 또는 개수 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 코스를 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.get('/find-n-closest', authenticateToken, async (req, res) => {
  try {
    const { lon, lat, n } = req.query;
    if (lon == null || lat == null || n == null) {
      return res
        .status(400)
        .json({ error: '경도(lon), 위도(lat), 개수(n)는 필수 쿼리 파라미터입니다.' });
    }
    const closestCourses = await findNClosestCourses(parseFloat(lat), parseFloat(lon), parseInt(n));
    if (closestCourses) {
      res.json({ closestCourses });
    } else {
      res
        .status(404)
        .json({ error: '코스를 찾을 수 없거나 가장 가까운 코스들을 결정할 수 없습니다.' });
    }
  } catch (error) {
    logger.error(`가까운 코스들 찾기 오류: ${error.message}`);
    res.status(500).json({ error: '가까운 코스들을 찾는 중 오류가 발생했습니다.' });
  }
});

/**
 * @swagger
 * /course/find-n-random:
 *   get:
 *     summary: 랜덤으로 N개의 코스 ID 조회
 *     description: 데이터베이스에서 랜덤으로 N개의 코스를 선택하여 ID 목록을 반환합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: n
 *         required: true
 *         schema: { type: integer }
 *         description: 가져올 랜덤 코스의 개수
 *         example: 5
 *     responses:
 *       200:
 *         description: 랜덤 코스 ID 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 randomCourses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["seoultrail_1", "durunubi_123", "seoultrail_8"]
 *       400:
 *         description: n 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/find-n-random', authenticateToken, async (req, res) => {
  try {
    const { n } = req.query;
    const count = parseInt(n, 10);

    if (isNaN(count) || count <= 0) {
      return res.status(400).json({ error: 'n은 0보다 큰 정수여야 합니다.' });
    }

    const randomCourses = await getRandomCourses(count);
    res.json({ randomCourses });
  } catch (error) {
    logger.error(`랜덤 코스 조회 오류: ${error.message}`);
    res.status(500).json({ error: '랜덤 코스를 조회하는 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
