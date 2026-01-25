const { ServerError, ERROR_CODES } = require('./error');

/**
 * Extracts the user ID (sub) from the API Gateway event context.
 * Supports both Cognito JWT Authorizer and Legacy Lambda Authorizer.
 * @param {object} event - The Lambda event object
 * @returns {string|null} - The user ID or null if not found
 */
const getUserId = (event) => {
  // 1. Cognito JWT Authorizer (standard)
  if (event.requestContext?.authorizer?.jwt?.claims?.sub) {
    return event.requestContext.authorizer.jwt.claims.sub;
  }
  
  // 2. Legacy Lambda Authorizer (if any)
  if (event.requestContext?.authorizer?.lambda?.userId) {
    return event.requestContext.authorizer.lambda.userId;
  }

  return null;
};

/**
 * Extracts the user ID or throws UNAUTHORIZED if missing.
 * @param {object} event 
 * @returns {string} User ID
 */
const requireUserId = (event) => {
  const userId = getUserId(event);
  if (!userId) {
    throw new ServerError(ERROR_CODES.UNAUTHORIZED, 401);
  }
  return userId;
};

/**
 * Extracts the Bearer token from the Authorization header.
 * @param {object} event - The Lambda event object
 * @returns {string|null} - The access token or null
 */
const getAccessToken = (event) => {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) return null;
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return authHeader;
};

module.exports = {
  getUserId,
  requireUserId,
  getAccessToken
};