const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { validate, updateProfileSchema } = require('@utils/validation');
const { User, AuthRefreshToken } = require('@models');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * @swagger
 * /user:
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
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: 사용자 고유 ID
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
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: 계정 생성일
 *       401:
 *         description: 인증되지 않음
 */
router.get('/', authenticateToken, async (req, res) => {
  const { id, email, nickname, language, distance_unit, created_at } = req.user;
  res.json({ id, email, nickname, language, distance_unit, created_at });
});

/**
 * @swagger
 * /user:
 *   put:
 *     summary: 현재 사용자 프로필 수정
 *     description: 인증된 사용자의 프로필 정보를 업데이트합니다.
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
 *                 description: 새로운 닉네임 (선택사항)
 *                 example: 홍길동
 *               language:
 *                 type: string
 *                 description: 선호 언어 (선택사항)
 *                 example: ko
 *               distance_unit:
 *                 type: string
 *                 enum: [km, mi]
 *                 description: 거리 단위 (선택사항)
 *                 example: km
 *     responses:
 *       200:
 *         description: 프로필이 성공적으로 업데이트되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *       400:
 *         description: 입력값이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  try {
    const { nickname, language, distance_unit } = req.body;
    const user = req.user;

    // 업데이트할 필드 수집
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (language !== undefined) updates.language = language;
    if (distance_unit !== undefined) updates.distance_unit = distance_unit;

    if (Object.keys(updates).length === 0) {
      throw new ServerError(ERROR_CODES.NO_FIELDS_TO_UPDATE, 400);
    }

    await user.update(updates);

    logger.info(`사용자 프로필 업데이트: ${user.email}`);
    res.status(200).json({ message: '프로필이 성공적으로 업데이트되었습니다.' });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`사용자 프로필 업데이트 중 오류 발생: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user:
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
router.delete('/', authenticateToken, async (req, res) => {
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
