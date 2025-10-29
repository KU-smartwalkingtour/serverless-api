const express = require('express');
const router = express.Router();
const { Course } = require('@models');
const { getDistance } = require('@utils/course/closest-course');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: 코스 탭에서 코스 목록 조회 (정렬 및 난이도 필터링)
 *     description: 현재 위치를 기준으로 N개의 코스를 조회하며, 정렬 기준과 난이도 필터링을 적용할 수 있습니다.
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
 *         schema: { type: string, enum: [distance, length, difficulty] }
 *         description: 정렬 기준 (distance=거리순, length=길이순, difficulty=난이도순)
 *         example: distance
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [하, 중, 상] }
 *         description: 난이도 필터 (하, 중, 상) - 선택사항
 *         example: 하
 *     responses:
 *       200:
 *         description: 코스 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Course'
 *       400:
 *         description: 잘못된 요청 파라미터
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증되지 않음
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
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { lat, lon, n, sortBy, difficulty } = req.query;

    if (!lat || !lon || !n) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
    }

    logger.info(`코스 목록 조회 요청: lat=${lat}, lon=${lon}, n=${n}, sortBy=${sortBy}, difficulty=${difficulty}`);

    // 모든 코스 조회
    let courses = await Course.findAll();

    // 난이도 필터링 (선택사항)
    if (difficulty) {
      courses = courses.filter((course) => course.course_difficulty === difficulty);
      logger.info(`난이도 필터링 적용: ${difficulty}, 결과 개수: ${courses.length}`);
    }

    // 정렬 기준 적용
    if (sortBy === 'distance') {
      // 거리순 정렬 (가까운 순)
      courses.sort((a, b) => {
        const distanceA = getDistance(parseFloat(lat), parseFloat(lon), a.start_lat, a.start_lon);
        const distanceB = getDistance(parseFloat(lat), parseFloat(lon), b.start_lat, b.start_lon);
        return distanceA - distanceB;
      });
      logger.info('거리순 정렬 적용');
    } else if (sortBy === 'length') {
      // 길이순 정렬 (긴 순)
      courses.sort((a, b) => b.course_length - a.course_length);
      logger.info('길이순 정렬 적용');
    } else if (sortBy === 'difficulty') {
      // 난이도순 정렬 (하 → 중 → 상)
      const difficultyOrder = { 하: 1, 중: 2, 상: 3 };
      courses.sort((a, b) => difficultyOrder[a.course_difficulty] - difficultyOrder[b.course_difficulty]);
      logger.info('난이도순 정렬 적용');
    } else {
      // 기본: 거리순 정렬
      courses.sort((a, b) => {
        const distanceA = getDistance(parseFloat(lat), parseFloat(lon), a.start_lat, a.start_lon);
        const distanceB = getDistance(parseFloat(lat), parseFloat(lon), b.start_lat, b.start_lon);
        return distanceA - distanceB;
      });
      logger.info('기본 거리순 정렬 적용');
    }

    // N개로 제한
    const paginatedCourses = courses.slice(0, parseInt(n));

    logger.info(`코스 목록 조회 완료: ${paginatedCourses.length}개 반환`);
    res.json(paginatedCourses);
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
