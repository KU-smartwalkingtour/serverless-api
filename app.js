const express = require('express');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { logger } = require('@utils/logger');

// Import routers
const weatherRouter = require('@routes/weather');
const courseRouter = require('@routes/course');
const authRouter = require('@routes/auth');
const userRouter = require('@routes/user');
const medicalRouter = require('@routes/medical');

const app = express();

// Swagger configuration
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
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    servers: [
      { url: 'http://localhost:8000', description: '로컬 개발 서버' },
      { url: process.env.API_SERVER_URL || 'http://localhost:8000', description: 'EC2 프로덕션 서버' },
    ],
  },
  apis: ['./routes/**/*.js'], // includes subdirectories
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Request logger middleware
const requestLogger = (req, res, next) => {
  logger.info(`요청: ${req.method} ${req.url} ${JSON.stringify(req.query)}`);
  next();
};

app.use(requestLogger);

// Root redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register routes
app.use('/auth', authRouter);
app.use('/weather', weatherRouter);
app.use('/course', courseRouter);
app.use('/user', userRouter);
app.use('/medical', medicalRouter);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: '요청한 경로를 찾을 수 없습니다.', path: req.path });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  logger.error(`오류 발생: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message || '내부 서버 오류가 발생했습니다.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
