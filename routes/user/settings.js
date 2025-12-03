const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈
const dynamoDB = require('../../config/dynamoDB');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /user/settings:
 *   patch:
 *     summary: 사용자 설정 업데이트
 *     description: 인증된 사용자의 설정을 업데이트합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 닉네임
 *               language:
 *                 type: string
 *                 description: 언어
 *               distance_unit:
 *                 type: string
 *                 enum: [km, mi]
 *                 description: 거리 단위
 *               is_dark_mode_enabled:
 *                 type: boolean
 *                 description: 다크 모드 활성화 여부
 *               allow_location_storage:
 *                 type: boolean
 *                 description: 위치 정보 저장 허용 여부
 *     responses:
 *       200:
 *         description: 설정이 성공적으로 업데이트되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nickname:
 *                   type: string
 *                   description: 닉네임
 *                 distance_unit:
 *                   type: string
 *                   enum: [km, mi]
 *                   description: 거리 단위
 *                 is_dark_mode_enabled:
 *                   type: boolean
 *                   description: 다크 모드 활성화 여부
 *                 language:
 *                   type: string
 *                   description: 언어
 *                 allow_location_storage:
 *                   type: boolean
 *                   description: 위치 정보 저장 허용 여부
 *       400:
 *         description: 입력값이 유효하지 않음
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.patch('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nickname, language, distance_unit, is_dark_mode_enabled, allow_location_storage } = req.body;

    // 1. 업데이트할 필드가 하나라도 있는지 확인
    if (nickname === undefined && language === undefined && distance_unit === undefined && 
        is_dark_mode_enabled === undefined && allow_location_storage === undefined) {
      throw new ServerError(ERROR_CODES.NO_FIELDS_TO_UPDATE, 400);
    }

    // 2. 동적 UpdateExpression 생성
    let updateExpression = 'set updated_at = :now';
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':now': new Date().toISOString(),
    };

    if (nickname !== undefined) {
      updateExpression += ', nickname = :nick';
      expressionAttributeValues[':nick'] = nickname;
    }
    if (language !== undefined) {
      updateExpression += ', #lang = :lang'; // language는 예약어 충돌 방지를 위해 별칭 사용
      expressionAttributeNames['#lang'] = 'language';
      expressionAttributeValues[':lang'] = language;
    }
    if (distance_unit !== undefined) {
      updateExpression += ', distance_unit = :unit';
      expressionAttributeValues[':unit'] = distance_unit;
    }
    if (is_dark_mode_enabled !== undefined) {
      updateExpression += ', is_dark_mode_enabled = :dark';
      expressionAttributeValues[':dark'] = is_dark_mode_enabled;
    }
    if (allow_location_storage !== undefined) {
      updateExpression += ', allow_location_storage = :loc';
      expressionAttributeValues[':loc'] = allow_location_storage;
    }

    // 3. DynamoDB 업데이트 실행
    const params = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_INFO_ITEM',
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW', // 업데이트된 최신 데이터를 반환받음
      ConditionExpression: 'attribute_exists(user_id)', // 유저가 존재할 때만 수정
    };

    const result = await dynamoDB.send(new UpdateCommand(params));
    const updatedUser = result.Attributes;

    logger.info(`사용자 설정 업데이트 완료: ${updatedUser.email}`);

    res.status(200).json({
      nickname: updatedUser.nickname,
      language: updatedUser.language,
      distance_unit: updatedUser.distance_unit,
      is_dark_mode_enabled: updatedUser.is_dark_mode_enabled,
      allow_location_storage: updatedUser.allow_location_storage,
    });

  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
       // 유저가 없는 경우 (토큰은 유효하지만 DB에 데이터가 없는 희귀 케이스)
       throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    }

    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`사용자 설정 업데이트 중 오류: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
