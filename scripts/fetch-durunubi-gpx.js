/**
 * @fileoverview Durunubi GPX Data Fetcher
 *
 * 한국관광공사가 제공하는 "두루누비 정보 서비스_GW" API를 사용하여
 * 전국 순환형 트래킹 코스 '코리아둘레길'의 코스 목록을 전체 순회(Pagination)하고 GPX 파일을 수집하는 스크립트이다.
 *
 * --------------------------------------------------------------------------------
 * [Target API Information]
 * - Service Name: 한국관광공사_두루누비 정보 서비스_GW
 * - Operation: 코스정보목록 조회 (courseList)
 * - Provider: 공공데이터포털
 * --------------------------------------------------------------------------------
 *
 * [Data Processing Strategy]
 * 1. Pagination: 'numOfRows'와 'totalCount'를 기반으로 마지막 페이지까지 자동 순회.
 * 2. Extraction: 응답 데이터(JSON)에서 다음 필드들을 추출하여 활용.
 *    - `crsIdx`: 코스 고유 ID. 파일명 생성 및 식별에 사용.
 *    - `gpxpath`: 실제 GPX 데이터를 다운로드할 원격 URL.
 * 3. Storage: 추출한 URL에서 XML/GPX 데이터를 받아 로컬 `gpx_files/durunubi/` 폴더에 저장.
 * --------------------------------------------------------------------------------
 *
 * [Required Environment Variables]
 * - `DURUNUBI_SERVICE_KEY`: 두루누비 API 인증 키
 * - `LOG_LEVEL`: (Optional) 로그 레벨 (default: info)
 * - `NODE_ENV`: (Optional) 실행 환경 (development/production)
 * --------------------------------------------------------------------------------
 *
 * @see {@link https://www.data.go.kr/data/15101974/openapi.do#/API%20%EB%AA%A9%EB%A1%9D/courseList | 한국관광공사_두루누비 정보 서비스_GW API 문서}
 *
 * @requires dotenv
 * @requires axios
 * @requires fs/promises
 * @requires pino
 */

/**
 * 공공데이터포털 두루누비 정보 서비스 코스 목록 정보 조회 API Response Item Schema
 * @typedef {Object} CourseItem
 * @property {string} crsIdx - 코스 고유 식별자 (e.g., "T_CRS_MNG0000005116")
 * @property {string} crsKorNm - 코스 명칭 (e.g., "남파랑길 1코스")
 * @property {string} crsDstnc - 코스 총 거리 (km)
 * @property {string} crsTotlRqrmHour - 코스 총 소요 시간 (분)
 * @property {string} crsLevel - 난이도 코드 (1: 하, 2: 중, 3: 상)
 * @property {string} crsContents - 코스 설명/내용
 * @property {string} sigun - 소재지 시군구 명칭
 * @property {string} gpxpath - GPX 파일 다운로드 경로 (핵심 수집 대상)
 * @property {string} [modifiedtime] - 최종 수정 시각
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const pino = require('pino');

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * Configure Pino logger.
 *
 * - Environment: Production에서는 JSON 포맷(Log Aggregation 용이성), Development에서는 Pretty Print 권장.
 * - Timestamp: ISO 8601 포맷 사용.
 * - Level: 환경 변수로 제어하여 불필요한 I/O 오버헤드 방지.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  base: {
    service: 'durunubi-fetcher',
    env: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// Constants & Configuration
// ============================================================================

const SERVICE_KEY = process.env.DURUNUBI_SERVICE_KEY;

/**
 * Base URL for Durunubi API
 * @see https://www.data.go.kr/data/15101974/openapi.do#/API%20%EB%AA%A9%EB%A1%9D/courseList
 */
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';

/**
 * Number of items to fetch per API call.
 * API 최대 허용치에 맞춰 설정하여 HTTP Request 횟수를 최소화한다.
 */
const NUM_OF_ROWS = 100;

const OUTPUT_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches a single GPX file stream and writes it to the disk.
 *
 * @param {string} url - The remote URL of the GPX file.
 * @param {string} savePath - The absolute local path where the file will be saved.
 * @returns {Promise<void>} Resolves when the file is successfully written.
 */
const fetchAndSaveGpx = async (url, savePath) => {
  const fileName = path.basename(savePath);
  try {
    // GPX는 XML 기반 텍스트 형식이므로 responseType을 'text'로 명시한다.
    const response = await axios.get(url, { responseType: 'text' });
    await fs.writeFile(savePath, response.data);

    // High volume logs (success cases) are kept at 'debug' level to reduce noise in production.
    logger.debug({ fileName, url }, 'GPX file saved successfully');
  } catch (error) {
    // Pass the raw Error object to 'err' key for proper stack trace serialization.
    logger.error({ err: error, fileName, url }, 'Failed to fetch or save GPX');
  }
};

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * Main Orchestrator.
 *
 * 1. Output 디렉토리 생성.
 * 2. API Pagination을 수행하며 코스 목록 조회.
 * 3. 각 코스의 GPX URL을 추출하여 비동기 병렬 다운로드 실행.
 * 4. Rate Limiting을 준수하며 마지막 페이지까지 반복.
 */
const fetchAllCourses = async () => {
  logger.info({ outputDir: OUTPUT_DIR, apiBaseUrl: API_BASE_URL }, 'Starting Durunubi course data fetch');

  // Initialization: Fail fast if the environment is not ready (e.g., permission issues).
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    logger.fatal({ err: error, outputDir: OUTPUT_DIR }, 'Could not create output directory');
    process.exit(1);
  }

  let pageNo = 1;
  let totalFetched = 0;

  // Infinite loop for pagination, broken by explicit exit conditions.
  while (true) {
    logger.info({ pageNo }, 'Fetching course list page');

    try {
      const response = await axios.get(API_BASE_URL, {
        params: {
          serviceKey: SERVICE_KEY,
          pageNo: pageNo,
          numOfRows: NUM_OF_ROWS,
          MobileOS: 'ETC',
          MobileApp: 'AppTest',
          _type: 'json',
        },
      });

      // Defensive coding: API structure might change or return unexpected nulls.
      const body = response.data?.response?.body;
      if (!body) {
        logger.warn({ responseData: response.data }, 'Invalid response body received');
        break;
      }

      // Exit Condition 1: API explicitly returns 0 rows.
      if (body.numOfRows === 0) {
        logger.info('No more items found based on numOfRows. Stopping.');
        break;
      }

      // API 응답 정규화 (Single Object vs Array 처리)
      const items = body.items?.item || [];
      const courseItems = Array.isArray(items) ? items : [items];

      // Exit Condition 2: Empty item list.
      if (courseItems.length === 0) {
        logger.info('No items in this page. Stopping.');
        break;
      }

      logger.info({ count: courseItems.length, pageNo }, 'Found courses on page, processing GPX files...');

      // -------------------------------------------------------
      // Data Extraction & Mapping
      // -------------------------------------------------------
      // Concurrency: Process all items in the current page in parallel.
      // Promise.allSettled를 사용하지 않고 Promise.all을 사용하는 이유는
      // 개별 파일 실패는 내부 catch에서 처리하고, 전체 프로세스를 중단하지 않기 위함이다.
      const gpxFetchPromises = courseItems.map((/** @type {CourseItem} */ item) => {
        // Essential fields validation:
        // - gpxpath: Source URL for download
        // - crsIdx: Unique identifier for file naming
        if (item.gpxpath && item.crsIdx) {
          const fileName = `${item.crsIdx}.gpx`;
          const savePath = path.join(OUTPUT_DIR, fileName);
          return fetchAndSaveGpx(item.gpxpath, savePath);
        }
        
        logger.warn({ item }, 'Skipping item: Missing critical fields (gpxpath or crsIdx)');
        return Promise.resolve();
      });

      await Promise.all(gpxFetchPromises);
      totalFetched += courseItems.length;

      // Exit Condition 3: Last page detection (Received items < Requested limit).
      if (body.numOfRows < NUM_OF_ROWS) {
        logger.info('Reached the last page.');
        break;
      }

      pageNo++;

      // Rate Limiting: Introduce a delay to prevent '429 Too Many Requests' or IP blocking.
      await new Promise((resolve) => setTimeout(resolve, 200));

    } catch (error) {
      // Error in one page should not crash the entire process immediately,
      // but currently, we choose to break to avoid infinite error loops.
      logger.error({ err: error, pageNo }, 'An error occurred while fetching page');
      break;
    }
  }

  logger.info({ totalFetched }, 'Fetching complete');
};

// Execute
fetchAllCourses().catch(err => {
  logger.fatal({ err }, 'Unhandled exception in main execution');
  process.exit(1);
});