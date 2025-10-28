const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { generateTokens } = require('@utils/auth');
const { validate, registerSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// 상수 정의
const BCRYPT_SALT_ROUNDS = 10;

/**
 * 사용자 정보를 안전한 형태로 변환
 * @param {Object} user - Sequelize 사용자 객체
 * @returns {Object} 클라이언트에 반환할 사용자 정보
 */
const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
});

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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 이미 존재하는 이메일
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
router.post('/', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 기존 사용자 확인
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      logger.warn('회원가입 실패: 이메일 중복', { email });
      throw new ServerError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
    }

    // 비밀번호 해싱
    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // 사용자 생성
    const newUser = await User.create({
      email,
      password_hash,
      nickname,
    });

    logger.info('신규 사용자 등록 완료', {
      userId: newUser.id,
      email: newUser.email,
    });

    // 토큰 생성
    const { accessToken, refreshToken } = await generateTokens(newUser);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('회원가입 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });

    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
