const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { User, UserSavedCourse, UserCourseHistory } = require('@models'); // User 모델도 여기서 가져옵니다.

/**
 * @swagger
 * /user/settings:
 *   get:
 *     summary: 사용자 설정 화면 조회 (거리단위, 저장된 코스 개수, 최근 본 코스 개수)
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 사용자 설정 및 코스 개수 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 distance_unit:
 *                   type: string
 *                   enum: [km, mi]
 *                   description: 사용자가 설정한 거리 단위
 *                 saved_courses_count:
 *                   type: integer
 *                   description: 저장된 코스 총 개수
 *                 history_courses_count:
 *                   type: integer
 *                   description: 최근 본 코스 총 개수 (중복 포함)
 *                 '401':
 *                   description: Unauthorized.
 *                 '500':
 *                   description: 서버 오류 발생
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 사용자 설정 가져오기 (DB에서 직접 조회하여 최신 정보 보장)
        // authenticateToken에서 가져온 req.user가 Sequelize 인스턴스라고 가정
        const userSettings = await User.findByPk(userId, {
            attributes: ['distance_unit']
        });
        const distanceUnit = userSettings ? userSettings.distance_unit : 'km'; // 사용자를 못 찾는 경우 대비

        // 저장된 코스 개수 세기
        const savedCount = await UserSavedCourse.count({
            where: { user_id: userId }
        });

        // 최근 본 코스 개수 세기
        const historyCount = await UserCourseHistory.count({
            where: { user_id: userId }
        });

        res.json({
            distance_unit: distanceUnit,
            saved_courses_count: savedCount,
            history_courses_count: historyCount
        });

    } catch (error) {
        logger.error(`Error fetching user settings: ${error.message}`);
        res.status(500).json({ error: '사용자 설정을 가져오는 중 오류가 발생했습니다.' });
    }
});

module.exports = router;