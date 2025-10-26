const axios = require('axios');
const xml2js = require('xml2js');
const { logger } = require('@utils/logger');

// XML parser instance (reusable)
const parser = new xml2js.Parser({ explicitArray: false });

// API configuration
const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;
const API_KEY = process.env.NMC_HOSPITAL_KEY;
const DEFAULT_NUM_ROWS = 10;

/**
 * Validate required environment variables
 * @throws {Error} If required environment variables are missing
 */
const validateEnvironment = () => {
  if (!ENDPOINT || !API_KEY) {
    throw new Error('NMC_HOSPITAL_ENDPOINT and NMC_HOSPITAL_KEY must be configured');
  }
};

/**
 * Fetch nearby medical facilities (hospitals and pharmacies)
 * @param {string} lat - Latitude (WGS84_Y)
 * @param {string} lon - Longitude (WGS84_X)
 * @param {number} [numOfRows=10] - Number of results to return
 * @returns {Promise<Array>} Array of medical facility data (JSON)
 * @throws {Error} If API call fails or response parsing fails
 */
const fetchNearbyFacilities = async (lat, lon, numOfRows = DEFAULT_NUM_ROWS) => {
  try {
    validateEnvironment();

    const params = {
      serviceKey: API_KEY,
      WGS84_Y: lat,
      WGS84_X: lon,
      numOfRows,
    };

    logger.debug(`주변 시설 조회 중 - 좌표: ${lat}, ${lon}`);
    const response = await axios.get(ENDPOINT, { params });
    const xmlData = response.data;

    // async/await를 사용하여 XML 데이터를 JSON으로 파싱
    const result = await parser.parseStringPromise(xmlData);

    // 파싱된 결과에서 항목 추출
    const items = result.response?.body?.items?.item;

    // 배열 반환 (단일 항목과 다중 항목 모두 처리)
    if (!items) {
      logger.debug('주변 의료시설을 찾을 수 없음');
      return [];
    }

    return Array.isArray(items) ? items : [items];
  } catch (error) {
    if (error.response) {
      logger.error('NMC API 오류', {
        statusCode: error.response.status,
        data: error.response.data,
      });
    } else if (error.message.includes('parseStringPromise')) {
      logger.error('의료 API XML 응답 파싱 실패');
    } else {
      logger.error(`의료 API 네트워크 오류: ${error.message}`);
    }
    throw new Error('주변 의료시설 조회 실패');
  }
};

module.exports = { fetchNearbyFacilities };
