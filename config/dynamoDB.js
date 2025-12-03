// config/dynamodb.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
require('dotenv').config();

// 1. 클라이언트 생성 (연결 정보 설정)
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-northeast-2", // 서울 리전
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. 편의성을 위한 DocumentClient 변환 (Javascript 객체를 바로 넣고 뺄 수 있게 함)
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true, // undefined 값은 자동으로 제거 (DynamoDB 에러 방지)
  },
});

module.exports = dynamoDB;