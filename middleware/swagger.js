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
        UserSavedCourse: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
              description: '사용자 고유 ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            provider: {
              type: 'string',
              description: '코스 제공자',
              enum: ['seoul_trail', 'durunubi'],
              example: 'seoul_trail',
            },
            provider_course_id: {
              type: 'string',
              description: '제공자별 코스 고유 ID',
              example: 'seoul_trail_001',
            },
            saved_at: {
              type: 'string',
              format: 'date-time',
              description: '코스 저장 시간',
              example: '2024-01-15T10:30:00.000Z',
            },
          },
          required: ['user_id', 'provider', 'provider_course_id'],
        },
        UserCourseHistory: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: '히스토리 고유 ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: '사용자 고유 ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            provider: {
              type: 'string',
              description: '코스 제공자',
              example: 's3',
            },
            provider_course_id: {
              type: 'string',
              description: '제공자별 코스 고유 ID',
              example: 'seoul_trail_001',
            },
            viewed_at: {
              type: 'string',
              format: 'date-time',
              description: '코스 조회 시간',
              example: '2024-01-15T10:30:00.000Z',
            },
          },
          required: ['id', 'user_id', 'provider', 'provider_course_id'],
        },
        UserStat: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid',
              description: '사용자 고유 ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            total_walk_distance_km: {
              type: 'number',
              format: 'float',
              description: '총 걷기 거리 (킬로미터)',
              example: 42.5,
              minimum: 0,
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: '마지막 업데이트 시간',
              example: '2024-01-15T10:30:00.000Z',
            },
          },
          required: ['user_id', 'total_walk_distance_km'],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    servers: [
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
