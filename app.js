const express = require('express');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const { logger } = require('@utils/logger');
const swaggerSpec = require('@middleware/swagger');

// Import routers
const weatherRouter = require('@routes/weather');
const courseRouter = require('@routes/course');
const authRouter = require('@routes/auth');
const userRouter = require('@routes/user');
const medicalRouter = require('@routes/medical');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Swagger JSON 스펙 엔드포인트 (Swagger UI보다 먼저 등록)
app.get('/api-docs/json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

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
