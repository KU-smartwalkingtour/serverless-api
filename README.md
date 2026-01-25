# KU Smart Walking Tour API (Serverless)

KU Smart Walking Tour 서비스를 위한 AWS Serverless 기반 백엔드 API입니다.
**SST (Serverless Stack) v3**를 사용하여 AWS Lambda, API Gateway, DynamoDB, Cognito 등의 인프라를 코드로 관리하고 배포합니다.

## API Documentation
로컬 개발 환경 및 배포된 환경에서 Swagger UI를 통해 API 명세를 확인할 수 있습니다.

- **Production**: [Swagger Documentation](https://obc0v1juwf.execute-api.ap-northeast-2.amazonaws.com/api-docs)
- **Local**: `http://localhost:3000/api-docs` (로컬 서버 실행 시)

## Architecture & Tech Stack

- **Framework**: [SST (Serverless Stack)](https://sst.dev/) v3 (Ion)
- **Runtime**: Node.js 20.x
- **Infrastructure**:
  - **Compute**: AWS Lambda
  - **API**: AWS API Gateway v2 (HTTP API)
  - **Database**: AWS DynamoDB
  - **Auth**: AWS Cognito (User Pool & Authorizer)
  - **Storage**: AWS S3 (GPX 파일 저장)
  - **Email**: AWS SES (이메일 발송)
- **Monitoring**: AWS CloudWatch (Production 환경 알람)

## Getting Started

### 1. Prerequisites
- **Node.js**: v20.x 이상
- **Yarn**: 패키지 매니저
- **AWS CLI**: AWS 계정 설정 및 자격 증명 구성 (`aws configure`)

### 2. Environment Variables (.env)
프로젝트 루트에 `.env` 파일을 생성하고 다음 변수들을 설정해야 합니다. `sst.config.ts`에서 이 변수들을 참조하여 인프라를 구성합니다.

```ini
# AWS Configuration (Local SST 실행 시 필요)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_ACCOUNT_ID=your_aws_account_id  # SES Identity ARN 구성에 사용됨


# External APIs
# 기상청 단기예보 조회 서비스
KMA_API_KEY=your_kma_api_key
# 한국환경공단 에어코리아 대기오염정보
AIRKOREA_API_KEY=your_airkorea_api_key

# Walking Course APIs
# 두루누비 정보 서비스
DURUNUBI_SERVICE_KEY=your_durunubi_service_key
# 서울 두드림길 정보
SEOUL_TRAIL_API_KEY=your_seoul_trail_api_key

# Medical APIs (국립중앙의료원)
NMC_HOSPITAL_KEY=your_nmc_hospital_key
# (Optional) 기본값: http://apis.data.go.kr/B551182/hospInfoServicev2
NMC_HOSPITAL_ENDPOINT=http://apis.data.go.kr/B551182/hospInfoServicev2
```

### 3. Installation
```bash
yarn install
```

### 4. Local Development
SST Live Lambda 개발 환경을 실행합니다.
```bash
npx sst dev
```
실행 후 터미널에 출력되는 API URL을 통해 테스트할 수 있습니다.

### 5. Deployment
Production 스테이지로 배포합니다.
```bash
npx sst deploy --stage production
```
배포를 제거하려면:
```bash
npx sst remove --stage production
```

## Project Structure

```
.
├── sst.config.ts           # SST 인프라 정의 (Lambda, API Gateway, DynamoDB 권한 등)
├── src/
│   ├── functions/          # Lambda Handlers (Auth, Courses, User, Weather, etc.)
│   ├── services/           # 비즈니스 로직 (DynamoDB 연동 등)
│   ├── config/             # 설정 파일 (DynamoDB Client 등)
│   └── utils/              # 공통 유틸리티
├── scripts/                # 데이터 시딩 스크립트 
└── .github/workflows/      # CI/CD 파이프라인
```