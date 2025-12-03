const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');
const { User } = require('@models');
const { ServerError, ERROR_CODES } = require('@utils/error');

/**
 * Authorization 헤더에서 Bearer 토큰 추출
 * @param {Object} headers - HTTP 요청 헤더
 * @returns {string|null} 추출된 토큰 또는 null
 */
const extractToken = (headers) => {
  const authHeader = headers['authorization'];
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
};

/**
 * JWT 액세스 토큰 검증 미들웨어
 *
 * Authorization 헤더의 Bearer 토큰을 검증하고 데이터베이스에서 사용자를 조회합니다.
 * 검증 성공 시 req.user에 사용자 객체를 첨부하고 다음 미들웨어로 진행합니다.
 *
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 * @returns {void}
 */
const authenticateToken = async (req, res, next) => {
  try {
    const token = extractToken(req.headers);

    // 토큰 없음
    if (!token) {
      throw new ServerError(ERROR_CODES.UNAUTHORIZED, 401);
    }

    // JWT 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 데이터베이스에서 활성 사용자 조회
    const user = await User.findOne({
      where: { id: decoded.id, is_active: true },
    });

    if (!user) {
      logger.warn('인증 실패: 사용자를 찾을 수 없거나 비활성 상태', {
        userId: decoded.id,
        path: req.path,
      });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 403);
    }

    // 인증 성공: 사용자 객체를 요청에 첨부
    req.user = user;
    next();
  } catch (err) {
    // ServerError인 경우 그대로 전달
    if (ServerError.isServerError(err)) {
      return res.status(err.statusCode).json(err.toJSON());
    }

    // JWT 에러 타입별 처리
    if (err.name === 'TokenExpiredError') {
      logger.warn('JWT 토큰 만료', {
        expiredAt: err.expiredAt,
        path: req.path,
      });
      const error = new ServerError(ERROR_CODES.TOKEN_EXPIRED, 401);
      return res.status(error.statusCode).json(error.toJSON());
    }

    if (err.name === 'JsonWebTokenError') {
      logger.warn('JWT 토큰 검증 실패', {
        message: err.message,
        path: req.path,
      });
      const error = new ServerError(ERROR_CODES.INVALID_TOKEN, 401);
      return res.status(error.statusCode).json(error.toJSON());
    }

    // 기타 에러
    logger.error('JWT 인증 중 예상치 못한 오류', {
      name: err.name,
      message: err.message,
      path: req.path,
    });
    const error = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    return res.status(error.statusCode).json(error.toJSON());
  }
};

module.exports = { authenticateToken };
