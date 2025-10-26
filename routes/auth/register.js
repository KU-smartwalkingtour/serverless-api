const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { generateTokens } = require('@utils/auth');
const { validate, registerSchema } = require('@utils/validation');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 신규 사용자 회원가입
 *     description: 이메일과 비밀번호로 새 계정을 생성합니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 사용자 이메일 주소
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: 비밀번호 (최소 8자)
 *                 example: password123
 *               nickname:
 *                 type: string
 *                 description: 사용자 닉네임 (선택사항)
 *                 example: 홍길동
 *     responses:
 *       201:
 *         description: 회원가입 성공. 액세스 토큰과 리프레시 토큰이 반환됩니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT 액세스 토큰
 *                 refreshToken:
 *                   type: string
 *                   description: 리프레시 토큰
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid, description: 사용자 ID }
 *                     email: { type: string, format: email, description: 이메일 }
 *                     nickname: { type: string, description: 닉네임 }
 *       400:
 *         description: 입력값이 유효하지 않음
 *       409:
 *         description: 이미 존재하는 이메일
 *       500:
 *         description: 서버 오류
 */
router.post('/', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 기존 사용자 확인
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: '이미 존재하는 이메일입니다.' });
    }

    // 비밀번호 해싱 및 사용자 생성
    const password_hash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ email, password_hash, nickname });

    logger.info(`신규 사용자 등록: ${email}`);

    // 토큰 생성
    const { accessToken, refreshToken } = await generateTokens(newUser);
    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: newUser.id, email: newUser.email, nickname: newUser.nickname },
    });
  } catch (error) {
    logger.error(`회원가입 중 오류 발생: ${error.message}`);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
