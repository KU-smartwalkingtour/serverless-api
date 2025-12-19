const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { register } = require('services/authService');

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};

  logger.info('Auth register request');

  try {
    const result = await register(body);
    return success(result, 201);
  } catch (err) {
    logger.error('Register error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
