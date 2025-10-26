const { Sequelize } = require('sequelize');
require('dotenv').config(); // 환경 변수를 사용하기 위해 dotenv 추가

/*
  배포 환경에서 사용할 경우 .env 파일설정 사용
  DATABASE_URL 예시: postgres://username:password@host:port/database
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Vercel, Heroku 등 클라우드 배포 시 필요할 수 있음
    }
  },
  logging: false // 배포 환경에서는 false로 설정하는 것이 좋음
});
*/

// 로컬 개발 환경에서 사용할 경우 아래 설정 사용
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // "임시"로 인증서 검증 비활성화
    },
  },
  logging: console.log,
});

module.exports = sequelize;
