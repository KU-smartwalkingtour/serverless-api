const axios = require('axios');
const proj4 = require('proj4');
const { ServerError, ERROR_CODES } = require('./error');
const { logger } = require('./logger');

// 상수
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 9시간 (밀리초)
const WEATHER_API_DELAY_MINUTES = 45; // API 데이터 지연 시간 (분)

/**
 * 날씨 API 요청을 위한 기준 날짜 및 시간 가져오기
 * 날씨 API 데이터는 약 45분 지연됨
 * @returns {{base_date: string, base_time: string}} KMA API 형식의 날짜 및 시간
 */
const getDateTimeForWeatherSummary = () => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);

  const initialTimeLog = kstNow.toISOString().replace('T', ' ').substring(0, 19);
  logger.debug(`초기 KST 시간: ${initialTimeLog}`);

  const minutes = kstNow.getUTCMinutes();

  // 45분 지연 시간 내인 경우 이전 시간 사용
  if (minutes < WEATHER_API_DELAY_MINUTES) {
    kstNow.setUTCHours(kstNow.getUTCHours() - 1);
  }

  const year = kstNow.getUTCFullYear();
  const month = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstNow.getUTCDate()).padStart(2, '0');
  const hours = String(kstNow.getUTCHours()).padStart(2, '0');

  const base_time = `${hours}00`;
  const base_date = `${year}${month}${day}`;

  logger.debug(`API 매개변수 계산 완료 -> base_date: ${base_date}, base_time: ${base_time}`);

  return { base_date, base_time };
};

/**
 * 경도/위도를 KMA API에서 사용하는 격자 좌표(nx, ny)로 변환
 * @param {number} lon - 경도
 * @param {number} lat - 위도
 * @returns {Promise<{nx: number, ny: number}>} 격자 좌표
 * @throws {WeatherError} 변환 실패 또는 API 오류 시
 */
const getNxNy = async (lon, lat) => {
  const url = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_xy_lonlat';
  const authKey = process.env.KMA_API_KEY;

  if (!authKey) {
    throw new ServerError(ERROR_CODES.KMA_API_ERROR, 500, {
      reason: 'KMA_API_KEY environment variable is not configured',
    });
  }

  try {
    const response = await axios.get(url, {
      params: {
        lon,
        lat,
        help: 0,
        authKey,
      },
    });

    // JSON 오류 응답 확인
    if (typeof response.data === 'object' && response.data !== null && response.data.result) {
      const result = response.data.result;
      if (result.status !== 200) {
        throw new ServerError(ERROR_CODES.KMA_API_ERROR, result.status, {
          message: `KMA NX/NY API Error: ${result.message}`,
        });
      }
    }

    // nx, ny 좌표를 위한 텍스트 응답 파싱
    const lines = response.data.split('\n');
    if (lines.length >= 3) {
      const parts = lines[2].split(/,\s*/);
      if (parts.length >= 4) {
        const nx = parseInt(parts[2], 10);
        const ny = parseInt(parts[3], 10);
        logger.debug(`좌표를 격자로 변환 완료: nx=${nx}, ny=${ny}`);
        return { nx, ny };
      }
    }
    throw new ServerError(ERROR_CODES.KMA_API_ERROR, 500, {
      message: 'Invalid response format from NX/NY conversion API',
    });
  } catch (error) {
    if (ServerError.isServerError(error)) {
      throw error;
    }
    logger.error(`nx/ny 좌표 조회 오류: ${error.message}`);
    throw new ServerError(ERROR_CODES.KMA_API_ERROR, 500, {
      message: error.message || 'Error fetching nx/ny coordinates',
    });
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
  proj4.defs(
    'EPSG:5186',
    '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
  );

  // Convert coordinates
  const [tmX, tmY] = proj4(wgs84, 'EPSG:5186', [lon, lat]);
  logger.debug(`Converted coords WGS84(${lon}, ${lat}) to TM(${tmX}, ${tmY})`);
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
    throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, 500, {
      reason: 'AirKorea API key is missing. Please check your .env file.',
    });
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
        ver: '1.1', // API 문서에 명시된 버전 사용
      },
    });

    // 3. 응답 처리
    if (response.data?.response?.body?.items && response.data.response.body.items.length > 0) {
      const nearestStation = response.data.response.body.items[0];
      const stationName = nearestStation.stationName;
      logger.debug(`Found nearest air quality station: ${stationName}`);
      return stationName;
    } else {
      logger.warn(
        `No nearby air quality station found for TM coords (${tmCoords.x}, ${tmCoords.y}) or invalid API response format.`,
      );
      throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, 404, {
        message: '가까운 측정소를 찾을 수 없거나 API 응답 형식이 올바르지 않습니다.',
      });
    }
  } catch (error) {
    if (ServerError.isServerError(error)) {
      throw error;
    }

    let errorMessage = 'Error fetching nearest station name';
    let statusCode = 500;
    if (error.response) {
      errorMessage = `AirKorea API Error (getNearestStationName): ${error.response.data?.response?.header?.resultMsg || error.message}`;
      statusCode = error.response.status;
    } else {
      errorMessage = error.message;
    }
    logger.error(`Error fetching nearest station: ${errorMessage}`);
    throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, statusCode, {
      message: errorMessage,
    });
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
    logger.error('AirKorea API key is missing for getAirQualityByStationName.');
    // 에러를 throw하는 대신 null을 반환하여, 대기질 정보 전체가 실패하지 않도록 함
    return null;
  }
  if (!stationName) {
    logger.warn('Station name is required for getAirQualityByStationName.');
    return null;
  }

  try {
    const response = await axios.get(url, {
      params: {
        serviceKey: serviceKey,
        returnType: 'json',
        stationName: stationName, // 입력받은 측정소명 사용
        dataTerm: 'DAILY', // 요청 자료기간 (시간 : DAILY, 월 : MONTH, 3개월 : 3MONTH) - 보통 최근 측정값은 DAILY 사용
        ver: '1.3', // API 문서 버전 참고
      },
    });

    // API 응답 구조 확인 및 데이터 추출
    if (response.data?.response?.body?.items && response.data.response.body.items.length > 0) {
      // API는 보통 최근 측정값 하나를 반환합니다.
      const data = response.data.response.body.items[0];
      const airQualityData = {
        dataTime: data.dataTime, // 측정 시간
        pm10Value: data.pm10Value, // 미세먼지(PM10) 농도 (단위: µg/m³)
        pm25Value: data.pm25Value, // 초미세먼지(PM2.5) 농도 (단위: µg/m³)
        o3Value: data.o3Value, // 오존(O3) 농도 (단위: ppm)
        coValue: data.coValue, // 일산화탄소(CO) 농도 (단위: ppm)
        so2Value: data.so2Value, // 아황산가스(SO2) 농도 (단위: ppm)
        no2Value: data.no2Value, // 이산화질소(NO2) 농도 (단위: ppm)
        khaiGrade: data.khaiGrade, // 통합대기환경지수 등급 (1:좋음, 2:보통, 3:나쁨, 4:매우나쁨)
        khaiValue: data.khaiValue, // 통합대기환경지수 값
      };
      logger.debug(`Fetched air quality for station ${stationName}`);
      return airQualityData;
    } else {
      logger.warn(
        `No air quality data found for station ${stationName} or invalid API response format. Msg: ${response.data?.response?.header?.resultMsg}`,
      );
      return null; // 데이터 없거나 실패 시 null 반환
    }
  } catch (error) {
    let errorMessage = `Error fetching air quality for station ${stationName}`;
    if (error.response) {
      errorMessage = `AirKorea API Error (getAirQualityByStationName): ${error.response.data?.response?.header?.resultMsg || error.message}`;
    } else {
      errorMessage = error.message;
    }
    logger.error(errorMessage);
    return null; // 에러 발생 시 null 반환
  }
};

/**
 * 초단기 날씨 예보 요약 가져오기
 * @param {number} lon - 경도
 * @param {number} lat - 위도
 * @returns {Promise<Array>} 시간별로 그룹화된 예보 데이터 배열
 * @throws {WeatherError} API 호출 실패 또는 오류 반환 시
 */
const getWeatherSummary = async (lon, lat) => {
  const { nx, ny } = await getNxNy(lon, lat);
  const { base_date, base_time } = getDateTimeForWeatherSummary();
  const baseUrl =
    'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst';

  const params = {
    pageNo: 1,
    numOfRows: 1000,
    dataType: 'JSON',
    base_date,
    base_time,
    nx,
    ny,
    authKey: process.env.KMA_API_KEY,
  };

  try {
    const response = await axios.get(baseUrl, { params });

    if (!response.data?.response?.header) {
      throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500, {
        message: 'Invalid response format from Weather API',
      });
    }

    const { header, body } = response.data.response;
    logger.info(body);

    if (header.resultCode !== '00') {
      throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 400, {
        message: `Weather API error: ${header.resultMsg}`,
      });
    }

    const originalItemArray = body.items.item;

    // 시간별로 예보 데이터 그룹화
    const groupedByTime = originalItemArray.reduce((acc, current) => {
      const { fcstDate, fcstTime, category, fcstValue } = current;

      const key = `${fcstDate}-${fcstTime}`;
      if (!acc[key]) {
        acc[key] = { fcstDate, fcstTime };
      }

      acc[key][category] = fcstValue;
      return acc;
    }, {});

    // 예보 시간순으로 정렬
    const finalForecast = Object.values(groupedByTime).sort((a, b) =>
      `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`),
    );

    logger.debug(`${finalForecast.length}개의 예보 시간대 조회 완료`);
    return finalForecast;
  } catch (error) {
    if (ServerError.isServerError(error)) {
      throw error;
    }
    logger.error(`날씨 요약 조회 오류: ${error.message}`);
    throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500, {
      message: 'Failed to fetch weather summary',
    });
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
      logger.warn(`Air quality data is null for station: ${stationName}`);
      return null;
    }

    return airQualityData;
  } catch (error) {
    logger.error(`Error in getAirQualitySummary: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getDateTimeForWeatherSummary,
  getNxNy,
  getNearestStationName,
  getAirQualityByStationName,
  getAirQualitySummary,
  getWeatherSummary,
};
