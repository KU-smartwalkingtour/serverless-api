const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { generateTokens } = require('@utils/auth');
const { validate, registerSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 관련 모듈 가져오기
const dynamoDB = require('../../config/dynamoDB');
const { QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

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
 *               $ref: '#/components/schemas/AuthResponse'
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

    // 1. 이메일 중복 확인 (USER_TABLE의 EmailIndex 사용)
    const checkEmailParams = {
      TableName: 'USER_TABLE',
      IndexName: 'EmailIndex', // 아까 만든 GSI 이름
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    };

    const { Items: existingUsers } = await dynamoDB.send(new QueryCommand(checkEmailParams));

    if (existingUsers && existingUsers.length > 0) {
      logger.warn('회원가입 실패: 이메일 중복', { email });
      throw new ServerError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
    }

    // 2. 데이터 준비
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const now = new Date().toISOString();

    // 3. 토큰 생성 (여기서 refreshTokenPayload를 받아와야 함!)
    const { accessToken, refreshToken, refreshTokenPayload } = await generateTokens({
      id: userId,
      email,
      nickname,
    });

    // 4. 트랜잭션 아이템 구성 (프로필 + 비밀번호 + 토큰)
    const transactItems = [
      {
        // [A] 사용자 프로필 저장 (USER_TABLE)
        Put: {
          TableName: 'USER_TABLE',
          Item: {
            user_id: userId,
            sort_key: 'USER_INFO_ITEM',
            email,
            nickname: nickname || null,
            is_active: true,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            // 기본 설정값들
            language: 'ko',
            distance_unit: 'km',
            is_dark_mode_enabled: false,
            allow_location_storage: false,
          },
          // 동시성 제어: 혹시라도 같은 user_id가 이미 있으면 실패하도록
          ConditionExpression: 'attribute_not_exists(user_id)',
        },
      },
      {
        // [B] 비밀번호 저장 (AUTH_DATA_TABLE)
        Put: {
          TableName: 'AUTH_DATA_TABLE',
          Item: {
            user_id: userId,
            sort_key: 'PASSWORD_ITEM',
            password_hash: passwordHash,
            created_at: now,
            updated_at: now,
          },
        },
      },
      {
        // [C] 리프레시 토큰 저장 (AUTH_DATA_TABLE)
        Put: {
          TableName: 'AUTH_DATA_TABLE',
          Item: refreshTokenPayload, // utils/auth.js에서 만들어준 객체 그대로 저장
        },
      },
    ];

    // 5. 트랜잭션 실행 (All or Nothing)
    await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }));

    logger.info('신규 사용자 등록 완료 (DynamoDB Transaction)', { userId, email });

    // 6. 응답 반환
    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
        nickname,
      },
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    
    // 트랜잭션 취소 에러 처리 (예: ID 중복 등)
    if (error.name === 'TransactionCanceledException') {
        logger.error(`회원가입 트랜잭션 실패: ${error.message}`);
        // 중복 등 구체적인 원인 파악이 어렵다면 일반 에러로 처리
    }

    logger.error('회원가입 중 예상치 못한 오류', { error: error.message });
    console.log(error);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
