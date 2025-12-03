const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { validate } = require('@utils/validation');
const z = require('zod');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈 (경로 확인: ../../../)
const dynamoDB = require('../../../config/dynamodb');
const { QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

// 상수 정의
const BCRYPT_SALT_ROUNDS = 10;

// 검증 + 비밀번호 재설정 스키마
const verifyAndResetSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
  newPassword: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
});

/**
 * @swagger
 * /auth/forgot-password/verify:
 *   post:
 *     summary: 비밀번호 재설정 코드 검증 및 비밀번호 변경
 *     description: 이메일로 받은 6자리 인증 코드를 검증하고 새로운 비밀번호로 변경합니다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
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
 *               newPassword:
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
 *                   example: 비밀번호가 성공적으로 재설정되었습니다.
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
router.post('/', validate(verifyAndResetSchema), async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    // 1. 이메일로 user_id 조회 (USER_TABLE)
    const userQuery = {
      TableName: 'USER_TABLE',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    };
    const { Items: users } = await dynamoDB.send(new QueryCommand(userQuery));
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      logger.warn('코드 검증 실패: 사용자를 찾을 수 없음', { email });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    const userId = user.user_id;

    // 2. 새 비밀번호 해싱
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const now = new Date().toISOString();

    // 3. 트랜잭션: 코드 검증/소비(Update) + 비밀번호 변경(Update)
    // DynamoDB는 '읽고 나서 수정' 사이에 데이터가 변할 수 있으므로,
    // ConditionExpression을 사용해 '코드가 유효할 때만' 업데이트하도록 트랜잭션을 구성합니다.
const transactParams = {
        TransactItems: [
            { // 3-1. 인증 코드 검증 및 소비 처리
                Update: {
                    TableName: 'AUTH_DATA_TABLE',
                    Key: { 
                        user_id: userId, 
                        sort_key: `RESET#${code}` 
                    },
                    // ★ 수정됨: consumed -> #c 로 변경
                    UpdateExpression: 'set #c = :consumed, verified_at = :now',
                    // ★ 수정됨: 조건식에서도 #c 사용
                    ConditionExpression: '#c = :not_consumed AND expires_at > :now',
                    // ★ 추가됨: 별명 정의
                    ExpressionAttributeNames: {
                        '#c': 'consumed'
                    },
                    ExpressionAttributeValues: {
                        ':consumed': true,
                        ':now': now,
                        ':not_consumed': false,
                    }
                }
            },
            { // 3-2. 비밀번호 변경
                Update: {
                    TableName: 'AUTH_DATA_TABLE',
                    Key: { 
                        user_id: userId, 
                        sort_key: 'PASSWORD_ITEM' 
                    },
                    UpdateExpression: 'set password_hash = :hash, updated_at = :now',
                    ExpressionAttributeValues: {
                        ':hash': newPasswordHash,
                        ':now': now
                    }
                }
            }
        ]
    };

    await dynamoDB.send(new TransactWriteCommand(transactParams));

    logger.info('비밀번호 재설정 성공', { userId });
    res.status(200).json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });

  } catch (error) {
    // 1. TransactionCanceledException 처리 (조건 불만족)
    if (error.name === 'TransactionCanceledException') {
        // 상세 이유를 로그에 출력
        // CancellationReasons는 배열 형태로 실패 원인을 알려줌
        logger.warn('비밀번호 재설정 트랜잭션 취소됨', { 
            reasons: JSON.stringify(error.CancellationReasons) 
        });
        return res.status(400).json({
            error: "INVALID_VERIFICATION_CODE",
            message: "인증 코드가 틀렸거나, 만료되었거나, 이미 사용되었습니다."
        });
    }

    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    // 2. 기타 에러 (여기가 중요! 상세 내용을 클라이언트로 보냄)
    logger.error('비밀번호 재설정 중 오류', { error: error.message });
    
    // 개발 중에만 이렇게 상세 내용을 봅니다.
    res.status(500).json({
        error: "Internal Server Error",
        message: "서버 내부 오류가 발생했습니다.",
        details: error.message, // ★ 진짜 에러 메시지 (영어)
        stack: error.stack      // ★ 에러 위치
    });
  }
});

module.exports = router;
