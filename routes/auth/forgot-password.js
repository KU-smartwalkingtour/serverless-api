const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { User, PasswordResetRequest } = require('@models');
const { validate, forgotPasswordSchema } = require('@utils/validation');

// 상수 정의
const CODE_EXPIRY_MINUTES = 10;

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: 비밀번호 재설정 코드 요청
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
 *       500:
 *         description: 서버 오류
 */
router.post('/', validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (user) {
      // 6자리 인증 코드 생성
      const code = crypto.randomInt(100000, 999999).toString();
      const expires_at = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

      await PasswordResetRequest.create({
        user_id: user.id,
        code,
        expires_at,
      });

      // 보안: 인증 코드는 로그에 기록하지 않음
      logger.info('비밀번호 재설정 코드 생성', { userId: user.id });
    }

    res.status(200).json({ message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' });
  } catch (error) {
    logger.error('비밀번호 재설정 요청 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });
    res.status(500).json({
      error: '비밀번호 재설정 처리 중 오류가 발생했습니다.',
      code: 'UNEXPECTED_ERROR',
    });
  }
});

module.exports = router;
