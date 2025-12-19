const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { refreshToken } = require('services/authService');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};

  logger.info('Auth refresh token request');

  try {
    const result = await refreshToken(body);
    return success(result);
  } catch (err) {
    logger.error('Refresh token error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
