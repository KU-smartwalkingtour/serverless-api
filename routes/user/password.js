const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const { User, PasswordResetRequest } = require('@models');
const { validate, resetPasswordSchema } = require('@utils/validation');

// 상수 정의
const BCRYPT_SALT_ROUNDS = 10;

/**
 * @swagger
 * /user/password:
 *   patch:
 *     summary: 비밀번호 재설정
 *     description: 인증 코드로 검증된 후 새로운 비밀번호로 변경합니다.
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, password]
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
 *               password:
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
 *       400:
 *         description: 유효하지 않거나 만료된 인증 코드
 *       500:
 *         description: 서버 오류
 */
router.patch('/', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { email, code, password } = req.body;

    // 사용자 조회
    const user = await User.findOne({ where: { email } });
    if (!user) {
      logger.warn('비밀번호 재설정 실패: 사용자를 찾을 수 없음', { email });
      return res.status(400).json({
        error: '유효하지 않은 이메일 또는 인증 코드입니다.',
        code: 'INVALID_CREDENTIALS',
      });
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
      logger.warn('비밀번호 재설정 실패: 인증 코드가 유효하지 않거나 만료됨', {
        userId: user.id,
        email,
      });
      return res.status(400).json({
        error: '유효하지 않거나 만료된 인증 코드입니다.',
        code: 'INVALID_CODE',
      });
    }

    // 비밀번호 해싱 및 업데이트
    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await user.update({ password_hash });

    // 인증 코드 사용 처리
    await resetRequest.update({ consumed: true, verified_at: new Date() });

    logger.info('비밀번호 재설정 완료', {
      userId: user.id,
      email,
    });

    res.status(200).json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
  } catch (error) {
    logger.error('비밀번호 재설정 중 예상치 못한 오류', {
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
