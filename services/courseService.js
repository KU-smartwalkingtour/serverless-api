const { GetCommand, QueryCommand, PutCommand, DeleteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../config/dynamodbClient"); // ⭐ 경로 수정
const { logger } = require("../utils/logger");

// ⭐ 테이블 이름 통일
const TABLE_NAME = "COURSE_DATA_TABLE"; 

// [유틸] 거리 계산 함수 (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371; 
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 1. 코스 상세 조회
async function getCourseDetail(courseId) {
  try {
    logger.info(`[DynamoDB] getCourseDetail 호출: courseId=${courseId}`);
    
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        course_id: courseId
      },
    });
    
    const response = await docClient.send(command);
    
    if (!response.Item) {
      logger.warn(`[DynamoDB] 코스를 찾을 수 없음: courseId=${courseId}`);
      return null;
    }

    const courseData = response.Item;

    // Medical Facility 정보 가공 (기존 RDB 로직 유지)
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
        distance_from_course_km: courseData.distance_to_closest_medical_facility_km,
      };

      // 불필요한 필드 제거
      delete courseData.MedicalFacility;
      delete courseData.closest_medical_facility_hpid;
      delete courseData.distance_to_closest_medical_facility_km;
    }

    logger.info(`[DynamoDB] 코스 조회 성공: courseId=${courseId}`);
    return courseData;
  } catch (error) {
    logger.error('[DynamoDB] getCourseDetail 오류:', error);
    throw error;
  }
}

// 2. 사용자 저장 코스 조회
async function getUserSavedCourses(userId) {
  try {
    logger.info(`[DynamoDB] getUserSavedCourses 호출: userId=${userId}`);
    
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "SAVED#",
      },
      ScanIndexForward: false 
    });
    
    const response = await docClient.send(command);
    logger.info(`[DynamoDB] 저장된 코스 조회 완료: ${response.Items?.length || 0}개`);
    return response.Items || [];
  } catch (error) {
    logger.error('[DynamoDB] getUserSavedCourses 오류:', error);
    throw error;
  }
}

// 3. 코스 저장하기
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
    logger.info(`[DynamoDB] 코스 저장 완료: userId=${userId}, courseId=${courseData.course_id}`);
  } catch (error) {
    logger.error('[DynamoDB] saveCourse 오류:', error);
    throw error;
  }
}

// 4. 저장한 코스 삭제
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
    logger.info(`[DynamoDB] 코스 저장 해제 완료: userId=${userId}, courseId=${courseId}`);
  } catch (error) {
    logger.error('[DynamoDB] unsaveCourse 오류:', error);
    throw error;
  }
}

// 5. 최근 본 코스 추가
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
    logger.info(`[DynamoDB] 최근 본 코스 추가 완료: userId=${userId}, courseId=${courseData.course_id}`);
  } catch (error) {
    logger.error('[DynamoDB] addRecentCourse 오류:', error);
    throw error;
  }
}

// 6. 최근 본 코스 조회
async function getRecentCourses(userId) {
  try {
    logger.info(`[DynamoDB] getRecentCourses 호출: userId=${userId}`);
    
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "RECENT#",
      },
      ScanIndexForward: false,
      Limit: 50,
    });

    const response = await docClient.send(command);
    logger.info(`[DynamoDB] 최근 본 코스 조회 완료: ${response.Items?.length || 0}개`);
    return response.Items || [];
  } catch (error) {
    logger.error('[DynamoDB] getRecentCourses 오류:', error);
    throw error;
  }
}

// 7. 전체 코스 목록 조회 (필터링 및 정렬)
async function getAllCourses({ lat, lon, sortBy, difficulty, limit }) {
  try {
    logger.info(`[DynamoDB] getAllCourses 호출: lat=${lat}, lon=${lon}, sortBy=${sortBy}, difficulty=${difficulty}, limit=${limit}`);
    
    // ⭐ Course 데이터만 조회하도록 필터 추가
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "attribute_exists(course_id) AND attribute_not_exists(PK)",
    });

    const response = await docClient.send(command);
    let courses = response.Items || [];

    logger.info(`[DynamoDB] Scan 결과: ${courses.length}개 코스 조회됨`);

    // 1. 난이도 필터링
    if (difficulty) {
      courses = courses.filter(c => c.course_difficulty === difficulty);
      logger.info(`난이도 필터링 적용: ${difficulty}, 결과: ${courses.length}개`);
    }

    // 2. 정렬
    if (sortBy === 'distance' && lat && lon) {
      courses.sort((a, b) => {
        const distA = getDistance(lat, lon, a.start_lat, a.start_lon);
        const distB = getDistance(lat, lon, b.start_lat, b.start_lon);
        return distA - distB;
      });
      logger.info('거리순 정렬 적용');
    } else if (sortBy === 'length') {
      courses.sort((a, b) => (parseFloat(b.course_length) || 0) - (parseFloat(a.course_length) || 0));
      logger.info('길이순 정렬 적용');
    } else if (sortBy === 'difficulty') {
      const order = { '하': 1, '중': 2, '상': 3 };
      courses.sort((a, b) => (order[a.course_difficulty] || 0) - (order[b.course_difficulty] || 0));
      logger.info('난이도순 정렬 적용');
    } else if (lat && lon) { 
      // 기본 거리순
      courses.sort((a, b) => {
        const distA = getDistance(lat, lon, a.start_lat, a.start_lon);
        const distB = getDistance(lat, lon, b.start_lat, b.start_lon);
        return distA - distB;
      });
      logger.info('기본 거리순 정렬 적용');
    }

    // 3. 개수 제한
    if (limit) {
      courses = courses.slice(0, limit);
    }

    logger.info(`[DynamoDB] 최종 반환: ${courses.length}개 코스`);
    return courses;
  } catch (error) {
    logger.error('[DynamoDB] getAllCourses 오류:', error);
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
  getAllCourses
};