/**
 * @fileoverview User course response transformation utility
 * 이 유틸리티는 사용자 코스 관련 엔드포인트의 응답 데이터를
 * 기존의 형식(Relational Database 사용할 때의 형식)과 키 순서에 맞게 변환하는 함수들을 포함합니다.
 */

/**
 * 저장된 코스 목록 응답을 변환합니다.
 * @param {Array} savedCourseLinks - 사용자가 저장한 코스 링크 목록 (USER_COURSE_TABLE)
 * @param {Array} courseData - 코스 상세 정보 목록 (COURSE_DATA_TABLE)
 * @returns {Array} 변환된 코스 객체 배열
 */
function transformSavedCourses(savedCourseLinks, courseData) {
  return savedCourseLinks
    .map((link) => {
      const course = courseData.find((c) => c.course_id === link.course_id);
      if (!course) return null;

      // 키 순서를 보장하기 위해 새 객체 생성
      const orderedCourse = {
        course_id: course.course_id,
        course_name: course.course_name,
        course_type: course.course_type,
        course_length: course.course_length,
        course_duration: course.course_duration,
        course_difficulty: course.course_difficulty,
        course_description: course.course_description,
        location: course.location,
        start_lat: course.start_lat,
        start_lon: course.start_lon,
        closest_medical_facility_hpid: course.medical_facility
          ? course.medical_facility.hpid
          : null,
        distance_to_closest_medical_facility_km: course.distance_to_closest_medical_facility_km,
      };
      return orderedCourse;
    })
    .filter(Boolean); // null 항목 제거
}

/**
 * 최근 본 코스 목록 응답을 변환합니다.
 * @param {Array} recentCourseLinks - 사용자가 최근에 본 코스 링크 목록 (USER_COURSE_TABLE)
 * @param {Array} courseData - 코스 상세 정보 목록 (COURSE_DATA_TABLE)
 * @returns {Array} 변환된 코스 객체 배열
 */
function transformRecentCourses(recentCourseLinks, courseData) {
  return recentCourseLinks
    .map((link) => {
      const course = courseData.find((c) => c.course_id === link.course_id);
      if (!course) return null;

      const { medical_facility, distance_to_closest_medical_facility_km } = course;

      const medical_facility_info = medical_facility
        ? (() => {
            let ordered_operating_hours = null;
            const operating_hours_source = medical_facility;
            ordered_operating_hours = {
              mon_start: operating_hours_source.time_mon_start || null,
              mon_end: operating_hours_source.time_mon_end || null,
              tue_start: operating_hours_source.time_tue_start || null,
              tue_end: operating_hours_source.time_tue_end || null,
              wed_start: operating_hours_source.time_wed_start || null,
              wed_end: operating_hours_source.time_wed_end || null,
              thu_start: operating_hours_source.time_thu_start || null,
              thu_end: operating_hours_source.time_thu_end || null,
              fri_start: operating_hours_source.time_fri_start || null,
              fri_end: operating_hours_source.time_fri_end || null,
              sat_start: operating_hours_source.time_sat_start || null,
              sat_end: operating_hours_source.time_sat_end || null,
              sun_start: operating_hours_source.time_sun_start || null,
              sun_end: operating_hours_source.time_sun_end || null,
              hol_start: operating_hours_source.time_hol_start || null,
              hol_end: operating_hours_source.time_hol_end || null,
            };
            

            return {
              name: medical_facility.name,
              address: medical_facility.address,
              tel_main: medical_facility.tel_main,
              emergency_room_open: medical_facility.is_emergency || false,
              tel_emergency: medical_facility.tel_emergency || null,
              operating_hours: ordered_operating_hours,
              distance_from_course_km: parseFloat(
                distance_to_closest_medical_facility_km.toFixed(1),
              ),
            };
          })()
        : undefined;

      // 키 순서를 보장하기 위해 새 객체 생성
      const orderedCourse = {
        course_id: course.course_id,
        course_name: course.course_name,
        course_type: course.course_type,
        course_length: course.course_length,
        course_duration: course.course_duration,
        course_difficulty: course.course_difficulty,
        course_description: course.course_description,
        location: course.location,
        start_lat: course.start_lat,
        start_lon: course.start_lon,
        medical_facility_info: medical_facility_info,
        viewed_at: link.viewed_at,
        updated_at: link.updated_at,
      };
      return orderedCourse;
    })
    .filter(Boolean);
}

module.exports = {
  transformSavedCourses,
  transformRecentCourses,
};
