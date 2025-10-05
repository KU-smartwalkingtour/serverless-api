const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'withdrawn'), // 'active':활성상태 또는 'withdrawn':탈퇴상태 값만 허용
    allowNull: false,                           
    defaultValue: 'active'                     
  }
}, {
  timestamps: true,
});

module.exports = User;
