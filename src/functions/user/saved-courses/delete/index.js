const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { unsaveCourse } = require('services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.lambda?.userId;
  const courseId = event.pathParameters?.courseId;

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User unsave course request', { userId, courseId });

  try {
    const result = await unsaveCourse(userId, courseId);
    return success(result);
  } catch (err) {
    logger.error('User unsave course error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
