const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { getCourse } = require('/opt/nodejs/services/coursesService');

exports.handler = async (event) => {
  const courseId = event.pathParameters?.courseId;
  const userId = event.requestContext?.authorizer?.userId;

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
