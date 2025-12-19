const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { getCourse } = require('services/coursesService');

exports.handler = async (event) => {
  const courseId = event.pathParameters?.courseId;
  const userId = event.requestContext?.authorizer?.lambda?.userId;

  logger.info('Courses detail request', { courseId });

  try {
    const result = await getCourse(courseId, userId);
    return success(result);
  } catch (err) {
    logger.error('Courses detail error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
