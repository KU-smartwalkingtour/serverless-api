const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { validateBody, updateLocationSchema } = require('/opt/nodejs/utils/validation');
const { updateCoordinates } = require('/opt/nodejs/services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.lambda?.userId;

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User coordinates update request', { userId });

  try {
    const body = JSON.parse(event.body || '{}');
    const validation = validateBody(updateLocationSchema, body);

    if (!validation.success) {
      return error(new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, { errors: validation.errors }));
    }

    const { latitude, longitude } = validation.data;
    const result = await updateCoordinates(userId, latitude, longitude);
    return success(result);
  } catch (err) {
    logger.error('User coordinates update error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
