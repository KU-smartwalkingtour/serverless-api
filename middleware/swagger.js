/**
 * Swagger/OpenAPI 설정
 * API 문서화를 위한 스키마 및 설정 정의
 */

const swaggerJsdoc = require('swagger-jsdoc');

/**
 * Swagger 옵션 설정
 */
const swaggerOptions = {
  definition: {
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
                code: {
                  type: 'string',
                  description: '에러 코드',
                  example: 'INVALID_INPUT',
                },
                message: {
                  type: 'string',
                  description: '한글 에러 메시지',
                  example: '입력값이 유효하지 않습니다.',
                },
                details: {
                  type: 'object',
                  description: '추가 에러 정보 (선택사항)',
                  example: { field: 'email', reason: 'invalid format' },
                },
              },
              required: ['code', 'message'],
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: '에러 발생 시각',
              example: '2024-01-15T10:30:00.000Z',
            },
          },
          required: ['error', 'timestamp'],
        },
        UserSavedCourse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            email: {
              type: 'string',
            },
            nickname: {
              type: 'string',
            },
            language: {
              type: 'string',
              default: 'ko',
            },
            distance_unit: {
              type: 'string',
              enum: ['km', 'mi'],
              default: 'km',
            },
            is_active: {
              type: 'boolean',
              default: true,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AuthRefreshToken: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            token_hash: {
              type: 'string',
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
            },
            revoked_at: {
              type: 'string',
              format: 'date-time',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        PasswordResetRequest: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            code: {
              type: 'string',
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
            },
            verified_at: {
              type: 'string',
              format: 'date-time',
            },
            consumed: {
              type: 'boolean',
              default: false,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        UserLocation: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            latitude: {
              type: 'number',
              format: 'decimal',
            },
            longitude: {
              type: 'number',
              format: 'decimal',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        UserStat: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            total_walk_distance_km: {
              type: 'number',
              format: 'decimal',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Course: {
          type: 'object',
          properties: {
            course_id: {
              type: 'string',
              description: '코스 ID',
              example: 'seoultrail_1',
            },
            course_name: {
              type: 'string',
              description: '코스명',
              example: '서울둘레길 1코스',
            },
            course_type: {
              type: 'string',
              enum: ['seoul_trail', 'durunubi'],
              description: '코스 타입',
              example: 'seoul_trail',
            },
            course_length: {
              type: 'number',
              format: 'decimal',
              description: '코스 길이 (km)',
              example: 18.6,
            },
            course_duration: {
              type: 'integer',
              description: '예상 소요 시간 (분)',
              example: 360,
            },
            course_difficulty: {
              type: 'string',
              enum: ['하', '중', '상'],
              description: '난이도',
              example: '중',
            },
            course_description: {
              type: 'string',
              description: '코스 설명',
              example: '개화산과 방화동을 거쳐 길동자연생태공원까지',
            },
            location: {
              type: 'string',
              description: '위치 정보',
              example: '서울시 강서구',
            },
            start_lat: {
              type: 'number',
              format: 'decimal',
              description: '시작 위도',
              example: 37.5665,
            },
            start_lon: {
              type: 'number',
              format: 'decimal',
              description: '시작 경도',
              example: 126.9780,
            },
            road_name_address: {
              type: 'string',
              description: '도로명 주소',
              example: '서울시 강서구 개화동',
            },
            medical_facility_info: {
              type: 'object',
              description: '가장 가까운 의료시설 정보',
              nullable: true,
              properties: {
                name: {
                  type: 'string',
                  description: '의료시설명',
                  example: '서울대학병원',
                },
                address: {
                  type: 'string',
                  description: '주소',
                  example: '서울시 종로구 대학로 101',
                },
                tel_main: {
                  type: 'string',
                  description: '대표 전화번호',
                  example: '02-1234-5678',
                },
                emergency_room_open: {
                  type: 'boolean',
                  description: '응급실 운영 여부',
                  nullable: true,
                  example: true,
                },
                tel_emergency: {
                  type: 'string',
                  description: '응급실 전화번호',
                  nullable: true,
                  example: '02-1234-5679',
                },
                operating_hours: {
                  type: 'object',
                  description: '운영시간',
                  properties: {
                    mon_start: {
                      type: 'string',
                      description: '월요일 시작시간',
                      example: '0900',
                    },
                    mon_end: {
                      type: 'string',
                      description: '월요일 종료시간',
                      example: '1800',
                    },
                    tue_start: {
                      type: 'string',
                      description: '화요일 시작시간',
                      example: '0900',
                    },
                    tue_end: {
                      type: 'string',
                      description: '화요일 종료시간',
                      example: '1800',
                    },
                    wed_start: {
                      type: 'string',
                      description: '수요일 시작시간',
                      example: '0900',
                    },
                    wed_end: {
                      type: 'string',
                      description: '수요일 종료시간',
                      example: '1800',
                    },
                    thu_start: {
                      type: 'string',
                      description: '목요일 시작시간',
                      example: '0900',
                    },
                    thu_end: {
                      type: 'string',
                      description: '목요일 종료시간',
                      example: '1800',
                    },
                    fri_start: {
                      type: 'string',
                      description: '금요일 시작시간',
                      example: '0900',
                    },
                    fri_end: {
                      type: 'string',
                      description: '금요일 종료시간',
                      example: '1800',
                    },
                    sat_start: {
                      type: 'string',
                      description: '토요일 시작시간',
                      nullable: true,
                      example: '0900',
                    },
                    sat_end: {
                      type: 'string',
                      description: '토요일 종료시간',
                      nullable: true,
                      example: '1300',
                    },
                    sun_start: {
                      type: 'string',
                      description: '일요일 시작시간',
                      nullable: true,
                      example: null,
                    },
                    sun_end: {
                      type: 'string',
                      description: '일요일 종료시간',
                      nullable: true,
                      example: null,
                    },
                    hol_start: {
                      type: 'string',
                      description: '공휴일 시작시간',
                      nullable: true,
                      example: null,
                    },
                    hol_end: {
                      type: 'string',
                      description: '공휴일 종료시간',
                      nullable: true,
                      example: null,
                    },
                  },
                },
                distance_from_course_km: {
                  type: 'number',
                  format: 'float',
                  description: '코스로부터의 거리 (km)',
                  example: 2.5,
                },
              },
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              description: 'JWT 액세스 토큰',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              description: '리프레시 토큰',
              example: 'a1b2c3d4e5f6...',
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  format: 'uuid',
                  description: '사용자 ID',
                  example: '123e4567-e89b-12d3-a456-426614174000',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  description: '이메일',
                  example: 'user@example.com',
                },
                nickname: {
                  type: 'string',
                  description: '닉네임',
                  example: '홍길동',
                },
              },
            },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: '이메일 주소',
              example: 'user@example.com',
            },
            nickname: {
              type: 'string',
              description: '닉네임',
              example: '홍길동',
            },
            language: {
              type: 'string',
              description: '선호 언어',
              example: 'ko',
            },
            distance_unit: {
              type: 'string',
              enum: ['km', 'mi'],
              description: '거리 단위',
              example: 'km',
            },
            is_dark_mode_enabled: {
              type: 'boolean',
              description: '다크 모드 활성화 여부',
              example: false,
            },
            allow_location_storage: {
              type: 'boolean',
              description: '위치 정보 저장 허용 여부',
              example: true,
            },
            saved_courses_count: {
              type: 'integer',
              description: '저장한 코스 개수',
              example: 5,
            },
            recent_courses_count: {
              type: 'integer',
              description: '최근 본 코스 개수',
              example: 10,
            },
          },
        },
        MedicalFacility: {
          type: 'object',
          properties: {
            dutyAddr: {
              type: 'string',
              description: '주소',
              example: '서울시 강남구 역삼동 123-45',
            },
            dutyName: {
              type: 'string',
              description: '시설명',
              example: '서울대학병원',
            },
            dutyTel1: {
              type: 'string',
              description: '전화번호',
              example: '02-1234-5678',
            },
            latitude: {
              type: 'number',
              format: 'float',
              description: '위도',
              example: 37.5665,
            },
            longitude: {
              type: 'number',
              format: 'float',
              description: '경도',
              example: 126.9780,
            },
            distance: {
              type: 'number',
              format: 'float',
              description: '사용자로부터의 거리(km)',
              example: 1.5,
            },
          },
        },
        WeatherData: {
          type: 'object',
          properties: {
            temperature: {
              type: 'string',
              description: '기온 (°C)',
              example: '0',
              nullable: true,
            },
            humidity: {
              type: 'string',
              description: '습도 (%)',
              example: '0',
              nullable: true,
            },
            windSpeed: {
              type: 'string',
              description: '풍속 (km/h)',
              example: '0',
              nullable: true,
            },
            precipitation: {
              type: 'string',
              description: '1시간 강수량 (mm)',
              example: '0',
              nullable: true,
            },
            skyCondition: {
              type: 'string',
              description: '하늘 상태 코드 (1:맑음, 3:구름많음, 4:흐림)',
              example: '1',
              nullable: true,
            },
            precipitationType: {
              type: 'string',
              description: '강수 형태 코드 (0:없음, 1:비, 2:비/눈, 3:눈)',
              example: '0',
              nullable: true,
            },
          },
        },
        AirQualityData: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: '대기질 상태 메시지',
              example: '보통 수준의 대기질입니다. 민감한 분들은 주의하세요.',
            },
            pm10: {
              type: 'number',
              description: 'PM10 농도 (μg/m³)',
              example: 30,
              nullable: true,
            },
            pm25: {
              type: 'number',
              description: 'PM2.5 농도 (μg/m³)',
              example: 15,
              nullable: true,
            },
            grade: {
              type: 'number',
              description: '대기질 등급 (1:좋음, 2:보통, 3:나쁨, 4:매우나쁨, 5:극히나쁨)',
              example: 2,
              nullable: true,
            },
          },
        },
        IntegratedWeatherResponse: {
          type: 'object',
          properties: {
            weather: {
              oneOf: [{ $ref: '#/components/schemas/WeatherData' }, { type: 'null' }],
              description: '날씨 정보 (실패 시 null)',
            },
            airQuality: {
              oneOf: [{ $ref: '#/components/schemas/AirQualityData' }, { type: 'null' }],
              description: '대기질 정보 (실패 시 null)',
            },
          },
        },
        CoordinatePoint: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              format: 'float',
              description: '위도',
              example: 37.689050,
            },
            lon: {
              type: 'number',
              format: 'float',
              description: '경도',
              example: 127.045876,
            },
          },
        },
        UserSavedCourse: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            course_id: {
              type: 'string',
            },
            saved_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        UserRecentCourse: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
            },
            course_id: {
              type: 'string',
            },
            viewed_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    servers:
      process.env.NODE_ENV === 'production'
        ? [
            {
              url: process.env.API_SERVER_URL,
              description: '프로덕션 서버',
            },
          ]
        : [
            { url: 'http://localhost:8000', description: '로컬 개발 서버' },
            {
              url: process.env.API_SERVER_URL || 'http://localhost:8000',
              description: 'EC2 프로덕션 서버',
            },
          ],
  },
  apis: ['./routes/**/*.js'], // includes subdirectories
};

/**
 * Swagger 스펙 생성
 */
const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
