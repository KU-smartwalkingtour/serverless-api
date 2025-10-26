const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const gpxParse = require('gpx-parse');
const Course = require('../models/course');
const sequelize = require('../config/database');

// --- Configuration ---
const API_URL = 'http://openapi.seoul.go.kr:8088/785379446563686936327a487a764e/json/viewGil/1/22';
const GPX_DIR = path.join(__dirname, '..', 'gpx_files', 'seoultrail');

/**
 * GPX 파일에서 첫 좌표를 읽어옵니다.
 */
const getFirstPointFromGpx = async (gpxFilePath) => {
    try {
        console.log(gpxFilePath);
        let gpxData = await fs.readFile(gpxFilePath, 'utf8');
        // GPX-parse가 엄격한 형식을 요구하므로 version 속성 추가
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
        if (error.code !== 'ENOENT') { // 파일이 없는 경우는 오류로 기록하지 않음
            console.error(`Error parsing GPX file ${path.basename(gpxFilePath)}: ${error.message}`);
        }
        return null;
    }
};


/**
 * API의 문자 난이도를 '하', '중', '상'으로 변환합니다.
 */
const mapDifficulty = (level) => {
    switch (level) {
        case '초급': return '하';
        case '중급': return '중';
        case '상급': return '상';
        default: return null;
    }
};

/**
 * 시간 문자열 (예: "약 4시간 50분")을 분 단위로 변환합니다.
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

/**
 * 데이터베이스에 데이터를 시딩하는 메인 함수
 */
const seedDatabase = async () => {
    console.log('Starting Seoul Trail course database seeding...');
    let totalUpserted = 0;

    try {
        console.log(`Fetching API data from: ${API_URL}...`);
        const response = await axios.get(API_URL);

        const rows = response.data?.viewGil?.row;
        if (!rows || rows.length === 0) {
            console.log('No items from API. Stopping.');
            return;
        }

        console.log(`Found ${rows.length} items. Processing for database insertion...`);

        const upsertPromises = rows.map(async (item) => {
            const courseId = `seoultrail_${item.GIL_NO}`;
            const gpxFilePath = path.join(GPX_DIR, `${courseId}.gpx`);
            const firstPoint = await getFirstPointFromGpx(gpxFilePath);
            

            const courseData = {
                course_id: courseId,
                course_name: `${item.GIL_NM} 서울둘레길`,
                course_type: 'seoul_trail',
                course_length: item.GIL_LEN ? parseFloat(item.GIL_LEN) : null,
                course_duration: parseDuration(item.REQ_TM),
                course_difficulty: mapDifficulty(item.LV_CD),
                course_description: item.GIL_EXPLN ? item.GIL_EXPLN.replace(/\r\n/g, ' ') : null,
                location: item.STRT_PSTN,
                start_lat: firstPoint?.lat || null,
                start_lon: firstPoint?.lon || null,
            };

            console.log(`--- Upserting Data for Course: ${courseData.course_name} ---`);
            await Course.upsert(courseData);
        });

        await Promise.all(upsertPromises);
        totalUpserted = rows.length;

    } catch (error) {
        console.error('A critical error occurred during the seeding process:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    } finally {
        console.log(`
--------------------------------------------------`);
        console.log(`Seeding complete. Total records processed: ${totalUpserted}`);
        console.log(`--------------------------------------------------`);
        await sequelize.close();
        console.log('Database connection closed.');
    }
};

// --- Execute the script ---
seedDatabase();
