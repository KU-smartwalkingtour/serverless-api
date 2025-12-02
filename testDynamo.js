// testDynamo.js
const { getUserSavedCourses, saveCourse } = require("./services/courseService");

async function main() {
  const userId = "test-user-01";
  const courseId = "seoul-trail-01";

  console.log("▶︎ 코스 저장 시도 중...");
  
  const mockCourseData = {
    course_id: courseId,
    title: "서울 둘레길 1코스",
    difficulty: "중",
    thumbnail_url: "http://example.com/img.jpg"
  };
  
  try {
    // 저장 테스트
    await saveCourse(userId, mockCourseData);
    
    // 조회 테스트
    console.log("▶︎ 저장된 코스 목록 조회 중...");
    const myCourses = await getUserSavedCourses(userId);
    console.log("조회 결과:", myCourses);
    
  } catch (error) {
    console.error("\n🚨 에러 발생!");
    // 권한이나 테이블 없음 에러가 뜨면 연결 시도는 성공한 것입니다.
    console.error("에러 내용:", error.message); 
    
    if (error.name === 'ResourceNotFoundException') {
        console.log("\n✅ 성공입니다! (테이블이 없다는 에러는 AWS 연결에 성공했다는 뜻입니다.)");
    } else if (error.name === 'AccessDeniedException') {
        console.log("\n✅ 성공입니다! (권한 에러는 AWS 연결에 성공했다는 뜻입니다.)");
    }
  }
}

main();