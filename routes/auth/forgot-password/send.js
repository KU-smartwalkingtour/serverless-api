const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { validate, forgotPasswordSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { sendPasswordResetEmail } = require('@utils/sendEmail');

// ★ DynamoDB 모듈
const dynamoDB = require('../../../config/dynamoDB');
const { 
  QueryCommand, 
  PutCommand, 
  TransactWriteCommand 
} = require('@aws-sdk/lib-dynamodb');

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

    // 1. 이메일로 사용자 조회
    const userQuery = {
      TableName: 'USER_TABLE',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    };
    const { Items: users } = await dynamoDB.send(new QueryCommand(userQuery));
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      logger.warn('비밀번호 재설정 코드 전송 실패: 사용자를 찾을 수 없음', { email });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    const userId = user.user_id;

    // 2. Rate Limiting 체크 (최근 요청 확인)
    const rateLimitQuery = {
      TableName: 'AUTH_DATA_TABLE',
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':prefix': 'RESET#',
      },
    };
    
    const { Items: resetRequests } = await dynamoDB.send(new QueryCommand(rateLimitQuery));

    if (resetRequests && resetRequests.length > 0) {
      // \최신순 정렬
      resetRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      const lastRequest = resetRequests[0];
      const timeDiff = Date.now() - new Date(lastRequest.created_at).getTime();
      const limitMs = RATE_LIMIT_MINUTES * 60 * 1000;

      if (timeDiff < limitMs) {
        const waitTimeSeconds = Math.ceil((limitMs - timeDiff) / 1000);
        throw new ServerError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429, {
          message: `비밀번호 재설정 요청은 ${RATE_LIMIT_MINUTES}분에 1회만 가능합니다.`,
          retryAfter: waitTimeSeconds,
        });
      }
    }

    // 3. 새 코드 생성
    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // 4. 트랜잭션 아이템 구성
    const transactItems = [];

    // 4-1. 이전 미소비 요청 무효화 (consumed=false인 것들)
    const activeRequests = resetRequests ? resetRequests.filter(r => r.consumed === false) : [];
    
    if (activeRequests.length > 0) {
      activeRequests.forEach((req) => {
        transactItems.push({
          Update: {
            TableName: 'AUTH_DATA_TABLE',
            Key: {
              user_id: userId,
              sort_key: req.sort_key,
            },
            // ★ 수정됨: consumed 예약어 회피 (#c 사용)
            UpdateExpression: 'set #c = :true, updated_at = :now',
            ExpressionAttributeNames: {
              '#c': 'consumed' 
            },
            ExpressionAttributeValues: {
              ':true': true,
              ':now': now,
            },
          },
        });
      });
    }

    // 4-2. 새 인증 코드 저장 (Put) - Put은 예약어 상관없음 (그대로 유지)
    transactItems.push({
      Put: {
        TableName: 'AUTH_DATA_TABLE',
        Item: {
          user_id: userId,
          sort_key: `RESET#${code}`,
          code: code,
          expires_at: expires_at,
          created_at: now,
          consumed: false,
          type: 'RESET_CODE',
        },
      },
    });

    // 5. 트랜잭션 실행
    await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }));

// 6. 이메일 발송
    try {
        await sendPasswordResetEmail({ toEmail: user.email, code });
        logger.info('이메일 전송 성공', { userId });
    } catch (emailError) {
        logger.error(`[AWS SES 전송 실패] ${emailError.message}`);
    }
    
    logger.info(`[개발용] 비밀번호 재설정 코드: ${code}`, { userId });

    res.status(200).json({ message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error('비밀번호 재설정 요청 중 오류', { error: error.message });
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

module.exports = router;
