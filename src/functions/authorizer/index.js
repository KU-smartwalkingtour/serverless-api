const jwt = require('jsonwebtoken');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('/opt/nodejs/config/dynamodb');
const { logger } = require('/opt/nodejs/utils/logger');

exports.handler = async (event) => {
  logger.info('Authorizer invoked', { routeArn: event.routeArn });

  try {
    const token = extractToken(event.headers);
    if (!token) {
      logger.warn('No token provided');
      return generatePolicy('anonymous', 'Deny', event.routeArn);
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
      return generatePolicy(decoded.id, 'Deny', event.routeArn);
    }

    logger.info('Authorization successful', { userId: decoded.id });
    return generatePolicy(decoded.id, 'Allow', event.routeArn, {
      userId: decoded.id,
      email: user.email,
      nickname: user.nickname,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.warn('Token expired');
    } else if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { message: err.message });
    } else {
      logger.error('Authorizer error', { error: err.message });
    }
    return generatePolicy('anonymous', 'Deny', event.routeArn);
  }
};

function extractToken(headers) {
  const authHeader = headers?.authorization || headers?.Authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

function generatePolicy(principalId, effect, resource, context = {}) {
  const policy = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (Object.keys(context).length > 0) {
    policy.context = context;
  }

  return policy;
}
