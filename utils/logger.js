const pino = require('pino');

// Pino configuration
const pinoConfig = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Use pino-pretty in development for human-readable logs
if (process.env.NODE_ENV === 'development') {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{msg}',
    },
  };
}

const logger = pino(pinoConfig);

module.exports = { logger };
