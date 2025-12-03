const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logger } = require('@utils/logger');
const { validate, forgotPasswordSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { sendPasswordResetEmail } = require('@utils/sendEmail');

// ★ DynamoDB 모듈
const dynamoDB = require('../../../config/dynamodb');
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

    // 2. [추가됨] Rate Limiting 체크 (최근 요청 확인)
    // 해당 유저의 모든 RESET 코드를 가져와서 최신 것과 시간 비교
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
      // created_at 기준으로 내림차순 정렬 (최신순)
      resetRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      const lastRequest = resetRequests[0];
      const timeDiff = Date.now() - new Date(lastRequest.created_at).getTime();
      const limitMs = RATE_LIMIT_MINUTES * 60 * 1000;

      // 5분(limitMs)이 안 지났으면 에러 발생
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

    // 4-1. 이전 미소비 요청 무효화 (consumed=true)
    const activeRequests = resetRequests ? resetRequests.filter(r => r.consumed === false) : [];
    if (activeRequests.length > 0) {
      activeRequests.forEach((req) => {
        transactItems.push({
          Update: {
            TableName: 'AUTH_DATA_TABLE',
            Key: { user_id: userId, sort_key: req.sort_key },
            UpdateExpression: 'set consumed = :true, updated_at = :now',
            ExpressionAttributeValues: { ':true': true, ':now': now },
          },
        });
      });
    }

    // 4-2. 새 코드 저장
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
    logger.info(`[개발용] 비밀번호 재설정 코드 생성됨: ${code}`, { userId });
    try {
    //     await sendPasswordResetEmail({ toEmail: user.email, code });
    //     logger.info('비밀번호 재설정 이메일 전송 성공', { userId });
    // } catch (emailError) {
    //     logger.error(`이메일 전송 실패: ${emailError.message}`);
    // }
        await sendPasswordResetEmail({ toEmail: user.email, code });
        logger.info('이메일 전송 성공', { userId });
    } catch (emailError) {
      // 이메일 전송 실패해도 로그만 남기고 넘어가기 (테스트를 위해)
      logger.error(`[AWS SES 전송 실패] 샌드박스 모드이거나 인증되지 않은 이메일입니다: ${emailError.message}`);
    }

    res.status(200).json({ message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' });

  } catch (error) {
    // 🔍 디버깅용 로그 (에러의 정체를 밝혀라!)
    console.error("=====================================");
    console.error("❌ 비밀번호 재설정 에러 상세 내용:");
    console.error(error); // 에러 객체 전체 출력
    console.error("=====================================");

    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    
    // 에러 메시지를 응답에 포함시켜서 Swagger에서 볼 수 있게 함 (개발 중에만!)
    res.status(500).json({
        error: "Internal Server Error",
        details: error.message, // ★ 여기가 중요
        stack: error.stack
    });
  }
});

module.exports = router;
