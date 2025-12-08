const { DataTypes, Model } = require('sequelize');
const { getSequelize } = require('../config/database');

const sequelize = getSequelize();

class UserRecentCourse extends Model {}

UserRecentCourse.init(
  {
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    course_id: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true,
    },
  },
  {
    sequelize,
    modelName: 'UserRecentCourse',
    tableName: 'user_recent_courses',
    timestamps: true,
    createdAt: 'viewed_at',
    updatedAt: 'updated_at',
  }
);

module.exports = UserRecentCourse;
