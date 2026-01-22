const { logger } = require('../../utils/logger');
const { success, error } = require('../../utils/response');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const weatherService = require('../../services/weatherService');

exports.handler = async (event) => {
  const routeKey = event.routeKey;
  logger.info('Weather domain handler invoked', { routeKey });

  try {
    const query = event.queryStringParameters || {};

    let result;

    switch (routeKey) {
      case 'GET /weather':
        result = await weatherService.getIntegratedWeather(query);
        break;

      case 'GET /weather/summary':
        result = await weatherService.getWeather(query);
        break;

      case 'GET /weather/airquality':
        result = await weatherService.getAirQuality(query);
        break;

      default:
        logger.warn('Route not found in Weather handler', { routeKey });
        throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }

    return success(result);
  } catch (err) {
    logger.error('Weather handler error', { error: err.message, stack: err.stack, routeKey });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
