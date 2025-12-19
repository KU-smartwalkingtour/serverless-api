/**
 * OpenAPI JSON Lambda Handler
 * /api-docs/json 경로에서 OpenAPI JSON을 제공
 */

const openApiSpec = require('./index.js');

// index.js에서 openApiSpec을 export하지 않으므로 여기서 다시 정의
const spec = {
  openapi: '3.0.0',
  info: {
    title: 'ku-smartwalkingtour API',
    version: '1.0.0',
    description: '건국대학교 스마트 워킹 투어 API 서버',
  },
  tags: [
    { name: 'Auth', description: '사용자 인증 및 토큰 관리' },
    { name: 'User', description: '사용자 프로필 및 설정 관리' },
    { name: 'Course', description: '산책 코스 검색 및 관리' },
    { name: 'Weather', description: '날씨 정보 조회' },
    { name: 'Medical', description: '병원 및 약국 정보 조회' },
    { name: 'User Courses', description: '사용자 저장 코스 및 히스토리 관리 (User 도메인 하위)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '에러 코드', example: 'INVALID_INPUT' },
              message: { type: 'string', description: '한글 에러 메시지', example: '입력값이 유효하지 않습니다.' },
              details: { type: 'object', description: '추가 에러 정보 (선택사항)', example: { field: 'email', reason: 'invalid format' } },
            },
            required: ['code', 'message'],
          },
          timestamp: { type: 'string', format: 'date-time', description: '에러 발생 시각', example: '2024-01-15T10:30:00.000Z' },
        },
        required: ['error', 'timestamp'],
      },
      UserSavedCourse: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          course_id: { type: 'string' },
          saved_at: { type: 'string', format: 'date-time' },
        },
      },
      AuthRefreshToken: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          token_hash: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
          revoked_at: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      PasswordResetRequest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
          verified_at: { type: 'string', format: 'date-time' },
          consumed: { type: 'boolean', default: false },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UserLocation: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          latitude: { type: 'number', format: 'decimal' },
          longitude: { type: 'number', format: 'decimal' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      UserStat: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          total_walk_distance_km: { type: 'number', format: 'decimal' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Course: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: '코스 ID', example: 'seoultrail_1' },
          course_name: { type: 'string', description: '코스명', example: '서울둘레길 1코스' },
          course_type: { type: 'string', enum: ['seoul_trail', 'durunubi'], description: '코스 타입', example: 'seoul_trail' },
          course_length: { type: 'number', format: 'decimal', description: '코스 길이 (km)', example: 18.6 },
          course_duration: { type: 'integer', description: '예상 소요 시간 (분)', example: 360 },
          course_difficulty: { type: 'string', enum: ['하', '중', '상'], description: '난이도', example: '중' },
          course_description: { type: 'string', description: '코스 설명', example: '개화산과 방화동을 거쳐 길동자연생태공원까지' },
          location: { type: 'string', description: '위치 정보', example: '서울시 강서구' },
          start_lat: { type: 'number', format: 'decimal', description: '시작 위도', example: 37.5665 },
          start_lon: { type: 'number', format: 'decimal', description: '시작 경도', example: 126.978 },
          road_name_address: { type: 'string', description: '도로명 주소', example: '서울시 강서구 개화동' },
          medical_facility_info: {
            type: 'object',
            description: '가장 가까운 의료시설 정보',
            nullable: true,
            properties: {
              name: { type: 'string', description: '의료시설명', example: '서울대학병원' },
              address: { type: 'string', description: '주소', example: '서울시 종로구 대학로 101' },
              tel_main: { type: 'string', description: '대표 전화번호', example: '02-1234-5678' },
              emergency_room_open: { type: 'boolean', description: '응급실 운영 여부', nullable: true, example: true },
              tel_emergency: { type: 'string', description: '응급실 전화번호', nullable: true, example: '02-1234-5679' },
              distance_from_course_km: { type: 'number', format: 'float', description: '코스로부터의 거리 (km)', example: 2.5 },
            },
          },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', description: 'JWT 액세스 토큰', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          refreshToken: { type: 'string', description: '리프레시 토큰', example: 'a1b2c3d4e5f6...' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid', description: '사용자 ID', example: '123e4567-e89b-12d3-a456-426614174000' },
              email: { type: 'string', format: 'email', description: '이메일', example: 'user@example.com' },
              nickname: { type: 'string', description: '닉네임', example: '홍길동' },
            },
          },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', description: '이메일 주소', example: 'user@example.com' },
          nickname: { type: 'string', description: '닉네임', example: '홍길동' },
          language: { type: 'string', description: '선호 언어', example: 'ko' },
          distance_unit: { type: 'string', enum: ['km', 'mi'], description: '거리 단위', example: 'km' },
          is_dark_mode_enabled: { type: 'boolean', description: '다크 모드 활성화 여부', example: false },
          allow_location_storage: { type: 'boolean', description: '위치 정보 저장 허용 여부', example: true },
          saved_courses_count: { type: 'integer', description: '저장한 코스 개수', example: 5 },
          recent_courses_count: { type: 'integer', description: '최근 본 코스 개수', example: 10 },
        },
      },
      MedicalFacility: {
        type: 'object',
        properties: {
          dutyAddr: { type: 'string', description: '주소', example: '서울시 강남구 역삼동 123-45' },
          dutyName: { type: 'string', description: '시설명', example: '서울대학병원' },
          dutyTel1: { type: 'string', description: '전화번호', example: '02-1234-5678' },
          latitude: { type: 'number', format: 'float', description: '위도', example: 37.5665 },
          longitude: { type: 'number', format: 'float', description: '경도', example: 126.978 },
          distance: { type: 'number', format: 'float', description: '사용자로부터의 거리(km)', example: 1.5 },
        },
      },
      WeatherData: {
        type: 'object',
        properties: {
          temperature: { type: 'string', description: '기온 (°C)', example: '0', nullable: true },
          humidity: { type: 'string', description: '습도 (%)', example: '0', nullable: true },
          windSpeed: { type: 'string', description: '풍속 (km/h)', example: '0', nullable: true },
          precipitation: { type: 'string', description: '1시간 강수량 (mm)', example: '0', nullable: true },
          skyCondition: { type: 'string', description: '하늘 상태 코드 (1:맑음, 3:구름많음, 4:흐림)', example: '1', nullable: true },
          precipitationType: { type: 'string', description: '강수 형태 코드 (0:없음, 1:비, 2:비/눈, 3:눈)', example: '0', nullable: true },
        },
      },
      AirQualityData: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '대기질 상태 메시지', example: '보통 수준의 대기질입니다. 민감한 분들은 주의하세요.' },
          pm10: { type: 'number', description: 'PM10 농도 (μg/m³)', example: 30, nullable: true },
          pm25: { type: 'number', description: 'PM2.5 농도 (μg/m³)', example: 15, nullable: true },
          grade: { type: 'number', description: '대기질 등급 (1:좋음, 2:보통, 3:나쁨, 4:매우나쁨, 5:극히나쁨)', example: 2, nullable: true },
        },
      },
      IntegratedWeatherResponse: {
        type: 'object',
        properties: {
          weather: { oneOf: [{ $ref: '#/components/schemas/WeatherData' }, { type: 'null' }], description: '날씨 정보 (실패 시 null)' },
          airQuality: { oneOf: [{ $ref: '#/components/schemas/AirQualityData' }, { type: 'null' }], description: '대기질 정보 (실패 시 null)' },
        },
      },
      CoordinatePoint: {
        type: 'object',
        properties: {
          lat: { type: 'number', format: 'float', description: '위도', example: 37.68905 },
          lon: { type: 'number', format: 'float', description: '경도', example: 127.045876 },
        },
      },
      UserRecentCourse: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          course_id: { type: 'string' },
          viewed_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  servers: [{ url: 'https://obc0v1juwf.execute-api.ap-northeast-2.amazonaws.com', description: 'Production API Gateway' }],
  paths: {
    '/auth/forgot-password/send': { post: { summary: '비밀번호 재설정 코드 전송', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } }, responses: { 200: { description: '비밀번호 재설정 코드가 전송되었습니다.' }, 400: { description: '입력값이 유효하지 않음' }, 404: { description: '사용자를 찾을 수 없음' }, 429: { description: '요청 횟수 제한 초과' }, 500: { description: '서버 오류' } } } },
    '/auth/forgot-password/verify': { post: { summary: '비밀번호 재설정 코드 검증', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'code', 'newPassword'], properties: { email: { type: 'string', format: 'email' }, code: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } }, responses: { 200: { description: '비밀번호가 성공적으로 재설정되었습니다.' }, 400: { description: '유효하지 않은 코드' }, 404: { description: '사용자를 찾을 수 없음' }, 500: { description: '서버 오류' } } } },
    '/auth/login': { post: { summary: '사용자 로그인', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } }, responses: { 200: { description: '로그인 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } }, 400: { description: '입력값이 유효하지 않음' }, 401: { description: '인증 실패' }, 500: { description: '서버 오류' } } } },
    '/auth/logout': { post: { summary: '사용자 로그아웃', tags: ['Auth'], security: [{ bearerAuth: [] }], responses: { 200: { description: '로그아웃 성공' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/auth/refresh-token': { post: { summary: '토큰 갱신', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } }, responses: { 200: { description: '토큰 갱신 성공' }, 400: { description: '입력값이 유효하지 않음' }, 403: { description: '유효하지 않은 토큰' }, 500: { description: '서버 오류' } } } },
    '/auth/register': { post: { summary: '회원가입', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, nickname: { type: 'string' } } } } } }, responses: { 201: { description: '회원가입 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } }, 400: { description: '입력값이 유효하지 않음' }, 409: { description: '이메일 중복' }, 500: { description: '서버 오류' } } } },
    '/courses/course': { get: { summary: '코스 목록 조회', tags: ['Course'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lat', required: true, schema: { type: 'number' } }, { in: 'query', name: 'lon', required: true, schema: { type: 'number' } }, { in: 'query', name: 'n', required: true, schema: { type: 'integer' } }, { in: 'query', name: 'sortBy', schema: { type: 'string', enum: ['distance', 'length', 'difficulty'] } }, { in: 'query', name: 'difficulty', schema: { type: 'string', enum: ['하', '중', '상'] } }], responses: { 200: { description: '코스 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } }, 400: { description: '잘못된 파라미터' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/courses/{courseId}': { get: { summary: '코스 상세 조회', tags: ['Course'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '코스 상세', content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } } }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } } },
    '/courses/home': { get: { summary: '홈 코스 목록', tags: ['Course'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lat', required: true, schema: { type: 'number' } }, { in: 'query', name: 'lon', required: true, schema: { type: 'number' } }, { in: 'query', name: 'n', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '코스 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } }, 400: { description: '잘못된 파라미터' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/courses/{courseId}/coordinates': { get: { summary: '코스 좌표 조회', tags: ['Course'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '좌표 배열', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CoordinatePoint' } } } } }, 400: { description: 'courseId 누락' }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } } },
    '/medical/search': { get: { summary: '병원/약국 검색', tags: ['Medical'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'Q0', schema: { type: 'string' } }, { in: 'query', name: 'Q1', schema: { type: 'string' } }, { in: 'query', name: 'QZ', schema: { type: 'string' } }, { in: 'query', name: 'QD', schema: { type: 'string' } }, { in: 'query', name: 'QT', schema: { type: 'string' } }, { in: 'query', name: 'QN', schema: { type: 'string' } }, { in: 'query', name: 'ORD', schema: { type: 'string' } }, { in: 'query', name: 'pageNo', schema: { type: 'integer', default: 1 } }, { in: 'query', name: 'numOfRows', schema: { type: 'integer', default: 10 } }], responses: { 200: { description: '의료시설 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MedicalFacility' } } } } }, 400: { description: '잘못된 파라미터' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/coordinates': { put: { summary: '위치 업데이트', tags: ['User'], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['latitude', 'longitude'], properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } } } } }, responses: { 200: { description: '업데이트 성공' }, 400: { description: '입력값 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/password': { patch: { summary: '비밀번호 변경', tags: ['User'], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } }, responses: { 200: { description: '변경 성공' }, 400: { description: '입력값 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/profile': { get: { summary: '프로필 조회', tags: ['User'], security: [{ bearerAuth: [] }], responses: { 200: { description: '프로필', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } }, 401: { description: '인증되지 않음' } } } },
    '/user/withdraw': { delete: { summary: '회원탈퇴', tags: ['User'], security: [{ bearerAuth: [] }], responses: { 200: { description: '탈퇴 완료' }, 401: { description: '인증되지 않음' }, 404: { description: '사용자 없음' }, 500: { description: '서버 오류' } } } },
    '/user/settings': { patch: { summary: '설정 변경', tags: ['User'], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nickname: { type: 'string' }, language: { type: 'string' }, distance_unit: { type: 'string', enum: ['km', 'mi'] }, is_dark_mode_enabled: { type: 'boolean' }, allow_location_storage: { type: 'boolean' } } } } } }, responses: { 200: { description: '변경 성공' }, 400: { description: '입력값 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/stats': { get: { summary: '통계 조회', tags: ['User'], security: [{ bearerAuth: [] }], responses: { 200: { description: '통계', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStat' } } } }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/stats/walk': { post: { summary: '걷기 기록', tags: ['User'], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['distance_km'], properties: { distance_km: { type: 'number' } } } } } }, responses: { 200: { description: '기록 성공' }, 400: { description: '입력값 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/courses/saved-courses': { get: { summary: '저장된 코스 목록', tags: ['User Courses'], security: [{ bearerAuth: [] }], responses: { 200: { description: '코스 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/courses/saved-courses/{courseId}': { put: { summary: '코스 저장', tags: ['User Courses'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '이미 저장됨' }, 201: { description: '저장 성공' }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } }, delete: { summary: '저장 삭제', tags: ['User Courses'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '삭제 성공' }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } } },
    '/user/courses/recent-courses': { get: { summary: '최근 본 코스 목록', tags: ['User Courses'], security: [{ bearerAuth: [] }], responses: { 200: { description: '코스 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/user/courses/recent-courses/{courseId}': { put: { summary: '최근 본 코스 추가', tags: ['User Courses'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '이미 있음' }, 201: { description: '추가 성공' }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } }, delete: { summary: '최근 본 코스 삭제', tags: ['User Courses'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' } }], responses: { 200: { description: '삭제 성공' }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 404: { description: '코스 없음' }, 500: { description: '서버 오류' } } } },
    '/weather/air-quality': { get: { summary: '대기질 조회', tags: ['Weather'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lon', required: true, schema: { type: 'string' } }, { in: 'query', name: 'lat', required: true, schema: { type: 'string' } }], responses: { 200: { description: '대기질', content: { 'application/json': { schema: { $ref: '#/components/schemas/AirQualityData' } } } }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/weather': { get: { summary: '통합 날씨 조회', tags: ['Weather'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lon', required: true, schema: { type: 'string' } }, { in: 'query', name: 'lat', required: true, schema: { type: 'string' } }], responses: { 200: { description: '날씨+대기질', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntegratedWeatherResponse' } } } }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/weather/summary': { get: { summary: '날씨 요약', tags: ['Weather'], security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lon', required: true, schema: { type: 'string' } }, { in: 'query', name: 'lat', required: true, schema: { type: 'string' } }], responses: { 200: { description: '날씨 요약', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntegratedWeatherResponse' } } } }, 400: { description: '파라미터 오류' }, 401: { description: '인증되지 않음' }, 500: { description: '서버 오류' } } } },
    '/health': { get: { summary: '상태 확인', tags: ['Health'], responses: { 200: { description: '정상', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' } } } } } } } } },
  },
};

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(spec),
  };
};
