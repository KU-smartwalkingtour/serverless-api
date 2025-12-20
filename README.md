# ku-smartwalkingtour API Server

## AWS Lambda 기반 Swagger Documentation(정상 작동)
# [Swagger Documentation](https://obc0v1juwf.execute-api.ap-northeast-2.amazonaws.com/api-docs)

### 주요 기술 스택
- **Framework**: [SST (Serverless Stack)](https://sst.dev/) v3
- **Runtime**: Node.js 20.x
- **Cloud**: AWS (Lambda, API Gateway, DynamoDB, S3)
- **Database**: DynamoDB
- **Documentation**: Swagger (OpenAPI 3.0)

### 개발 환경 설정
1. 의존성 설치: `yarn install`
2. 로컬 개발 서버 실행: `npx sst dev`
3. 배포: `npx sst deploy --stage production`
