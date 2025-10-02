# 초단기예보 제공 API 서버 (기상청 API 초단기 예보 활용)

## 사전 준비

- [Node.js](https://nodejs.org/)
- npm (Node.js 설치 시 자동 설치)

## 설치 및 실행 방법

1.  **저장소 복제**

    ```bash
    git clone <repository-url>
    cd today_weather_summary
    ```

2.  **의존성 설치**

    ```bash
    npm ci
    ```

3.  **환경 변수 설정**

    프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 작성합니다. 이 파일은 Git에 의해 추적되지 않으므로 안전합니다.

    ```
    # 기상청 API 인증키
    KMA_API_KEY=your_kma_api_key

    # JWT 서명에 사용할 시크릿 키
    JWT_SECRET=your_jwt_secret_key
    ```

4.  **애플리케이션 실행**

    ```bash
    npm start
    ```

    서버가 정상적으로 실행되면 `http://localhost:3000`에서 접속할 수 있습니다.

## API 엔드포인트

서버 실행 후 `http://localhost:3000/api-docs` 로 접속하면 모든 API의 명세와 사용법을 확인할 수 있습니다.

### 인증 (Auth)

- `POST /api/auth/register`: 사용자 회원가입
- `POST /api/auth/login`: 로그인 후 JWT 토큰 발급

### 날씨 (Weather)

- `GET /api/weather/summary`: 날씨 요약 정보 조회 (JWT 인증 필요)
