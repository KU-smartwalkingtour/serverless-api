const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class UserCourseHistory extends Model {}

UserCourseHistory.init(
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
    provider: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    provider_course_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'UserCourseHistory',
    tableName: 'user_course_history',
    timestamps: true,
    createdAt: 'viewed_at',
    updatedAt: false,
  },
);

module.exports = UserCourseHistory;
