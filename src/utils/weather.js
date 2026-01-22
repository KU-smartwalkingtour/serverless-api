const axios = require('axios');
const proj4 = require('proj4');
const { ServerError, ERROR_CODES } = require('./error');
const { logger } = require('./logger');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEATHER_API_DELAY_MINUTES = 45;

const getDateTimeForWeatherSummary = () => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);

  const minutes = kstNow.getUTCMinutes();

  if (minutes < WEATHER_API_DELAY_MINUTES) {
    kstNow.setUTCHours(kstNow.getUTCHours() - 1);
  }

  const year = kstNow.getUTCFullYear();
  const month = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstNow.getUTCDate()).padStart(2, '0');
  const hours = String(kstNow.getUTCHours()).padStart(2, '0');

  const base_time = `${hours}00`;
  const base_date = `${year}${month}${day}`;

  logger.debug(`API params: base_date=${base_date}, base_time=${base_time}`);

  return { base_date, base_time };
};

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
      params: { lon, lat, help: 0, authKey },
    });

    if (
      typeof response.data === 'object' &&
      response.data !== null &&
      response.data.result
    ) {
      const result = response.data.result;
      if (result.status !== 200) {
        throw new ServerError(ERROR_CODES.KMA_API_ERROR, result.status, {
          message: `KMA NX/NY API Error: ${result.message}`,
        });
      }
    }

    const lines = response.data.split('\n');
    if (lines.length >= 3) {
      const parts = lines[2].split(/,\s*/);
      if (parts.length >= 4) {
        const nx = parseInt(parts[2], 10);
        const ny = parseInt(parts[3], 10);
        logger.debug(`Converted coords to grid: nx=${nx}, ny=${ny}`);
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
    logger.error(`nx/ny coord error: ${error.message}`);
    throw new ServerError(ERROR_CODES.KMA_API_ERROR, 500, {
      message: error.message || 'Error fetching nx/ny coordinates',
    });
  }
};

const convertWGS84toTM = (lon, lat) => {
  const wgs84 = 'EPSG:4326';
  proj4.defs(
    'EPSG:5186',
    '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs'
  );

  const [tmX, tmY] = proj4(wgs84, 'EPSG:5186', [lon, lat]);
  logger.debug(`Converted WGS84(${lon}, ${lat}) to TM(${tmX}, ${tmY})`);
  return { x: tmX, y: tmY };
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

    const groupedByTime = originalItemArray.reduce((acc, current) => {
      const { fcstTime, category, fcstValue } = current;

      if (!acc[fcstTime]) {
        acc[fcstTime] = { fcstTime };
      }

      acc[fcstTime][category] = fcstValue;
      return acc;
    }, {});

    const finalForecast = Object.values(groupedByTime).sort((a, b) =>
      a.fcstTime.localeCompare(b.fcstTime)
    );

    logger.debug(`Fetched ${finalForecast.length} forecast time slots`);
    return finalForecast;
  } catch (error) {
    if (ServerError.isServerError(error)) {
      throw error;
    }
    logger.error(`Weather summary error: ${error.message}`);
    throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500, {
      message: 'Failed to fetch weather summary',
    });
  }
};

const convertUgM3ToPpm = (ug_m3, gasType) => {
  if (ug_m3 === null || ug_m3 === undefined) return null;

  const CONVERSION_FACTORS = {
    CO: 1150,
    NO2: 1880,
    O3: 1960,
    SO2: 2620,
  };

  const factor = CONVERSION_FACTORS[gasType];
  if (!factor) {
    logger.warn(`Unknown gas type: ${gasType}`);
    return null;
  }

  return ug_m3 / factor;
};

const getAirQualitySummary = async (lon, lat) => {
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality';

  try {
    const response = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        hourly:
          'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi',
        timezone: 'Asia/Seoul',
      },
    });

    if (!response.data || !response.data.hourly) {
      logger.warn(`No air quality data from Open-Meteo for (${lon}, ${lat})`);
      return null;
    }

    const hourlyData = response.data.hourly;
    const latestIndex = 0;

    if (!hourlyData.time || hourlyData.time.length === 0) {
      logger.warn(`Open-Meteo returned empty data for (${lon}, ${lat})`);
      return null;
    }

    const pm10_ug = hourlyData.pm10[latestIndex];
    const pm25_ug = hourlyData.pm2_5[latestIndex];
    const o3_ug = hourlyData.ozone[latestIndex];
    const co_ug = hourlyData.carbon_monoxide[latestIndex];
    const so2_ug = hourlyData.sulphur_dioxide[latestIndex];
    const no2_ug = hourlyData.nitrogen_dioxide[latestIndex];
    const aqi = hourlyData.european_aqi[latestIndex];

    const o3_ppm =
      o3_ug !== null
        ? parseFloat(convertUgM3ToPpm(o3_ug, 'O3').toFixed(4))
        : null;
    const co_ppm =
      co_ug !== null
        ? parseFloat(convertUgM3ToPpm(co_ug, 'CO').toFixed(2))
        : null;
    const so2_ppm =
      so2_ug !== null
        ? parseFloat(convertUgM3ToPpm(so2_ug, 'SO2').toFixed(4))
        : null;
    const no2_ppm =
      no2_ug !== null
        ? parseFloat(convertUgM3ToPpm(no2_ug, 'NO2').toFixed(4))
        : null;

    const airQualityData = {
      dataTime: hourlyData.time[latestIndex],
      pm10Value: pm10_ug,
      pm25Value: pm25_ug,
      o3Value: o3_ppm,
      no2Value: no2_ppm,
      coValue: co_ppm,
      so2Value: so2_ppm,
      khaiGrade: aqi,
      khaiValue: null,
      source: 'Open-Meteo (Units Converted)',
    };

    logger.debug(`Fetched air quality from Open-Meteo for (${lon}, ${lat})`);
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
  convertWGS84toTM,
  getAirQualitySummary,
  getWeatherSummary,
};
