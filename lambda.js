// serverless-api/lambda.js
const serverless = require('serverless-http');
const app = require('./app');

/**
 * [Function: AWS Lambda API 핸들러]
 * * 목적: 본 람다 함수는 Express 애플리케이션(app.js)의 진입점(Handler)을 정의합니다.
 * * 아키텍처 전략: 통합 코드 기반 (Monolithic Codebase) 배포 및 논리적 도메인 분리
 * * 상세 설명:
 * 1. 의존성 관리: 전체 Express 애플리케이션을 감싸서 배포함으로써, 공통 모듈(utils, middleware, config)의 의존성 해결 및 관리 복잡성을 최소화합니다.
 * 2. 논리적 분리: API Gateway 설정을 통해 특정 경로(예: /courses/*)의 요청만 본 람다로 라우팅합니다.
 * 3. 결과: 코드는 통합되어 있으나, 실행 환경은 도메인별로 분리되어 작동하는 효율적인 서버리스 구조를 달성합니다.
 */
// Express 앱을 AWS Lambda가 실행할 수 있는 형태(Handler)로 변환
module.exports.handler = serverless(app);