const { Sequelize } = require('sequelize');
const { Course } = require('@models');

/**
 * 데이터베이스에서 랜덤으로 n개의 코스를 조회하여 ID를 반환합니다.
 * @param {number} n - 조회할 코스의 개수
 * @returns {Promise<Array<string>>} 랜덤 코스 ID의 배열
 */
const getRandomCourses = async (n) => {
  try {
    const courses = await Course.findAll({
      order: Sequelize.literal('RANDOM()'),
      limit: n,
      attributes: ['course_id'],
    });
    return courses.map(course => course.course_id);
  } catch (error) {
    throw new Error(`데이터베이스에서 랜덤 코스 조회 중 오류 발생: ${error.message}`);
  }
};

module.exports = { getRandomCourses };
