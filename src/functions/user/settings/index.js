const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { updateSettings } = require('/opt/nodejs/services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.lambda?.userId;
  const body = event.body ? JSON.parse(event.body) : {};

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User settings update request', { userId });

  try {
    const result = await updateSettings(userId, body);
    return success(result);
  } catch (err) {
    logger.error('User settings error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
