/**
 * @fileoverview Medical Facility Data Fetcher (Gzip version)
 *
 * 공공데이터포털(Data.go.kr)의 "국립중앙의료원_전국 병·의원 찾기 서비스" API를 사용하여
 * 전국의 의료기관 정보를 수집하고, Hive 스타일 파티션 구조(source/dt/page)에 맞춰 
 * Gzip 압축 JSON(.json.gz)으로 저장하는 스크립트이다.
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
 * 4. Storage: `data/raw/hospitals/source=data_go_kr/dt={YYYY-MM-DD}/` 폴더에
 *    `page={XXXX}.json.gz` 형식으로 압축 저장.
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
 * @requires zlib
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
const zlib = require('zlib');
const { promisify } = require('util');

// Gzip 압축을 비동기(Promise) 방식으로 사용하기 위해 promisify 적용
const gzipAsync = promisify(zlib.gzip);

// ============================================================================
// Logger Configuration
// ============================================================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
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

const PARSER_OPTIONS = {
  explicitArray: false, // 단일 요소가 배열로 감싸지는 것을 방지
  trim: true,           // 텍스트 앞뒤 공백 제거
};

/**
 * API 응답 필드와 데이터베이스/JSON 스키마 필드 간의 매핑 정의
 */
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
 * 특정 페이지의 의료기관 데이터를 API로부터 가져옵니다.
 * 
 * @param {number} pageNo 조회할 페이지 번호
 * @returns {Promise<Object[]>} 의료기관 목록 배열
 */
async function fetchMedicalFacilitiesFromApi(pageNo) {
  try {
    const response = await axios.get(API_ENDPOINT, {
      headers: { Accept: 'application/xml' },
      params: {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
      },
    });

    const result = await parseStringPromise(response.data, PARSER_OPTIONS);

    if (result?.response?.header?.resultCode !== '00') {
      throw new Error(`API Error: ${result?.response?.header?.resultMsg}`);
    }

    const items = result.response.body?.items?.item;
    if (!items) return [];
    
    // 데이터가 1개일 경우 객체로 반환되므로 배열로 정규화
    return Array.isArray(items) ? items : [items];
  } catch (error) {
    logger.error({ err: error, pageNo }, `Failed to fetch page ${pageNo} from API`);
    return [];
  }
}

/**
 * API 응답 데이터를 내부 서비스 규격에 맞게 변환합니다.
 * 
 * @param {Object} rawItem API로부터 받은 원본 데이터 객체
 * @returns {Object} 변환된 데이터 객체
 */
function normalizeFacilityData(rawItem) {
  const normalized = {};
  for (const [apiKey, serviceKey] of Object.entries(FIELD_MAPPING)) {
    if (rawItem[apiKey] !== undefined && rawItem[apiKey] !== null) {
      normalized[serviceKey] = rawItem[apiKey];
    }
  }
  return normalized;
}

/**
 * 현재 날짜를 YYYY-MM-DD 형식의 문자열로 반환합니다.
 */
function getCurrentDatePath() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * 전체 의료기관 데이터를 순회하며 수집 및 저장하는 메인 함수입니다.
 */
async function startMedicalDataIngestion() {
  if (!SERVICE_KEY) {
    logger.fatal('Required environment variable MEDICAL_FACILITIES_API_KEY is missing.');
    process.exit(1);
  }

  const datePartition = getCurrentDatePath();
  const baseOutputDir = path.join(
    process.cwd(),
    'data', 'raw', 'hospitals',
    'source=data_go_kr',
    `dt=${datePartition}`
  );

  logger.info({ apiEndpoint: API_ENDPOINT, baseOutputDir }, 'Starting medical facility data ingestion');

  try {
    // 저장 폴더 생성 (하위 폴더 포함)
    await fs.mkdir(baseOutputDir, { recursive: true });
    
    let currentPage = 1;
    let totalItemsProcessed = 0;

    while (currentPage < 1000) { // 무한 루프 방지를 위한 안전 장치
      logger.info({ currentPage }, 'Fetching facilities from API...');
      const rawFacilities = await fetchMedicalFacilitiesFromApi(currentPage);

      if (rawFacilities.length === 0) {
        logger.info('No more data found. Ingestion complete.');
        break;
      }

      // 1. 유효한 의료기관(응급실 운영 등) 필터링 및 데이터 정규화
      const processedFacilities = rawFacilities
        .filter(item => item.dutyEmclsName !== '응급의료기관 이외')
        .map(normalizeFacilityData);

      // 2. 파일 저장 처리
      if (processedFacilities.length > 0) {
        const jsonContent = JSON.stringify(processedFacilities, null, 2);
        const compressedBuffer = await gzipAsync(jsonContent);

        const fileName = `page=${String(currentPage).padStart(4, '0')}.json.gz`;
        const savePath = path.join(baseOutputDir, fileName);
        
        await fs.writeFile(savePath, compressedBuffer);
        totalItemsProcessed += processedFacilities.length;
        
        logger.info({ currentPage, count: processedFacilities.length, file: fileName }, 'Successfully saved compressed page');
      } else {
        logger.info({ currentPage }, 'No relevant facilities to save on this page.');
      }

      currentPage++;
      
      // API 서버 부하 방지를 위한 짧은 대기 (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info({ totalItemsProcessed }, 'Medical facility data ingestion finished successfully');
  } catch (error) {
    logger.fatal({ err: error }, 'Critical error occurred during data ingestion');
    process.exit(1);
  }
}

// 스크립트 실행
startMedicalDataIngestion();