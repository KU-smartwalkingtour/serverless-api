const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { getSavedCourses } = require('services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.lambda?.userId;

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User get saved courses request', { userId });

  try {
    const result = await getSavedCourses(userId);
    return success(result);
  } catch (err) {
    logger.error('User get saved courses error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
