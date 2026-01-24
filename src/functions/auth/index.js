const { logger } = require('../../utils/logger');
const { success, error } = require('../../utils/response');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const authService = require('../../services/authService');
const { getAccessToken, getUserId } = require('../../utils/auth');

exports.handler = async (event) => {
  // API Gateway V2의 routeKey (예: "POST /auth/login")
  const routeKey = event.routeKey;
  
  logger.info('Auth domain handler invoked', { routeKey });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userId = getUserId(event);

    let result;
    let statusCode = 200;

    switch (routeKey) {
      case 'POST /auth/register':
        result = await authService.register(body);
        statusCode = 201;
        break;

      case 'POST /auth/login':
        result = await authService.login(body);
        break;

      case 'POST /auth/refresh-token':
        result = await authService.refreshToken(body);
        break;

      case 'POST /auth/logout':
        const accessToken = getAccessToken(event);
        if (!accessToken) {
             throw new ServerError(ERROR_CODES.UNAUTHORIZED, 401, { message: '토큰이 필요합니다.' });
        }
        result = await authService.logout(accessToken);
        break;

      case 'POST /auth/forgot-password/send':
        result = await authService.forgotPasswordSend(body);
        break;

      case 'POST /auth/forgot-password/verify':
        result = await authService.forgotPasswordVerify(body);
        break;

      default:
        logger.warn('Route not found in Auth handler', { routeKey });
        throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }

    return success(result, statusCode);

  } catch (err) {
    logger.error('Auth handler error', { error: err.message, stack: err.stack, routeKey });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
