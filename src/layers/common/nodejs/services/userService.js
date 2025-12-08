const bcrypt = require('bcryptjs');
const {
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, GSI } = require('../config/dynamodb');
const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');

const BCRYPT_SALT_ROUNDS = 10;

async function getProfile(userId) {
  const { Item: user } = await docClient.send(
    new GetCommand({
      TableName: TABLES.USER,
      Key: { user_id: userId, sort_key: 'USER_INFO_ITEM' },
    })
  );

  if (!user) {
    throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
  }

  const [savedCountResult, recentCountResult] = await Promise.all([
    docClient.send(
      new QueryCommand({
        TableName: TABLES.USER_COURSE,
        KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :sk)',
        ExpressionAttributeValues: { ':uid': userId, ':sk': 'SAVED#' },
        Select: 'COUNT',
      })
    ),
    docClient.send(
      new QueryCommand({
        TableName: TABLES.USER_COURSE,
        KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :sk)',
        ExpressionAttributeValues: { ':uid': userId, ':sk': 'RECENT#' },
        Select: 'COUNT',
      })
    ),
  ]);

  return {
    email: user.email,
    nickname: user.nickname,
    language: user.language || 'ko',
    distance_unit: user.distance_unit || 'km',
    is_dark_mode_enabled: user.is_dark_mode_enabled || false,
    allow_location_storage: user.allow_location_storage || false,
    saved_courses_count: savedCountResult.Count || 0,
    recent_courses_count: recentCountResult.Count || 0,
  };
}

async function withdraw(userId) {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.USER,
      Key: { user_id: userId, sort_key: 'USER_INFO_ITEM' },
      UpdateExpression: 'set is_active = :active, deleted_at = :deletedAt',
      ExpressionAttributeValues: { ':active': false, ':deletedAt': now },
      ConditionExpression: 'attribute_exists(user_id)',
    })
  );

  const { Items: activeTokens } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.AUTH_DATA,
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      FilterExpression: 'attribute_not_exists(revoked_at)',
      ExpressionAttributeValues: { ':uid': userId, ':prefix': 'TOKEN#' },
    })
  );

  if (activeTokens && activeTokens.length > 0) {
    const updatePromises = activeTokens.map((token) =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLES.AUTH_DATA,
          Key: { user_id: userId, sort_key: token.sort_key },
          UpdateExpression: 'set revoked_at = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      )
    );
    await Promise.all(updatePromises);
  }

  logger.info('User soft deleted', { userId });
  return { message: '회원탈퇴 처리가 완료되었습니다.' };
}

async function updateSettings(userId, body) {
  const { nickname, language, distance_unit, is_dark_mode_enabled, allow_location_storage } = body;

  if (
    nickname === undefined &&
    language === undefined &&
    distance_unit === undefined &&
    is_dark_mode_enabled === undefined &&
    allow_location_storage === undefined
  ) {
    throw new ServerError(ERROR_CODES.NO_FIELDS_TO_UPDATE, 400);
  }

  let updateExpression = 'set updated_at = :now';
  const expressionAttributeNames = {};
  const expressionAttributeValues = { ':now': new Date().toISOString() };

  if (nickname !== undefined) {
    updateExpression += ', nickname = :nick';
    expressionAttributeValues[':nick'] = nickname;
  }
  if (language !== undefined) {
    updateExpression += ', #lang = :lang';
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

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.USER,
      Key: { user_id: userId, sort_key: 'USER_INFO_ITEM' },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
      ConditionExpression: 'attribute_exists(user_id)',
    })
  );

  const updatedUser = result.Attributes;
  logger.info('User settings updated', { userId });

  return {
    nickname: updatedUser.nickname,
    language: updatedUser.language,
    distance_unit: updatedUser.distance_unit,
    is_dark_mode_enabled: updatedUser.is_dark_mode_enabled,
    allow_location_storage: updatedUser.allow_location_storage,
  };
}

async function changePassword(userId, body) {
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400);
  }

  const { Item: authData } = await docClient.send(
    new GetCommand({
      TableName: TABLES.AUTH_DATA,
      Key: { user_id: userId, sort_key: 'PASSWORD_ITEM' },
    })
  );

  if (!authData || !authData.password_hash) {
    throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    authData.password_hash
  );

  if (!isCurrentPasswordValid) {
    throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
  }

  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.AUTH_DATA,
      Key: { user_id: userId, sort_key: 'PASSWORD_ITEM' },
      UpdateExpression: 'set password_hash = :hash, updated_at = :now',
      ExpressionAttributeValues: {
        ':hash': newPasswordHash,
        ':now': new Date().toISOString(),
      },
    })
  );

  logger.info('Password changed', { userId });
  return { message: '비밀번호가 성공적으로 변경되었습니다.' };
}

async function getSavedCourses(userId) {
  const { Items: savedCourseLinks } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER_COURSE,
      IndexName: GSI.SAVED_COURSE,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    })
  );

  if (!savedCourseLinks || savedCourseLinks.length === 0) {
    return [];
  }

  const courseIds = savedCourseLinks.map((link) => link.course_id);

  const { Responses } = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLES.COURSE_DATA]: {
          Keys: courseIds.map((id) => ({ course_id: id })),
        },
      },
    })
  );

  const courseData = Responses[TABLES.COURSE_DATA] || [];
  const courseMap = new Map(courseData.map((c) => [c.course_id, c]));

  return savedCourseLinks.map((link) => ({
    ...courseMap.get(link.course_id),
    saved_at: link.saved_at,
  }));
}

async function saveCourse(userId, courseId) {
  if (!courseId) {
    throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
  }

  const { Item: course } = await docClient.send(
    new GetCommand({
      TableName: TABLES.COURSE_DATA,
      Key: { course_id: courseId },
    })
  );

  if (!course) {
    throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USER_COURSE,
        Item: {
          user_id: userId,
          sort_key: `SAVED#${courseId}`,
          course_id: courseId,
          saved_at: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(sort_key)',
      })
    );
    return { message: '코스가 성공적으로 저장되었습니다.', created: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { message: '코스가 이미 저장되어 있습니다.', created: false };
    }
    throw err;
  }
}

async function unsaveCourse(userId, courseId) {
  if (!courseId) {
    throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
  }

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.USER_COURSE,
        Key: { user_id: userId, sort_key: `SAVED#${courseId}` },
        ConditionExpression: 'attribute_exists(sort_key)',
      })
    );
    return { message: '코스가 성공적으로 삭제되었습니다.' };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }
    throw err;
  }
}

async function getRecentCourses(userId) {
  const { Items: recentCourseLinks } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER_COURSE,
      IndexName: GSI.RECENT_COURSE,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      Limit: 50,
    })
  );

  if (!recentCourseLinks || recentCourseLinks.length === 0) {
    return [];
  }

  const courseIds = recentCourseLinks.map((link) => link.course_id);

  const { Responses } = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLES.COURSE_DATA]: {
          Keys: courseIds.map((id) => ({ course_id: id })),
        },
      },
    })
  );

  const courseData = Responses[TABLES.COURSE_DATA] || [];
  const courseMap = new Map(courseData.map((c) => [c.course_id, c]));

  return recentCourseLinks.map((link) => ({
    ...courseMap.get(link.course_id),
    viewed_at: link.viewed_at,
    updated_at: link.updated_at,
  }));
}

async function addRecentCourse(userId, courseId) {
  if (!courseId) {
    throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
  }

  const { Item: course } = await docClient.send(
    new GetCommand({
      TableName: TABLES.COURSE_DATA,
      Key: { course_id: courseId },
    })
  );

  if (!course) {
    throw new ServerError(ERROR_CODES.COURSE_NOT_FOUND, 404);
  }

  const { Item: existingItem } = await docClient.send(
    new GetCommand({
      TableName: TABLES.USER_COURSE,
      Key: { user_id: userId, sort_key: `RECENT#${courseId}` },
    })
  );

  const now = new Date().toISOString();

  if (existingItem) {
    const { Attributes: updatedItem } = await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USER_COURSE,
        Key: { user_id: userId, sort_key: `RECENT#${courseId}` },
        UpdateExpression: 'set updated_at = :now',
        ExpressionAttributeValues: { ':now': now },
        ReturnValues: 'ALL_NEW',
      })
    );
    return {
      message: '이미 목록에 있는 코스를 업데이트했습니다.',
      data: updatedItem,
      created: false,
    };
  }

  const newItem = {
    user_id: userId,
    sort_key: `RECENT#${courseId}`,
    course_id: courseId,
    viewed_at: now,
    updated_at: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.USER_COURSE,
      Item: newItem,
    })
  );

  return { message: '코스가 성공적으로 추가되었습니다.', data: newItem, created: true };
}

async function deleteRecentCourse(userId, courseId) {
  if (!courseId) {
    throw new ServerError(ERROR_CODES.INVALID_INPUT, 400);
  }

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.USER_COURSE,
        Key: { user_id: userId, sort_key: `RECENT#${courseId}` },
        ConditionExpression: 'attribute_exists(sort_key)',
      })
    );
    return { message: '코스가 성공적으로 삭제되었습니다.' };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404);
    }
    throw err;
  }
}

module.exports = {
  getProfile,
  withdraw,
  updateSettings,
  changePassword,
  getSavedCourses,
  saveCourse,
  unsaveCourse,
  getRecentCourses,
  addRecentCourse,
  deleteRecentCourse,
};
