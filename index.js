const express = require('express');
require('dotenv').config();
const cookieParser = require('cookie-parser'); // Add this line

const weatherRouter = require('./routes/weather');
const courseRouter = require('./routes/course');

const authRouter = require('./routes/auth');
const userRouter = require('./routes/user'); // Add this line
// 라우터 불러오기
const medicalRouter = require('./routes/medical');

const { log } = require('./utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = 8000;

// Swagger definition
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ku-smartwalkingtour',
      version: '1.0.0',
      description: 'API server for ku-smartwalkingtour',
    },
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
      { url: `http://localhost:${PORT}`, description: 'localhost' },
      { url: `${process.env.API_SERVER_URL}`, description: 'ec2 server' },
    ],
  },
  apis: ['./routes/*.js'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(express.json());
app.use(cookieParser()); // Add this line

const requestLogger = (req, res, next) => {
  log('info', `Request: ${req.method} ${req.url} ${JSON.stringify(req.query)}`);
  next();
};

app.use(requestLogger);

app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Register routes
app.use('/auth', authRouter);
app.use('/weather', weatherRouter);
app.use('/course', courseRouter);
app.use('/user', userRouter); // Add this line

// --- Database Synchronization ---

// Load all models with associations
require('./models');

// 병원 경로 추가(라우팅)
app.use('/medical', medicalRouter);

// Database synchronization
const sequelize = require('./config/database');
// Use { alter: true } in development to avoid dropping data, but be cautious.
// In production, you should use migrations.
const syncOptions = {
  // alter: process.env.NODE_ENV === 'development'
};

sequelize
  .authenticate()
  .then(() => {
    log('info', 'Database connection has been established successfully.');
    // Sync all models
    return sequelize.sync(syncOptions);
  })
  .then(() => {
    app.listen(PORT, () => {
      log('info', `Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    log('error', 'Unable to connect to the database:', err);
    console.error('name:', err.name);
    console.error('message:', err.message);
    console.error('stack:', err.stack);
  });
