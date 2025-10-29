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

    if (header.resultCode !== '00') {
      throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 400, {
        message: `Weather API error: ${header.resultMsg}`,
      });
    }

    const originalItemArray = body.items.item;

    // 시간별로 예보 데이터 그룹화
    const groupedByTime = originalItemArray.reduce((acc, current) => {
      const { fcstTime, category, fcstValue } = current;

      if (!acc[fcstTime]) {
        acc[fcstTime] = { fcstTime };
      }

      acc[fcstTime][category] = fcstValue;
      return acc;
    }, {});

    // 예보 시간순으로 정렬
    const finalForecast = Object.values(groupedByTime).sort((a, b) =>
      a.fcstTime.localeCompare(b.fcstTime),
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
 * 기체 농도 단위를 µg/m³에서 ppm으로 변환 (표준 25°C, 1 atm 기준)
 * @param {number | null | undefined} ug_m3 - 농도 (µg/m³)
 * @param {'CO' | 'NO2' | 'O3' | 'SO2'} gasType - 기체 종류
 * @returns {number | null} 변환된 농도 (ppm)
 */
const convertUgM3ToPpm = (ug_m3, gasType) => {
  if (ug_m3 === null || ug_m3 === undefined) return null;

  // EPA(미국 환경보호청) 표준 변환 계수 (근사치)
  // 1 ppm = X µg/m³  --->  1 µg/m³ = 1/X ppm
  const CONVERSION_FACTORS = {
    // 1 ppm CO ≈ 1150 µg/m³
    CO: 1150,  
    // 1 ppm NO2 ≈ 1880 µg/m³
    NO2: 1880, 
    // 1 ppm O3 ≈ 1960 µg/m³
    O3: 1960,  
    // 1 ppm SO2 ≈ 2620 µg/m³
    SO2: 2620, 
  };

  const factor = CONVERSION_FACTORS[gasType];
  if (!factor) {
    logger.warn(`알 수 없는 기체 타입: ${gasType}`);
    return null;
  }

  // ppm = (µg/m³) / (변환 계수)
  return ug_m3 / factor;
};

/**
 * [수정됨] Open-Meteo API를 사용해 위도/경도의 대기 질 정보를 반환합니다.
 * @param {string} lon - 경도 (WGS84)
 * @param {string} lat - 위도 (WGS84)
 * @returns {Promise<object | null>} 대기 질 정보 객체 (실패 시 null 또는 에러 throw)
 */
const getAirQualitySummary = async (lon, lat) => {
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality';

  try {
    const response = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        // (수정) european_aqi (통합지수) 추가
        hourly: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi',
        timezone: 'Asia/Seoul',
      },
    });

    if (!response.data || !response.data.hourly) {
      logger.warn(`No air quality data found from Open-Meteo for coords (${lon}, ${lat})`);
      return null; 
    }

    const hourlyData = response.data.hourly;
    const latestIndex = 0; // API는 시간대별 배열로 반환하므로 가장 최근(첫 번째) 값 사용

    if (!hourlyData.time || hourlyData.time.length === 0) {
      logger.warn(`Open-Meteo returned empty hourly data for coords (${lon}, ${lat})`);
      return null;
    }

    // 1. Open-Meteo에서 원본 값(µg/m³) 추출
    const pm10_ug = hourlyData.pm10[latestIndex];
    const pm25_ug = hourlyData.pm2_5[latestIndex];
    const o3_ug = hourlyData.ozone[latestIndex];
    const co_ug = hourlyData.carbon_monoxide[latestIndex];
    const so2_ug = hourlyData.sulphur_dioxide[latestIndex];
    const no2_ug = hourlyData.nitrogen_dioxide[latestIndex];
    const aqi = hourlyData.european_aqi[latestIndex]; // 유럽 AQI (1-5등급)

    // 2. [핵심] µg/m³ -> ppm 단위 변환 (헬퍼 함수 사용)
    // 스크린샷의 소수점 자릿수에 맞춰 포맷팅
    const o3_ppm = o3_ug !== null ? parseFloat(convertUgM3ToPpm(o3_ug, 'O3').toFixed(4)) : null;
    const co_ppm = co_ug !== null ? parseFloat(convertUgM3ToPpm(co_ug, 'CO').toFixed(2)) : null;
    const so2_ppm = so2_ug !== null ? parseFloat(convertUgM3ToPpm(so2_ug, 'SO2').toFixed(4)) : null;
    const no2_ppm = no2_ug !== null ? parseFloat(convertUgM3ToPpm(no2_ug, 'NO2').toFixed(4)) : null;

    // 3. 에어코리아 형식과 동일한 객체로 구성
    const airQualityData = {
      dataTime: hourlyData.time[latestIndex], // 측정 시간
      
      // PM-10 (µg/m³): 단위 일치
      pm10Value: pm10_ug, 
      
      // PM-2.5 (µg/m³): 단위 일치
      pm25Value: pm25_ug, 
      
      // 오존 (ppm): 단위 변환
      o3Value: o3_ppm,
      
      // 이산화질소 (ppm): 단위 변환
      no2Value: no2_ppm,
      
      // 일산화탄소 (ppm): 단위 변환
      coValue: co_ppm,
      
      // 아황산가스 (ppm): 단위 변환
      so2Value: so2_ppm,
      
      // (대체) khaiGrade -> European AQI (1-5 스케일)
      // *참고: Open-Meteo는 한국형 통합지수(khai)가 아닌 유럽형(european_aqi)을 제공합니다. 
      //  (1:좋음, 2:보통, 3:나쁨, 4:매우나쁨, 5:극히나쁨)
      khaiGrade: aqi, 
      
      // (제공 안함) khaiValue는 Open-Meteo에 해당 값이 없습니다.
      khaiValue: null, 
      
      source: 'Open-Meteo (Units Converted)',
    };

    logger.debug(`Fetched and converted air quality from Open-Meteo for (${lon}, ${lat})`);
    return airQualityData;

  } catch (error) {
    let errorMessage = 'Error fetching Open-Meteo air quality';
    let statusCode = 500;

    if (error.response) {
      errorMessage = `Open-Meteo API Error: ${error.response.data?.reason || error.message}`;
      statusCode = error.response.status;
    } else {
      errorMessage = error.message;
    }
    
    logger.error(errorMessage, { error: error.message });

    throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, statusCode, {
      message: errorMessage,
    });
  }
};

module.exports = {
  getDateTimeForWeatherSummary,
  getNxNy,
  getAirQualitySummary,
  getWeatherSummary,
};
