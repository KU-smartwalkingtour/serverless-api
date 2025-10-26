require('module-alias/register');
require('dotenv').config();

const app = require('./app');
const { logger } = require('@utils/logger');
const sequelize = require('@config/database');

const PORT = process.env.PORT || 8000;

// 연관관계를 포함한 모든 모델 로드
require('@models');

// 데이터베이스 동기화 옵션
const syncOptions = {
  // alter: process.env.NODE_ENV === 'development'
};

// 데이터베이스 연결 및 서버 시작
const startServer = async () => {
  try {
    // 데이터베이스 연결 인증
    await sequelize.authenticate();
    logger.info('데이터베이스 연결이 성공적으로 설정되었습니다.');

    // 모든 모델 동기화
    await sequelize.sync(syncOptions);
    logger.info('데이터베이스 모델이 성공적으로 동기화되었습니다.');

    // Express 서버 시작
    const server = app.listen(PORT, () => {
      logger.info(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
      logger.info(`API 문서: http://localhost:${PORT}/api-docs`);
      logger.info(`환경: ${process.env.NODE_ENV || 'development'}`);
    });

    // 안전한 종료
    const shutdown = async (signal) => {
      logger.info(`${signal} 수신. 안전한 종료를 시작합니다...`);

      server.close(async () => {
        logger.info('HTTP 서버가 종료되었습니다.');

        try {
          await sequelize.close();
          logger.info('데이터베이스 연결이 종료되었습니다.');
          process.exit(0);
        } catch (err) {
          logger.error('데이터베이스 연결 종료 중 오류:', err);
          process.exit(1);
        }
      });

      // 10초 후 강제 종료
      setTimeout(() => {
        logger.error('타임아웃 후 강제 종료되었습니다.');
        process.exit(1);
      }, 10000);
    };

    // 종료 시그널 처리
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(
      {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      '서버 시작 실패',
    );
    process.exit(1);
  }
};

// 서버 시작
startServer();
