const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('./logger');

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

const generateTokens = async (user) => {
  try {
    validateEnvironment();

    if (!user || !user.id) {
      throw new Error('Invalid user object: user.id is required');
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, nickname: user.nickname },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    const refreshTokenPayload = {
      user_id: user.id,
      sort_key: `TOKEN#${tokenHash}`,
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: undefined,
    };

    logger.debug(`토큰 생성 완료 - 사용자 ID: ${user.id}`);

    return { accessToken, refreshToken, refreshTokenPayload };
  } catch (error) {
    logger.error(`토큰 생성 실패: ${error.message}`, { userId: user?.id });
    throw error;
  }
};

module.exports = { generateTokens, hashToken };
