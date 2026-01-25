const { logger } = require('../../utils/logger');
const { success, error } = require('../../utils/response');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const medicalService = require('../../services/medicalService');

exports.handler = async (event) => {
  const routeKey = event.routeKey;
  logger.info('Medical domain handler invoked', { routeKey });

  try {
    const query = event.queryStringParameters || {};

    let result;

    switch (routeKey) {
      case 'GET /medical/search':
        result = await medicalService.search(query);
        break;

      default:
        logger.warn('Route not found in Medical handler', { routeKey });
        throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }

    return success(result);
  } catch (err) {
    logger.error('Medical handler error', { error: err.message, stack: err.stack, routeKey });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
