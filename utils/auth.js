// utils/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('@utils/logger');

// 토큰 설정 상수
const ACCESS_TOKEN_EXPIRY = '1h'; 
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_DAYS = 14; 

const validateEnvironment = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * 사용자를 위한 액세스 토큰 및 리프레시 토큰 생성 (DynamoDB용)
 */
const generateTokens = async (user) => {
  try {
    validateEnvironment();

    if (!user || !user.id) {
      throw new Error('Invalid user object: user.id is required');
    }

    // 1. 액세스 토큰 생성 (JWT)
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, nickname: user.nickname },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // 2. 리프레시 토큰 생성 (Random String)
    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(refreshToken);

    // 3. 만료일
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    // 4. ★ 핵심 변경: DB에 저장하지 않고, 저장할 객체를 만들어서 반환만 함!
    const refreshTokenPayload = {
      user_id: user.id,               // PK
      sort_key: `TOKEN#${tokenHash}`, // SK
      token_hash: tokenHash,          // GSI 검색용
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
    };

    logger.debug(`토큰 생성 완료 - 사용자 ID: ${user.id}`);
    
    // 액세스 토큰, 리프레시 토큰, 그리고 DynamoDB에 넣을 payload까지 반환
    return { accessToken, refreshToken, refreshTokenPayload };

  } catch (error) {
    logger.error(`토큰 생성 실패: ${error.message}`, { userId: user?.id });
    throw error;
  }
};

module.exports = { generateTokens, hashToken };