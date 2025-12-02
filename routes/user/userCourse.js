const express = require('express');
const router = express.Router();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const {
  transformSavedCourses,
  transformRecentCourses,
} = require('@utils/userCourseResponseFormatter');
const { ServerError, ERROR_CODES } = require('@utils/error');

// AWS DynamoDB client
const client = new DynamoDBClient({
  region: 'ap-northeast-2',
});

const docClient = DynamoDBDocumentClient.from(client);
const USER_COURSE_TABLE = 'USER_COURSE_TABLE';
const COURSE_DATA_TABLE = 'COURSE_DATA_TABLE';
const SAVED_COURSE_GSI = 'usercourse_saved_at_index';
const RECENT_COURSE_GSI = 'usercourse_updated_at_index';

/**
 * @swagger
 * tags:
 *   name: User Courses
 *   description: 사용자 저장 코스 및 히스토리 관리 (User 도메인 하위)
 */

/**
 * @swagger
 * /user/courses/saved-courses:
 *   get:
 *     summary: 사용자 저장된 코스 목록 조회 (DynamoDB)
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 저장된 코스 목록 (최신순)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Course'
 *       '401':
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/saved-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. GSI를 사용하여 저장된 코스 목록을 saved_at 기준으로 최신순 조회
    const savedCourseLinksParams = {
      TableName: USER_COURSE_TABLE,
      IndexName: SAVED_COURSE_GSI, // 'saved_at'을 정렬 키로 사용하는 GSI
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // 최신순 (내림차순)
    };

    const command = new QueryCommand(savedCourseLinksParams);
    const { Items: savedCourseLinks } = await docClient.send(command);

    if (!savedCourseLinks || savedCourseLinks.length === 0) {
      return res.json([]);
    }

    const courseIds = savedCourseLinks.map((link) => link.course_id);
    if (courseIds.length === 0) {
      return res.json([]);
    }

    // 2. 코스 상세 정보 배치 조회
    const batchGetParams = {
      RequestItems: {
        [COURSE_DATA_TABLE]: {
          Keys: courseIds.map((id) => ({ course_id: id })),
        },
      },
    };

    const batchGetCommand = new BatchGetCommand(batchGetParams);
    const { Responses } = await docClient.send(batchGetCommand);
    const courseData = Responses[COURSE_DATA_TABLE] || [];

    // 3. 데이터 변환 유틸리티를 사용하여 응답 형식 맞춤
    const responseCourses = transformSavedCourses(savedCourseLinks, courseData);

    res.json(responseCourses);
  } catch (error) {
    logger.error(`저장된 코스 조회 오류 (DynamoDB v3): ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/saved-courses/{courseId}:
 *   put:
 *     summary: 코스를 사용자 목록에 저장
 *     description: 지정된 코스를 사용자의 저장 목록에 추가합니다.
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: 저장할 코스의 고유 ID
 *     responses:
 *       201:
 *         description: 코스가 성공적으로 저장되었습니다.
 *       200:
 *         description: 코스가 이미 저장되어 있습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 해당 코스를 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.put('/saved-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) {
      throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수입니다.');
    }

    const getCourseCommand = new GetCommand({
      TableName: COURSE_DATA_TABLE,
      Key: { course_id: courseId },
    });
    const { Item: course } = await docClient.send(getCourseCommand);
    if (!course) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    const putParams = {
      TableName: USER_COURSE_TABLE,
      Item: {
        user_id: userId,
        sort_key: `SAVED#${courseId}`,
        course_id: courseId,
        saved_at: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(sort_key)',
    };

    const putCommand = new PutCommand(putParams);
    try {
      await docClient.send(putCommand);
      res.status(201).json({ message: '코스가 성공적으로 저장되었습니다.', data: putParams.Item });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        res.status(200).json({ message: '코스가 이미 저장되어 있습니다.' });
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`코스 저장 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/saved-courses/{courseId}:
 *   delete:
 *     summary: 코스를 사용자 목록에서 삭제
 *     description: 저장된 코스를 사용자의 저장 목록에서 제거합니다.
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: 삭제할 코스의 고유 ID
 *     responses:
 *       200:
 *         description: 코스가 성공적으로 삭제되었습니다.
 *       404:
 *         description: 저장 목록에서 코스를 찾을 수 없습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.delete('/saved-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) {
      throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수입니다.');
    }

    const deleteParams = {
      TableName: USER_COURSE_TABLE,
      Key: {
        user_id: userId,
        sort_key: `SAVED#${courseId}`,
      },
      ConditionExpression: 'attribute_exists(sort_key)',
    };

    const deleteCommand = new DeleteCommand(deleteParams);
    try {
      await docClient.send(deleteCommand);
      res.status(200).json({ message: '코스가 성공적으로 삭제되었습니다.' });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new ServerError(
          ERROR_CODES.RESOURCE_NOT_FOUND,
          404,
          '저장 목록에서 코스를 찾을 수 없습니다.',
        );
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`코스 삭제 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/recent-courses:
 *   get:
 *     summary: 사용자 최근 본 코스 목록 조회 (전체 코스 정보 포함)
 *     description: 최근 본 코스 목록을 Course 테이블과 JOIN하여 전체 코스 정보와 함께 반환합니다.
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       '200':
 *         description: 최근 본 코스 목록 (최신순, 최대 50개, 전체 코스 데이터 포함)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Course'
 *                   - type: object
 *                     properties:
 *                       viewed_at:
 *                         type: string
 *                         format: date-time
 *                         description: 코스를 본 시간
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         description: 마지막으로 본 시간
 *       '401':
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: 서버 오류 발생
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/recent-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const recentCoursesParams = {
      TableName: USER_COURSE_TABLE,
      IndexName: RECENT_COURSE_GSI,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
      Limit: 50,
    };

    const queryCommand = new QueryCommand(recentCoursesParams);
    const { Items: recentCourseLinks } = await docClient.send(queryCommand);

    if (!recentCourseLinks || recentCourseLinks.length === 0) {
      return res.json([]);
    }

    const courseIds = recentCourseLinks.map((link) => link.course_id);
    if (courseIds.length === 0) {
      return res.json([]);
    }

    const batchGetParams = {
      RequestItems: {
        [COURSE_DATA_TABLE]: {
          Keys: courseIds.map((id) => ({ course_id: id })),
        },
      },
    };
    const batchGetCommand = new BatchGetCommand(batchGetParams);
    const { Responses } = await docClient.send(batchGetCommand);
    const courseData = Responses[COURSE_DATA_TABLE] || [];

    const responseCourses = transformRecentCourses(recentCourseLinks, courseData);

    res.json(responseCourses);
  } catch (error) {
    logger.error(`최근 본 코스 조회 오류 : ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/recent-courses/{courseId}:
 *   put:
 *     summary: 코스를 사용자의 최근 본 목록에 추가
 *     description: 지정된 코스를 사용자의 최근 본 목록에 추가합니다.
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: 추가할 코스의 고유 ID
 *     responses:
 *       201:
 *         description: 코스가 성공적으로 추가되었습니다.
 *       200:
 *         description: 코스가 이미 목록에 있습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 해당 코스를 찾을 수 없습니다.
 *       500:
 *         description: 서버 오류
 */
router.put('/recent-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) {
      throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수 파라미터입니다.');
    }

    const getCourseCommand = new GetCommand({
      TableName: COURSE_DATA_TABLE,
      Key: { course_id: courseId },
    });
    const { Item: course } = await docClient.send(getCourseCommand);

    if (!course) {
      throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
    }

    const getRecentCommand = new GetCommand({
      TableName: USER_COURSE_TABLE,
      Key: { user_id: userId, sort_key: `RECENT#${courseId}` },
    });
    const { Item: existingItem } = await docClient.send(getRecentCommand);

    const now = new Date().toISOString();
    if (existingItem) {
      const updateParams = {
        TableName: USER_COURSE_TABLE,
        Key: { user_id: userId, sort_key: `RECENT#${courseId}` },
        UpdateExpression: 'set updated_at = :now',
        ExpressionAttributeValues: { ':now': now },
        ReturnValues: 'ALL_NEW',
      };
      const updateCommand = new UpdateCommand(updateParams);
      const { Attributes: updatedItem } = await docClient.send(updateCommand);
      res
        .status(200)
        .json({ message: '이미 목록에 있는 코스를 업데이트했습니다.', data: updatedItem });
    } else {
      const newItem = {
        user_id: userId,
        sort_key: `RECENT#${courseId}`,
        course_id: courseId,
        viewed_at: now,
        updated_at: now,
      };
      const putCommand = new PutCommand({
        TableName: USER_COURSE_TABLE,
        Item: newItem,
      });
      await docClient.send(putCommand);
      res.status(201).json({ message: '코스가 성공적으로 추가되었습니다.', data: newItem });
    }
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`코스 히스토리 저장 오류 (DynamoDB v3): ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/courses/recent-courses/{courseId}:
 *   delete:
 *     summary: 코스를 사용자의 최근 본 목록에서 삭제
 *     description: 지정된 코스를 사용자의 최근 본 목록에서 제거합니다.
 *     tags: [User Courses]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: 삭제할 코스의 고유 ID
 *     responses:
 *       200:
 *         description: 코스가 성공적으로 삭제되었습니다.
 *       404:
 *         description: 목록에서 코스를 찾을 수 없습니다.
 *       400:
 *         description: 파라미터가 누락되었거나 유효하지 않습니다.
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.delete('/recent-courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) {
      throw new ServerError(ERROR_CODES.INVALID_INPUT, 400, 'courseId는 필수 파라미터입니다.');
    }

    const deleteParams = {
      TableName: USER_COURSE_TABLE,
      Key: {
        user_id: userId,
        sort_key: `RECENT#${courseId}`,
      },
      ConditionExpression: 'attribute_exists(sort_key)',
    };

    const deleteCommand = new DeleteCommand(deleteParams);
    try {
      await docClient.send(deleteCommand);
      res.status(200).json({ message: '코스가 성공적으로 삭제되었습니다.' });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new ServerError(
          ERROR_CODES.RESOURCE_NOT_FOUND,
          404,
          '목록에서 코스를 찾을 수 없습니다.',
        );
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    logger.error(`코스 히스토리 삭제 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
