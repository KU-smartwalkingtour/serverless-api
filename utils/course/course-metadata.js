const Course = require('../models/course');

/**
 * 데이터베이스에서 특정 코스의 메타데이터를 조회합니다.
 * @param {string} courseId - 조회할 코스의 ID
 * @returns {Promise<object|null>} 코스 메타데이터 객체 또는 찾지 못한 경우 null
 */
const getCourseMetadata = async (courseId) => {
  try {
    const course = await Course.findOne({ where: { course_id: courseId } });
    return course;
  } catch (error) {
    // 에러 로깅은 호출하는 쪽에서 처리하도록 여기서 throw
    throw new Error(`데이터베이스에서 코스 메타데이터 조회 중 오류 발생: ${error.message}`);
  }
};

module.exports = { getCourseMetadata };
