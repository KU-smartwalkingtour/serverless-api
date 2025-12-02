const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const path = require('path');

// 1. .env 파일 위치를 명시적으로 지정 (현재 utils 폴더의 상위 폴더에 .env가 있음)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// [추가된 부분] 로컬 테스트 환경인지 확인 (예: .env에 IS_LOCAL=true 설정)
const IS_LOCAL = process.env.IS_LOCAL === 'true';
// 2. 클라이언트 생성
// [🚨 수정된 부분]: credentials 블록을 조건부로 추가하여,
// 로컬 키가 없을 경우 SDK가 자동으로 EC2 Role을 찾도록 유도한다.
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-2',
    
    // 1. 엔드포인트는 IS_LOCAL에 따라 분기
    endpoint: IS_LOCAL ? 'http://localhost:8001' : undefined, 
    
    // 2. [수정됨] IS_LOCAL이 true일 때만 더미 키를 삽입
    //    EC2에서는 이 블록이 제거되어, SDK가 IAM Role을 자동으로 찾도록 유도
    ...(IS_LOCAL ? {
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'DUMMY_ACCESS_KEY',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'DUMMY_SECRET',
        },
    } : (process.env.AWS_ACCESS_KEY_ID && { // 로컬 키가 있을 경우를 대비한 안전장치
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    })),
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

module.exports = { docClient };