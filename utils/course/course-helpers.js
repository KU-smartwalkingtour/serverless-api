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


/**
 * 분 단위를 "X시간 Y분" 형태의 문자열로 변환하는 함수
 * @param {number} minutes - 분
 * @returns {string} 변환된 문자열
 */
const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) {
    return '';
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  let result = '';
  if (hours > 0) {
    result += `${hours}시간 `;
  }
  if (remainingMinutes > 0) {
    result += `${remainingMinutes}분`;
  }
  return result.trim();
};

/**
 * 난이도 Enum 값을 문자열로 매핑하는 함수
 * @param {string} difficulty - 난이도 Enum 값 ('하', '중', '상')
 * @returns {string} 매핑된 문자열 ('쉬움', '보통', '어려움')
 */
const mapDifficulty = (difficulty) => {
  switch (difficulty) {
    case '하':
      return '쉬움';
    case '중':
      return '보통';
    case '상':
      return '어려움';
    default:
      return '';
  }
};

module.exports = {
  getProviderFromCourseId,
  logCourseView,
  formatDuration,
  mapDifficulty,
};
