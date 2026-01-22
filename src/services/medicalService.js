const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');
const { searchFacilities } = require('../utils/medical');

async function search(searchOptions) {
  if (Object.keys(searchOptions).length === 0) {
    throw new ServerError(
      ERROR_CODES.INVALID_QUERY_PARAMS,
      400,
      '하나 이상의 검색 조건이 필요합니다.'
    );
  }

  logger.info('Medical search request', { searchOptions });

  const medicalFacilities = await searchFacilities(searchOptions);
  return medicalFacilities;
}

module.exports = {
  search,
};
