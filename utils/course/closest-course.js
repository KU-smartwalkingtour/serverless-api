const { Op } = require('sequelize');
const { Course } = require('@models');

const EARTH_RADIUS_KM = 6371;
const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Haversine 공식을 사용하여 두 GPS 좌표 간의 거리 계산
 * @param {number} lat1 - 첫 번째 지점 위도
 * @param {number} lon1 - 첫 번째 지점 경도
 * @param {number} lat2 - 두 번째 지점 위도
 * @param {number} lon2 - 두 번째 지점 경도
 * @returns {number} 킬로미터 단위 거리
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * DEGREES_TO_RADIANS;
  const dLon = (lon2 - lon1) * DEGREES_TO_RADIANS;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEGREES_TO_RADIANS) *
      Math.cos(lat2 * DEGREES_TO_RADIANS) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * 주어진 좌표에 가장 가까운 코스 찾기
 * @param {number} lat - 위도
 * @param {number} lon - 경도
 * @returns {Promise<string|null>} 가장 가까운 코스의 ID 또는 null
 */
const findClosestCourse = async (lat, lon) => {
  const courses = await Course.findAll({
    attributes: ['course_id', 'start_lat', 'start_lon'],
    where: {
      start_lat: {
        [Op.ne]: null,
      },
      start_lon: {
        [Op.ne]: null,
      },
    },
  });

  if (!courses || courses.length === 0) {
    return null;
  }

  let closestCourseId = null;
  let minDistance = Infinity;

  for (const course of courses) {
    const distance = getDistance(lat, lon, course.start_lat, course.start_lon);
    if (distance < minDistance) {
      minDistance = distance;
      closestCourseId = course.course_id;
    }
  }

  return closestCourseId;
};

/**
 * 주어진 좌표에 가장 가까운 N개의 코스 찾기
 * @param {number} lat - 위도
 * @param {number} lon - 경도
 * @param {number} n - 반환할 코스 수
 * @returns {Promise<Array<string>>} 거리순으로 정렬된 코스 ID 배열
 */
const findNClosestCourses = async (lat, lon, n) => {
  const courses = await Course.findAll({
    attributes: ['course_id', 'start_lat', 'start_lon'],
    where: {
      start_lat: {
        [Op.ne]: null,
      },
      start_lon: {
        [Op.ne]: null,
      },
    },
  });

  if (!courses || courses.length === 0) {
    return [];
  }

  const coursesWithDistance = courses.map((course) => {
    const distance = getDistance(lat, lon, course.start_lat, course.start_lon);
    return { course_id: course.course_id, distance };
  });

  coursesWithDistance.sort((a, b) => a.distance - b.distance);

  return coursesWithDistance.slice(0, n).map((c) => c.course_id);
};

module.exports = { findClosestCourse, findNClosestCourses, getDistance };
