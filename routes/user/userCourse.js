// const express = require('express');
// const router = express.Router();
// const { authenticateToken } = require('@middleware/auth');
// const { logger } = require('@utils/logger');
// const { UserSavedCourse, UserRecentCourse, Course } = require('@models');
// const { ServerError, ERROR_CODES } = require('@utils/error');

// /**
//  * @swagger
//  * tags:
//  *   name: User Courses
//  *   description: 사용자 저장 코스 및 히스토리 관리 (User 도메인 하위)
//  */

// /**
//  * @swagger
//  * /user/courses/saved-courses:
//  *   get:
//  *     summary: 사용자 저장된 코스 목록 조회
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     responses:
//  *       '200':
//  *         description: 저장된 코스 목록 (최신순)
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 $ref: '#/components/schemas/Course'
//  *       '401':
//  *         description: 인증되지 않음
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/ErrorResponse'
//  *       '500':
//  *         description: 서버 오류 발생
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/ErrorResponse'
//  */
// router.get('/saved-courses', authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const savedCourseLinks = await UserSavedCourse.findAll({
//       where: { user_id: userId },
//       order: [['saved_at', 'DESC']],
//     });

//     if (!savedCourseLinks || savedCourseLinks.length === 0) {
//       return res.json([]);
//     }

//     const courseIds = savedCourseLinks.map((link) => link.course_id);

//     const savedCourses = await Course.findAll({
//       where: {
//         course_id: courseIds,
//       },
//     });

//     res.json(savedCourses);
//   } catch (error) {
//     logger.error(`저장된 코스 조회 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// /**
//  * @swagger
//  * /user/courses/saved-courses/{courseId}:
//  *   put:
//  *     summary: 코스를 사용자 목록에 저장
//  *     description: 지정된 코스를 사용자의 저장 목록에 추가합니다.
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     parameters:
//  *       - in: path
//  *         name: courseId
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: 저장할 코스의 고유 ID
//  *     responses:
//  *       201:
//  *         description: 코스가 성공적으로 저장되었습니다.
//  *       200:
//  *         description: 코스가 이미 저장되어 있습니다.
//  *       400:
//  *         description: 파라미터가 누락되었거나 유효하지 않습니다.
//  *       401:
//  *         description: 인증되지 않음
//  *       404:
//  *         description: 해당 코스를 찾을 수 없습니다.
//  *       500:
//  *         description: 서버 오류
//  */
// router.put('/saved-courses/:courseId', authenticateToken, async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     if (!courseId) {
//       throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수입니다.');
//     }

//     const course = await Course.findByPk(courseId.toString());
//     if (!course) {
//       throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
//     }

//     const [savedCourse, created] = await UserSavedCourse.findOrCreate({
//       where: {
//         user_id: req.user.id,
//         course_id: courseId.toString(),
//       },
//     });

//     if (created) {
//       res.status(201).json({ message: '코스가 성공적으로 저장되었습니다.', data: savedCourse });
//     } else {
//       res.status(200).json({ message: '코스가 이미 저장되어 있습니다.', data: savedCourse });
//     }
//   } catch (error) {
//     if (ServerError.isServerError(error)) {
//       return res.status(error.statusCode).json(error.toJSON());
//     }

//     logger.error(`코스 저장 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// /**
//  * @swagger
//  * /user/courses/saved-courses/{courseId}:
//  *   delete:
//  *     summary: 코스를 사용자 목록에서 삭제
//  *     description: 저장된 코스를 사용자의 저장 목록에서 제거합니다.
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     parameters:
//  *       - in: path
//  *         name: courseId
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: 삭제할 코스의 고유 ID
//  *     responses:
//  *       200:
//  *         description: 코스가 성공적으로 삭제되었습니다.
//  *       404:
//  *         description: 저장 목록에서 코스를 찾을 수 없습니다.
//  *       400:
//  *         description: 파라미터가 누락되었거나 유효하지 않습니다.
//  *       401:
//  *         description: 인증되지 않음
//  *       500:
//  *         description: 서버 오류
//  */
// router.delete('/saved-courses/:courseId', authenticateToken, async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     if (!courseId) {
//       throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수입니다.');
//     }

//     const deletedCount = await UserSavedCourse.destroy({
//       where: {
//         user_id: req.user.id,
//         course_id: courseId.toString(),
//       },
//     });

//     if (deletedCount > 0) {
//       res.status(200).json({ message: '코스가 성공적으로 삭제되었습니다.' });
//     } else {
//       throw new ServerError(
//         ERROR_CODES.RESOURCE_NOT_FOUND,
//         404,
//         '저장 목록에서 코스를 찾을 수 없습니다.',
//       );
//     }
//   } catch (error) {
//     if (ServerError.isServerError(error)) {
//       return res.status(error.statusCode).json(error.toJSON());
//     }

//     logger.error(`코스 삭제 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// /**
//  * @swagger
//  * /user/courses/recent-courses:
//  *   get:
//  *     summary: 사용자 최근 본 코스 목록 조회 (전체 코스 정보 포함)
//  *     description: 최근 본 코스 목록을 Course 테이블과 JOIN하여 전체 코스 정보와 함께 반환합니다.
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     responses:
//  *       '200':
//  *         description: 최근 본 코스 목록 (최신순, 최대 50개, 전체 코스 데이터 포함)
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 allOf:
//  *                   - $ref: '#/components/schemas/Course'
//  *                   - type: object
//  *                     properties:
//  *                       viewed_at:
//  *                         type: string
//  *                         format: date-time
//  *                         description: 코스를 본 시간
//  *                       updated_at:
//  *                         type: string
//  *                         format: date-time
//  *                         description: 마지막으로 본 시간
//  *       '401':
//  *         description: 인증되지 않음
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/ErrorResponse'
//  *       '500':
//  *         description: 서버 오류 발생
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/ErrorResponse'
//  */
// router.get('/recent-courses', authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const recentCourseLinks = await UserRecentCourse.findAll({
//       where: { user_id: userId },
//       order: [['updated_at', 'DESC']],
//       limit: 50,
//     });

//     if (!recentCourseLinks || recentCourseLinks.length === 0) {
//       return res.json([]);
//     }

//     const courseIds = recentCourseLinks.map((link) => link.course_id);

//     const recentCourses = await Course.findAll({
//       where: {
//         course_id: courseIds,
//       },
//     });

//     res.json(recentCourses);
//   } catch (error) {
//     logger.error(`최근 본 코스 조회 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// /**
//  * @swagger
//  * /user/courses/recent-courses/{courseId}:
//  *   put:
//  *     summary: 코스를 사용자의 최근 본 목록에 추가
//  *     description: 지정된 코스를 사용자의 최근 본 목록에 추가합니다.
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     parameters:
//  *       - in: path
//  *         name: courseId
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: 추가할 코스의 고유 ID
//  *     responses:
//  *       201:
//  *         description: 코스가 성공적으로 추가되었습니다.
//  *       200:
//  *         description: 코스가 이미 목록에 있습니다.
//  *       400:
//  *         description: 파라미터가 누락되었거나 유효하지 않습니다.
//  *       401:
//  *         description: 인증되지 않음
//  *       404:
//  *         description: 해당 코스를 찾을 수 없습니다.
//  *       500:
//  *         description: 서버 오류
//  */
// router.put('/recent-courses/:courseId', authenticateToken, async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     if (!courseId) {
//       throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수 파라미터입니다.');
//     }

//     const course = await Course.findByPk(courseId.toString());
//     if (!course) {
//       throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
//     }

//     const userId = req.user.id;
//     const recentCourse = await UserRecentCourse.findOne({
//       where: {
//         user_id: userId,
//         course_id: courseId.toString(),
//       },
//     });

//     if (recentCourse) {
//       // Entry exists, update timestamp with raw query
//       await UserRecentCourse.sequelize.query(
//         'UPDATE user_recent_courses SET updated_at = NOW() WHERE user_id = :userId AND course_id = :courseId',
//         {
//           replacements: { userId, courseId: courseId.toString() },
//           type: UserRecentCourse.sequelize.QueryTypes.UPDATE,
//         },
//       );
//       await recentCourse.reload();
//       res
//         .status(200)
//         .json({ message: '이미 목록에 있는 코스를 업데이트했습니다.', data: recentCourse });
//     } else {
//       // Entry does not exist, create it
//       const newRecentCourse = await UserRecentCourse.create({
//         user_id: userId,
//         course_id: courseId.toString(),
//       });
//       res.status(201).json({ message: '코스가 성공적으로 추가되었습니다.', data: newRecentCourse });
//     }
//   } catch (error) {
//     if (ServerError.isServerError(error)) {
//       return res.status(error.statusCode).json(error.toJSON());
//     }

//     logger.error(`코스 히스토리 저장 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// /**
//  * @swagger
//  * /user/courses/recent-courses/{courseId}:
//  *   delete:
//  *     summary: 코스를 사용자의 최근 본 목록에서 삭제
//  *     description: 지정된 코스를 사용자의 최근 본 목록에서 제거합니다.
//  *     tags: [User Courses]
//  *     security: [ { bearerAuth: [] } ]
//  *     parameters:
//  *       - in: path
//  *         name: courseId
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: 삭제할 코스의 고유 ID
//  *     responses:
//  *       200:
//  *         description: 코스가 성공적으로 삭제되었습니다.
//  *       404:
//  *         description: 목록에서 코스를 찾을 수 없습니다.
//  *       400:
//  *         description: 파라미터가 누락되었거나 유효하지 않습니다.
//  *       401:
//  *         description: 인증되지 않음
//  *       500:
//  *         description: 서버 오류
//  */
// router.delete('/recent-courses/:courseId', authenticateToken, async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     if (!courseId) {
//       throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수 파라미터입니다.');
//     }

//     const deletedCount = await UserRecentCourse.destroy({
//       where: {
//         user_id: req.user.id,
//         course_id: courseId.toString(),
//       },
//     });

//     if (deletedCount > 0) {
//       res.status(200).json({ message: '코스가 성공적으로 삭제되었습니다.' });
//     } else {
//       throw new ServerError(
//         ERROR_CODES.RESOURCE_NOT_FOUND,
//         404,
//         '목록에서 코스를 찾을 수 없습니다.',
//       );
//     }
//   } catch (error) {
//     if (ServerError.isServerError(error)) {
//       return res.status(error.statusCode).json(error.toJSON());
//     }

//     logger.error(`코스 히스토리 삭제 오류: ${error.message}`);
//     const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
//     res.status(500).json(serverError.toJSON());
//   }
// });

// module.exports = router;
//-----------------------------------------------------------------------------
// 여기서부터는 Revised to use DynamoDB instead of RDB

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth'); // 경로 확인
const { logger } = require('../../utils/logger'); // 경로 확인
const { ServerError, ERROR_CODES } = require('../../utils/error'); // 경로 확인

// DynamoDB Service 가져오기
const { 
  getUserSavedCourses, 
  saveCourse, 
  unsaveCourse, 
  getCourseDetail,
  getRecentCourses,
  addRecentCourse
} = require('../../services/courseService');

// 1. 사용자 저장된 코스 목록 조회
router.get('/saved-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const savedCourses = await getUserSavedCourses(userId);
    res.json(savedCourses || []);
  } catch (error) {
    logger.error(`저장된 코스 조회 오류: ${error.message}`);
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

// 2. 코스를 사용자 목록에 저장
router.put('/saved-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);

    // 코스 정보 조회 (비정규화 데이터용)
    const courseData = await getCourseDetail(courseId);
    if (!courseData) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    // 저장 실행
    await saveCourse(userId, courseData);

    res.status(201).json({ message: '코스가 성공적으로 저장되었습니다.' });
  } catch (error) {
    logger.error(`코스 저장 오류: ${error.message}`);
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

// 3. 저장된 코스 삭제
router.delete('/saved-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    await unsaveCourse(userId, courseId);
    res.status(200).json({ message: '코스가 삭제되었습니다.' });
  } catch (error) {
    logger.error(`코스 삭제 오류: ${error.message}`);
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

// 4. 최근 본 코스 목록 조회
router.get('/recent-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const recentCourses = await getRecentCourses(userId);
    res.json(recentCourses || []);
  } catch (error) {
    logger.error(`최근 본 코스 조회 오류: ${error.message}`);
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

// 5. 최근 본 코스 추가
router.put('/recent-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const courseData = await getCourseDetail(courseId);
    if (!courseData) throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);

    await addRecentCourse(userId, courseData);

    res.status(201).json({ message: '최근 본 코스에 추가되었습니다.' });
  } catch (error) {
    logger.error(`최근 본 코스 추가 오류: ${error.message}`);
    res.status(500).json(new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500).toJSON());
  }
});

// router 객체를 내보낸다.
module.exports = router;