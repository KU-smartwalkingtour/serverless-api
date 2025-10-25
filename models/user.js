const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
  },
  password_hash: {
    type: DataTypes.TEXT,
  },
  nickname: {
    type: DataTypes.STRING(50),
  },
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'ko',
  },
  distance_unit: {
    type: DataTypes.ENUM('km', 'mi'),
    allowNull: false,
    defaultValue: 'km',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
  paranoid: true, // for soft deletes
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  tableName: 'users',
});

module.exports = User;