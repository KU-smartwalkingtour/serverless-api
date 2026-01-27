require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const pino = require('pino');

// --- Logger Configuration ---
// Best Practice: Production 환경에서는 JSON 포맷을 유지하고,
// 개발 환경에서만 pino-pretty를 파이프라인으로 연결하는 것이 일반적이다.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info', // 환경변수로 제어 가능하게 설정
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  base: {
    service: 'durunubi-fetcher', // 여러 서비스 로그가 섞일 때 식별자
    env: process.env.NODE_ENV || 'development',
  },
});

// --- Configuration ---
const SERVICE_KEY = process.env.DURUNUBI_SERVICE_KEY;
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';
const NUM_OF_ROWS = 100;
const OUTPUT_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');

/**
 * Fetches a single GPX file from a URL and saves it to the specified path.
 * @param {string} url The URL of the GPX file.
 * @param {string} savePath The full path where the file will be saved.
 */
const fetchAndSaveGpx = async (url, savePath) => {
  const fileName = path.basename(savePath);
  try {
    const response = await axios.get(url, { responseType: 'text' });
    await fs.writeFile(savePath, response.data);
    
    // Success는 debug 레벨로 낮춰 로그 양(Volume)을 조절한다.
    // 필요 시 LOG_LEVEL=debug로 실행하여 확인 가능.
    logger.debug({ fileName, url }, 'GPX file saved successfully');
  } catch (error) {
    // Error Object는 반드시 'err' 키에 할당해야 pino가 Stack Trace를 직렬화한다.
    logger.error({ err: error, fileName, url }, 'Failed to fetch or save GPX');
  }
};

/**
 * Main function to fetch all course lists and their corresponding GPX files.
 */
const fetchAllCourses = async () => {
  // 메타데이터와 함께 시작 로그 기록
  logger.info({ outputDir: OUTPUT_DIR, apiBaseUrl: API_BASE_URL }, 'Starting Durunubi course data fetch');

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    logger.fatal({ err: error, outputDir: OUTPUT_DIR }, 'Could not create output directory');
    process.exit(1); // 치명적 오류 시 프로세스 종료 코드 명시
  }

  let pageNo = 1;
  let totalFetched = 0;

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

      const body = response.data?.response?.body;
      
      // API 응답 구조가 예상과 다를 경우를 대비해 body 전체를 debug로 남겨둘 수 있음
      if (!body) {
        logger.warn({ responseData: response.data }, 'Invalid response body received');
        break;
      }

      if (body.numOfRows === 0) {
        logger.info('No more items found based on numOfRows. Stopping.');
        break;
      }

      const items = body.items?.item || [];
      const courseItems = Array.isArray(items) ? items : [items];

      if (courseItems.length === 0) {
        logger.info('No items in this page. Stopping.');
        break;
      }

      logger.info({ count: courseItems.length, pageNo }, 'Found courses on page, processing GPX files...');

      const gpxFetchPromises = courseItems.map((item) => {
        if (item.gpxpath && item.crsIdx) {
          const fileName = `${item.crsIdx}.gpx`;
          const savePath = path.join(OUTPUT_DIR, fileName);
          return fetchAndSaveGpx(item.gpxpath, savePath);
        }
        // 데이터가 불완전한 경우 경고 로그
        logger.warn({ item }, 'Skipping item due to missing gpxpath or crsIdx');
        return Promise.resolve();
      });

      await Promise.all(gpxFetchPromises);
      totalFetched += courseItems.length;

      if (body.numOfRows < NUM_OF_ROWS) {
        logger.info('Reached the last page.');
        break;
      }

      pageNo++;
      await new Promise((resolve) => setTimeout(resolve, 200));

    } catch (error) {
      // Loop 내의 에러는 fatal이 아닌 error로 처리하여 다음 로직 수행 여부 결정
      logger.error({ err: error, pageNo }, 'An error occurred while fetching page');
      break; 
    }
  }

  logger.info({ totalFetched }, 'Fetching complete');
};

// --- Execute the script ---
// Top-level error handling
fetchAllCourses().catch(err => {
  logger.fatal({ err }, 'Unhandled exception in main execution');
  process.exit(1);
});