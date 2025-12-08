const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// DynamoDB Table Names
const TABLES = {
  USER: 'USER_TABLE',
  AUTH_DATA: 'AUTH_DATA_TABLE',
  COURSE_DATA: 'COURSE_DATA_TABLE',
  USER_COURSE: 'USER_COURSE_TABLE',
};

// GSI Names
const GSI = {
  SAVED_COURSE: 'usercourse_saved_at_index',
  RECENT_COURSE: 'usercourse_updated_at_index',
};

// For backward compatibility with courseService
const TABLE_NAME = TABLES.COURSE_DATA;

module.exports = { docClient, TABLE_NAME, TABLES, GSI };
