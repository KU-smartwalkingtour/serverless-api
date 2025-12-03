const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 클라이언트 가져오기
const dynamoDB = require('../config/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

const extractToken = (headers) => {
  const authHeader = headers['authorization'];
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
};

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