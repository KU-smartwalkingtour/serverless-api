const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { changePassword } = require('services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.lambda?.userId;
  const body = event.body ? JSON.parse(event.body) : {};

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User password change request', { userId });

  try {
    const result = await changePassword(userId, body);
    return success(result);
  } catch (err) {
    logger.error('User password error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
