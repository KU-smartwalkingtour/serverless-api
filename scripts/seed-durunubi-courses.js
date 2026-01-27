require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const gpxParse = require('gpx-parse');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

// --- Configuration ---
const SERVICE_KEY = process.env.DURUNUBI_SERVICE_KEY;
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';
const NUM_OF_ROWS = 100;
const GPX_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');

// --- DynamoDB Client Setup ---
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const TABLE_NAME = process.env.COURSE_TABLE_NAME || 'COURSE_DATA_TEST_TABLE';

/**
 * GPX 파일에서 첫 좌표를 읽어옵니다.
 */
const getFirstPointFromGpx = async (gpxFilePath) => {
  try {
    let gpxData = await fs.readFile(gpxFilePath, 'utf8');
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
      // Don't log error if file simply doesn't exist
      console.error(`Error parsing GPX file ${path.basename(gpxFilePath)}: ${error.message}`);
    }
    return null;
  }
};

/**
 * API의 숫자 난이도를 '하', '중', '상'으로 변환합니다.
 * @param {string} level API에서 받은 난이도 값 ("1", "2", "3")
 * @returns {string|null}
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

/**
 * 데이터베이스에 데이터를 시딩하는 메인 함수
 */
const seedDatabase = async () => {
  console.log('Starting Durunubi course database seeding...');
  let pageNo = 1;
  let totalUpserted = 0;

  try {
    while (true) {
      console.log(`
Fetching API data for page: ${pageNo}...`);
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
        console.log('No more items from API. Stopping.');
        break;
      }

      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      console.log(`Found ${items.length} items. Processing for database insertion...`);

      const upsertPromises = items.map(async (item) => {
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

        console.log(
          `--- Upserting Data for Course: ${courseData.course_id} ---
`,
          JSON.stringify(courseData, null, 2),
        );
        
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: courseData
        }));
      });

      await Promise.all(upsertPromises);
      totalUpserted += items.length;

      if (body.numOfRows < NUM_OF_ROWS) {
        console.log('Reached the last page from API.');
        break;
      }

      pageNo++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.error('A critical error occurred during the seeding process:', error);
  } finally {
    console.log(`
--------------------------------------------------`);
    console.log(`Seeding complete. Total records processed: ${totalUpserted}`);
    console.log(`--------------------------------------------------`);
  }
};

// --- Execute the script ---
seedDatabase();
