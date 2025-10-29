// Central model associations file
// Import all models
const User = require('./user');
const AuthRefreshToken = require('./authRefreshToken');
const PasswordResetRequest = require('./passwordResetRequest');
const UserLocation = require('./userLocation');
const UserStat = require('./userStat');
const UserSavedCourse = require('./userSavedCourse');
const UserRecentCourse = require('./userRecentCourse');
const Course = require('./course');
const MedicalFacility = require('./medicalFacility');

// Define all model associations
// User - AuthRefreshToken (1:N)
User.hasMany(AuthRefreshToken, { foreignKey: 'user_id' });
AuthRefreshToken.belongsTo(User, { foreignKey: 'user_id' });

// User - PasswordResetRequest (1:N)
User.hasMany(PasswordResetRequest, { foreignKey: 'user_id' });
PasswordResetRequest.belongsTo(User, { foreignKey: 'user_id' });

// User - UserLocation (1:1)
User.hasOne(UserLocation, { foreignKey: 'user_id' });
UserLocation.belongsTo(User, { foreignKey: 'user_id' });

// User - UserStat (1:1)
User.hasOne(UserStat, { foreignKey: 'user_id' });
UserStat.belongsTo(User, { foreignKey: 'user_id' });

// User - UserSavedCourse (1:N)
User.hasMany(UserSavedCourse, { foreignKey: 'user_id' });
UserSavedCourse.belongsTo(User, { foreignKey: 'user_id' });

// User - UserCourseHistory (1:N)
User.hasMany(UserRecentCourse, { foreignKey: 'user_id' });
UserRecentCourse.belongsTo(User, { foreignKey: 'user_id' });

Course.belongsTo(MedicalFacility, { foreignKey: 'closest_medical_facility_hpid', targetKey: 'hpid' });

// Export all models with associations configured
module.exports = {
  User,
  AuthRefreshToken,
  PasswordResetRequest,
  UserLocation,
  UserStat,
  UserSavedCourse,
  UserRecentCourse,
  Course,
  MedicalFacility,
};
