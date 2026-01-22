const { logger } = require('../../utils/logger');
const { success, error } = require('../../utils/response');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const coursesService = require('../../services/coursesService');

exports.handler = async (event) => {
  const routeKey = event.routeKey;
  logger.info('Courses domain handler invoked', { routeKey });

  try {
    const query = event.queryStringParameters || {};
    const userId = event.requestContext?.authorizer?.lambda?.userId;
    const pathParameters = event.pathParameters || {};
    const courseId = pathParameters.courseId;

    let result;

    switch (routeKey) {
      case 'GET /courses/home':
        result = await coursesService.getHomeCourses(query);
        break;

      case 'GET /courses/course':
        result = await coursesService.getCourseList(query);
        break;

      case 'GET /courses/{courseId}':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await coursesService.getCourse(courseId, userId);
        break;

      case 'GET /courses/{courseId}/coordinates':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await coursesService.getCoordinates(courseId, userId);
        break;

      default:
        logger.warn('Route not found in Courses handler', { routeKey });
        throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }

    return success(result);
  } catch (err) {
    logger.error('Courses handler error', { error: err.message, stack: err.stack, routeKey });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
