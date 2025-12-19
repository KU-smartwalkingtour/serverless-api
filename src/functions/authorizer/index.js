const jwt = require('jsonwebtoken');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('config/dynamodb');
const { logger } = require('utils/logger');

/**
 * Lambda Authorizer for HTTP API v2 with Simple Response format
 * Returns: { isAuthorized: boolean, context: { ... } }
 */
exports.handler = async (event) => {
  logger.info('Authorizer invoked', { routeArn: event.routeArn });

  try {
    const token = extractToken(event.headers);
    if (!token) {
      logger.warn('No token provided');
      return { isAuthorized: false };
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { Item: user } = await docClient.send(
      new GetCommand({
        TableName: TABLES.USER,
        Key: {
          user_id: decoded.id,
          sort_key: 'USER_INFO_ITEM',
        },
      })
    );

    if (!user || user.is_active === false) {
      logger.warn('User not found or inactive', { userId: decoded.id });
      return { isAuthorized: false };
    }

    logger.info('Authorization successful', { userId: decoded.id });
    return {
      isAuthorized: true,
      context: {
        userId: decoded.id,
        email: user.email,
        nickname: user.nickname,
      },
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.warn('Token expired');
    } else if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { message: err.message });
    } else {
      logger.error('Authorizer error', { error: err.message });
    }
    return { isAuthorized: false };
  }
};

function extractToken(headers) {
  const authHeader = headers?.authorization || headers?.Authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}
