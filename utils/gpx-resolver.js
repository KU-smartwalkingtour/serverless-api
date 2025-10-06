const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');
const path = require('path');
const fs = require('fs');
const { get } = require('http');


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
            data.tracks.forEach(track => {
                track.segments.forEach(segment => {
                    segment.forEach(point => {
                        rows.push({
                            lat: point.lat,
                            lon: point.lon
                        });
                    });
                });
            });

            // 루트 포인트 추출
            if (data.routes) {
                data.routes.forEach(route => {
                    route.points.forEach(point => {
                        rows.push({
                            lat: point.lat,
                            lon: point.lon
                        });
                    });
                });
            }

            // 웨이포인트 추출
            if (data.waypoints) {
                data.waypoints.forEach(waypoint => {
                    rows.push({
                        lat: waypoint.lat,
                        lon: waypoint.lon
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
                const name01 = extensions['ogr:NAME_01'];   // "코스명"
                const value01 = extensions['ogr:VALUE_01']; // "[1코스] 수락산코스"
                const name02 = extensions['ogr:NAME_02'];   // "테마명"
                const value02 = extensions['ogr:VALUE_02']; // "[1코스] 속세를 떠나지 않은 옛사람의 길"
                const name03 = extensions['ogr:NAME_03'];   // "지역"
                const value03 = extensions['ogr:VALUE_03']; // "노원구"
                const name04 = extensions['ogr:NAME_04'];   // "세부코스"
                const value04 = extensions['ogr:VALUE_04']; // "도봉산역 ~ ..."
                const name05 = extensions['ogr:NAME_05'];   // "난이도"
                const value05 = extensions['ogr:VALUE_05']; // "상"
                const name06 = extensions['ogr:NAME_06'];   // "거리"
                const value06 = extensions['ogr:VALUE_06']; // "약 6.4km"
                const name07 = extensions['ogr:NAME_07'];   // "소요시간"
                const value07 = extensions['ogr:VALUE_07']; // "2시간 50분"
                const name08 = extensions['ogr:NAME_08'];   // "출발지"
                const value08 = extensions['ogr:VALUE_08']; // "지하철 1호선..."
                const name09 = extensions['ogr:NAME_09'];   // "도착지"
                const value09 = extensions['ogr:VALUE_09']; // "지하철 7호선..."
                const name10 = extensions['ogr:NAME_10'];   // "시점부"
                const value10 = extensions['ogr:VALUE_10']; // "도봉산역 ~ ..."
                const name11 = extensions['ogr:NAME_11'];   // "종점부"
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
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

async function findClosestCourse(lat, lon) {
    const gpxDir = path.join(__dirname, 'gpx_files');
    const files = await fs.promises.readdir(gpxDir);
    const parser = new xml2js.Parser({ explicitArray: false });

    let closestCourse = null;
    let minDistance = Infinity;

    for (const file of files) {
        if (path.extname(file) === '.gpx') {
            const filePath = path.join(gpxDir, file);
            const data = await fs.promises.readFile(filePath, 'utf8');
            const result = await parser.parseStringPromise(data);
            
            const extensions = result.gpx.trk.extensions;
            const fileLon = parseFloat(extensions['ogr:COORD_X']);
            const fileLat = parseFloat(extensions['ogr:COORD_Y']);

            if (!isNaN(fileLat) && !isNaN(fileLon)) {
                const distance = getDistance(lat, lon, fileLat, fileLon);

                if (distance < minDistance) {
                    minDistance = distance;
                    const courseNameMatch = file.match(/서울둘레길2\.0_(\d+)코스/);
                    if (courseNameMatch) {
                        closestCourse = courseNameMatch[1];
                    }
                }
            }
        }
    }

    return closestCourse;
}

async function findNClosestCourses(lat, lon, n) {
    const gpxDir = path.join(__dirname, 'gpx_files');
    const files = await fs.promises.readdir(gpxDir);
    const parser = new xml2js.Parser({ explicitArray: false });

    let courses = [];

    for (const file of files) {
        if (path.extname(file) === '.gpx') {
            const filePath = path.join(gpxDir, file);
            const data = await fs.promises.readFile(filePath, 'utf8');
            const result = await parser.parseStringPromise(data);
            
            const extensions = result.gpx.trk.extensions;
            const fileLon = parseFloat(extensions['ogr:COORD_X']);
            const fileLat = parseFloat(extensions['ogr:COORD_Y']);

            if (!isNaN(fileLat) && !isNaN(fileLon)) {
                const distance = getDistance(lat, lon, fileLat, fileLon);
                const courseNameMatch = file.match(/서울둘레길2\.0_(\d+)코스/);
                if (courseNameMatch) {
                    courses.push({ course: courseNameMatch[1], distance: distance });
                }
            }
        }
    }

    courses.sort((a, b) => a.distance - b.distance);

    return courses.slice(0, n).map(c => c.course);
}

module.exports = { getCoordinatesFromGpx, getCourseMetadataFromGpx, findClosestCourse, findNClosestCourses };