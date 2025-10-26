const axios = require('axios');
const WeatherError = require('./error');
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
    throw new WeatherError('KMA_API_KEY environment variable is not configured', 500);
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
        throw new WeatherError(`KMA NX/NY API Error: ${result.message}`, result.status);
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
    throw new WeatherError('Invalid response format from NX/NY conversion API', 500);
  } catch (error) {
    if (WeatherError.isWeatherError(error)) {
      throw error;
    }
    logger.error(`nx/ny 좌표 조회 오류: ${error.message}`);
    throw new WeatherError(error.message || 'Error fetching nx/ny coordinates', 500);
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
      throw new WeatherError('Invalid response format from Weather API', 500);
    }

    const { header, body } = response.data.response;

    if (header.resultCode !== '00') {
      throw new WeatherError(`Weather API error: ${header.resultMsg}`, 400);
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
      a.fcstTime.localeCompare(b.fcstTime)
    );

    logger.debug(`${finalForecast.length}개의 예보 시간대 조회 완료`);
    return finalForecast;
  } catch (error) {
    if (WeatherError.isWeatherError(error)) {
      throw error;
    }
    logger.error(`날씨 요약 조회 오류: ${error.message}`);
    throw new WeatherError('Failed to fetch weather summary', 500);
  }
};

module.exports = {
  getDateTimeForWeatherSummary,
  getNxNy,
  getWeatherSummary,
};
