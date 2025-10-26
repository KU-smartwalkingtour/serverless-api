const pino = require('pino');

// Pino 로거 설정
const pinoConfig = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
};

// 개발 환경에서 사람이 읽기 쉬운 로그를 위해 pino-pretty 사용
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
