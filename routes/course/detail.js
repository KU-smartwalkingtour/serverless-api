// const express = require('express');
// const router = express.Router();
// const { Course } = require('@models');
// const { getCourseMetadata } = require('@utils/course/course-metadata');
// const { logger } = require('@utils/logger');
// const { authenticateToken } = require('@middleware/auth');
// const { ServerError, ERROR_CODES } = require('@utils/error');
// const { logCourseView, getProviderFromCourseId } = require('@utils/course/course-helpers');

// router.get('/:courseId', authenticateToken, async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     const userId = req.user.id;

//     logger.info(`코스 메타데이터 조회: courseId=${courseId}`);

//     // DB에서 코스 메타데이터 조회
//     const metadata = await getCourseMetadata(courseId);
//     if (!metadata) {
//       throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
//     }

//     const responseData = metadata.toJSON(); // Convert Sequelize instance to plain object

//     if (responseData.MedicalFacility) {
//       const facility = responseData.MedicalFacility;
//       const medicalFacilityInfo = {
//         name: facility.name,
//         address: facility.address,
//         tel_main: facility.tel_main,
//         emergency_room_open: facility.emergency_room_open === '1' ? true : (facility.emergency_room_open === '2' ? false : null),
//         tel_emergency: facility.tel_emergency,
//         operating_hours: {
//           mon_start: facility.time_mon_start,
//           mon_end: facility.time_mon_end,
//           tue_start: facility.time_tue_start,
//           tue_end: facility.time_tue_end,
//           wed_start: facility.time_wed_start,
//           wed_end: facility.time_wed_end,
//           thu_start: facility.time_thu_start,
//           thu_end: facility.time_thu_end,
//           fri_start: facility.time_fri_start,
//           fri_end: facility.time_fri_end,
//           sat_start: facility.time_sat_start,
//           sat_end: facility.time_sat_end,
//           sun_start: facility.time_sun_start,
//           sun_end: facility.time_sun_end,
//           hol_start: facility.time_hol_start,
//           hol_end: facility.time_hol_end,
//         },
//         distance_from_course_km: responseData.distance_to_closest_medical_facility_km,
//       };
//       responseData.medical_facility_info = medicalFacilityInfo;
//       delete responseData.MedicalFacility; // Remove the raw MedicalFacility object
//       delete responseData.closest_medical_facility_hpid; // Remove the foreign key
//       delete responseData.distance_to_closest_medical_facility_km; // Remove the raw distance
//     }

//     res.json(responseData);

//     // 비동기로 코스 조회 기록 (응답 후 실행)
//     const provider = getProviderFromCourseId(courseId);
//     logCourseView(userId, courseId, provider);
//   } catch (error) {
//     if (ServerError.isServerError(error)) {
//       return res.status(error.statusCode).json(error.toJSON());
//     }

//     logger.error(`코스 메타데이터 조회 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// module.exports = router;
//-----------------------------------------------------------------------------
// 여기서부터는 Revised to use DynamoDB instead of RDB

const express = require('express');
const router = express.Router();
const { logger } = require('../../utils/logger'); // 경로 조정 필요할 수 있음
const { authenticateToken } = require('../../middleware/auth');
const { ServerError, ERROR_CODES } = require('../../utils/error');
const { getCourseDetail } = require('../../services/courseService'); // DynamoDB Service Import
const { logCourseView, getProviderFromCourseId } = require('../../utils/course/course-helpers');

/**
 * @swagger
 * /courses/{courseId}:
 *   get:
 *     summary: 코스 상세 메타데이터 조회
 *     description: 코스 ID로 코스의 상세 메타데이터를 조회하고, 최근 본 코스에 추가합니다.
 *     tags: [Course]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *         description: 코스의 제공자별 고유 ID
 *         example: seoultrail_1
 *     responses:
 *       200:
 *         description: 코스 메타데이터 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       401:
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 코스를 찾을 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

router.get('/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    logger.info(`[DynamoDB] 코스 상세 조회: courseId=${courseId}`);

    // 1. DynamoDB에서 코스 조회
    const courseData = await getCourseDetail(courseId);

    if (!courseData) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    // 2. 응답 데이터 구성 (DynamoDB Item 그대로 반환하거나 필요한 가공 수행)
    // 기존 RDB 로직에 있던 MedicalFacility 정보가 DynamoDB Item에 포함되어 있다고 가정합니다.
    res.json(courseData);

    // 3. 비동기 로그 기록 (기존 유지)
    const provider = getProviderFromCourseId(courseId);
    logCourseView(userId, courseId, provider);

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`코스 상세 조회 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
