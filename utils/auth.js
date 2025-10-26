const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AuthRefreshToken } = require('@models');
const { logger } = require('@utils/logger');

// Token configuration constants
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validate required environment variables
 * @throws {Error} If JWT_SECRET is not configured
 */
const validateEnvironment = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
};

/**
 * Generate access token and refresh token for a user
 * @param {Object} user - User object with id property
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 * @throws {Error} If JWT_SECRET is missing or token generation fails
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
