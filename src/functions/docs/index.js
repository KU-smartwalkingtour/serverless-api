/**
 * Swagger UI Lambda Handler
 * /api-docs 경로에서 Swagger UI를, /api-docs/json 경로에서 OpenAPI JSON을 제공
 */

const openApiSpec = {
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
              operating_hours: {
                type: 'object',
                description: '운영시간',
                properties: {
                  mon_start: { type: 'string', example: '0900' },
                  mon_end: { type: 'string', example: '1800' },
                  tue_start: { type: 'string', example: '0900' },
                  tue_end: { type: 'string', example: '1800' },
                  wed_start: { type: 'string', example: '0900' },
                  wed_end: { type: 'string', example: '1800' },
                  thu_start: { type: 'string', example: '0900' },
                  thu_end: { type: 'string', example: '1800' },
                  fri_start: { type: 'string', example: '0900' },
                  fri_end: { type: 'string', example: '1800' },
                  sat_start: { type: 'string', nullable: true, example: '0900' },
                  sat_end: { type: 'string', nullable: true, example: '1300' },
                  sun_start: { type: 'string', nullable: true, example: null },
                  sun_end: { type: 'string', nullable: true, example: null },
                  hol_start: { type: 'string', nullable: true, example: null },
                  hol_end: { type: 'string', nullable: true, example: null },
                },
              },
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
  servers: [{ url: 'https://gspl0i5f44.execute-api.ap-northeast-2.amazonaws.com', description: 'Production API Gateway' }],
  paths: {
    '/auth/forgot-password/send': {
      post: {
        summary: '비밀번호 재설정 코드 전송',
        description: '등록된 이메일 주소로 비밀번호 재설정을 위한 6자리 인증 코드를 전송합니다.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', description: '비밀번호를 재설정할 사용자의 이메일 주소', example: 'user@example.com' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '비밀번호 재설정 코드가 전송되었습니다.' },
          400: { description: '입력값이 유효하지 않음', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: '해당 이메일로 등록된 사용자를 찾을 수 없음' },
          429: { description: '요청 횟수 제한 초과 (5분에 1회만 가능)' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/auth/forgot-password/verify': {
      post: {
        summary: '비밀번호 재설정 코드 검증 및 비밀번호 변경',
        description: '이메일로 받은 6자리 인증 코드를 검증하고 새로운 비밀번호로 변경합니다.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'code', 'newPassword'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  code: { type: 'string', description: '이메일로 전송된 6자리 인증 코드', example: '123456' },
                  newPassword: { type: 'string', format: 'password', minLength: 8, description: '새로운 비밀번호 (최소 8자)', example: 'newpassword123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '비밀번호가 성공적으로 재설정되었습니다.' },
          400: { description: '유효하지 않거나 만료된 인증 코드' },
          404: { description: '해당 이메일로 등록된 사용자를 찾을 수 없음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: '사용자 로그인',
        description: '이메일과 비밀번호로 로그인하고 액세스 토큰을 발급받습니다.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', format: 'password', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '로그인 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: '입력값이 유효하지 않음' },
          401: { description: '이메일 또는 비밀번호가 일치하지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: '사용자 로그아웃',
        description: '액세스 토큰을 통해 인증된 사용자의 모든 리프레시 토큰을 무효화합니다.',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '로그아웃이 성공적으로 완료되었습니다.' },
          401: { description: '인증되지 않음' },
          403: { description: '접근 거부' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/auth/refresh-token': {
      post: {
        summary: '리프레시 토큰으로 새 액세스 토큰 발급',
        description: '유효한 리프레시 토큰을 사용하여 새로운 액세스 토큰을 발급받습니다.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', description: '리프레시 토큰' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '새 액세스 토큰 및 리프레시 토큰이 성공적으로 발급되었습니다.' },
          400: { description: '입력값이 유효하지 않음' },
          403: { description: '유효하지 않거나 만료된 리프레시 토큰' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: '신규 사용자 회원가입',
        description: '이메일과 비밀번호로 새 계정을 생성합니다.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', format: 'password', minLength: 8, example: 'password123' },
                  nickname: { type: 'string', description: '사용자 닉네임 (선택사항)', example: '홍길동' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: '회원가입 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: '입력값이 유효하지 않음' },
          409: { description: '이미 존재하는 이메일' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/courses/course': {
      get: {
        summary: '코스 탭에서 코스 목록 조회 (정렬 및 난이도 필터링)',
        description: '현재 위치를 기준으로 N개의 코스를 조회하며, 정렬 기준과 난이도 필터링을 적용할 수 있습니다.',
        tags: ['Course'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lat', required: true, schema: { type: 'number', format: 'float' }, description: '사용자의 위도', example: 37.5665 },
          { in: 'query', name: 'lon', required: true, schema: { type: 'number', format: 'float' }, description: '사용자의 경도', example: 126.978 },
          { in: 'query', name: 'n', required: true, schema: { type: 'integer' }, description: '조회할 코스의 개수', example: 10 },
          { in: 'query', name: 'sortBy', schema: { type: 'string', enum: ['distance', 'length', 'difficulty'] }, description: '정렬 기준' },
          { in: 'query', name: 'difficulty', schema: { type: 'string', enum: ['하', '중', '상'] }, description: '난이도 필터' },
        ],
        responses: {
          200: { description: '코스 목록 조회 성공', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } },
          400: { description: '잘못된 요청 파라미터' },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/courses/{courseId}': {
      get: {
        summary: '코스 상세 메타데이터 조회',
        description: '코스 ID로 코스의 상세 메타데이터를 조회하고, 최근 본 코스에 추가합니다.',
        tags: ['Course'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '코스의 제공자별 고유 ID', example: 'seoultrail_1' }],
        responses: {
          200: { description: '코스 메타데이터 조회 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } } },
          401: { description: '인증되지 않음' },
          404: { description: '코스를 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/courses/home': {
      get: {
        summary: '홈 탭에서 가까운 코스 목록 조회',
        description: '현재 위치를 기준으로 가까운 순서대로 N개의 코스를 조회합니다.',
        tags: ['Course'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lat', required: true, schema: { type: 'number', format: 'float' }, description: '사용자의 위도', example: 37.5665 },
          { in: 'query', name: 'lon', required: true, schema: { type: 'number', format: 'float' }, description: '사용자의 경도', example: 126.978 },
          { in: 'query', name: 'n', required: true, schema: { type: 'integer' }, description: '조회할 코스의 개수', example: 5 },
        ],
        responses: {
          200: { description: '가까운 코스 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } },
          400: { description: '잘못된 요청 파라미터' },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/courses/{courseId}/coordinates': {
      get: {
        summary: '특정 코스의 GPS 좌표 조회',
        description: '코스 ID로 코스 경로의 모든 GPS 좌표를 조회합니다.',
        tags: ['Course'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '코스의 제공자별 고유 ID', example: 'seoultrail_1' }],
        responses: {
          200: { description: '코스 경로의 좌표 배열', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CoordinatePoint' } } } } },
          400: { description: 'courseId 파라미터가 누락되었습니다.' },
          401: { description: '인증되지 않음' },
          404: { description: '코스 파일을 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/medical/search': {
      get: {
        tags: ['Medical'],
        summary: '병원/약국 조건 검색',
        description: '주어진 조건(시/도, 시/군/구, 기관명 등)에 맞는 병원 및 약국 정보를 검색합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'Q0', schema: { type: 'string' }, description: "주소(시도) (예: '서울특별시')" },
          { in: 'query', name: 'Q1', schema: { type: 'string' }, description: "주소(시군구) (예: '강남구')" },
          { in: 'query', name: 'QZ', schema: { type: 'string' }, description: '기관구분 (B:병원, C:의원 등)' },
          { in: 'query', name: 'QD', schema: { type: 'string' }, description: '진료과목 (D001: 내과 등)' },
          { in: 'query', name: 'QT', schema: { type: 'string' }, description: '진료요일 (1:월요일 ~ 7:일요일, 8:공휴일)' },
          { in: 'query', name: 'QN', schema: { type: 'string' }, description: "기관명 (예: '삼성병원')" },
          { in: 'query', name: 'ORD', schema: { type: 'string' }, description: '정렬 순서 (NAME: 이름순)' },
          { in: 'query', name: 'pageNo', schema: { type: 'integer', default: 1 }, description: '페이지 번호' },
          { in: 'query', name: 'numOfRows', schema: { type: 'integer', default: 10 }, description: '목록 건수' },
        ],
        responses: {
          200: { description: '병원/약국 목록이 성공적으로 검색되었습니다.', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MedicalFacility' } } } } },
          400: { description: '잘못된 요청 파라미터입니다.' },
          401: { description: '인증되지 않음' },
          403: { description: '접근 거부 (유효하지 않은 토큰)' },
          500: { description: '병원/약국 데이터를 조회하는 중 오류가 발생했습니다.' },
        },
      },
    },
    '/user/coordinates': {
      put: {
        summary: '사용자의 마지막 위치 업데이트',
        description: '인증된 사용자의 현재 위치 정보(위도, 경도)를 업데이트합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['latitude', 'longitude'],
                properties: {
                  latitude: { type: 'number', format: 'float', description: '위도 (-90 ~ 90)', example: 37.5665 },
                  longitude: { type: 'number', format: 'float', description: '경도 (-180 ~ 180)', example: 126.978 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '위치가 성공적으로 업데이트되었습니다.' },
          400: { description: '입력값이 유효하지 않음' },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/password': {
      patch: {
        summary: '비밀번호 변경',
        description: '인증된 사용자가 현재 비밀번호를 확인한 후 새로운 비밀번호로 변경합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', format: 'password', example: 'currentpassword123' },
                  newPassword: { type: 'string', format: 'password', minLength: 8, example: 'newpassword123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '비밀번호가 성공적으로 변경되었습니다.' },
          400: { description: '입력값이 유효하지 않음' },
          401: { description: '인증되지 않음 또는 현재 비밀번호가 일치하지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/profile': {
      get: {
        summary: '현재 사용자 프로필 조회',
        description: '인증된 사용자의 프로필 정보를 조회합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '사용자의 프로필 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } },
          401: { description: '인증되지 않음' },
        },
      },
    },
    '/user/withdraw': {
      delete: {
        summary: '사용자 회원탈퇴 (Soft Delete)',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '회원탈퇴 처리가 완료되었습니다.' },
          401: { description: 'Unauthorized.' },
          404: { description: '사용자를 찾을 수 없습니다.' },
          500: { description: '서버 오류 발생' },
        },
      },
    },
    '/user/settings': {
      patch: {
        summary: '사용자 설정 업데이트',
        description: '인증된 사용자의 설정을 업데이트합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nickname: { type: 'string' },
                  language: { type: 'string' },
                  distance_unit: { type: 'string', enum: ['km', 'mi'] },
                  is_dark_mode_enabled: { type: 'boolean' },
                  allow_location_storage: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '설정이 성공적으로 업데이트되었습니다.' },
          400: { description: '입력값이 유효하지 않음' },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/stats': {
      get: {
        summary: '사용자의 통계 조회',
        description: '인증된 사용자의 걷기 통계 정보를 조회합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '사용자의 통계 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStat' } } } },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/stats/walk': {
      post: {
        summary: '사용자의 총 걷기 거리에 거리 추가',
        description: '새로 걸은 거리를 기록하여 사용자의 총 걷기 거리에 추가합니다.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['distance_km'],
                properties: {
                  distance_km: { type: 'number', format: 'float', description: '걸은 거리 (킬로미터, 양수)', example: 5.2 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '걷기 거리가 성공적으로 기록되었습니다.' },
          400: { description: '입력값이 유효하지 않음' },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/courses/saved-courses': {
      get: {
        summary: '사용자 저장된 코스 목록 조회 (DynamoDB)',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '저장된 코스 목록 (최신순)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류 발생' },
        },
      },
    },
    '/user/courses/saved-courses/{courseId}': {
      put: {
        summary: '코스를 사용자 목록에 저장',
        description: '지정된 코스를 사용자의 저장 목록에 추가합니다.',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '저장할 코스의 고유 ID' }],
        responses: {
          200: { description: '코스가 이미 저장되어 있습니다.' },
          201: { description: '코스가 성공적으로 저장되었습니다.' },
          400: { description: '파라미터가 누락되었거나 유효하지 않습니다.' },
          401: { description: '인증되지 않음' },
          404: { description: '해당 코스를 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
      delete: {
        summary: '코스를 사용자 목록에서 삭제',
        description: '저장된 코스를 사용자의 저장 목록에서 제거합니다.',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '삭제할 코스의 고유 ID' }],
        responses: {
          200: { description: '코스가 성공적으로 삭제되었습니다.' },
          400: { description: '파라미터가 누락되었거나 유효하지 않습니다.' },
          401: { description: '인증되지 않음' },
          404: { description: '저장 목록에서 코스를 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/user/courses/recent-courses': {
      get: {
        summary: '사용자 최근 본 코스 목록 조회 (전체 코스 정보 포함)',
        description: '최근 본 코스 목록을 Course 테이블과 JOIN하여 전체 코스 정보와 함께 반환합니다.',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '최근 본 코스 목록 (최신순, 최대 50개, 전체 코스 데이터 포함)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } } },
          401: { description: '인증되지 않음' },
          500: { description: '서버 오류 발생' },
        },
      },
    },
    '/user/courses/recent-courses/{courseId}': {
      put: {
        summary: '코스를 사용자의 최근 본 목록에 추가',
        description: '지정된 코스를 사용자의 최근 본 목록에 추가합니다.',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '추가할 코스의 고유 ID' }],
        responses: {
          200: { description: '코스가 이미 목록에 있습니다.' },
          201: { description: '코스가 성공적으로 추가되었습니다.' },
          400: { description: '파라미터가 누락되었거나 유효하지 않습니다.' },
          401: { description: '인증되지 않음' },
          404: { description: '해당 코스를 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
      delete: {
        summary: '코스를 사용자의 최근 본 목록에서 삭제',
        description: '지정된 코스를 사용자의 최근 본 목록에서 제거합니다.',
        tags: ['User Courses'],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'courseId', required: true, schema: { type: 'string' }, description: '삭제할 코스의 고유 ID' }],
        responses: {
          200: { description: '코스가 성공적으로 삭제되었습니다.' },
          400: { description: '파라미터가 누락되었거나 유효하지 않습니다.' },
          401: { description: '인증되지 않음' },
          404: { description: '목록에서 코스를 찾을 수 없습니다.' },
          500: { description: '서버 오류' },
        },
      },
    },
    '/weather/air-quality': {
      get: {
        summary: '대기질 정보 조회',
        description: '주어진 위도와 경도에 대한 대기질 정보를 조회합니다.',
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lon', schema: { type: 'string' }, required: true, description: '경도', example: '126.9780' },
          { in: 'query', name: 'lat', schema: { type: 'string' }, required: true, description: '위도', example: '37.5665' },
        ],
        responses: {
          200: { description: 'Successful response with air quality data', content: { 'application/json': { schema: { $ref: '#/components/schemas/AirQualityData' } } } },
          400: { description: 'Latitude(lat) and Longitude(lon) are required' },
          401: { description: '인증되지 않음' },
          403: { description: '접근 거부 (유효하지 않은 토큰)' },
          404: { description: 'Could not find nearest station or air quality data' },
          500: { description: 'An error occurred while fetching data' },
        },
      },
    },
    '/weather': {
      get: {
        summary: '날씨 및 대기질 통합 정보 조회',
        description: '주어진 위도와 경도에 대한 날씨와 대기질 정보를 통합하여 조회합니다.',
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lon', schema: { type: 'string' }, required: true, description: '경도', example: '126.9780' },
          { in: 'query', name: 'lat', schema: { type: 'string' }, required: true, description: '위도', example: '37.5665' },
        ],
        responses: {
          200: { description: '날씨 및 대기질 정보가 성공적으로 조회되었습니다.', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntegratedWeatherResponse' } } } },
          400: { description: '위도와 경도는 필수 파라미터입니다.' },
          401: { description: '인증되지 않음' },
          403: { description: '접근 거부 (유효하지 않은 토큰)' },
          500: { description: '데이터를 조회하는 중 오류가 발생했습니다.' },
        },
      },
    },
    '/weather/summary': {
      get: {
        summary: '날씨 요약 정보 조회',
        description: '주어진 위도와 경도에 대한 현재 날씨 요약 정보를 조회합니다.',
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lon', schema: { type: 'string' }, required: true, description: '경도', example: '126.9780' },
          { in: 'query', name: 'lat', schema: { type: 'string' }, required: true, description: '위도', example: '37.5665' },
        ],
        responses: {
          200: { description: '날씨 요약 정보가 성공적으로 조회되었습니다.', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntegratedWeatherResponse' } } } },
          400: { description: '위도와 경도는 필수 파라미터입니다.' },
          401: { description: '인증되지 않음' },
          403: { description: '접근 거부 (유효하지 않은 토큰)' },
          500: { description: '날씨 데이터를 조회하는 중 오류가 발생했습니다.' },
        },
      },
    },
    '/health': {
      get: {
        summary: '서버 상태 확인',
        tags: ['Health'],
        responses: {
          200: {
            description: '서버 정상 작동',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ku-smartwalkingtour API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        spec: ${JSON.stringify(openApiSpec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`;

exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
    body: swaggerUiHtml,
  };
};
