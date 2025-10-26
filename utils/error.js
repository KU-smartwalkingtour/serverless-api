class WeatherError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'WeatherError';
    this.statusCode = statusCode;
  }
}

module.exports = WeatherError;
