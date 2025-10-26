const axios = require('axios');
const proj4 = require('proj4');
const WeatherError = require('./error');
const { log } = require('./logger');

const getDateTimeForWeatherSummary = () => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));

  const initialTimeLog = kstNow.toISOString().replace('T', ' ').substring(0, 19);
  log('debug', `initial KST: ${initialTimeLog}`);

  const minutes = kstNow.getUTCMinutes();

  if (minutes < 45) {
    kstNow.setUTCHours(kstNow.getUTCHours() - 1);
  }

  const year = kstNow.getUTCFullYear();
  const month = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstNow.getUTCDate()).padStart(2, '0');
  const hours = String(kstNow.getUTCHours()).padStart(2, '0');
  
  const base_time = `${hours}00`; 
  const base_date = `${year}${month}${day}`;

  log('debug', `Calculated time (these will be the url parameters) -> base_date: ${base_date}, base_time: ${base_time}`);

  return { base_date, base_time };
};

// utils/weatherApi.js 또는 해당 파일

const getNxNy = async (lon, lat) => {
    const url = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_xy_lonlat';
    const authKey = process.env.KMA_API_KEY;

    try {
        const response = await axios.get(url, {
            params: {
                lon: lon,
                lat: lat,
                help: 0,
                authKey: authKey
            }
        });

        // 💡 수정 부분 시작 💡
        // 1. 응답 데이터가 JSON 형식이고 'result' 객체를 포함하는지 확인합니다.
        //    (기상청 오류 응답은 보통 JSON으로 옵니다.)
        if (typeof response.data === 'object' && response.data !== null && response.data.result) {
            const result = response.data.result;
            // 2. HTTP 상태 코드가 성공(200)이 아니면 오류를 throw 합니다.
            if (result.status !== 200) {
                throw new WeatherError(`KMA NX/NY API Error: ${result.message}`, result.status);
            }
        }
        
        // 3. 정상적인 텍스트 응답(nx, ny 좌표)을 파싱합니다.
        const lines = response.data.split('\n');
        if (lines.length >= 3) {
            const parts = lines[2].split(/,\s*/);
            if (parts.length >= 4) {
                const nx = parseInt(parts[2], 10);
                const ny = parseInt(parts[3], 10);
                log('debug', `coordinates to nx,ny : nx=${nx}, ny=${ny}`);
                return { nx, ny };
            }
        }
        throw new WeatherError('Invalid response format from NX/NY conversion API', 500);
        
    } catch (error) {
        // Axios 오류 또는 위에서 throw한 WeatherError를 처리합니다.
        const statusCode = error.isWeatherError ? error.statusCode : 500;
        log('error', `Error fetching nx/ny coordinates: ${error.message}`);
        throw new WeatherError(error.message || 'Error fetching nx/ny coordinates', statusCode);
    }
};

/**
 * WGS84 좌표를 TM 좌표로 변환합니다.(에어코리아는 기상청과 달리 TM 좌표계를 사용)
 * @param {number} lon - 경도 (WGS84)
 * @param {number} lat - 위도 (WGS84)
 * @returns {{x: number, y: number}} TM 좌표 객체
 */
const convertWGS84toTM = (lon, lat) => {
    // Define projection systems
    const wgs84 = 'EPSG:4326'; 
    proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");

    // Convert coordinates
    const [tmX, tmY] = proj4(wgs84, 'EPSG:5186', [lon, lat]);
    log('debug', `Converted coords WGS84(${lon}, ${lat}) to TM(${tmX}, ${tmY})`);
    return { x: tmX, y: tmY };
};

/**
 * [신규] 위도, 경도를 기반으로 'getNearbyMsrstnList' API를 호출하여
 * 가장 가까운 대기 질 측정소 이름을 반환합니다.
 * @param {string} lon - 경도 (WGS84)
 * @param {string} lat - 위도 (WGS84)
 * @returns {Promise<string>} 가장 가까운 측정소 이름
 */
const getNearestStationName = async (lon, lat) => {
    const serviceKey = process.env.AIRKOREA_API_KEY;
    const url = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList';

    if (!serviceKey) {
        throw new WeatherError('AirKorea API key is missing. Please check your .env file.', 500);
    }

    try {
        // 1. WGS84 좌표를 TM 좌표로 변환
        const tmCoords = convertWGS84toTM(parseFloat(lon), parseFloat(lat));

        // 2. 변환된 TM 좌표로 API 호출
        const response = await axios.get(url, {
            params: {
                serviceKey: serviceKey,
                returnType: 'json',
                tmX: tmCoords.x, // TM 좌표 사용
                tmY: tmCoords.y, // TM 좌표 사용
                ver: '1.1'       // API 문서에 명시된 버전 사용
            }
        });

        // 3. 응답 처리
        if (response.data?.response?.body?.items && response.data.response.body.items.length > 0) {
            const nearestStation = response.data.response.body.items[0];
            const stationName = nearestStation.stationName;
            log('debug', `Found nearest air quality station: ${stationName}`);
            return stationName;
        } else {
            log('warn', `No nearby air quality station found for TM coords (${tmCoords.x}, ${tmCoords.y}) or invalid API response format.`);
            throw new WeatherError('가까운 측정소를 찾을 수 없거나 API 응답 형식이 올바르지 않습니다.', 404);
        }

    } catch (error) {
        let errorMessage = 'Error fetching nearest station name';
        let statusCode = 500;
        if (error.response) {
            errorMessage = `AirKorea API Error (getNearestStationName): ${error.response.data?.response?.header?.resultMsg || error.message}`;
            statusCode = error.response.status;
        } else if (error instanceof WeatherError) {
            errorMessage = error.message;
            statusCode = error.statusCode;
        } else {
            errorMessage = error.message;
        }
        log('error', `Error fetching nearest station: ${errorMessage}`);
        throw new WeatherError(errorMessage, statusCode);
    }
};

/**
 * 특정 측정소 이름으로 실시간 대기 질 정보를 가져옵니다.
 * @param {string} stationName - 대기 질 정보를 조회할 측정소 이름
 * @returns {Promise<object | null>} 해당 측정소의 대기 질 정보 객체 (실패 시 null)
 */
const getAirQualityByStationName = async (stationName) => {
    const serviceKey = process.env.AIRKOREA_API_KEY;
    const url = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty';

    if (!serviceKey) {
        log('error', 'AirKorea API key is missing for getAirQualityByStationName.');
        // 에러를 throw하는 대신 null을 반환하여, 대기질 정보 전체가 실패하지 않도록 함
        return null; 
    }
    if (!stationName) {
        log('warn', 'Station name is required for getAirQualityByStationName.');
        return null;
    }

    try {
        const response = await axios.get(url, {
            params: {
                serviceKey: serviceKey,
                returnType: 'json',
                stationName: stationName, // 입력받은 측정소명 사용
                dataTerm: 'DAILY',        // 요청 자료기간 (시간 : DAILY, 월 : MONTH, 3개월 : 3MONTH) - 보통 최근 측정값은 DAILY 사용
                ver: '1.3'                // API 문서 버전 참고
            }
        });

        // API 응답 구조 확인 및 데이터 추출
        if (response.data?.response?.body?.items && response.data.response.body.items.length > 0) {
            // API는 보통 최근 측정값 하나를 반환합니다.
            const data = response.data.response.body.items[0];
            const airQualityData = {
                dataTime: data.dataTime, // 측정 시간
                pm10Value: data.pm10Value, // 미세먼지(PM10) 농도 (단위: µg/m³)
                pm25Value: data.pm25Value, // 초미세먼지(PM2.5) 농도 (단위: µg/m³)
                o3Value: data.o3Value,     // 오존(O3) 농도 (단위: ppm)
                coValue: data.coValue,     // 일산화탄소(CO) 농도 (단위: ppm)
                so2Value: data.so2Value,    // 아황산가스(SO2) 농도 (단위: ppm)
                no2Value: data.no2Value,    // 이산화질소(NO2) 농도 (단위: ppm)
                khaiGrade: data.khaiGrade, // 통합대기환경지수 등급 (1:좋음, 2:보통, 3:나쁨, 4:매우나쁨)
                khaiValue: data.khaiValue, // 통합대기환경지수 값
            };
            log('debug', `Fetched air quality for station ${stationName}`);
            return airQualityData;
        } else {
            log('warn', `No air quality data found for station ${stationName} or invalid API response format. Msg: ${response.data?.response?.header?.resultMsg}`);
            return null; // 데이터 없거나 실패 시 null 반환
        }

    } catch (error) {
        let errorMessage = `Error fetching air quality for station ${stationName}`;
        if (error.response) {
            errorMessage = `AirKorea API Error (getAirQualityByStationName): ${error.response.data?.response?.header?.resultMsg || error.message}`;
        } else {
            errorMessage = error.message;
        }
        log('error', errorMessage);
        return null; // 에러 발생 시 null 반환
    }
};

const getWeatherSummary = async (lon, lat) => {

    const { nx, ny } = await getNxNy(lon, lat);
    const { base_date, base_time } = getDateTimeForWeatherSummary();
    const baseUrl = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst';


    const params = {
        pageNo: 1,
        numOfRows: 1000,
        dataType: 'JSON',
        base_date: base_date,
        base_time: base_time,
        nx: nx,
        ny: ny,
        authKey: process.env.KMA_API_KEY
    };

    const response = await axios.get(baseUrl, { params: params });

    if (response.data && response.data.response && response.data.response.header) {
        if (response.data.response.header.resultCode === '00') {
            const originalItemArray = response.data.response.body.items.item;

            const groupedByTime = originalItemArray.reduce((acc, current) => {
                const { fcstTime, category, fcstValue } = current;

                if (!acc[fcstTime]) {
                    acc[fcstTime] = { fcstTime: fcstTime };
                }

                acc[fcstTime][category] = fcstValue;

                return acc;
            }, {});

            const finalForecast = Object.values(groupedByTime)
                .sort((a, b) => a.fcstTime.localeCompare(b.fcstTime));

            return finalForecast;
        } else {
            throw new WeatherError(`API returned an error: ${response.data.response.header.resultMsg}`, 400);
        }
    }
    else {
        throw new WeatherError('Invalid response format from Weather API', 500);
    }
};

/**
 * 위도/경도를 받아 가장 가까운 측정소의 대기 질 정보를 반환합니다.
 * @param {string} lon - 경도 (WGS84)
 * @param {string} lat - 위도 (WGS84)
 * @returns {Promise<object | null>} 대기 질 정보 객체 (실패 시 null 또는 에러 throw)
 */
const getAirQualitySummary = async (lon, lat) => {
    try {

        const stationName = await getNearestStationName(lon, lat);

        const airQualityData = await getAirQualityByStationName(stationName);

        // getAirQualityByStationName 함수가 실패하여 null을 반환했을 경우 처리
        if (!airQualityData) {
            log('warn', `Air quality data is null for station: ${stationName}`);
            return null; 
        }

        return airQualityData;

    } catch (error) {
        log('error', `Error in getAirQualitySummary: ${error.message}`);
        throw error;
    }
};

module.exports = {
    getDateTimeForWeatherSummary,
    getNxNy,
    getNearestStationName,
    getAirQualityByStationName,
    getAirQualitySummary,
    getWeatherSummary
};
