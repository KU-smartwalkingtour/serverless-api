# Express → AWS Lambda 마이그레이션 계획

## 개요

### 목표
- Express 5.1.0 기반 REST API를 AWS Lambda + API Gateway로 완전 마이그레이션
- 모든 API 엔드포인트, 요청/응답 형식, 에러 코드 동일 유지
- 서버리스 아키텍처로 비용 최적화 및 자동 스케일링

### 범위
- 5개 라우트 도메인: auth, weather, courses, user, medical
- 기존 PostgreSQL 데이터베이스 유지
- DynamoDB (코스 데이터) 유지
- JWT 인증 체계 유지

### 기술 스택
| 항목 | 도구 |
|------|------|
| IaC | SST (Ion) |
| CI/CD | GitHub Actions |
| Runtime | Node.js 20.x |
| API | API Gateway HTTP API v2 |
| Compute | AWS Lambda |
| DB | PostgreSQL (RDS) - 직접 연결 |
| NoSQL | DynamoDB (코스 데이터) |
| 인증 | AWS Access Key / Secret Key |

---

## 현재 상태 (As-Is)

```
┌─────────────────────────────────────────────────┐
│                    EC2                          │
│  ┌───────────────────────────────────────────┐  │
│  │              Docker Container             │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │         Express 5.1.0               │  │  │
│  │  │  ┌─────┬─────┬─────┬─────┬───────┐  │  │  │
│  │  │  │auth │weather│course│user│medical│  │  │  │
│  │  │  └─────┴─────┴─────┴─────┴───────┘  │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
  ┌──────────────────┐    ┌──────────────────┐
  │   PostgreSQL     │    │    DynamoDB      │
  │   (RDS)          │    │  (코스 데이터)    │
  └──────────────────┘    └──────────────────┘
```

| 항목 | 현재 |
|------|------|
| Framework | Express 5.1.0 |
| Runtime | Node.js 20 |
| 배포 | Docker + EC2 |
| CI/CD | GitHub Actions |
| DB | PostgreSQL (RDS) + DynamoDB |
| ORM | Sequelize 6.37.7 |

---

## 목표 상태 (To-Be)

```
                    ┌─────────────────┐
                    │  API Gateway    │
                    │  (HTTP API v2)  │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Lambda     │ │   Lambda     │ │   Lambda     │
    │   Authorizer │ │   auth/*     │ │   weather/*  │
    │   (JWT)      │ │              │ │              │
    └──────────────┘ └──────────────┘ └──────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Lambda     │ │   Lambda     │ │   Lambda     │
    │   courses/*  │ │   user/*     │ │   medical/*  │
    └──────────────┘ └──────────────┘ └──────────────┘
            │                │                │
            └────────────────┼────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                                 ▼
  ┌──────────────────┐              ┌──────────────────┐
  │   PostgreSQL     │              │    DynamoDB      │
  │   (RDS)          │              │  (코스 데이터)    │
  └──────────────────┘              └──────────────────┘
```

| 항목 | 변경 후 |
|------|---------|
| Framework | AWS Lambda (순수 핸들러) |
| Runtime | Node.js 20.x |
| API Layer | API Gateway HTTP API v2 |
| IaC | SST (Ion) |
| CI/CD | GitHub Actions + SST |
| DB | PostgreSQL (RDS) + DynamoDB |
| ORM | Sequelize 6.37.7 (유지) |

---

## 아키텍처 설계

### Lambda 함수 구성 (개별 함수 분리)

| 도메인 | 함수명 | 역할 | 메모리 | 타임아웃 |
|--------|--------|------|--------|----------|
| - | `authorizer` | JWT 토큰 검증 | 128MB | 5s |
| auth | `auth/register` | 회원가입 | 256MB | 10s |
| auth | `auth/login` | 로그인 | 256MB | 10s |
| auth | `auth/logout` | 로그아웃 | 256MB | 10s |
| auth | `auth/refresh-token` | 토큰 갱신 | 256MB | 10s |
| auth | `auth/forgot-password-send` | 비밀번호 재설정 요청 | 256MB | 10s |
| auth | `auth/forgot-password-verify` | 비밀번호 재설정 검증 | 256MB | 10s |
| weather | `weather/integrated` | 통합 날씨 | 256MB | 15s |
| weather | `weather/summary` | 날씨 요약 | 256MB | 15s |
| weather | `weather/airquality` | 대기질 | 256MB | 15s |
| courses | `courses/home` | 홈 코스 목록 | 256MB | 10s |
| courses | `courses/list` | 코스 목록 | 256MB | 10s |
| courses | `courses/detail` | 코스 상세 | 256MB | 10s |
| courses | `courses/coordinates` | 코스 좌표 | 256MB | 10s |
| user | `user/profile` | 프로필 조회 | 256MB | 10s |
| user | `user/settings` | 설정 수정 | 256MB | 10s |
| user | `user/password` | 비밀번호 변경 | 256MB | 10s |
| user | `user/withdraw` | 회원탈퇴 | 256MB | 10s |
| user | `user/coordinates` | 위치 업데이트 | 256MB | 10s |
| user | `user/stats/get` | 통계 조회 | 256MB | 10s |
| user | `user/stats/walk` | 걷기 기록 | 256MB | 10s |
| user | `user/saved-courses/*` | 저장된 코스 | 256MB | 10s |
| user | `user/recent-courses/*` | 최근 코스 | 256MB | 10s |
| medical | `medical/search` | 의료시설 검색 | 256MB | 15s |
| - | `health` | 헬스체크 | 128MB | 5s |

### Lambda Layer 구성

```
src/layers/common/nodejs/
├── package.json
├── config/           # DB 설정 (PostgreSQL, DynamoDB)
├── models/           # Sequelize 모델
├── utils/            # 공통 유틸리티
└── services/         # 비즈니스 로직
```

### API Gateway 라우팅

| Method | Path | Lambda | Authorizer |
|--------|------|--------|------------|
| POST | /auth/register | auth/register | - |
| POST | /auth/login | auth/login | - |
| POST | /auth/logout | auth/logout | JWT |
| POST | /auth/refresh-token | auth/refresh-token | - |
| POST | /auth/forgot-password/send | auth/forgot-password-send | - |
| POST | /auth/forgot-password/verify | auth/forgot-password-verify | - |
| GET | /weather | weather/integrated | JWT |
| GET | /weather/summary | weather/summary | JWT |
| GET | /weather/airquality | weather/airquality | JWT |
| GET | /courses/home | courses/home | JWT |
| GET | /courses/course | courses/list | JWT |
| GET | /courses/{courseId} | courses/detail | JWT |
| GET | /courses/{courseId}/coordinates | courses/coordinates | JWT |
| GET | /user/profile | user/profile | JWT |
| PATCH | /user/settings | user/settings | JWT |
| PATCH | /user/password | user/password | JWT |
| DELETE | /user/withdraw | user/withdraw | JWT |
| PUT | /user/coordinates | user/coordinates | JWT |
| GET | /user/stats | user/stats/get | JWT |
| POST | /user/stats/walk | user/stats/walk | JWT |
| GET | /user/courses/saved-courses | user/saved-courses/get | JWT |
| PUT | /user/courses/saved-courses/{courseId} | user/saved-courses/save | JWT |
| DELETE | /user/courses/saved-courses/{courseId} | user/saved-courses/delete | JWT |
| GET | /user/courses/recent-courses | user/recent-courses/get | JWT |
| PUT | /user/courses/recent-courses/{courseId} | user/recent-courses/add | JWT |
| DELETE | /user/courses/recent-courses/{courseId} | user/recent-courses/delete | JWT |
| GET | /medical/search | medical/search | JWT |
| GET | /health | health | - |

---

## 디렉토리 구조 (변경 후)

```
serverless-api/
├── package.json
├── sst.config.ts                 # SST 인프라 설정
├── tsconfig.json
│
├── src/                          # 소스 코드
│   ├── layers/
│   │   └── common/
│   │       └── nodejs/
│   │           ├── package.json
│   │           ├── config/       # DB 설정
│   │           │   ├── database.js
│   │           │   └── dynamodb.js
│   │           ├── models/       # Sequelize 모델
│   │           ├── utils/        # 공통 유틸리티
│   │           └── services/     # 비즈니스 로직
│   │
│   └── functions/
│       ├── authorizer/
│       │   └── index.js
│       │
│       ├── auth/
│       │   ├── register/index.js
│       │   ├── login/index.js
│       │   ├── logout/index.js
│       │   ├── refresh-token/index.js
│       │   ├── forgot-password-send/index.js
│       │   └── forgot-password-verify/index.js
│       │
│       ├── weather/
│       │   ├── integrated/index.js
│       │   ├── summary/index.js
│       │   └── airquality/index.js
│       │
│       ├── courses/
│       │   ├── home/index.js
│       │   ├── list/index.js
│       │   ├── detail/index.js
│       │   └── coordinates/index.js
│       │
│       ├── user/
│       │   ├── profile/index.js
│       │   ├── withdraw/index.js
│       │   ├── settings/index.js
│       │   ├── password/index.js
│       │   ├── coordinates/index.js
│       │   ├── stats/
│       │   │   ├── get/index.js
│       │   │   └── walk/index.js
│       │   ├── saved-courses/
│       │   │   ├── get/index.js
│       │   │   ├── save/index.js
│       │   │   └── delete/index.js
│       │   └── recent-courses/
│       │       ├── get/index.js
│       │       ├── add/index.js
│       │       └── delete/index.js
│       │
│       ├── medical/
│       │   └── search/index.js
│       │
│       └── health/
│           └── index.js
│
├── .github/
│   └── workflows/
│       └── serverless-deploy.yml  # SST CI/CD
│
└── (기존 Express 코드 - 마이그레이션 완료 후 삭제)
    ├── app.js
    ├── index.js
    ├── lambda.js
    ├── routes/
    ├── models/
    ├── utils/
    ├── config/
    ├── middleware/
    └── services/
```

---

## SST 구성

### sst.config.ts

```typescript
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "ku-swt",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-northeast-2",
        },
      },
    };
  },
  async run() {
    // Lambda Layer
    const commonLayer = new sst.aws.Function.Layer("CommonLayer", {
      path: "src/layers/common",
    });

    // 환경 변수
    const environment = {
      DB_HOST: process.env.DB_HOST!,
      DB_PORT: process.env.DB_PORT!,
      DB_NAME: process.env.DB_NAME!,
      DB_USER: process.env.DB_USER!,
      DB_PASSWORD: process.env.DB_PASSWORD!,
      JWT_SECRET: process.env.JWT_SECRET!,
    };

    // API Gateway
    const api = new sst.aws.ApiGatewayV2("Api");

    // Auth Routes
    api.route("POST /auth/register", {
      handler: "src/functions/auth/register/index.handler",
      layers: [commonLayer],
      environment,
    });

    // ... 나머지 라우트

    return {
      api: api.url,
    };
  },
});
```

---

## GitHub Actions CI/CD

### .github/workflows/serverless-deploy.yml

```yaml
name: Deploy Serverless API

on:
  push:
    branches:
      - deploy/prod
  pull_request:
    branches:
      - deploy/prod

env:
  AWS_REGION: ap-northeast-2

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install Layer dependencies
        run: |
          cd src/layers/common/nodejs
          yarn install --production --frozen-lockfile

      - name: Deploy with SST
        run: npx sst deploy --stage production
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_PORT: ${{ secrets.DB_PORT }}
          DB_NAME: ${{ secrets.DB_NAME }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          KMA_API_KEY: ${{ secrets.KMA_API_KEY }}
          DURUNUBI_SERVICE_KEY: ${{ secrets.DURUNUBI_SERVICE_KEY }}
          SEOUL_TRAIL_API_KEY: ${{ secrets.SEOUL_TRAIL_API_KEY }}
          NMC_HOSPITAL_KEY: ${{ secrets.NMC_HOSPITAL_KEY }}
```

---

## 구현 단계

### Phase 1: SST 프로젝트 설정

- [x] SST 초기화 (`sst.config.ts` 생성)
- [x] package.json 의존성 추가
- [x] 기존 Terraform 코드 삭제

### Phase 2: 공통 레이어 구성

- [x] `src/layers/common/nodejs/` 디렉토리 생성
- [x] 기존 `models/`, `utils/`, `config/`, `services/` 마이그레이션
- [x] Lambda용 DB 연결 로직 수정 (connection pool)

### Phase 3: Lambda 함수 작성

- [x] Authorizer 함수 (JWT 검증)
- [x] Auth 함수들 (개별 함수 분리)
- [x] Weather 함수들 (개별 함수 분리)
- [x] Courses 함수들 (개별 함수 분리)
- [x] User 함수들 (개별 함수 분리)
  - [x] profile, settings, password, withdraw
  - [x] coordinates, stats/get, stats/walk (누락분 추가 완료)
  - [x] saved-courses/*, recent-courses/*
- [x] Medical 함수 (개별 함수 분리)
- [x] Health 함수

### Phase 4: 인프라 구성

- [x] DynamoDB 테이블 생성 (USER_TABLE, AUTH_DATA_TABLE, COURSE_DATA_TABLE, USER_COURSE_TABLE)
- [x] GSI 설정 (EmailIndex, TokenHashIndex, saved_at, updated_at)
- [x] Lambda IAM 권한 설정 (DynamoDB 접근)
- [x] `.github/workflows/serverless-deploy.yml` 작성 (deploy/sst 브랜치)
- [ ] GitHub Secrets 설정 (수동)

### Phase 5: 테스트 및 검증

- [x] `sst dev`로 로컬 테스트
- [x] 기존 API와 응답 비교 테스트
- [x] 개발 테스트 서버 배포 (https://gspl0i5f44.execute-api.ap-northeast-2.amazonaws.com)
- [ ] 프로덕션 배포

### Phase 6: 마이그레이션 완료

- [ ] 기존 Express 코드 정리
- [ ] CloudWatch 알람 설정
- [ ] 기존 EC2 인프라 정리

---

## GitHub Secrets 설정

| Secret Name | 설명 |
|-------------|------|
| `AWS_ACCESS_KEY_ID` | AWS IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM 시크릿 키 |
| `DB_HOST` | RDS 엔드포인트 |
| `DB_PORT` | RDS 포트 |
| `DB_NAME` | 데이터베이스 이름 |
| `DB_USER` | 데이터베이스 사용자 |
| `DB_PASSWORD` | RDS 비밀번호 |
| `JWT_SECRET` | JWT 서명 키 |
| `KMA_API_KEY` | 기상청 API 키 |
| `DURUNUBI_SERVICE_KEY` | 두루누비 API 키 |
| `SEOUL_TRAIL_API_KEY` | 서울둘레길 API 키 |
| `NMC_HOSPITAL_KEY` | 국민건강보험공단 병원 API 키 |

---

## 삭제 대상 파일 (마이그레이션 완료 후)

| 파일 | 이유 |
|------|------|
| `app.js` | Express 앱 설정 |
| `index.js` | Express 서버 시작점 |
| `lambda.js` | serverless-http 래퍼 |
| `Dockerfile` | Docker 배포 불필요 |
| `.dockerignore` | Docker 불필요 |
| `routes/` | Lambda handlers로 대체 |
| `middleware/` | Lambda authorizer로 대체 |
| `build.js` | SST가 빌드 처리 |
| `terraform/` | SST로 대체 |

---

## 참고 자료

- [SST Documentation](https://sst.dev/docs/)
- [SST API Gateway](https://sst.dev/docs/component/aws/apigatewayv2)
- [SST Lambda](https://sst.dev/docs/component/aws/function)
- [Sequelize Lambda Best Practices](https://sequelize.org/docs/v6/other-topics/aws-lambda/)
