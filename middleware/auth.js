const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');
const { User } = require('@models');

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
  const token = extractToken(req.headers);

  // 토큰 없음
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  try {
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
      return res.status(403).json({ error: '접근 권한이 없습니다.', code: 'FORBIDDEN_USER' });
    }

    // 인증 성공: 사용자 객체를 요청에 첨부
    req.user = user;
    next();
  } catch (err) {
    // JWT 에러 타입별 처리
    if (err.name === 'TokenExpiredError') {
      logger.warn('JWT 토큰 만료', {
        expiredAt: err.expiredAt,
        path: req.path,
      });
      return res.status(401).json({ error: '토큰이 만료되었습니다.', code: 'TOKEN_EXPIRED' });
    }

    if (err.name === 'JsonWebTokenError') {
      logger.warn('JWT 토큰 검증 실패', {
        message: err.message,
        path: req.path,
      });
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.', code: 'INVALID_TOKEN' });
    }

    // 기타 에러
    logger.error('JWT 인증 중 예상치 못한 오류', {
      name: err.name,
      message: err.message,
      path: req.path,
    });
    return res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.', code: 'UNEXPECTED_ERROR' });
  }
};

module.exports = { authenticateToken };
