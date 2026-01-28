/**
 * @fileoverview Medical Facility Data Fetcher
 *
 * 공공데이터포털(Data.go.kr)의 "국립중앙의료원_전국 병·의원 찾기 서비스" API를 사용하여
 * 전국의 의료기관 정보를 수집하고, 응급실 운영 여부 등을 포함하여 로컬 JSON 파일로 저장하는 스크립트이다.
 *
 * --------------------------------------------------------------------------------
 * [Target API Information]
 * - Service Name: 국립중앙의료원_전국 병·의원 찾기 서비스
 * - Operation: 병의원기본정보조회 (getHsptlMdcncFullDown)
 * - Provider: 공공데이터포털 (보건복지부 국립중앙의료원)
 * --------------------------------------------------------------------------------
 *
 * [Data Processing Strategy]
 * 1. Pagination: 1페이지부터 시작하여 데이터가 없을 때까지 순회 (Page Size: 1000).
 * 2. Filtering: `dutyEmclsName`이 '응급의료기관 이외'인 단순 의원급은 제외하고,
 *    응급실 운영 가능성이 있거나 규모가 있는 병원급 이상을 선별하여 저장.
 * 3. Transformation: API의 한글/약어 필드명을 영어 Key로 변환.
 * 4. Storage: `data/medical-facilities/` 폴더에 페이지별 JSON 파일로 저장.
 * --------------------------------------------------------------------------------
 *
 * [Required Environment Variables]
 * - `MEDICAL_FACILITIES_API_KEY`: 공공데이터포털 API 인증 키 (Encoding)
 * - `LOG_LEVEL`: (Optional) 로그 레벨 (default: info)
 * - `NODE_ENV`: (Optional) 실행 환경 (development/production)
 * --------------------------------------------------------------------------------
 *
 * @see {@link https://www.data.go.kr/data/15000563/openapi.do | 국립중앙의료원_전국 병·의원 찾기 서비스 API 문서}
 *
 * @requires module-alias/register
 * @requires dotenv
 * @requires axios
 * @requires xml2js
 * @requires pino
 * @requires fs/promises
 */

/**
 * 전국 병·의원 찾기 서비스 API Response Item Schema (XML to JSON)
 * @typedef {Object} MedicalFacilityItem
 * @property {string} hpid - 기관 ID (e.g., "A1100010")
 * @property {string} dutyName - 기관명 (e.g., "청구성심병원")
 * @property {string} dutyAddr - 주소
 * @property {string} [postCdn1] - 우편번호1
 * @property {string} [postCdn2] - 우편번호2
 * @property {string} [dutyDiv] - 병원분류코드 (e.g., "A")
 * @property {string} [dutyDivNam] - 병원분류명 (e.g., "종합병원")
 * @property {string} [dutyEmcls] - 응급의료기관코드
 * @property {string} [dutyEmclsName] - 응급의료기관명 (e.g., "지역응급의료센터")
 * @property {string} [dutyEryn] - 응급실운영여부 (1: 운영, 2: 비운영)
 * @property {string} [dutyTel1] - 대표전화
 * @property {string} [dutyTel3] - 응급실전화
 * @property {string} [wgs84Lat] - 위도
 * @property {string} [wgs84Lon] - 경도
 * @property {string} [dutyTime1s] - 진료시간(월) 시작
 * @property {string} [dutyTime1c] - 진료시간(월) 종료
 * @property {string} [dutyTime2s] - 진료시간(화) 시작
 * @property {string} [dutyTime2c] - 진료시간(화) 종료
 * @property {string} [dutyTime3s] - 진료시간(수) 시작
 * @property {string} [dutyTime3c] - 진료시간(수) 종료
 * @property {string} [dutyTime4s] - 진료시간(목) 시작
 * @property {string} [dutyTime4c] - 진료시간(목) 종료
 * @property {string} [dutyTime5s] - 진료시간(금) 시작
 * @property {string} [dutyTime5c] - 진료시간(금) 종료
 * @property {string} [dutyTime6s] - 진료시간(토) 시작
 * @property {string} [dutyTime6c] - 진료시간(토) 종료
 * @property {string} [dutyTime7s] - 진료시간(일) 시작
 * @property {string} [dutyTime7c] - 진료시간(일) 종료
 * @property {string} [dutyTime8s] - 진료시간(공휴일) 시작
 * @property {string} [dutyTime8c] - 진료시간(공휴일) 종료
 */

require('module-alias/register');
require('dotenv').config();
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const pino = require('pino');
const fs = require('fs/promises');
const path = require('path');

// ============================================================================
// Logger Configuration
// ============================================================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  base: {
    service: 'medical-facility-fetcher',
    env: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// Constants & Configuration
// ============================================================================

const SERVICE_KEY = process.env.MEDICAL_FACILITIES_API_KEY;
const API_ENDPOINT = 'http://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncFullDown';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'medical-facilities');

const PARSER_OPTIONS = {
  explicitArray: false, // <item> sub-elements are not wrapped in an array
  trim: true,
};

// Maps API response fields to our database columns
const FIELD_MAPPING = {
  hpid: 'hpid',
  dutyName: 'name',
  dutyAddr: 'address',
  postCdn1: 'postal_code1',
  postCdn2: 'postal_code2',
  dutyDiv: 'hospital_div_code',
  dutyDivNam: 'hospital_div_name',
  dutyEmcls: 'emergency_class_code',
  dutyEmclsName: 'emergency_class_name',
  dutyEryn: 'emergency_room_open',
  dutyTel1: 'tel_main',
  dutyTel3: 'tel_emergency',
  dutyMapimg: 'map_hint',
  dutyTime1s: 'time_mon_start',
  dutyTime1c: 'time_mon_end',
  dutyTime2s: 'time_tue_start',
  dutyTime2c: 'time_tue_end',
  dutyTime3s: 'time_wed_start',
  dutyTime3c: 'time_wed_end',
  dutyTime4s: 'time_thu_start',
  dutyTime4c: 'time_thu_end',
  dutyTime5s: 'time_fri_start',
  dutyTime5c: 'time_fri_end',
  dutyTime6s: 'time_sat_start',
  dutyTime6c: 'time_sat_end',
  dutyTime7s: 'time_sun_start',
  dutyTime7c: 'time_sun_end',
  dutyTime8s: 'time_hol_start',
  dutyTime8c: 'time_hol_end',
  wgs84Lat: 'latitude',
  wgs84Lon: 'longitude',
  rnum: 'rnum',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches a single page of data from the API.
 * @param {number} pageNo - The page number to fetch.
 * @returns {Promise<MedicalFacilityItem[]>} A promise that resolves to an array of items.
 */
async function fetchPage(pageNo) {
  try {
    const response = await axios.get(API_ENDPOINT, {
      headers: {
        Accept: 'application/xml',
      },
      params: {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000, // Per API documentation, utilizing a large batch size
      },
    });

    const xml = response.data;
    const result = await parseStringPromise(xml, PARSER_OPTIONS);

    // Defensive check for response structure
    if (!result?.response?.header) {
      throw new Error('Invalid API response structure');
    }

    if (result.response.header.resultCode !== '00') {
      throw new Error(`API Error: ${result.response.header.resultMsg}`);
    }

    const items = result.response.body?.items?.item;
    
    // Normalize to array
    if (!items) return [];
    return Array.isArray(items) ? items : [items];

  } catch (error) {
    logger.error({ err: error, pageNo }, `Error fetching page ${pageNo}`);
    return [];
  }
}

/**
 * Transforms a single API item into the format for our database model.
 * @param {MedicalFacilityItem} item - The item from the API response.
 * @returns {object} The transformed object for DB insertion.
 */
function transformItem(item) {
  const transformed = {};
  for (const apiKey in FIELD_MAPPING) {
    const modelKey = FIELD_MAPPING[apiKey];
    if (item[apiKey] !== undefined && item[apiKey] !== null) {
      transformed[modelKey] = item[apiKey];
    }
  }
  return transformed;
}

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * Main function to fetch all data and store it in the database.
 */
async function run() {
  // 1. Environment Validation
  if (!SERVICE_KEY) {
    logger.fatal('MEDICAL_FACILITIES_API_KEY environment variable is not set.');
    process.exit(1);
  }

  logger.info({ apiEndpoint: API_ENDPOINT, outputDir: OUTPUT_DIR }, 'Starting to fetch medical facility data...');

  try {
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    let pageNo = 1;
    let totalSaved = 0;

    // 2. Fetch Loop
    while (true) {
      logger.info({ pageNo }, 'Fetching page...');
      const items = await fetchPage(pageNo);

      if (items.length === 0) {
        logger.info('No more items found (empty list). Finishing process.');
        break;
      }

      // 3. Filtering
      const filteredItems = items.filter(
        (item) => item.dutyEmclsName !== '응급의료기관 이외'
      );

      // 4. Storage (JSON File)
      if (filteredItems.length > 0) {
        const recordsToSave = filteredItems.map(transformItem);
        
        const filePath = path.join(OUTPUT_DIR, `medical-facilities-page-${pageNo}.json`);
        await fs.writeFile(filePath, JSON.stringify(recordsToSave, null, 2), 'utf8');

        totalSaved += recordsToSave.length;
        logger.info(
          { count: recordsToSave.length, pageNo, filePath },
          'Saved records to JSON file'
        );
      } else {
        logger.info({ pageNo }, 'No relevant items to save on this page.');
      }

      pageNo++;
      
      // Basic rate limiting to be safe (optional but good practice)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info({ totalSaved }, 'Finished fetching and saving data.');

  } catch (error) {
    logger.fatal({ err: error }, 'A critical error occurred during execution');
    process.exit(1);
  }
}

run();