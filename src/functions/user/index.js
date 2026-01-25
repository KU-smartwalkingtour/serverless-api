const { logger } = require('../../utils/logger');
const { success, error } = require('../../utils/response');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const userService = require('../../services/userService');
const { validateBody, updateLocationSchema, logWalkSchema } = require('../../utils/validation');
const { requireUserId } = require('../../utils/auth');

exports.handler = async (event) => {
  const routeKey = event.routeKey;
  logger.info('User domain handler invoked', { routeKey });

  try {
    const userId = requireUserId(event);

    const body = event.body ? JSON.parse(event.body) : {};
    const pathParameters = event.pathParameters || {};
    const courseId = pathParameters.courseId;

    let result;
    let statusCode = 200;

    switch (routeKey) {
      case 'GET /user/profile':
        result = await userService.getProfile(userId);
        break;

      case 'PATCH /user/settings':
        result = await userService.updateSettings(userId, body);
        break;

      case 'PATCH /user/password':
        result = await userService.changePassword(userId, body);
        break;

      case 'DELETE /user/withdraw':
        result = await userService.withdraw(userId);
        break;

      case 'PUT /user/coordinates': {
        const validation = validateBody(updateLocationSchema, body);
        if (!validation.success) {
          throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, { errors: validation.errors });
        }
        const { latitude, longitude } = validation.data;
        result = await userService.updateCoordinates(userId, latitude, longitude);
        break;
      }

      case 'GET /user/stats':
        result = await userService.getStats(userId);
        break;

      case 'POST /user/stats/walk': {
        const validation = validateBody(logWalkSchema, body);
        if (!validation.success) {
          throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, { errors: validation.errors });
        }
        const { distance_km } = validation.data;
        result = await userService.logWalk(userId, distance_km);
        break;
      }

      // Saved Courses
      case 'GET /user/courses/saved-courses':
        result = await userService.getSavedCourses(userId);
        break;

      case 'PUT /user/courses/saved-courses/{courseId}':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await userService.saveCourse(userId, courseId);
        if (result.created) statusCode = 201;
        break;

      case 'DELETE /user/courses/saved-courses/{courseId}':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await userService.unsaveCourse(userId, courseId);
        break;

      // Recent Courses
      case 'GET /user/courses/recent-courses':
        result = await userService.getRecentCourses(userId);
        break;

      case 'PUT /user/courses/recent-courses/{courseId}':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await userService.addRecentCourse(userId, courseId);
        if (result.created) statusCode = 201;
        break;

      case 'DELETE /user/courses/recent-courses/{courseId}':
        if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
        result = await userService.deleteRecentCourse(userId, courseId);
        break;

      default:
        logger.warn('Route not found in User handler', { routeKey });
        throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }

    return success(result, statusCode);

  } catch (err) {
    logger.error('User handler error', { error: err.message, stack: err.stack, routeKey });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
