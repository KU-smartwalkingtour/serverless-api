const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class UserLocation extends Model {}

UserLocation.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    latitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'UserLocation',
    tableName: 'user_locations',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at',
  },
);

module.exports = UserLocation;
