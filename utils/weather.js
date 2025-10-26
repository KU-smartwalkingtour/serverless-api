const axios = require('axios');
const WeatherError = require('./error');
const { log } = require('./logger');

const getDateTimeForWeatherSummary = () => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

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

  log(
    'debug',
    `Calculated time (these will be the url parameters) -> base_date: ${base_date}, base_time: ${base_time}`,
  );

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
        authKey: authKey,
      },
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

const getWeatherSummary = async (lon, lat) => {
  const { nx, ny } = await getNxNy(lon, lat);
  const { base_date, base_time } = getDateTimeForWeatherSummary();
  const baseUrl =
    'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst';

  const params = {
    pageNo: 1,
    numOfRows: 1000,
    dataType: 'JSON',
    base_date: base_date,
    base_time: base_time,
    nx: nx,
    ny: ny,
    authKey: process.env.KMA_API_KEY,
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

      const finalForecast = Object.values(groupedByTime).sort((a, b) =>
        a.fcstTime.localeCompare(b.fcstTime),
      );

      return finalForecast;
    } else {
      throw new WeatherError(
        `API returned an error: ${response.data.response.header.resultMsg}`,
        400,
      );
    }
  } else {
    throw new WeatherError('Invalid response format from Weather API', 500);
  }
};

module.exports = {
  getDateTimeForWeatherSummary,
  getNxNy,
  getWeatherSummary,
};
