/**
 * Custom error class for weather-related errors
 * @extends Error
 */
class WeatherError extends Error {
  /**
   * Create a WeatherError
   * @param {string} message - Error message
   * @param {number} [statusCode=500] - HTTP status code
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'WeatherError';
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WeatherError);
    }
  }

  /**
   * Check if an error is a WeatherError instance
   * @param {Error} error - Error object to check
   * @returns {boolean}
   */
  static isWeatherError(error) {
    return error instanceof WeatherError;
  }

  /**
   * Convert error to JSON format for API responses
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    };
  }
}

module.exports = WeatherError;
