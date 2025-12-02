// serverless-api/config/dynamodbClient.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

// 1. 클라이언트 초기화 (서울 리전)
const client = new DynamoDBClient({
  region: "ap-northeast-2",
});

// 2. DocumentClient 변환 (사용하기 편하게 설정)
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true, // undefined 값은 DB 저장 시 자동으로 제외
  },
});

// 3. 테이블 이름 상수
const TABLE_NAME = "COURSE_DATA_TABLE";


module.exports = { docClient, TABLE_NAME };