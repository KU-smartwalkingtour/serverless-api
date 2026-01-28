/**
 * @fileoverview Seoul Trail Course Data Seeder
 *
 * 서울 열린데이터 광장이 제공하는 "서울둘레길 코스 정보" API를 사용하여
 * 서울둘레길의 코스 목록을 조회하고, 로컬 GPX 파일과 결합하여 DynamoDB에 저장하는 스크립트이다.
 *
 * --------------------------------------------------------------------------------
 * [Target API Information]
 * - Service Name: 서울둘레길 정보 (viewGil)
 * - Provider: 서울 열린데이터 광장
 * - Operation: JSON/viewGil
 * --------------------------------------------------------------------------------
 *
 * [Data Processing Strategy]
 * 1. Fetch: 서울 열린데이터 광장 API에서 전체 코스 데이터 조회 (Pagination 없음, 단일 호출).
 * 2. Extraction & Mapping:
 *    - `GIL_NO` -> `course_id`: "seoultrail_{GIL_NO}" 형식으로 생성 (Unique ID)
 *    - `GIL_NM` -> `course_name`: "{GIL_NM} 서울둘레길" 형식
 *    - `GIL_LEN` -> `course_length`: 거리 (km)
 *    - `REQ_TM` -> `course_duration`: "약 4시간 50분" 포맷을 분 단위 정수로 파싱
 *    - `LV_CD` -> `course_difficulty`: 난이도 매핑 (초급->하, 중급->중, 상급->상)
 *    - `GIL_EXPLN` -> `course_description`: 설명 (개행 문자 제거)
 *    - `STRT_PSTN` -> `location`: 시작 지점 주소
 * 3. GPX Integration: `gpx_files/seoultrail/seoultrail_{GIL_NO}.gpx` 파일 파싱하여 시작점 좌표 추출.
 * 4. Storage: DynamoDB `COURSE_DATA_TABLE`에 저장.
 * --------------------------------------------------------------------------------
 *
 * [Required Environment Variables]
 * - `SEOUL_TRAIL_API_KEY`: 서울 열린데이터 광장 인증키
 * - `AWS_REGION`: (Optional) AWS 리전 (default: ap-northeast-2)
 * - `COURSE_TABLE_NAME`: (Optional) DynamoDB 테이블명
 * - `LOG_LEVEL`: (Optional) 로그 레벨 (default: info)
 * --------------------------------------------------------------------------------
 *
 * @see {@link https://data.seoul.go.kr/dataList/OA-22438/S/1/datasetView.do | 서울 열린데이터 광장 - 서울둘레길 코스정보}
 *
 * @requires dotenv
 * @requires axios
 * @requires fs/promises
 * @requires gpx-parse
 * @requires @aws-sdk/client-dynamodb
 * @requires @aws-sdk/lib-dynamodb
 * @requires pino
 */

/**
 * 서울 열린데이터 광장 서울둘레길 API Response Item Schema
 * @typedef {Object} SeoulTrailItem
 * @property {number} ROAD_NO - 코스 번호 (e.g., 21)
 * @property {string} ROAD_NM - 코스 명칭 (e.g., "북한산 도봉")
 * @property {number} ROAD_LEN - 거리 (km) (e.g., 7)
 * @property {string} REQ_HR - 소요 시간 문자열 (e.g., "약 3시간 25분")
 * @property {string} LV_KORN - 난이도 (초급/중급/상급)
 * @property {string} ROAD_EXPLN - 코스 설명
 * @property {string} BGNG_PSTN - 시작 지점
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const gpxParse = require('gpx-parse');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const pino = require('pino');

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
    service: 'seoultrail-seeder',
    env: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// Constants & Configuration
// ============================================================================

const SERVICE_KEY = process.env.SEOUL_TRAIL_API_KEY;
// 서울 열린데이터 광장은 path variable로 인증키를 전달 (1부터 22까지 전체 조회)
// Note: If the API service name has changed from 'viewGil' to something else (e.g. 'seoulGilWalkCourse'), update this URL.
const API_URL = `http://openapi.seoul.go.kr:8088/${SERVICE_KEY}/json/viewGil/1/22`;
const GPX_DIR = path.join(__dirname, '..', 'gpx_files', 'seoultrail');
const TABLE_NAME = process.env.COURSE_TABLE_NAME || 'COURSE_DATA_TEST_TABLE';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';

// ============================================================================
// DynamoDB Client Setup
// ============================================================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * GPX 파일에서 첫 번째 좌표(시작점)를 추출합니다.
 *
 * @param {string} gpxFilePath - GPX 파일 경로
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
const getFirstPointFromGpx = async (gpxFilePath) => {
  try {
    let gpxData = await fs.readFile(gpxFilePath, 'utf8');
    // GPX-parse 호환성 보정
    if (!gpxData.match(/<gpx[^>]+version=/i)) {
      gpxData = gpxData.replace(/<gpx/i, '<gpx version="1.1"');
    }
    const parsed = await new Promise((resolve, reject) => {
      gpxParse.parseGpx(gpxData, (error, data) => {
        if (error) return reject(error);
        resolve(data);
      });
    });
    const firstPoint = parsed?.tracks[0]?.segments[0]?.[0];
    if (firstPoint && firstPoint.lat && firstPoint.lon) {
      return { lat: firstPoint.lat, lon: firstPoint.lon };
    }
    return null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn({ err: error, file: path.basename(gpxFilePath) }, 'Error parsing GPX file');
    }
    return null;
  }
};

/**
 * API의 문자 난이도를 '하', '중', '상'으로 변환합니다.
 * @param {string} level - "초급", "중급", "상급"
 */
const mapDifficulty = (level) => {
  switch (level) {
    case '초급':
      return '하';
    case '중급':
      return '중';
    case '상급':
      return '상';
    default:
      return null;
  }
};

/**
 * 시간 문자열 (예: "약 4시간 50분")을 분 단위로 변환합니다.
 * @param {string} timeString
 * @returns {number|null} Total minutes
 */
const parseDuration = (timeString) => {
  if (!timeString) return null;
  let totalMinutes = 0;
  const hourMatch = timeString.match(/(\d+)\s*시간/);
  const minuteMatch = timeString.match(/(\d+)\s*분/);
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1], 10) * 60;
  }
  if (minuteMatch) {
    totalMinutes += parseInt(minuteMatch[1], 10);
  }
  return totalMinutes > 0 ? totalMinutes : null;
};

// ============================================================================
// Main Execution Logic
// ============================================================================

const seedDatabase = async () => {
  logger.info({ tableName: TABLE_NAME, apiUrl: API_URL }, 'Starting Seoul Trail course database seeding');
  let totalUpserted = 0;

  try {
    logger.info('Fetching API data...');
    const response = await axios.get(API_URL);

    // Attempt to find rows in potential response locations
    const rows = response.data?.viewGil?.row || response.data?.seoulGilWalkCourse?.row || response.data?.row;
    if (!rows || rows.length === 0) {
      logger.warn({ data: response.data }, 'No items received from API.');
      return;
    }

    logger.info({ count: rows.length }, 'Processing items for database insertion');

    const upsertPromises = rows.map(async (/** @type {SeoulTrailItem} */ item) => {
      // 서울둘레길 ID 규칙: seoultrail_{ROAD_NO}
      const courseId = `seoultrail_${item.ROAD_NO}`;
      // GPX 파일명 규칙: 서울둘레길2.0_{ROAD_NO}코스.gpx
      const gpxFilePath = path.join(GPX_DIR, `서울둘레길2.0_${item.ROAD_NO}코스.gpx`);
      const firstPoint = await getFirstPointFromGpx(gpxFilePath);

      const courseData = {
        course_id: courseId,
        course_name: `${item.ROAD_NM} 서울둘레길`,
        course_type: 'seoultrail',
        course_length: item.ROAD_LEN ? Number(item.ROAD_LEN) : null,
        course_duration: parseDuration(item.REQ_HR),
        course_difficulty: mapDifficulty(item.LV_KORN),
        course_description: item.ROAD_EXPLN ? item.ROAD_EXPLN.replace(/\r\n/g, ' ') : null,
        location: item.BGNG_PSTN,
        start_lat: firstPoint?.lat || null,
        start_lon: firstPoint?.lon || null,
      };

      logger.debug({ courseId: courseId, courseData: courseData }, 'Upserting course data');

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: courseData
      }));
    });

    await Promise.all(upsertPromises);
    totalUpserted = rows.length;

  } catch (error) {
    // Axios error handling
    if (error.response) {
      logger.fatal({ err: error, responseData: error.response.data }, 'API Request failed');
    } else {
      logger.fatal({ err: error }, 'A critical error occurred during the seeding process');
    }
  } finally {
    logger.info({ totalRecords: totalUpserted }, 'Seeding complete');
  }
};

// --- Execute the script ---
seedDatabase();
