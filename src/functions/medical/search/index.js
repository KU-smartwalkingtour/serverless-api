const { logger } = require('utils/logger');
const { success, error } = require('utils/response');
const { ServerError, ERROR_CODES } = require('utils/error');
const { search } = require('services/medicalService');

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};

  logger.info('Medical search request');

  try {
    const result = await search(query);
    return success(result);
  } catch (err) {
    logger.error('Medical search error', { error: err.message });
    if (ServerError.isServerError(err)) {
      return error(err);
    }
    return error(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500));
  }
};
