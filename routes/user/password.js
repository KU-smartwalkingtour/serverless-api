const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { validate } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { authenticateToken } = require('@middleware/auth');
const z = require('zod');

// 상수 정의
const BCRYPT_SALT_ROUNDS = 10;

// 비밀번호 변경 스키마
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요.'),
  newPassword: z.string().min(8, '새 비밀번호는 최소 8자 이상이어야 합니다.'),
});

/**
 * @swagger
 * /user/password:
 *   patch:
 *     summary: 비밀번호 변경
 *     description: 인증된 사용자가 현재 비밀번호를 확인한 후 새로운 비밀번호로 변경합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: 현재 비밀번호
 *                 example: currentpassword123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: 새로운 비밀번호 (최소 8자)
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: 비밀번호가 성공적으로 변경되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *                   example: 비밀번호가 성공적으로 변경되었습니다.
 *       400:
 *         description: 입력값이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증되지 않음 또는 현재 비밀번호가 일치하지 않음
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
router.patch('/', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 사용자 조회
    const user = await User.findByPk(userId);
    if (!user) {
      logger.warn('비밀번호 변경 실패: 사용자를 찾을 수 없음', { userId });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    // 현재 비밀번호 확인
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isCurrentPasswordValid) {
      logger.warn('비밀번호 변경 실패: 현재 비밀번호가 일치하지 않음', {
        userId,
        email: user.email,
      });
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
    }

    // 새 비밀번호 해싱 및 업데이트
    const password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await user.update({ password_hash });

    logger.info('비밀번호 변경 완료', {
      userId,
      email: user.email,
    });

    res.status(200).json({ message: '비밀번호가 성공적으로 변경되었습니다.' });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error('비밀번호 변경 중 예상치 못한 오류', {
      name: error.name,
      message: error.message,
    });
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
