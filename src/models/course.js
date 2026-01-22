const { DataTypes, Model } = require('sequelize');
const { getSequelize } = require('../config/database');

const sequelize = getSequelize();

class Course extends Model {}

Course.init(
  {
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
    closest_medical_facility_hpid: {
      type: DataTypes.STRING(10),
      references: {
        model: 'medical_facilities',
        key: 'hpid',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    distance_to_closest_medical_facility_km: {
      type: DataTypes.DOUBLE,
    },
  },
  {
    sequelize,
    modelName: 'Course',
    tableName: 'courses',
    timestamps: false,
  }
);

module.exports = Course;
