const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('@utils/logger');

// S3 configuration
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'ku-smartwalkingtour-seoultrail-gpxstorage-bucket';
const GPX_PREFIX = 'gpx_files/';

// Constants
const EARTH_RADIUS_KM = 6371;
const DEGREES_TO_RADIANS = Math.PI / 180;

// S3 GetObjectCommand의 Body(Stream)를 문자열로 변환하는 헬퍼 함수
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

/**
 * GPX 파일 콘텐츠를 파싱하여 위도, 경도 좌표 배열을 반환합니다.
 * @param {string} gpxFileContent - GPX 파일의 전체 내용
 * @returns {Promise<Array<{lat: number, lon: number}>>} 위도, 경도 객체의 배열
 */
const getCoordinatesFromGpx = async (gpxFileContent) => {
  return new Promise((resolve, reject) => {
    gpxParse.parseGpx(gpxFileContent, (error, data) => {
      if (error) {
        logger.error(`GPX 파싱 실패: ${error.message}`);
        return reject(error);
      }

      const rows = [];

      // 트랙 포인트 추출
      if (data.tracks) {
        data.tracks.forEach((track) => {
          track.segments.forEach((segment) => {
            segment.forEach((point) => {
              rows.push({
                lat: point.lat,
                lon: point.lon,
              });
            });
          });
        });
      }

      // 루트 포인트 추출
      if (data.routes) {
        data.routes.forEach((route) => {
          route.points.forEach((point) => {
            rows.push({
              lat: point.lat,
              lon: point.lon,
            });
          });
        });
      }

      // 웨이포인트 추출
      if (data.waypoints) {
        data.waypoints.forEach((waypoint) => {
          rows.push({
            lat: waypoint.lat,
            lon: waypoint.lon,
          });
        });
      }

      resolve(rows);
    });
  });
};

/**
 * GPX 파일 콘텐츠를 파싱하여 코스 메타데이터를 반환합니다.
 * @param {string} gpxFileContent - GPX 파일의 전체 내용
 * @returns {Promise<object>} 코스 메타데이터 객체
 */
const getCourseMetadataFromGpx = async (gpxFileContent) => {
  try {
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(gpxFileContent);

    // trk 안의 extensions 접근
    const extensions = result.gpx.trk.extensions;

    // ogr 네임스페이스는 단순한 key로 들어있음
    const courseName = extensions['ogr:CONTS_NAME'];
    const addressOld = extensions['ogr:ADDR_OLD'];
    const addressNew = extensions['ogr:ADDR_NEW'];
    const name01 = extensions['ogr:NAME_01'];
    const value01 = extensions['ogr:VALUE_01'];
    const name02 = extensions['ogr:NAME_02'];
    const value02 = extensions['ogr:VALUE_02'];
    const name03 = extensions['ogr:NAME_03'];
    const value03 = extensions['ogr:VALUE_03'];
    const name04 = extensions['ogr:NAME_04'];
    const value04 = extensions['ogr:VALUE_04'];
    const name05 = extensions['ogr:NAME_05'];
    const value05 = extensions['ogr:VALUE_05'];
    const name06 = extensions['ogr:NAME_06'];
    const value06 = extensions['ogr:VALUE_06'];
    const name07 = extensions['ogr:NAME_07'];
    const value07 = extensions['ogr:VALUE_07'];
    const name08 = extensions['ogr:NAME_08'];
    const value08 = extensions['ogr:VALUE_08'];
    const name09 = extensions['ogr:NAME_09'];
    const value09 = extensions['ogr:VALUE_09'];
    const name10 = extensions['ogr:NAME_10'];
    const value10 = extensions['ogr:VALUE_10'];
    const name11 = extensions['ogr:NAME_11'];
    const value11 = extensions['ogr:VALUE_11'];

    return {
      courseName,
      addressOld,
      addressNew,
      attributes: {
        [name01]: value01,
        [name02]: value02,
        [name03]: value03,
        [name04]: value04,
        [name05]: value05,
        [name06]: value06,
        [name07]: value07,
        [name08]: value08,
        [name09]: value09,
        [name10]: value10,
        [name11]: value11,
      },
    };
  } catch (err) {
    logger.error(`GPX 메타데이터 파싱 실패: ${err.message}`);
    throw err;
  }
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * DEGREES_TO_RADIANS;
  const dLon = (lon2 - lon1) * DEGREES_TO_RADIANS;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEGREES_TO_RADIANS) *
      Math.cos(lat2 * DEGREES_TO_RADIANS) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Get distances from a point to all available courses
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array<{course: string, distance: number}>>} Array of courses with distances
 */
const getCourseDistances = async (lat, lon) => {
  const parser = new xml2js.Parser({ explicitArray: false });

  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: GPX_PREFIX,
  });

  const listedObjects = await s3Client.send(listCommand);
  if (!listedObjects.Contents) {
    return [];
  }

  const gpxFiles = listedObjects.Contents.filter((obj) => obj.Key.endsWith('.gpx'));

  const coursePromises = gpxFiles.map(async (file) => {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.Key,
      });
      const s3Object = await s3Client.send(getCommand);
      const data = await streamToString(s3Object.Body);

      const result = await parser.parseStringPromise(data);

      const extensions = result.gpx.trk.extensions;
      const fileLon = parseFloat(extensions['ogr:COORD_X']);
      const fileLat = parseFloat(extensions['ogr:COORD_Y']);

      if (!isNaN(fileLat) && !isNaN(fileLon)) {
        const distance = getDistance(lat, lon, fileLat, fileLon);
        const normalizedKey = file.Key.normalize('NFC');
        const courseNameMatch = normalizedKey.match(/서울둘레길2\.0_(\d+)코스\.gpx/);
        if (courseNameMatch) {
          return { course: courseNameMatch[1], distance };
        }
      }
    } catch (error) {
      logger.error(`파일 처리 오류 ${file.Key}: ${error.message}`);
    }
    return null;
  });

  const courses = (await Promise.all(coursePromises)).filter(Boolean);
  return courses;
};

/**
 * Find the closest course to given coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string|null>} Course number or null if none found
 */
const findClosestCourse = async (lat, lon) => {
  const courses = await getCourseDistances(lat, lon);

  if (!courses || courses.length === 0) {
    return null;
  }

  const closestCourse = courses.reduce(
    (min, course) => (course.distance < min.distance ? course : min),
    courses[0]
  );

  return closestCourse.course;
};

/**
 * Find N closest courses to given coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} n - Number of courses to return
 * @returns {Promise<Array<string>>} Array of course numbers sorted by distance
 */
const findNClosestCourses = async (lat, lon, n) => {
  const courses = await getCourseDistances(lat, lon);

  courses.sort((a, b) => a.distance - b.distance);

  return courses.slice(0, n).map((c) => c.course);
};

/**
 * Get GPX file content from S3 by course number
 * @param {string} courseNumber - Course number
 * @returns {Promise<string|null>} GPX file content or null if not found
 */
const getGpxContentFromS3 = async (courseNumber) => {
  const fileName = `서울둘레길2.0_${courseNumber}코스.gpx`.normalize('NFD');
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
      logger.debug(`코스 ${courseNumber}의 GPX 파일을 찾을 수 없음`);
      return null;
    }
    logger.error(`S3에서 GPX 파일 조회 실패: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getCoordinatesFromGpx,
  getCourseMetadataFromGpx,
  findClosestCourse,
  findNClosestCourses,
  getGpxContentFromS3,
};
