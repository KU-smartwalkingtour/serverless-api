/**
 * @fileoverview Durunubi Course Data Seeder
 *
 * 한국관광공사가 제공하는 "두루누비 정보 서비스_GW" API를 사용하여
 * 전국 순환형 트래킹 코스 '코리아둘레길'의 코스 목록을 조회하고,
 * 로컬에 저장된 GPX 파일에서 시작점 좌표를 추출하여 DynamoDB에 코스 정보를 저장(Upsert)하는 스크립트이다.
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
 * 3. GPX Integration: 로컬 GPX 파일에서 추출한 `start_lat`, `start_lon` 좌표를 결합.
 * 4. Storage: DynamoDB `COURSE_DATA_TABLE`에 최종 객체를 Upsert.
 * --------------------------------------------------------------------------------
 *
 * [Required Environment Variables]
 * - `DURUNUBI_SERVICE_KEY`: 두루누비 API 인증 키
 * - `AWS_REGION`: (Optional) AWS 리전 (default: ap-northeast-2)
 * - `COURSE_TABLE_NAME`: (Optional) DynamoDB 테이블명 (default: COURSE_DATA_TEST_TABLE)
 * - `LOG_LEVEL`: (Optional) 로그 레벨 (default: info)
 * --------------------------------------------------------------------------------
 *
 * @see {@link https://www.data.go.kr/data/15101974/openapi.do#/API%20%EB%AA%A9%EB%A1%9D/courseList | 한국관광공사_두루누비 정보 서비스_GW API 문서}
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
const gpxParse = require('gpx-parse');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const pino = require('pino');

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
const GPX_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');
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
 * GPX 파일에서 첫 번째 트랙의 첫 번째 세그먼트의 첫 번째 좌표(시작점)를 추출합니다.
 *
 * @param {string} gpxFilePath - GPX 파일의 절대 경로
 * @returns {Promise<{lat: number, lon: number}|null>} 시작점 좌표 객체 또는 null
 */
const getFirstPointFromGpx = async (gpxFilePath) => {
  try {
    let gpxData = await fs.readFile(gpxFilePath, 'utf8');
    // GPX 버전 호환성을 위한 패치
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
      // 파일이 없는 경우는 흔하므로(아직 수집 안됨 등) 에러 로그보다는 경고/무시 처리
      // 단, 파싱 에러는 로그를 남김
      logger.warn({ err: error, file: path.basename(gpxFilePath) }, 'Error parsing GPX file');
    }
    return null;
  }
};

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
 * API 페이지를 순회하며 데이터를 가공하여 DynamoDB에 저장합니다.
 */
const seedDatabase = async () => {
  logger.info({ tableName: TABLE_NAME }, 'Starting Durunubi course database seeding');
  
  let pageNo = 1;
  let totalUpserted = 0;

  try {
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
      logger.info({ count: items.length, pageNo }, 'Processing items for database insertion');

      const upsertPromises = items.map(async (/** @type {CourseItem} */ item) => {
        const gpxFilePath = path.join(GPX_DIR, `${item.crsIdx}.gpx`);
        const firstPoint = await getFirstPointFromGpx(gpxFilePath);

        // 새로운 스키마에 맞게 데이터 객체 구성
        const courseData = {
          course_id: item.crsIdx,
          course_name: item.crsKorNm,
          course_type: 'durunubi', // 타입 고정
          course_length: item.crsDstnc ? parseFloat(item.crsDstnc) : null,
          course_duration: item.crsTotlRqrmHour ? parseInt(item.crsTotlRqrmHour, 10) : null, // 분 단위로 가정
          course_difficulty: mapDifficulty(item.crsLevel),
          course_description: item.crsContents,
          location: item.sigun,
          start_lat: firstPoint?.lat || null,
          start_lon: firstPoint?.lon || null,
        };

        // 상세 로그는 debug 레벨로 낮춰서 노이즈 감소
        logger.debug({ courseId: courseData.course_id }, 'Upserting course data');
        
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: courseData
        }));
      });

      await Promise.all(upsertPromises);
      totalUpserted += items.length;

      if (body.numOfRows < NUM_OF_ROWS) {
        logger.info('Reached the last page from API.');
        break;
      }

      pageNo++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    logger.fatal({ err: error }, 'A critical error occurred during the seeding process');
  } finally {
    logger.info({ totalRecords: totalUpserted }, 'Seeding complete');
  }
};

// --- Execute the script ---
seedDatabase();
