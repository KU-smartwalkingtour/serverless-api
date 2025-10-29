const { Course, MedicalFacility } = require('@models');

/**
 * 데이터베이스에서 특정 코스의 메타데이터를 조회합니다.
 * @param {string} courseId - 조회할 코스의 ID
 * @returns {Promise<object|null>} 코스 메타데이터 객체 또는 찾지 못한 경우 null
 */
const getCourseMetadata = async (courseId) => {
  try {
    const course = await Course.findOne({
      where: { course_id: courseId },
      include: [
        {
          model: MedicalFacility,
          as: 'MedicalFacility', // Alias for the included model
          attributes: [
            'name',
            'address',
            'tel_main',
            'emergency_room_open',
            'tel_emergency',
            'time_mon_start',
            'time_mon_end',
            'time_tue_start',
            'time_tue_end',
            'time_wed_start',
            'time_wed_end',
            'time_thu_start',
            'time_thu_end',
            'time_fri_start',
            'time_fri_end',
            'time_sat_start',
            'time_sat_end',
            'time_sun_start',
            'time_sun_end',
            'time_hol_start',
            'time_hol_end',
          ],
        },
      ],
    });
    return course;
  } catch (error) {
    // 에러 로깅은 호출하는 쪽에서 처리하도록 여기서 throw
    throw new Error(`데이터베이스에서 코스 메타데이터 조회 중 오류 발생: ${error.message}`);
  }
};

module.exports = { getCourseMetadata };
