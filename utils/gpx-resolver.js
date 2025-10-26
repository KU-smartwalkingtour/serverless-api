const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { get } = require('http');

const s3Client = new S3Client({ region: 'ap-northeast-2' }); // VPC 엔드포인트를 통해 통신하므로 별도 인증 정보 설정이 필요 없습니다.
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
 * @returns {Promise<Array<{lat: number, lon: number, ele: number | null, time: string | null}>>} 위도, 경도, 고도, 시간 객체의 배열
 */
const getCoordinatesFromGpx = (gpxFileContent) => {
  return new Promise((resolve, reject) => {
    gpxParse.parseGpx(gpxFileContent, (error, data) => {
      if (error) {
        return reject(error);
      }

      const rows = [];

      // 트랙 포인트 추출
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
const getCourseMetadataFromGpx = (gpxFileContent) => {
  return new Promise(async (resolve, reject) => {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(gpxFileContent, { explicitArray: false });

      // trk 안의 extensions 접근
      const extensions = result.gpx.trk.extensions;

      // ogr 네임스페이스는 단순한 key로 들어있음
      const courseName = extensions['ogr:CONTS_NAME'];
      const addressOld = extensions['ogr:ADDR_OLD'];
      const addressNew = extensions['ogr:ADDR_NEW'];
      const name01 = extensions['ogr:NAME_01']; // "코스명"
      const value01 = extensions['ogr:VALUE_01']; // "[1코스] 수락산코스"
      const name02 = extensions['ogr:NAME_02']; // "테마명"
      const value02 = extensions['ogr:VALUE_02']; // "[1코스] 속세를 떠나지 않은 옛사람의 길"
      const name03 = extensions['ogr:NAME_03']; // "지역"
      const value03 = extensions['ogr:VALUE_03']; // "노원구"
      const name04 = extensions['ogr:NAME_04']; // "세부코스"
      const value04 = extensions['ogr:VALUE_04']; // "도봉산역 ~ ..."
      const name05 = extensions['ogr:NAME_05']; // "난이도"
      const value05 = extensions['ogr:VALUE_05']; // "상"
      const name06 = extensions['ogr:NAME_06']; // "거리"
      const value06 = extensions['ogr:VALUE_06']; // "약 6.4km"
      const name07 = extensions['ogr:NAME_07']; // "소요시간"
      const value07 = extensions['ogr:VALUE_07']; // "2시간 50분"
      const name08 = extensions['ogr:NAME_08']; // "출발지"
      const value08 = extensions['ogr:VALUE_08']; // "지하철 1호선..."
      const name09 = extensions['ogr:NAME_09']; // "도착지"
      const value09 = extensions['ogr:VALUE_09']; // "지하철 7호선..."
      const name10 = extensions['ogr:NAME_10']; // "시점부"
      const value10 = extensions['ogr:VALUE_10']; // "도봉산역 ~ ..."
      const name11 = extensions['ogr:NAME_11']; // "종점부"
      const value11 = extensions['ogr:VALUE_11']; // "당고개공원 갈림길"

      resolve({
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
      });
    } catch (err) {
      reject(err);
    }
  });
};

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

async function getCourseDistances(lat, lon) {
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
        nfc = file.Key.normalize('NFC');
        const courseNameMatch = nfc.match(/서울둘레길2\.0_(\d+)코스\.gpx/);
        if (courseNameMatch) {
          return { course: courseNameMatch[1], distance: distance };
        }
      }
    } catch (error) {
      console.error(`Error processing file ${file.Key}:`, error);
    }
    return null;
  });

  const courses = (await Promise.all(coursePromises)).filter(Boolean);
  return courses;
}

async function findClosestCourse(lat, lon) {
  const courses = await getCourseDistances(lat, lon);

  if (!courses || courses.length === 0) {
    return null;
  }

  const closestCourse = courses.reduce(
    (min, course) => (course.distance < min.distance ? course : min),
    courses[0],
  );

  return closestCourse.course;
}

async function findNClosestCourses(lat, lon, n) {
  const courses = await getCourseDistances(lat, lon);

  courses.sort((a, b) => a.distance - b.distance);

  return courses.slice(0, n).map((c) => c.course);
}

async function getGpxContentFromS3(courseNumber) {
  var fileName = `서울둘레길2.0_${courseNumber}코스.gpx`;
  fileName = fileName.normalize('NFD');
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
      return null; // 파일이 없으면 null 반환
    }
    throw error; // 그 외 다른 에러는 다시 던짐
  }
}

module.exports = {
  getCoordinatesFromGpx,
  getCourseMetadataFromGpx,
  findClosestCourse,
  findNClosestCourses,
  getGpxContentFromS3,
};
