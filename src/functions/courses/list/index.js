const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { getCourseList } = require('/opt/nodejs/services/coursesService');

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};

  logger.info('Courses list request');

  try {
    const result = await getCourseList(query);
    return success(result);
  } catch (err) {
    logger.error('Courses list error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
