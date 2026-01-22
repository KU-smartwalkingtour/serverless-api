const axios = require('axios');
const { logger } = require('./logger');

const DEFAULT_NUM_ROWS = 10;
const OPERATION_NAME = '/getHsptlMdcncListInfoInqire';

const validateEnvironment = () => {
  if (!process.env.NMC_HOSPITAL_ENDPOINT || !process.env.NMC_HOSPITAL_KEY) {
    throw new Error(
      'NMC_HOSPITAL_ENDPOINT and NMC_HOSPITAL_KEY must be configured'
    );
  }
};

const searchFacilities = async (searchOptions = {}) => {
  try {
    validateEnvironment();

    const API_KEY = process.env.NMC_HOSPITAL_KEY;
    const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;

    logger.info('Medical API request', {
      keyLength: API_KEY?.length,
    });

    const params = {
      ServiceKey: API_KEY,
      ...searchOptions,
    };
    if (!params.pageNo) {
      params.pageNo = 1;
    }
    if (!params.numOfRows) {
      params.numOfRows = DEFAULT_NUM_ROWS;
    }

    const fullUrl = ENDPOINT.replace(/\/+$/, '') + OPERATION_NAME;

    logger.info('API request info', {
      fullUrl,
      params: JSON.stringify({
        ...params,
        ServiceKey: `${String(params.ServiceKey).slice(0, 10)}...`,
      }),
    });

    const response = await axios.get(fullUrl, { params });

    const result = response.data;

    if (result.response?.header?.resultCode !== '00') {
      logger.warn('NMC API returned error', {
        code: result.response?.header?.resultCode,
        msg: result.response?.header?.resultMsg,
      });
      return [];
    }

    const items = result.response?.body?.items?.item;

    if (!items) {
      logger.info('No medical facilities found for search criteria');
      return [];
    }

    return Array.isArray(items) ? items : [items];
  } catch (error) {
    if (error.response) {
      logger.error('NMC API HTTP error', {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      logger.error(`Medical API error: ${error.message}`);
    }
    throw new Error('Medical facility search failed');
  }
};

module.exports = { searchFacilities };
