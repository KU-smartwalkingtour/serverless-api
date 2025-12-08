const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { validateBody, logWalkSchema } = require('/opt/nodejs/utils/validation');
const { logWalk } = require('/opt/nodejs/services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.userId;

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User stats walk request', { userId });

  try {
    const body = JSON.parse(event.body || '{}');
    const validation = validateBody(logWalkSchema, body);

    if (!validation.success) {
      return error(new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, { errors: validation.errors }));
    }

    const { distance_km } = validation.data;
    const result = await logWalk(userId, distance_km);
    return success(result);
  } catch (err) {
    logger.error('User stats walk error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
