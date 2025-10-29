require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

// --- Configuration ---
const SERVICE_KEY = process.env.DURUNUBI_SERVICE_KEY;
const API_BASE_URL = 'https://apis.data.go.kr/B551011/Durunubi/courseList';
const NUM_OF_ROWS = 100; // Number of items to fetch per page
const OUTPUT_DIR = path.join(__dirname, '..', 'gpx_files', 'durunubi');

/**
 * Fetches a single GPX file from a URL and saves it to the specified path.
 * @param {string} url The URL of the GPX file.
 * @param {string} savePath The full path where the file will be saved.
 */
const fetchAndSaveGpx = async (url, savePath) => {
  try {
    const response = await axios.get(url, { responseType: 'text' });
    await fs.writeFile(savePath, response.data);
    console.log(`Successfully saved: ${path.basename(savePath)}`);
  } catch (error) {
    console.error(`Failed to fetch or save GPX from ${url}: ${error.message}`);
  }
};

/**
 * Main function to fetch all course lists and their corresponding GPX files.
 */
const fetchAllCourses = async () => {
  console.log('Starting Durunubi course data fetch...');
  console.log(`GPX files will be saved to: ${OUTPUT_DIR}`);

  // 1. Ensure the output directory exists
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error(`Could not create directory ${OUTPUT_DIR}:`, error);
    return;
  }

  let pageNo = 1;
  let totalFetched = 0;

  while (true) {
    console.log(`
Fetching course list page: ${pageNo}...`);

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
      if (!body || body.numOfRows === 0) {
        console.log('No more items found. Stopping.');
        break;
      }

      const items = body.items?.item || [];
      // 응답의 items 필드를 가져온다.
      const courseItems = Array.isArray(items) ? items : [items];

      if (courseItems.length === 0) {
        console.log('No items in this page. Stopping.');
        break;
      }

      console.log(`Found ${courseItems.length} courses on this page. Fetching GPX files...`);

      const gpxFetchPromises = courseItems.map((item) => {
        if (item.gpxpath && item.crsIdx) {
          const fileName = `${item.crsIdx}.gpx`;
          const savePath = path.join(OUTPUT_DIR, fileName);
          return fetchAndSaveGpx(item.gpxpath, savePath);
        }
        return Promise.resolve(); // Resolve immediately if no path/id
      });

      await Promise.all(gpxFetchPromises);
      totalFetched += courseItems.length;

      // If the number of rows is less than requested, it's the last page.
      if (body.numOfRows < NUM_OF_ROWS) {
        console.log('Reached the last page.');
        break;
      }

      pageNo++;

      // Add a small delay to be polite to the API server
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`An error occurred while fetching page ${pageNo}: ${error.message}`);
      // Stop on error to avoid infinite loops on persistent failures
      break;
    }
  }

  console.log(`
--------------------------------------------------`);
  console.log(`Fetching complete. Total courses processed: ${totalFetched}`);
  console.log(`--------------------------------------------------`);
};

// --- Execute the script ---
fetchAllCourses();
