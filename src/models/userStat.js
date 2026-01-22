const { DataTypes, Model } = require('sequelize');
const { getSequelize } = require('../config/database');

const sequelize = getSequelize();

class UserStat extends Model {}

UserStat.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    total_walk_distance_km: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'UserStat',
    tableName: 'user_stats',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at',
  }
);

module.exports = UserStat;
