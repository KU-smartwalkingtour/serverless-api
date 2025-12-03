const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { validate, updateProfileSchema } = require('@utils/validation');
const { User, AuthRefreshToken, UserSavedCourse, UserRecentCourse } = require('@models');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: 현재 사용자 프로필 조회
 *     description: 인증된 사용자의 프로필 정보를 조회합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 사용자의 프로필 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: 이메일 주소
 *                 nickname:
 *                   type: string
 *                   description: 닉네임
 *                 language:
 *                   type: string
 *                   description: 선호 언어
 *                 distance_unit:
 *                   type: string
 *                   enum: [km, mi]
 *                   description: 거리 단위
 *                 is_dark_mode_enabled:
 *                   type: boolean
 *                   description: 다크 모드 활성화 여부
 *                 allow_location_storage:
 *                   type: boolean
 *                   description: 위치 정보 저장 허용 여부
 *                 saved_courses_count:
 *                   type: integer
 *                   description: 저장한 코스 개수
 *                 recent_courses_count:
 *                   type: integer
 *                   description: 최근 본 코스 개수
 *       401:
 *         description: 인증되지 않음
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    const saved_courses_count = await UserSavedCourse.count({ where: { user_id: req.user.id } });
    const recent_courses_count = await UserRecentCourse.count({ where: { user_id: req.user.id } });

    const {
      email,
      nickname,
      language,
      distance_unit,
      is_dark_mode_enabled,
      allow_location_storage,
    } = user;
    res.json({
      email,
      nickname,
      language,
      distance_unit,
      is_dark_mode_enabled,
      allow_location_storage,
      saved_courses_count,
      recent_courses_count,
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`Error fetching user profile: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/withdraw:
 *   delete:
 *     summary: 사용자 회원탈퇴 (Soft Delete)
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 회원탈퇴 처리가 완료되었습니다.
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: 사용자를 찾을 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/withdraw', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user || typeof user.destroy !== 'function') {
      const userInstance = await User.findByPk(req.user.id);
      if (!userInstance) {
        throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
      }
      await userInstance.destroy(); // Soft delete 실행
    } else {
      await user.destroy(); // Soft delete 실행
    }

    // 사용자의 리프레시 토큰도 모두 무효화 (revoked_at 설정)
    await AuthRefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: req.user.id, revoked_at: null } },
    );

    logger.info(`User soft deleted: ${req.user.email}`);
    res.status(200).json({ message: '회원탈퇴 처리가 완료되었습니다.' });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`Error deleting user: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
