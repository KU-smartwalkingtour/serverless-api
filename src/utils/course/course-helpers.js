const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../../config/dynamodb');
const { logger } = require('../logger');

const getProviderFromCourseId = (courseId) => {
  return courseId.startsWith('seoultrail') ? 'seoultrail' : 'durunubi';
};

const logCourseView = async (userId, courseId, provider) => {
  try {
    const timestamp = new Date().toISOString();

    await docClient.send(
      new PutCommand({
        TableName: TABLES.COURSE_DATA,
        Item: {
          PK: `USER#${userId}`,
          SK: `RECENT#${timestamp}#${courseId}`,
          viewed_at: timestamp,
          course_id: courseId,
          provider,
        },
      })
    );

    logger.debug(`Course view logged: userId=${userId}, courseId=${courseId}`);
  } catch (error) {
    logger.error(
      `Course view log failed: userId=${userId}, courseId=${courseId}, error=${error.message}`
    );
  }
};

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) {
    return '';
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  let result = '';
  if (hours > 0) {
    result += `${hours}시간 `;
  }
  if (remainingMinutes > 0) {
    result += `${remainingMinutes}분`;
  }
  return result.trim();
};

const mapDifficulty = (difficulty) => {
  switch (difficulty) {
    case '하':
      return '쉬움';
    case '중':
      return '보통';
    case '상':
      return '어려움';
    default:
      return '';
  }
};

module.exports = {
  getProviderFromCourseId,
  logCourseView,
  formatDuration,
  mapDifficulty,
};
