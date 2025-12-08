const { logger } = require('/opt/nodejs/utils/logger');
const { success, error } = require('/opt/nodejs/utils/response');
const { ServerError, ERROR_CODES } = require('/opt/nodejs/utils/error');
const { getIntegratedWeather } = require('/opt/nodejs/services/weatherService');

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};

  logger.info('Weather integrated request');

  try {
    const result = await getIntegratedWeather(query);
    return success(result);
  } catch (err) {
    logger.error('Weather integrated error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
