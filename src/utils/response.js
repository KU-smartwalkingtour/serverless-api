const { ServerError, ERROR_CODES } = require('./error');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

const success = (data, statusCode = 200) => ({
  statusCode,
  headers,
  body: JSON.stringify(data),
});

const error = (err) => {
  if (ServerError.isServerError(err)) {
    return {
      statusCode: err.statusCode,
      headers,
      body: JSON.stringify(err.toJSON()),
    };
  }

  const serverError = new ServerError(ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify(serverError.toJSON()),
  };
};

const notFound = () => {
  const err = new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify(err.toJSON()),
  };
};

const badRequest = (details = {}) => {
  const err = new ServerError(ERROR_CODES.INVALID_INPUT, 400, details);
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify(err.toJSON()),
  };
};

const unauthorized = () => {
  const err = new ServerError(ERROR_CODES.UNAUTHORIZED, 401);
  return {
    statusCode: 401,
    headers,
    body: JSON.stringify(err.toJSON()),
  };
};

module.exports = { success, error, notFound, badRequest, unauthorized, headers };
