const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { User, AuthRefreshToken } = require('@models');
const { generateTokens } = require('@utils/auth');
const { validate, loginSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

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
 * /auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     description: 이메일과 비밀번호로 로그인하고 액세스 토큰을 발급받습니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 사용자 이메일
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 비밀번호
 *                 example: password123
 *     responses:
 *       200:
 *         description: 로그인 성공. 토큰과 사용자 정보가 반환됩니다.
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
 *       401:
 *         description: 이메일 또는 비밀번호가 일치하지 않음
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
router.post('/', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // 활성화된 사용자 조회
    const user = await User.findOne({ where: { email, is_active: true } });
    if (!user) {
      logger.warn('로그인 실패: 사용자를 찾을 수 없음', { email });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      logger.warn('로그인 실패: 비밀번호 불일치', { userId: user.id, email });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // 기존 리프레시 토큰 무효화
    await AuthRefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: user.id, revoked_at: null } },
    );

    // 새 토큰 발급
    const { accessToken, refreshToken } = await generateTokens(user);

    logger.info('사용자 로그인 성공', {
      userId: user.id,
      email: user.email,
    });

    res.status(200).json({
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('로그인 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });

    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
