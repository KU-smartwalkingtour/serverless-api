const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 클라이언트 가져오기
const dynamoDB = require('../config/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

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
    if (!token) {
      throw new ServerError(ERROR_CODES.UNAUTHORIZED, 401);
    }

    // JWT 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ★ DynamoDB에서 유저 조회 (USER_TABLE)
    const params = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: decoded.id,
        sort_key: 'USER_INFO_ITEM' // 프로필 정보 SK
      }
    };

    const { Item: user } = await dynamoDB.send(new GetCommand(params));

    // 유저가 없거나 비활성 상태면 거부
    if (!user || user.is_active === false) {
      logger.warn('인증 실패: 사용자를 찾을 수 없거나 비활성 상태', { userId: decoded.id });
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 403);
    }

    // id 필드 맞춰주기 (DynamoDB는 user_id로 저장됨)
    user.id = user.user_id; 
    
    req.user = user;
    next();

  } catch (err) {
    if (ServerError.isServerError(err)) {
      return res.status(err.statusCode).json(err.toJSON());
    }
    if (err.name === 'TokenExpiredError') {
      const error = new ServerError(ERROR_CODES.TOKEN_EXPIRED, 401);
      return res.status(error.statusCode).json(error.toJSON());
    }
    if (err.name === 'JsonWebTokenError') {
      const error = new ServerError(ERROR_CODES.INVALID_TOKEN, 401);
      return res.status(error.statusCode).json(error.toJSON());
    }
    
    logger.error('JWT 인증 오류', { message: err.message });
    const error = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    return res.status(error.statusCode).json(error.toJSON());
  }
};

module.exports = { authenticateToken };