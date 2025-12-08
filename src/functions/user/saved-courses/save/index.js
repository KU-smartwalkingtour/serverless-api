const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { saveCourse } = require('/opt/nodejs/services/userService');

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.userId;
  const courseId = event.pathParameters?.courseId;

  if (!userId) {
    return error(new ServerError(ERROR_CODES.UNAUTHORIZED, 401));
  }

  logger.info('User save course request', { userId, courseId });

  try {
    const result = await saveCourse(userId, courseId);
    return success(result, result.created ? 201 : 200);
  } catch (err) {
    logger.error('User save course error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
