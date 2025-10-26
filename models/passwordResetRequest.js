const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class PasswordResetRequest extends Model {}

PasswordResetRequest.init(
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
    code: {
      type: DataTypes.CHAR(6),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    verified_at: {
      type: DataTypes.DATE,
    },
    consumed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'PasswordResetRequest',
    tableName: 'password_reset_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // No updated_at field in the schema
  },
);

module.exports = PasswordResetRequest;
