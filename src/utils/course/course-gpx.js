const { gpx } = require('@tmcw/togeojson');
const { DOMParser } = require('@xmldom/xmldom');
const {
  S3Client,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { logger } = require('../logger');

const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'ku-smartwalkingtour-seoultrail-gpxstorage-bucket';
const GPX_PREFIX = 'gpx_files/';

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

const getCoordinatesFromGpx = async (gpxFileContent) => {
  try {
    const doc = new DOMParser().parseFromString(gpxFileContent, 'text/xml');
    const geojson = gpx(doc);

    const rows = [];

    // Extract coordinates from GeoJSON features
    geojson.features.forEach((feature) => {
      const geometry = feature.geometry;

      if (geometry.type === 'Point') {
        // [lon, lat]
        rows.push({
          lat: parseFloat(geometry.coordinates[1].toFixed(6)),
          lon: parseFloat(geometry.coordinates[0].toFixed(6)),
        });
      } else if (geometry.type === 'LineString') {
        // Array of [lon, lat]
        geometry.coordinates.forEach((coord) => {
          rows.push({
            lat: parseFloat(coord[1].toFixed(6)),
            lon: parseFloat(coord[0].toFixed(6)),
          });
        });
      } else if (geometry.type === 'MultiLineString') {
        // Array of LineStrings
        geometry.coordinates.forEach((line) => {
          line.forEach((coord) => {
            rows.push({
              lat: parseFloat(coord[1].toFixed(6)),
              lon: parseFloat(coord[0].toFixed(6)),
            });
          });
        });
      }
    });

    return rows;
  } catch (error) {
    logger.error(`GPX parsing failed: ${error.message}`);
    throw error;
  }
};

const getGpxContentFromS3 = async (courseId) => {
  const fileName = `${courseId}.gpx`;
  const key = `${GPX_PREFIX}${fileName}`;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    return await streamToString(response.Body);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      logger.debug(`GPX file not found for course ${courseId}`);
      return null;
    }
    logger.error(`S3 GPX fetch failed: ${error.message}`);
    throw error;
  }
};

const getCourseCoordinates = async (courseId) => {
  try {
    logger.info(`getCourseCoordinates: courseId=${courseId}`);

    const gpxContent = await getGpxContentFromS3(courseId);
    if (!gpxContent) {
      logger.warn(`GPX file not found in S3: courseId=${courseId}`);
      return null;
    }

    logger.info(
      `S3 GPX fetch success: courseId=${courseId}, size=${gpxContent.length}`
    );

    const coordinates = await getCoordinatesFromGpx(gpxContent);
    logger.info(
      `GPX parsing success: courseId=${courseId}, points=${coordinates.length}`
    );

    return coordinates;
  } catch (error) {
    logger.error(
      `getCourseCoordinates failed: courseId=${courseId}, error=${error.message}`
    );
    throw error;
  }
};

module.exports = {
  getCoordinatesFromGpx,
  getGpxContentFromS3,
  getCourseCoordinates,
};
