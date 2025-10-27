const { DataTypes, Model } = require('sequelize');
const sequelize = require('@config/database');

class Course extends Model {}

Course.init({
  course_id: {
    type: DataTypes.TEXT,
    primaryKey: true,
  },
  course_name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  course_type: {
    type: DataTypes.ENUM('seoul_trail', 'durunubi'),
    allowNull: false,
  },
  course_length: {
    type: DataTypes.DECIMAL(5, 1),
  },
  course_duration: {
    type: DataTypes.INTEGER,
  },
  course_difficulty: {
    type: DataTypes.ENUM('하', '중', '상'),
  },
  course_description: {
    type: DataTypes.TEXT,
  },
  location: {
    type: DataTypes.TEXT,
  },
  start_lat: {
    type: DataTypes.DECIMAL(9, 6),
  },
  start_lon: {
    type: DataTypes.DECIMAL(9, 6),
  },
}, {
  sequelize,
  modelName: 'Course',
  tableName: 'courses',
  timestamps: false,
});

module.exports = Course;
