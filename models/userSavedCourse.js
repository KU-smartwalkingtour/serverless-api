const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class UserSavedCourse extends Model {}

UserSavedCourse.init({
  user_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  provider: {
    type: DataTypes.TEXT,
    primaryKey: true,
  },
  provider_course_id: {
    type: DataTypes.TEXT,
    primaryKey: true,
  },
}, {
  sequelize,
  modelName: 'UserSavedCourse',
  tableName: 'user_saved_courses',
  timestamps: true,
  createdAt: 'saved_at',
  updatedAt: false,
});

module.exports = UserSavedCourse;
