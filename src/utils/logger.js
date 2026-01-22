const pino = require('pino');

const pinoConfig = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
};

const logger = pino(pinoConfig);

module.exports = { logger };
