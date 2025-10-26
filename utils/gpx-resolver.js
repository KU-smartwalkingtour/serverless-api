const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('@utils/logger');

// S3 설정
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const BUCKET_NAME = 'ku-smartwalkingtour-seoultrail-gpxstorage-bucket';
const GPX_PREFIX = 'gpx_files/';

// 상수
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
 * 코스 번호로 S3에서 GPX 파일 콘텐츠 가져오기
 * @param {string} courseNumber - 코스 번호
 * @returns {Promise<string|null>} GPX 파일 콘텐츠 또는 찾을 수 없으면 null
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
  getGpxContentFromS3,
};
