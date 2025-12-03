const express = require('express');
const router = express.Router();
const { authenticateToken } = require('@middleware/auth');
const { logger } = require('@utils/logger');
const { validate, updateLocationSchema } = require('@utils/validation');
const { ServerError, ERROR_CODES } = require('@utils/error');

// ★ DynamoDB 모듈
const dynamoDB = require('../../config/dynamodb');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * @swagger
 * /user/coordinates:
 *   put:
 *     summary: 사용자의 마지막 위치 업데이트
 *     description: 인증된 사용자의 현재 위치 정보(위도, 경도)를 업데이트합니다.
 *     tags: [User]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *                 format: float
 *                 description: 위도 (-90 ~ 90)
 *                 example: 37.5665
 *               longitude:
 *                 type: number
 *                 format: float
 *                 description: 경도 (-180 ~ 180)
 *                 example: 126.9780
 *     responses:
 *       '200':
 *         description: 위치가 성공적으로 업데이트되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *       '400':
 *         description: 입력값이 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: 인증되지 않음
 *       '500':
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/', authenticateToken, validate(updateLocationSchema), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.user.id;

    // USER_TABLE의 활동 정보(USER_ACTIVITY_ITEM)에 좌표만 부분 수정 (Upsert 효과)
    // * 주의: PutItem을 쓰면 기존에 있던 stats(걷기 기록)이 날아갈 수 있으므로 UpdateItem 사용
    const updateParams = {
      TableName: 'USER_TABLE',
      Key: {
        user_id: userId,
        sort_key: 'USER_ACTIVITY_ITEM', 
      },
      UpdateExpression: 'set latitude = :lat, longitude = :lon, updated_at = :now',
      ExpressionAttributeValues: {
        ':lat': latitude,
        ':lon': longitude,
        ':now': new Date().toISOString(),
      },
      // 항목이 없으면 새로 만들고, 있으면 수정함 (Upsert)
    };

    await dynamoDB.send(new UpdateCommand(updateParams));

    logger.info(`사용자 위치 업데이트 완료: ${userId}`, { latitude, longitude });
    res.status(200).json({ message: '위치가 성공적으로 업데이트되었습니다.' });

  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`사용자 위치 업데이트 중 오류 발생: ${error.message}`);
    const serverError = new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;
