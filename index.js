const express = require('express');
require('dotenv').config();
const weatherRouter = require('./routes/weather');
const authRouter = require('./routes/auth'); // Add this line
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
    components: { // Add this section for auth
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [ // Add this section to apply auth globally
      {
        bearerAuth: [],
      },
    ],
    servers: [
      { url: `http://localhost:${PORT}`, description: 'localhost'},
      { url: `${process.env.API_SERVER_URL}:${PORT}`, description: 'ec2 server'},
    ],
  },
  apis: ['./routes/*.js'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(express.json()); // Add this line to parse JSON bodies

const requestLogger = (req, res, next) => {
  log('info', `Request: ${req.method} ${req.url} ${JSON.stringify(req.query)}`);
  next();
};

app.use(requestLogger);

app.get('/', (req, res) => {
  res.send('Hello, World from Node.js!');
});

app.use('/api/auth', authRouter); // Add this line
app.use('/api/weather', weatherRouter);

// Database synchronization
const sequelize = require('./config/database');
sequelize.authenticate()
  .then(() => {
    log('info', 'Database connection has been established successfully.');
    return sequelize.sync(); // Sync all models
  })
  .then(() => {
    app.listen(PORT, () => {
      log('info', `Server is running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    log('error', 'Unable to connect to the database:', err);
  });