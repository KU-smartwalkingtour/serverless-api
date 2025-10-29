const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('@utils/logger');

// S3 설정
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'ku-smartwalkingtour-seoultrail-gpxstorage-bucket';
const GPX_PREFIX = 'gpx_files/';

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
  // GPX 버전 호환성 확보
  let compatibleGpxContent = gpxFileContent.replace(/version="1.0"/i, 'version="1.1"');
  if (!compatibleGpxContent.match(/<gpx[^>]+version=/i)) {
    compatibleGpxContent = compatibleGpxContent.replace(/<gpx/i, '<gpx version="1.1"');
  }

  return new Promise((resolve, reject) => {
    gpxParse.parseGpx(compatibleGpxContent, (error, data) => {
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
                lat: parseFloat(point.lat.toFixed(6)),
                lon: parseFloat(point.lon.toFixed(6)),
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
              lat: parseFloat(point.lat.toFixed(6)),
              lon: parseFloat(point.lon.toFixed(6)),
            });
          });
        });
      }

      // 웨이포인트 추출
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

/**
 * 코스 번호로 S3에서 GPX 파일 콘텐츠 가져오기
 * @param {string} courseNumber - 코스 번호
 * @returns {Promise<string|null>} GPX 파일 콘텐츠 또는 찾을 수 없으면 null
 */
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
      logger.debug(`코스 ${courseId}의 GPX 파일을 찾을 수 없음`);
      return null;
    }
    logger.error(`S3에서 GPX 파일 조회 실패: ${error.message}`);
    throw error;
  }
};

/**
 * 코스 ID로 S3에서 GPX 파일을 가져와 좌표를 추출합니다.
 * @param {string} courseId - 코스 ID
 * @returns {Promise<Array<{lat: number, lon: number}>|null>} 좌표 배열 또는 파일을 찾지 못하면 null
 */
const getCourseCoordinates = async (courseId) => {
  const gpxContent = await getGpxContentFromS3(courseId);
  if (!gpxContent) {
    return null; // GPX 파일을 찾을 수 없음
  }
  return await getCoordinatesFromGpx(gpxContent);
};

module.exports = {
  getCoordinatesFromGpx,
  getGpxContentFromS3,
  getCourseCoordinates,
};
