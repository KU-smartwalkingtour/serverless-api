const express = require('express');
const router = express.Router();
const { logger } = require('@utils/logger');
const { Sequelize } = require('sequelize');
const { User, PasswordResetRequest } = require('@models');
const { validate } = require('@utils/validation');
const z = require('zod');
const { ServerError, ERROR_CODES } = require('@utils/error');

// 검증 스키마
const verifyCodeSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
});

/**
 * @swagger
 * /auth/forgot-password/verify:
 *   post:
 *     summary: 비밀번호 재설정 코드 검증
 *     description: 이메일로 받은 6자리 인증 코드를 검증합니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
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
 *     responses:
 *       200:
 *         description: 인증 코드가 유효합니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *                 valid:
 *                   type: boolean
 *                   description: 검증 결과
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
router.post('/', validate(verifyCodeSchema), async (req, res) => {
  try {
    const { email, code } = req.body;

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

    logger.info('비밀번호 재설정 코드 검증 성공', {
      userId: user.id,
      email,
    });

    res.status(200).json({
      message: '인증 코드가 확인되었습니다.',
      valid: true,
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
