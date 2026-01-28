/**
 * @fileoverview Durunubi Course Data Seeder
 *
 * 한국관광공사가 제공하는 "두루누비 정보 서비스_GW" API를 사용하여
 * 전국 순환형 트래킹 코스 '코리아둘레길'의 코스 목록을 조회하고,
 * 코스 메타데이터를 로컬 JSON 파일로 저장하는 스크립트이다.
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
 * 2. Extraction & Mapping: 응답 데이터(JSON)에서 다음 필드들을 추출하여 서비스 모델에 매핑.
 *    - `crsIdx` -> `course_id`: 코스 식별자
 *    - `crsKorNm` -> `course_name`: 코스 명칭
 *    - `crsDstnc` -> `course_length`: 코스 거리 (km)
 *    - `crsTotlRqrmHour` -> `course_duration`: 소요 시간 (분)
 *    - `crsLevel` -> `course_difficulty`: 난이도 (1:하, 2:중, 3:상)
 *    - `crsContents` -> `course_description`: 코스 설명
 *    - `sigun` -> `location`: 소재지 (시군구)
 * 3. Storage: `data/raw/trails/source=durunubi/dt={YYYY-MM-DD}/meta/` 폴더에
 *    `page={XXXX}.json.gz` 형식으로 압축 저장.
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
 * @requires zlib
 */

/**
 * 공공데이터포털 두루누비 정보 서비스 코스 목록 정보 조회 API Response Item Schema
 * @typedef {Object} CourseItem
 * @property {string} crsIdx - 코스 고유 식별자 (e.g., "T_CRS_MNG0000005116")
 * @property {string} crsKorNm - 코스 명칭
 * @property {string} crsDstnc - 코스 총 거리 (km 단위 문자열)
 * @property {string} crsTotlRqrmHour - 코스 총 소요 시간 (분 단위 문자열)
 * @property {string} crsLevel - 난이도 코드 (1: 하, 2: 중, 3: 상)
 * @property {string} crsContents - 코스 설명/내용
 * @property {string} sigun - 소재지 시군구 명칭
 * @property {string} gpxpath - GPX 파일 다운로드 경로 (파일명 추출에 사용)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const pino = require('pino');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * Configure Pino logger.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  base: {
    service: 'durunubi-seeder',
    env: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// Constants & Configuration
// ============================================================================

const SERVICE_KEY = process.env.DURUNUBI_SERVICE_KEY;
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';
const NUM_OF_ROWS = 100;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 현재 날짜를 YYYY-MM-DD 형식의 문자열로 반환합니다.
 */
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * API의 숫자 난이도 코드를 사람이 읽을 수 있는 문자열로 변환합니다.
 *
 * @param {string} level - API에서 받은 난이도 값 ("1", "2", "3")
 * @returns {string|null} 변환된 난이도 ("하", "중", "상") 또는 null
 */
const mapDifficulty = (level) => {
  switch (level) {
    case '1':
      return '하';
    case '2':
      return '중';
    case '3':
      return '상';
    default:
      return null;
  }
};

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * 메인 시딩 함수.
 * API 페이지를 순회하며 데이터를 가공하여 로컬 파일 시스템에 저장합니다.
 */
const seedDatabase = async () => {
  if (!SERVICE_KEY) {
    logger.fatal('DURUNUBI_SERVICE_KEY environment variable is not set.');
    process.exit(1);
  }

  // Define dynamic paths
  const dateStr = getTodayDateString();
  const baseDir = path.join(process.cwd(), 'data', 'raw', 'trails', 'source=durunubi', `dt=${dateStr}`);
  // Metadata will be saved in the 'meta' subdir
  const metaDir = path.join(baseDir, 'meta');

  logger.info({ metaDir }, 'Starting Durunubi course meta data collection');
  
  try {
    // 메타데이터 저장 디렉토리 생성
    await fs.mkdir(metaDir, { recursive: true });

    let pageNo = 1;
    let totalProcessed = 0;

    while (true) {
      logger.info({ pageNo }, 'Fetching API data');

      const response = await axios.get(API_BASE_URL, {
        params: {
          serviceKey: SERVICE_KEY,
          pageNo,
          numOfRows: NUM_OF_ROWS,
          MobileOS: 'ETC',
          MobileApp: 'AppTest',
          _type: 'json',
        },
      });

      const body = response.data?.response?.body;
      if (!body || body.numOfRows === 0 || !body.items) {
        logger.info('No more items from API or empty body. Stopping.');
        break;
      }

      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      logger.info({ count: items.length, pageNo }, 'Processing items...');

      const processedItems = items.map((/** @type {CourseItem} */ item) => {
        // 새로운 스키마에 맞게 데이터 객체 구성
        return {
          course_id: item.crsIdx,
          course_name: item.crsKorNm,
          course_type: 'durunubi', // 타입 고정
          course_length: item.crsDstnc ? parseFloat(item.crsDstnc) : null,
          course_duration: item.crsTotlRqrmHour ? parseInt(item.crsTotlRqrmHour, 10) : null, // 분 단위로 가정
          course_difficulty: mapDifficulty(item.crsLevel),
          course_description: item.crsContents,
          location: item.sigun,
        };
      });

      // 파일 저장 (JSON.gz)
      if (processedItems.length > 0) {
        const jsonContent = JSON.stringify(processedItems, null, 2);
        const compressed = await gzip(jsonContent);

        const fileName = `page=${String(pageNo).padStart(4, '0')}.json.gz`;
        const savePath = path.join(metaDir, fileName);

        await fs.writeFile(savePath, compressed);
        totalProcessed += processedItems.length;

        logger.info({ pageNo, count: processedItems.length, file: fileName }, 'Saved compressed metadata');
      } 

      if (body.numOfRows < NUM_OF_ROWS) {
        logger.info('Reached the last page from API.');
        break;
      }

      pageNo++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    logger.info({ totalProcessed }, 'Durunubi metadata collection complete');

  } catch (error) {
    logger.fatal({ err: error }, 'A critical error occurred during the seeding process');
    process.exit(1);
  }
};

// --- Execute the script ---
seedDatabase();
