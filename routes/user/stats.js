const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { validate, logWalkSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈
const dynamoDB = require('../../config/dynamodb');
const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /user/stats:
 *   get:
 *     summary: 사용자의 통계 조회
 *     description: 인증된 사용자의 걷기 통계 정보를 조회합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 사용자의 통계 정보
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStat'
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const params = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_ACTIVITY_ITEM',
      },
    };

    const { Item } = await dynamoDB.send(new GetCommand(params));

    // 데이터가 없으면 0으로 초기화된 객체 반환
    const stats = Item || { 
        user_id: userId, 
        total_walk_distance_km: 0 
    };

    res.json({
      user_id: stats.user_id,
      total_walk_distance_km: stats.total_walk_distance_km || 0,
      updated_at: stats.updated_at || null
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`사용자 통계 조회 중 오류 발생: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

/**
 * @swagger
 * /user/stats/walk:
 *   post:
 *     summary: 사용자의 총 걷기 거리에 거리 추가
 *     description: 새로 걸은 거리를 기록하여 사용자의 총 걷기 거리에 추가합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [distance_km]
 *             properties:
 *               distance_km:
 *                 type: number
 *                 format: float
 *                 description: 걸은 거리 (킬로미터, 양수)
 *                 example: 5.2
 *     responses:
 *       200:
 *         description: 걷기 거리가 성공적으로 기록되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *                 new_total:
 *                   type: number
 *                   description: 업데이트된 총 걷기 거리 (km)
 *       400:
 *         description: 입력값이 유효하지 않음
 *       401:
 *         description: 인증되지 않음
 *       500:
 *         description: 서버 오류
 */
router.post('/walk', authenticateToken, validate(logWalkSchema), async (req, res) => {
  try {
    const { distance_km } = req.body;
    const userId = req.user.id;

    // Atomic Counter (원자적 카운터) 사용
    // if_not_exists: 기존 값이 없으면 0으로 간주하고 더함 (초기화 + 더하기 동시 처리)
    const updateParams = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_ACTIVITY_ITEM',
      },
      UpdateExpression: 'set total_walk_distance_km = if_not_exists(total_walk_distance_km, :zero) + :val, updated_at = :now',
      ExpressionAttributeValues: {
        ':val': parseFloat(distance_km),
        ':zero': 0,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW', // 업데이트된 결과값만 반환받음
    };

    const result = await dynamoDB.send(new UpdateCommand(updateParams));
    
    // DynamoDB가 계산해준 최신 합계값
    const newTotal = result.Attributes.total_walk_distance_km;

    logger.info(`${distance_km}km 걷기 기록: ${req.user.email} (총 ${newTotal}km)`);
    
    res.status(200).json({ 
        message: '걷기 거리가 성공적으로 기록되었습니다.', 
        new_total: newTotal 
    });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`걷기 거리 기록 중 오류 발생: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
