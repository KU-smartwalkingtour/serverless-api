const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const gpxParse = require('gpx-parse');
const DurunubiCourse = require('../models/durunubiCourse');
const sequelize = require('../config/database');

// --- Configuration ---
const SERVICE_KEY = '5a40b867a77d82768bdf15603346916751915bbcf0b42e66d0e764e74a9de495';
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';
const NUM_OF_ROWS = 100;
const GPX_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');

/**
 * Parses a YYYYMMDDHHMMSS timestamp string into a Date object.
 * @param {string} ts The timestamp string.
 * @returns {Date|null} A Date object or null if the input is invalid.
 */
const parseTimestamp = (ts) => {
    if (!ts || ts.length !== 14) return null;
    return new Date(ts.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
};

/**
 * Reads a GPX file and returns the lat/lon of the first trackpoint.
 * @param {string} gpxFilePath Full path to the GPX file.
 * @returns {Promise<{lat: number, lon: number}|null>} An object with lat/lon or null.
 */
const getFirstPointFromGpx = async (gpxFilePath) => {
    try {
        let gpxData = await fs.readFile(gpxFilePath, 'utf8');

        // FIX: Add version="1.1" to the <gpx> tag if it's missing, as gpx-parse requires it.
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
        if (error.code !== 'ENOENT') { // Don't log error if file simply doesn't exist
            console.error(`Error parsing GPX file ${path.basename(gpxFilePath)}: ${error.message}`);
        }
        return null;
    }
};

/**
 * Main function to fetch course data and seed it into the database.
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
                params: { serviceKey: SERVICE_KEY, pageNo, numOfRows: NUM_OF_ROWS, MobileOS: 'ETC', MobileApp: 'AppTest', _type: 'json' },
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

                const courseData = {
                    crs_idx: item.crsIdx,
                    route_idx: item.routeIdx,
                    crs_kor_nm: item.crsKorNm,
                    crs_dstnc: item.crsDstnc ? parseFloat(item.crsDstnc) : null,
                    crs_totl_rqrm_hour: item.crsTotlRqrmHour ? parseInt(item.crsTotlRqrmHour, 10) : null,
                    crs_level: item.crsLevel ? parseInt(item.crsLevel, 10) : null,
                    crs_cycle: item.crsCycle,
                    crs_contents: item.crsContents,
                    crs_summary: item.crsSummary,
                    crs_tour_info: item.crsTourInfo,
                    traveler_info: item.travelerinfo,
                    sigun: item.sigun,
                    brd_div: item.brdDiv,
                    created_time: parseTimestamp(item.createdtime),
                    modified_time: parseTimestamp(item.modifiedtime),
                    first_lat: firstPoint?.lat || null,
                    first_lon: firstPoint?.lon || null,
                };

                await DurunubiCourse.upsert(courseData);
            });

            await Promise.all(upsertPromises);
            totalUpserted += items.length;

            if (body.numOfRows < NUM_OF_ROWS) {
                console.log('Reached the last page from API.');
                break;
            }

            pageNo++;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        console.error('A critical error occurred during the seeding process:', error);
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