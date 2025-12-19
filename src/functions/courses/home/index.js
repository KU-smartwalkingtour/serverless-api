const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { getHomeCourses } = require('services/coursesService');

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};

  logger.info('Courses home request');

  try {
    const result = await getHomeCourses(query);
    return success(result);
  } catch (err) {
    logger.error('Courses home error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
