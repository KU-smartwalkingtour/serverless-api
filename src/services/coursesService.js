const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');
const { getCourseDetail, getAllCourses } = require('./courseService');
const { getCourseCoordinates } = require('../utils/course/course-gpx');
const {
  getProviderFromCourseId,
  logCourseView,
} = require('../utils/course/course-helpers');

async function getHomeCourses(query) {
  const { lat, lon, n } = query;

  if (!lat || !lon || !n) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  logger.info(`Home courses request: lat=${lat}, lon=${lon}, n=${n}`);

  const courses = await getAllCourses({
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    limit: parseInt(n),
    sortBy: 'distance',
  });

  return courses;
}

async function getCourseList(query) {
  const { lat, lon, n, sortBy, difficulty } = query;

  if (!lat || !lon || !n) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  logger.info(
    `Course list request: lat=${lat}, lon=${lon}, n=${n}, sortBy=${sortBy}, difficulty=${difficulty}`
  );

  const courses = await getAllCourses({
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    limit: parseInt(n),
    sortBy,
    difficulty,
  });

  return courses;
}

async function getCourse(courseId, userId) {
  logger.info(`Course detail request: courseId=${courseId}`);

  const courseData = await getCourseDetail(courseId);

  if (!courseData) {
    throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
  }

  // Log course view asynchronously
  if (userId) {
    const provider = getProviderFromCourseId(courseId);
    logCourseView(userId, courseId, provider).catch((err) => {
      logger.error('Course view log failed', { error: err.message });
    });
  }

  return courseData;
}

async function getCoordinates(courseId, userId) {
  if (!courseId) {
    throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400);
  }

  logger.info(`Course coordinates request: courseId=${courseId}`);

  const coordinates = await getCourseCoordinates(courseId);

  if (!coordinates) {
    throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
  }

  // Log course view asynchronously
  if (userId) {
    const provider = getProviderFromCourseId(courseId);
    logCourseView(userId, courseId, provider).catch((err) => {
      logger.error('Course view log failed', { error: err.message });
    });
  }

  return coordinates;
}

module.exports = {
  getHomeCourses,
  getCourseList,
  getCourse,
  getCoordinates,
};
