const { DataTypes } = require('sequelize');
const sequelize = require('@config/database');

const MedicalFacility = sequelize.define(
  'MedicalFacility',
  {
    hpid: {
      type: DataTypes.STRING(10),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    postal_code1: {
      type: DataTypes.STRING(3),
      allowNull: false,
    },
    postal_code2: {
      type: DataTypes.STRING(3),
      allowNull: false,
    },
    hospital_div_code: {
      type: DataTypes.STRING(1),
      allowNull: false,
    },
    hospital_div_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    emergency_class_code: {
      type: DataTypes.STRING(4),
    },
    emergency_class_name: {
      type: DataTypes.STRING(50),
    },
    emergency_room_open: {
      type: DataTypes.STRING(1),
    },
    tel_main: {
      type: DataTypes.STRING(14),
      allowNull: false,
    },
    tel_emergency: {
      type: DataTypes.STRING(14),
    },
    map_hint: {
      type: DataTypes.TEXT,
    },
    time_mon_start: {
      type: DataTypes.STRING(4),
    },
    time_mon_end: {
      type: DataTypes.STRING(4),
    },
    time_tue_start: {
      type: DataTypes.STRING(4),
    },
    time_tue_end: {
      type: DataTypes.STRING(4),
    },
    time_wed_start: {
      type: DataTypes.STRING(4),
    },
    time_wed_end: {
      type: DataTypes.STRING(4),
    },
    time_thu_start: {
      type: DataTypes.STRING(4),
    },
    time_thu_end: {
      type: DataTypes.STRING(4),
    },
    time_fri_start: {
      type: DataTypes.STRING(4),
    },
    time_fri_end: {
      type: DataTypes.STRING(4),
    },
    time_sat_start: {
      type: DataTypes.STRING(4),
    },
    time_sat_end: {
      type: DataTypes.STRING(4),
    },
    time_sun_start: {
      type: DataTypes.STRING(4),
    },
    time_sun_end: {
      type: DataTypes.STRING(4),
    },
    time_hol_start: {
      type: DataTypes.STRING(4),
    },
    time_hol_end: {
      type: DataTypes.STRING(4),
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    rnum: {
      type: DataTypes.INTEGER,
    },
    is_emergency: {
      type: DataTypes.BOOLEAN,
    },
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    tableName: 'medical_facilities',
  },
);

module.exports = MedicalFacility;
