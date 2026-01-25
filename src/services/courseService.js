const {
  GetCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/dynamodb');
const { logger } = require('../utils/logger');

// Haversine formula for distance calculation
function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getCourseDetail(courseId) {
  try {
    logger.info(`[DynamoDB] getCourseDetail: courseId=${courseId}`);

    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { course_id: courseId },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      logger.warn(`[DynamoDB] Course not found: courseId=${courseId}`);
      return null;
    }

    const courseData = response.Item;

    if (courseData.MedicalFacility) {
      const facility = courseData.MedicalFacility;
      courseData.medical_facility_info = {
        name: facility.name,
        address: facility.address,
        tel_main: facility.tel_main,
        emergency_room_open:
          facility.emergency_room_open === '1'
            ? true
            : facility.emergency_room_open === '2'
              ? false
              : null,
        tel_emergency: facility.tel_emergency,
        operating_hours: {
          mon_start: facility.time_mon_start,
          mon_end: facility.time_mon_end,
          tue_start: facility.time_tue_start,
          tue_end: facility.time_tue_end,
          wed_start: facility.time_wed_start,
          wed_end: facility.time_wed_end,
          thu_start: facility.time_thu_start,
          thu_end: facility.time_thu_end,
          fri_start: facility.time_fri_start,
          fri_end: facility.time_fri_end,
          sat_start: facility.time_sat_start,
          sat_end: facility.time_sat_end,
          sun_start: facility.time_sun_start,
          sun_end: facility.time_sun_end,
          hol_start: facility.time_hol_start,
          hol_end: facility.time_hol_end,
        },
        distance_from_course_km:
          courseData.distance_to_closest_medical_facility_km,
      };

      delete courseData.MedicalFacility;
      delete courseData.closest_medical_facility_hpid;
      delete courseData.distance_to_closest_medical_facility_km;
    }

    logger.info(`[DynamoDB] Course found: courseId=${courseId}`);
    return courseData;
  } catch (error) {
    logger.error('[DynamoDB] getCourseDetail error:', error);
    throw error;
  }
}

async function getUserSavedCourses(userId) {
  try {
    logger.info(`[DynamoDB] getUserSavedCourses: userId=${userId}`);

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'SAVED#',
      },
      ScanIndexForward: false,
    });

    const response = await docClient.send(command);
    logger.info(
      `[DynamoDB] Saved courses retrieved: ${response.Items?.length || 0}`
    );
    return response.Items || [];
  } catch (error) {
    logger.error('[DynamoDB] getUserSavedCourses error:', error);
    throw error;
  }
}

async function saveCourse(userId, courseData) {
  try {
    const savedAt = new Date().toISOString();

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `SAVED#${courseData.course_id}`,
        saved_at: savedAt,
        course_id: courseData.course_id,
        course_title: courseData.course_name || courseData.title,
        course_difficulty: courseData.course_difficulty || courseData.difficulty,
        thumbnail_url: courseData.thumbnail_url,
      },
    });

    await docClient.send(command);
    logger.info(
      `[DynamoDB] Course saved: userId=${userId}, courseId=${courseData.course_id}`
    );
  } catch (error) {
    logger.error('[DynamoDB] saveCourse error:', error);
    throw error;
  }
}

async function unsaveCourse(userId, courseId) {
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `SAVED#${courseId}`,
      },
    });

    await docClient.send(command);
    logger.info(
      `[DynamoDB] Course unsaved: userId=${userId}, courseId=${courseId}`
    );
  } catch (error) {
    logger.error('[DynamoDB] unsaveCourse error:', error);
    throw error;
  }
}

async function addRecentCourse(userId, courseData) {
  try {
    const timestamp = new Date().toISOString();

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `RECENT#${timestamp}#${courseData.course_id}`,
        viewed_at: timestamp,
        course_id: courseData.course_id,
        course_title: courseData.course_name || courseData.title,
        thumbnail_url: courseData.thumbnail_url,
      },
    });

    await docClient.send(command);
    logger.info(
      `[DynamoDB] Recent course added: userId=${userId}, courseId=${courseData.course_id}`
    );
  } catch (error) {
    logger.error('[DynamoDB] addRecentCourse error:', error);
    throw error;
  }
}

async function getRecentCourses(userId) {
  try {
    logger.info(`[DynamoDB] getRecentCourses: userId=${userId}`);

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RECENT#',
      },
      ScanIndexForward: false,
      Limit: 50,
    });

    const response = await docClient.send(command);
    logger.info(
      `[DynamoDB] Recent courses retrieved: ${response.Items?.length || 0}`
    );
    return response.Items || [];
  } catch (error) {
    logger.error('[DynamoDB] getRecentCourses error:', error);
    throw error;
  }
}

async function getAllCourses({ lat, lon, sortBy, difficulty, limit }) {
  try {
    logger.info(
      `[DynamoDB] getAllCourses: lat=${lat}, lon=${lon}, sortBy=${sortBy}, difficulty=${difficulty}, limit=${limit}`
    );

    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        'attribute_exists(course_id) AND attribute_not_exists(PK)',
    });

    const response = await docClient.send(command);
    let courses = response.Items || [];

    logger.info(`[DynamoDB] Scan result: ${courses.length} courses`);

    if (difficulty) {
      courses = courses.filter((c) => c.course_difficulty === difficulty);
      logger.info(`Difficulty filter applied: ${difficulty}, result: ${courses.length}`);
    }

    if (sortBy === 'distance' && lat && lon) {
      courses.sort((a, b) => {
        const distA = getDistance(lat, lon, a.start_lat, a.start_lon);
        const distB = getDistance(lat, lon, b.start_lat, b.start_lon);
        return distA - distB;
      });
      logger.info('Distance sort applied');
    } else if (sortBy === 'length') {
      courses.sort(
        (a, b) =>
          (parseFloat(b.course_length) || 0) -
          (parseFloat(a.course_length) || 0)
      );
      logger.info('Length sort applied');
    } else if (sortBy === 'difficulty') {
      const order = { 하: 1, 중: 2, 상: 3 };
      courses.sort(
        (a, b) =>
          (order[a.course_difficulty] || 0) - (order[b.course_difficulty] || 0)
      );
      logger.info('Difficulty sort applied');
    } else if (lat && lon) {
      courses.sort((a, b) => {
        const distA = getDistance(lat, lon, a.start_lat, a.start_lon);
        const distB = getDistance(lat, lon, b.start_lat, b.start_lon);
        return distA - distB;
      });
      logger.info('Default distance sort applied');
    }

    if (limit) {
      courses = courses.slice(0, limit);
    }

    logger.info(`[DynamoDB] Final result: ${courses.length} courses`);
    return courses;
  } catch (error) {
    logger.error('[DynamoDB] getAllCourses error:', error);
    throw error;
  }
}

module.exports = {
  getCourseDetail,
  getUserSavedCourses,
  saveCourse,
  unsaveCourse,
  addRecentCourse,
  getRecentCourses,
  getAllCourses,
};
