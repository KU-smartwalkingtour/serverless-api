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
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            email: {
              type: 'string'
            },
            nickname: {
              type: 'string'
            },
            language: {
              type: 'string',
              default: 'ko'
            },
            distance_unit: {
              type: 'string',
              enum: ['km', 'mi'],
              default: 'km'
            },
            is_active: {
              type: 'boolean',
              default: true
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        AuthRefreshToken: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            token_hash: {
              type: 'string'
            },
            expires_at: {
              type: 'string',
              format: 'date-time'
            },
            revoked_at: {
              type: 'string',
              format: 'date-time'
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        PasswordResetRequest: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            code: {
              type: 'string'
            },
            expires_at: {
              type: 'string',
              format: 'date-time'
            },
            verified_at: {
              type: 'string',
              format: 'date-time'
            },
            consumed: {
              type: 'boolean',
              default: false
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserLocation: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            latitude: {
              type: 'number',
              format: 'decimal'
            },
            longitude: {
              type: 'number',
              format: 'decimal'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserStat: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            total_walk_distance_km: {
              type: 'number',
              format: 'decimal'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Course: {
          type: 'object',
          properties: {
            course_id: {
              type: 'string'
            },
            course_name: {
              type: 'string'
            },
            course_type: {
              type: 'string',
              enum: ['seoul_trail', 'durunubi']
            },
            course_length: {
              type: 'number',
              format: 'decimal'
            },
            course_duration: {
              type: 'integer'
            },
            course_difficulty: {
              type: 'string',
              enum: ['하', '중', '상']
            },
            course_description: {
              type: 'string'
            },
            location: {
              type: 'string'
            },
            start_lat: {
              type: 'number',
              format: 'decimal'
            },
            start_lon: {
              type: 'number',
              format: 'decimal'
            }
          }
        },
        UserSavedCourse: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            course_id: {
              type: 'string'
            },
            saved_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserRecentCourse: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            course_id: {
              type: 'string'
            },
            viewed_at: {
              type: 'string',
              format: 'date-time'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
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
