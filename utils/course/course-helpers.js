const { UserCourseHistory } = require('@models');
const { logger } = require('@utils/logger');

/**
 * courseId로부터 provider를 결정하는 헬퍼 함수
 * @param {string} courseId - 코스 ID
 * @returns {string} 'seoultrail' 또는 'durunubi'
 */
const getProviderFromCourseId = (courseId) => {
  return courseId.startsWith('seoultrail') ? 'seoultrail' : 'durunubi';
};

/**
 * 코스 조회 히스토리를 기록하는 헬퍼 함수
 * @param {number} userId - 사용자 ID
 * @param {string} courseId - 코스 ID
 * @param {string} provider - 제공자 ('seoultrail' 또는 'durunubi')
 */
const logCourseView = async (userId, courseId, provider) => {
  try {
    await UserCourseHistory.create({
      user_id: userId,
      provider: provider,
      provider_course_id: courseId.toString(),
    });
  } catch (error) {
    logger.error(`코스 히스토리 기록 실패 - 사용자 ${userId}, 코스 ${courseId}: ${error.message}`);
  }
};

module.exports = {
  getProviderFromCourseId,
  logCourseView,
};
