
require('module-alias/register'); // for @ path aliases
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { MedicalFacility } = require('@models');
const sequelize = require('@config/database');
const { logger } = require('@utils/logger');

const SERVICE_KEY = process.env.MEDICAL_FACILITIES_API_KEY;

if (!SERVICE_KEY) {
  logger.error('MEDICAL_FACILITIES_API_KEY environment variable is not set. Please set it in your .env file.');
  process.exit(1);
}
const API_ENDPOINT = 'http://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncFullDown';

// xml2js parser options
const parserOptions = {
  explicitArray: false, // <item> sub-elements are not wrapped in an array
  trim: true,
};

// Maps API response fields to our database columns
const fieldMapping = {
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

/**
 * Fetches a single page of data from the API.
 * @param {number} pageNo - The page number to fetch.
 * @returns {Promise<Array>} A promise that resolves to an array of items.
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
        numOfRows: 1000, // Per API documentation, max 100
      },
    });

    const xml = response.data;
    const result = await parseStringPromise(xml, parserOptions);

    if (result.response.header.resultCode !== '00') {
      throw new Error(`API Error: ${result.response.header.resultMsg}`);
    }

    const items = result.response.body.items.item;
    return items ? (Array.isArray(items) ? items : [items]) : []; // Ensure result is always an array
  } catch (error) {
    logger.error(error, `Error fetching page ${pageNo}`);
    return [];
  }
}

/**
 * Transforms a single API item into the format for our database model.
 * @param {object} item - The item from the API response.
 * @returns {object} The transformed item.
 */
function transformItem(item) {
  const transformed = {};
  for (const apiKey in fieldMapping) {
    const modelKey = fieldMapping[apiKey];
    if (item[apiKey] !== undefined && item[apiKey] !== null) {
      transformed[modelKey] = item[apiKey];
    }
  }
  // The is_emergency field is a generated column in the DB, so we don't set it here.
  return transformed;
}

/**
 * Main function to fetch all data and store it in the database.
 */
async function run() {
  await sequelize.sync(); // Ensure DB is connected and tables are created
  let pageNo = 1;
  let totalUpserted = 0;

  logger.info('Starting to fetch medical facility data...');

  while (true) {
    logger.info(`Fetching page ${pageNo}...`);
    const items = await fetchPage(pageNo);

    if (items.length === 0) {
      logger.info('No more items found. Finishing process.');
      break;
    }

    const filteredItems = items.filter(
      (item) => item.dutyEmclsName !== '응급의료기관 이외'
    );

    if (filteredItems.length > 0) {
      const recordsToUpsert = filteredItems.map(transformItem);
      
      // Get all column names from the model, except the primary key for the update list
      const updateOnDuplicateFields = Object.values(fieldMapping).filter(field => field !== 'hpid');

      await MedicalFacility.bulkCreate(recordsToUpsert, {
        updateOnDuplicate: updateOnDuplicateFields,
      });

      totalUpserted += recordsToUpsert.length;
      logger.info(
        `Upserted ${recordsToUpsert.length} records from page ${pageNo}.`
      );
    } else {
      logger.info(`No relevant items to upsert on page ${pageNo}.`);
    }

    pageNo++;
  }

  logger.info(
    `Finished fetching data. Total records upserted: ${totalUpserted}.`
  );
  await sequelize.close();
}

run().catch((error) => {
  logger.error(error, 'An unexpected error occurred:');
  process.exit(1);
});
