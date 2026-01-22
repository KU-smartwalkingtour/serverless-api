const { DataTypes, Model } = require('sequelize');
const { getSequelize } = require('../config/database');

const sequelize = getSequelize();

class AuthRefreshToken extends Model {}

AuthRefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    token_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked_at: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'AuthRefreshToken',
    tableName: 'auth_refresh_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = AuthRefreshToken;
