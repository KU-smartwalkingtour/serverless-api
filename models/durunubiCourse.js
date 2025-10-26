const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class DurunubiCourse extends Model {}

DurunubiCourse.init({
  crs_idx: {
    type: DataTypes.TEXT,
    primaryKey: true,
  },
  route_idx: {
    type: DataTypes.TEXT,
  },
  crs_kor_nm: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  crs_dstnc: {
    type: DataTypes.DECIMAL(5, 1),
  },
  crs_totl_rqrm_hour: {
    type: DataTypes.INTEGER,
  },
  crs_level: {
    type: DataTypes.SMALLINT,
  },
  crs_cycle: {
    type: DataTypes.TEXT,
  },
  crs_contents: {
    type: DataTypes.TEXT,
  },
  crs_summary: {
    type: DataTypes.TEXT,
  },
  crs_tour_info: {
    type: DataTypes.TEXT,
  },
  traveler_info: {
    type: DataTypes.TEXT,
  },
  sigun: {
    type: DataTypes.STRING(100),
  },
  brd_div: {
    type: DataTypes.STRING(10),
  },
  created_time: {
    type: DataTypes.DATE,
  },
  modified_time: {
    type: DataTypes.DATE,
  },
  first_lat: {
    type: DataTypes.DECIMAL(9, 6),
  },
  first_lon: {
    type: DataTypes.DECIMAL(9, 6),
  },
}, {
  sequelize,
  modelName: 'DurunubiCourse',
  tableName: 'durunubi_courses',
  timestamps: false, // The table has its own timestamp fields
});

module.exports = DurunubiCourse;
