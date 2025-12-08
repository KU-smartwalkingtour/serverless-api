const gpxParse = require('gpx-parse');
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
  let compatibleGpxContent = gpxFileContent.replace(
    /version="1.0"/i,
    'version="1.1"'
  );
  if (!compatibleGpxContent.match(/<gpx[^>]+version=/i)) {
    compatibleGpxContent = compatibleGpxContent.replace(
      /<gpx/i,
      '<gpx version="1.1"'
    );
  }

  return new Promise((resolve, reject) => {
    gpxParse.parseGpx(compatibleGpxContent, (error, data) => {
      if (error) {
        logger.error(`GPX parsing failed: ${error.message}`);
        return reject(error);
      }

      const rows = [];

      if (data.tracks) {
        data.tracks.forEach((track) => {
          track.segments.forEach((segment) => {
            segment.forEach((point) => {
              rows.push({
                lat: parseFloat(point.lat.toFixed(6)),
                lon: parseFloat(point.lon.toFixed(6)),
              });
            });
          });
        });
      }

      if (data.routes) {
        data.routes.forEach((route) => {
          route.points.forEach((point) => {
            rows.push({
              lat: parseFloat(point.lat.toFixed(6)),
              lon: parseFloat(point.lon.toFixed(6)),
            });
          });
        });
      }

      if (data.waypoints) {
        data.waypoints.forEach((waypoint) => {
          rows.push({
            lat: parseFloat(waypoint.lat.toFixed(6)),
            lon: parseFloat(waypoint.lon.toFixed(6)),
          });
        });
      }

      resolve(rows);
    });
  });
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
