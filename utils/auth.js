const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AuthRefreshToken } = require('@models');
const { logger } = require('@utils/logger');

// 토큰 설정 상수
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 필수 환경 변수 검증
 * @throws {Error} JWT_SECRET이 설정되지 않은 경우
 */
const validateEnvironment = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};

/**
 * 사용자를 위한 액세스 토큰 및 리프레시 토큰 생성
 * @param {Object} user - id 속성이 있는 사용자 객체
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 * @throws {Error} JWT_SECRET이 누락되었거나 토큰 생성이 실패한 경우
 */
const generateTokens = async (user) => {
  try {
    validateEnvironment();

    if (!user || !user.id) {
      throw new Error('Invalid user object: user.id is required');
    }

    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * MILLISECONDS_PER_DAY);

    await AuthRefreshToken.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    logger.debug(`토큰 생성 완료 - 사용자 ID: ${user.id}`);
    return { accessToken, refreshToken };
  } catch (error) {
    logger.error(`토큰 생성 실패: ${error.message}`, { userId: user?.id });
    throw error;
  }
};

module.exports = { generateTokens };
