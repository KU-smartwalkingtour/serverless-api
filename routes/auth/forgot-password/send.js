const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { User, PasswordResetRequest } = require('@models');
const { validate, forgotPasswordSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// 상수 정의
const CODE_EXPIRY_MINUTES = 10;

/**
 * @swagger
 * /auth/forgot-password/send:
 *   post:
 *     summary: 비밀번호 재설정 코드 전송
 *     description: 등록된 이메일 주소로 비밀번호 재설정을 위한 6자리 인증 코드를 전송합니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 비밀번호를 재설정할 사용자의 이메일 주소
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: 비밀번호 재설정 코드가 전송되었습니다.
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
router.post('/', validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      logger.warn('비밀번호 재설정 코드 전송 실패: 사용자를 찾을 수 없음', { email });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    // 6자리 인증 코드 생성
    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await PasswordResetRequest.create({
      user_id: user.id,
      code,
      expires_at,
    });

    // TODO: 이메일 전송 로직 구현
    // 이메일 서비스(예: SendGrid, AWS SES, Nodemailer 등)를 사용하여
    // 사용자에게 인증 코드를 포함한 이메일을 전송해야 합니다.
    // 예시:
    // await sendEmail({
    //   to: user.email,
    //   subject: '비밀번호 재설정 인증 코드',
    //   text: `인증 코드: ${code}`,
    //   html: `<p>인증 코드: <strong>${code}</strong></p>`,
    // });

    // 보안: 인증 코드는 로그에 기록하지 않음
    logger.info('비밀번호 재설정 코드 생성', { userId: user.id });

    res.status(200).json({ message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('비밀번호 재설정 요청 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
