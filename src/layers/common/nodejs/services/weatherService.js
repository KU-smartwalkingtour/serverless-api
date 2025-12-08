const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');
const {
  getWeatherSummary,
  getAirQualitySummary,
} = require('../utils/weather');

async function getIntegratedWeather(query) {
  const { lng, lat } = query;

  if (!lng || !lat) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  logger.info(`Integrated weather request: lat=${lat}, lng=${lng}`);

  const [weatherData, airQualityData] = await Promise.allSettled([
    getWeatherSummary(lng, lat),
    getAirQualitySummary(lng, lat),
  ]);

  let weatherSummary = null;
  if (
    weatherData.status === 'fulfilled' &&
    weatherData.value &&
    weatherData.value.length > 0
  ) {
    const firstForecast = weatherData.value[0];
    weatherSummary = {
      temperature: firstForecast.T1H || null,
      humidity: firstForecast.REH || null,
      windSpeed: firstForecast.WSD || null,
      precipitation: firstForecast.RN1 || null,
      skyCondition: firstForecast.SKY || null,
      precipitationType: firstForecast.PTY || null,
    };
  }

  let airQualitySummary = null;
  if (airQualityData.status === 'fulfilled' && airQualityData.value) {
    const aq = airQualityData.value;
    let message = '보통 수준의 대기질입니다. 민감한 분들은 주의하세요.';

    if (aq.khaiGrade) {
      const grade = parseInt(aq.khaiGrade);
      if (grade === 1) {
        message = '좋음 수준의 대기질입니다. 외부활동에 적합합니다.';
      } else if (grade === 2) {
        message = '보통 수준의 대기질입니다. 민감한 분들은 주의하세요.';
      } else if (grade === 3) {
        message = '나쁨 수준의 대기질입니다. 외부활동을 자제하세요.';
      } else if (grade === 4 || grade === 5) {
        message = '매우 나쁨 수준의 대기질입니다. 외출을 삼가세요.';
      }
    }

    airQualitySummary = {
      message,
      pm10: aq.pm10Value || null,
      pm25: aq.pm25Value || null,
      grade: aq.khaiGrade || null,
    };
  }

  const response = {
    weather: weatherSummary,
    airQuality: airQualitySummary,
  };

  if (weatherData.status === 'rejected') {
    logger.warn('Weather fetch failed', {
      lat,
      lng,
      error: weatherData.reason?.message,
    });
  }

  if (airQualityData.status === 'rejected') {
    logger.warn('Air quality fetch failed', {
      lat,
      lng,
      error: airQualityData.reason?.message,
    });
  }

  if (
    weatherData.status === 'rejected' &&
    airQualityData.status === 'rejected'
  ) {
    logger.error('Both weather and air quality fetch failed', { lat, lng });
    throw new ServerError(ERROR_CODES.WEATHER_API_ERROR, 500);
  }

  return response;
}

async function getWeather(query) {
  const { lng, lat } = query;

  if (!lng || !lat) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  return await getWeatherSummary(lng, lat);
}

async function getAirQuality(query) {
  const { lng, lat } = query;

  if (!lng || !lat) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  const airQualityData = await getAirQualitySummary(lng, lat);

  if (airQualityData === null) {
    throw new ServerError(ERROR_CODES.AIRKOREA_API_ERROR, 404);
  }

  return airQualityData;
}

module.exports = {
  getIntegratedWeather,
  getWeather,
  getAirQuality,
};
