const { GetCommand, QueryCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient, TABLE_NAME } = require("../config/dynamodbClient");

// 1. 코스 상세 조회
async function getCourseDetail(courseId) {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `COURSE#${courseId}`,
      SK: "METADATA",
    },
  });
  const response = await docClient.send(command);
  return response.Item;
}

// 2. 사용자 저장 코스 조회
async function getUserSavedCourses(userId) {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "SAVED#",
    },
    // 최신순 정렬 (SK에 날짜가 없다면 별도 정렬 필요할 수 있음)
    ScanIndexForward: false 
  });
  const response = await docClient.send(command);
  return response.Items;
}

// 3. 코스 저장하기 (비정규화 데이터 포함)
async function saveCourse(userId, courseData) {
  const savedAt = new Date().toISOString();
  
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `SAVED#${courseData.course_id}`,
      
      saved_at: savedAt,
      // [비정규화] 목록 조회용 데이터
      course_title: courseData.course_name || courseData.title, 
      course_difficulty: courseData.course_difficulty || courseData.difficulty,
      thumbnail_url: courseData.thumbnail_url,
    },
    // 이미 존재하면 덮어쓰기 (UserSavedCourse.findOrCreate와 유사 효과)
  });

  await docClient.send(command);
}

// 4. 저장한 코스 삭제
async function unsaveCourse(userId, courseId) {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `SAVED#${courseId}`,
    },
  });
  await docClient.send(command);
}

// 5. 최근 본 코스 추가 (Upsert)
async function addRecentCourse(userId, courseData) {
  const timestamp = new Date().toISOString();
  
  // 기존에 같은 코드가 있다면, SK(시간)가 달라지므로 중복이 생길 수 있음.
  // DynamoDB 패턴에서는 보통 최신것만 유지하거나, 별도 삭제 로직을 둡니다.
  // 여기서는 간단히 추가하는 로직으로 구현합니다. (나중에 오래된 것 삭제 로직 필요)
  
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `RECENT#${timestamp}#${courseData.course_id}`, // 시간순 정렬 보장
      
      viewed_at: timestamp,
      course_id: courseData.course_id,
      // [비정규화]
      course_title: courseData.course_name || courseData.title,
      thumbnail_url: courseData.thumbnail_url,
    },
  });

  await docClient.send(command);
}

// 6. 최근 본 코스 조회
async function getRecentCourses(userId) {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "RECENT#",
    },
    ScanIndexForward: false, // 최신순 정렬
    Limit: 50, // 최대 50개
  });

  const response = await docClient.send(command);
  return response.Items;
}

module.exports = {
  getCourseDetail,
  getUserSavedCourses,
  saveCourse,
  unsaveCourse,
  addRecentCourse,
  getRecentCourses
};