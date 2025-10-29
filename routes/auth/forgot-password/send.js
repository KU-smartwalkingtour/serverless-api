const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Sequelize } = require('sequelize');
const sequelize = require('@config/database');
const { logger } = require('@utils/logger');
const { User, PasswordResetRequest } = require('@models');
const { validate, forgotPasswordSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { sendPasswordResetEmail } = require('@utils/sendEmail');

// 상수 정의
const CODE_EXPIRY_MINUTES = 10;
const RATE_LIMIT_MINUTES = 5;

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
 *       429:
 *         description: 요청 횟수 제한 초과 (5분에 1회만 가능)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: RATE_LIMIT_EXCEEDED
 *                     message:
 *                       type: string
 *                       example: 요청 횟수 제한을 초과했습니다.
 *                     details:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: 비밀번호 재설정 요청은 5분에 1회만 가능합니다. 3분 후 다시 시도해주세요.
 *                         retryAfter:
 *                           type: integer
 *                           description: 재시도 가능까지 남은 시간(초)
 *                           example: 180
 *                 timestamp:
 *                   type: string
 *                   format: date-time
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

    // Rate Limiting: 최근 5분 이내 요청 확인
    const rateLimitTime = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000);
    const recentRequest = await PasswordResetRequest.findOne({
      where: {
        user_id: user.id,
        created_at: { [Sequelize.Op.gte]: rateLimitTime },
      },
      order: [['created_at', 'DESC']],
    });

    if (recentRequest) {
      const waitTimeSeconds = Math.ceil(
        (RATE_LIMIT_MINUTES * 60 * 1000 - (Date.now() - new Date(recentRequest.created_at))) / 1000,
      );
      const waitTimeMinutes = Math.ceil(waitTimeSeconds / 60);

      logger.warn('비밀번호 재설정 요청 제한 초과', {
        userId: user.id,
        email,
        waitTimeSeconds,
      });

      throw new ServerError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429, {
        message: `비밀번호 재설정 요청은 ${RATE_LIMIT_MINUTES}분에 1회만 가능합니다. ${waitTimeMinutes}분 후 다시 시도해주세요.`,
        retryAfter: waitTimeSeconds,
      });
    }

    // 6자리 인증 코드 생성
    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    // 트랜잭션으로 이전 미소비 요청 무효화 + 새 요청 생성
    await sequelize.transaction(async (t) => {
      // 이전 미소비 요청 모두 소비 처리
      const invalidatedCount = await PasswordResetRequest.update(
        { consumed: true },
        {
          where: {
            user_id: user.id,
            consumed: false,
          },
          transaction: t,
        },
      );

      if (invalidatedCount[0] > 0) {
        logger.info('이전 미소비 비밀번호 재설정 요청 무효화', {
          userId: user.id,
          invalidatedCount: invalidatedCount[0],
        });
      }

      // 새 요청 생성
      await PasswordResetRequest.create(
        {
          user_id: user.id,
          code,
          expires_at,
        },
        { transaction: t },
      );
    });

    await sendPasswordResetEmail({ toEmail: user.email, code });

    // 보안: 인증 코드는 로그에 기록하지 않음
    logger.info('비밀번호 재설정 코드 생성 및 전송', { userId: user.id });

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
