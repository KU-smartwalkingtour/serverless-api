const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { logger } = require('@utils/logger');
const { validate } = require('@utils/validation');
const z = require('zod');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈 (경로 확인: ../../../)
const dynamoDB = require('../../../config/dynamoDB');
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
    // ★ 수정 1: 변수를 try 밖으로 꺼내서, catch에서도 쓸 수 있게 함
    const { email, code, newPassword } = req.body;
  
    try {
      // 1. 유저 조회 (EmailIndex)
      const userQuery = {
        TableName: 'USER_TABLE',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      };
      const { Items: users } = await dynamoDB.send(new QueryCommand(userQuery));
      const user = users && users.length > 0 ? users[0] : null;
  
      if (!user) {
        throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
      }
  
      const userId = user.user_id;
  
      // 2. 비밀번호 해싱
      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
      const now = new Date().toISOString();
  
      // 3. 트랜잭션 실행
      const transactParams = {
        TransactItems: [
          {
            // 3-1. 인증 코드 검증 & 사용 처리
            Update: {
              TableName: 'AUTH_DATA_TABLE',
              Key: { 
                user_id: userId, 
                sort_key: `RESET#${code}` 
              },
              // 예약어 이슈 해결 (#c)
              UpdateExpression: 'set #c = :true, verified_at = :now',
              ConditionExpression: '#c = :false AND expires_at > :now',
              ExpressionAttributeNames: {
                 '#c': 'consumed'
              },
              ExpressionAttributeValues: {
                ':true': true,
                ':false': false,
                ':now': now,
              },
            },
          },
          {
            // 3-2. 비밀번호 변경
            Update: {
              TableName: 'AUTH_DATA_TABLE',
              Key: { 
                user_id: userId, 
                sort_key: 'PASSWORD_ITEM' 
              },
              UpdateExpression: 'set password_hash = :hash, updated_at = :now',
              ExpressionAttributeValues: {
                ':hash': newPasswordHash,
                ':now': now,
              },
            },
          },
        ],
      };
  
      await dynamoDB.send(new TransactWriteCommand(transactParams));
  
      logger.info('비밀번호 재설정 성공', { userId });
      res.status(200).json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
  
    } catch (error) {
      // 트랜잭션 실패 (조건 불만족 = 코드가 틀렸거나, 만료됐거나, 이미 사용됨)
      if (error.name === 'TransactionCanceledException') {
        // ★ 수정 2: 이제 email 변수를 안전하게 사용 가능
        logger.warn('비밀번호 재설정 실패: 코드 검증 조건 불만족 (코드 불일치/만료/재사용)', { email });
        return res.status(400).json(new ServerError(ERROR_CODES.INVALID_VERIFICATION_CODE, 400).toJSON());
      }
  
      if (ServerError.isServerError(error)) {
        return res.status(error.statusCode).json(error.toJSON());
      }
  
      logger.error('비밀번호 재설정 중 오류', { error: error.message });
      res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
    }
  });
  
  module.exports = router;
