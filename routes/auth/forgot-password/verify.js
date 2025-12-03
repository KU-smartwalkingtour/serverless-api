const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const { User, PasswordResetRequest } = require('@models');
const { validate } = require('@utils/validation');
const z = require('zod');
const { ServerError, ERROR_CODES } = require('@utils/error');

// 상수 정의
const BCRYPT_SALT_ROUNDS = 10;

// 검증 + 비밀번호 재설정 스키마
const verifyAndResetSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
  newPassword: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
});

/**
 * @swagger
 * /auth/forgot-password/verify:
 *   post:
 *     summary: 비밀번호 재설정 코드 검증 및 비밀번호 변경
 *     description: 이메일로 받은 6자리 인증 코드를 검증하고 새로운 비밀번호로 변경합니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 사용자 이메일 주소
 *                 example: user@example.com
 *               code:
 *                 type: string
 *                 description: 이메일로 전송된 6자리 인증 코드
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: 새로운 비밀번호 (최소 8자)
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: 비밀번호가 성공적으로 재설정되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *                   example: 비밀번호가 성공적으로 재설정되었습니다.
 *       400:
 *         description: 유효하지 않거나 만료된 인증 코드
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 해당 이메일로 등록된 사용자를 찾을 수 없음
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
router.post('/', validate(verifyAndResetSchema), async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    // 사용자 조회
    const user = await User.findOne({ where: { email } });
    if (!user) {
      logger.warn('코드 검증 실패: 사용자를 찾을 수 없음', { email });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    // 인증 코드 검증
    const resetRequest = await PasswordResetRequest.findOne({
      where: {
        user_id: user.id,
        code,
        consumed: false,
        expires_at: { [Sequelize.Op.gt]: new Date() },
      },
    });

    if (!resetRequest) {
      logger.warn('코드 검증 실패: 인증 코드가 유효하지 않거나 만료됨', {
        userId: user.id,
        email,
      });
      throw new ServerError(ERROR_CODES.INVALID_VERIFICATION_CODE, 400);
    }

    // 새 비밀번호 해싱
    const password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // 비밀번호 업데이트 및 인증 코드 소진 처리
    await user.update({ password_hash });
    await resetRequest.update({ consumed: true, verified_at: new Date() });

    logger.info('비밀번호 재설정 성공', {
      userId: user.id,
      email,
    });

    res.status(200).json({
      message: '비밀번호가 성공적으로 재설정되었습니다.',
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('코드 검증 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
