const { Sequelize } = require('sequelize');
const { logger } = require('../utils/logger');

let sequelize = null;

const getSequelize = () => {
  if (sequelize) {
    return sequelize;
  }

  sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: process.env.NODE_ENV === 'production' ? false : (msg) => logger.debug(msg),
    pool: {
      max: 2,
      min: 0,
      idle: 0,
      acquire: 3000,
      evict: 30000,
    },
  });

  return sequelize;
};

module.exports = { getSequelize };
