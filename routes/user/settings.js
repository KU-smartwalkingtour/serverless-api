const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /user/settings:
 *   patch:
 *     summary: 사용자 설정 업데이트
 *     description: 인증된 사용자의 설정을 업데이트합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 닉네임
 *               language:
 *                 type: string
 *                 description: 언어
 *               distance_unit:
 *                 type: string
 *                 enum: [km, mi]
 *                 description: 거리 단위
 *               is_dark_mode_enabled:
 *                 type: boolean
 *                 description: 다크 모드 활성화 여부
 *               allow_location_storage:
 *                 type: boolean
 *                 description: 위치 정보 저장 허용 여부
 *     responses:
 *       200:
 *         description: 설정이 성공적으로 업데이트되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nickname:
 *                   type: string
 *                   description: 닉네임
 *                 distance_unit:
 *                   type: string
 *                   enum: [km, mi]
 *                   description: 거리 단위
 *                 is_dark_mode_enabled:
 *                   type: boolean
 *                   description: 다크 모드 활성화 여부
 *                 language:
 *                   type: string
 *                   description: 언어
 *                 allow_location_storage:
 *                   type: boolean
 *                   description: 위치 정보 저장 허용 여부
 *       400:
 *         description: 입력값이 유효하지 않음
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.patch('/', authenticateToken, async (req, res) => {
  try {
    const { nickname, language, distance_unit, is_dark_mode_enabled, allow_location_storage } =
      req.body;
    const user = req.user;

    // 업데이트할 필드 수집
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (language !== undefined) updates.language = language;
    if (distance_unit !== undefined) updates.distance_unit = distance_unit;
    if (is_dark_mode_enabled !== undefined) updates.is_dark_mode_enabled = is_dark_mode_enabled;
    if (allow_location_storage !== undefined)
      updates.allow_location_storage = allow_location_storage;

    if (Object.keys(updates).length === 0) {
      throw new ServerError(ERROR_CODES.NO_FIELDS_TO_UPDATE, 400);
    }

    await user.update(updates);
    await user.reload();

    logger.info(`사용자 설정 업데이트: ${user.email}`);
    res.status(200).json({
      nickname: user.nickname,
      language: user.language,
      distance_unit: user.distance_unit,
      is_dark_mode_enabled: user.is_dark_mode_enabled,
      allow_location_storage: user.allow_location_storage,
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`사용자 설정 업데이트 중 오류 발생: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
