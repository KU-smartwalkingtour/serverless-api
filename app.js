const express = require('express');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const { logger } = require('@utils/logger');
const { ServerError, ERROR_CODES } = require('@utils/error');
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
  const error = new ServerError(ERROR_CODES.RESOURCE_NOT_FOUND, 404, { path: req.path });
  res.status(error.statusCode).json(error.toJSON());
});

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  // ServerError인 경우 그대로 반환
  if (ServerError.isServerError(err)) {
    logger.error(`ServerError 발생: ${err.code}`, {
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
    });
    return res.status(err.statusCode).json(err.toJSON());
  }

  // 일반 에러인 경우
  logger.error(`예상치 못한 오류 발생: ${err.message}`, {
    stack: err.stack,
    path: req.path,
  });

  const serverError = new ServerError(
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    err.status || 500,
    process.env.NODE_ENV === 'development' ? { originalError: err.message, stack: err.stack } : {},
  );

  res.status(serverError.statusCode).json(serverError.toJSON());
});

module.exports = app;
