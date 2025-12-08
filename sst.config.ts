/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "ku-swt",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-northeast-2",
        },
      },
    };
  },
  async run() {
    // ==========================================================================
    // DynamoDB Tables (기존 테이블 참조)
    // ==========================================================================
    const dynamoDbArns = {
      userTable: "arn:aws:dynamodb:ap-northeast-2:*:table/USER_TABLE",
      authDataTable: "arn:aws:dynamodb:ap-northeast-2:*:table/AUTH_DATA_TABLE",
      courseDataTable: "arn:aws:dynamodb:ap-northeast-2:*:table/COURSE_DATA_TABLE",
      userCourseTable: "arn:aws:dynamodb:ap-northeast-2:*:table/USER_COURSE_TABLE",
    };

    // ==========================================================================
    // Lambda Layer (pre-uploaded to AWS)
    // 수동 업로드: aws lambda publish-layer-version --layer-name ku-swt-common-layer ...
    // ==========================================================================
    const commonLayerArn = "arn:aws:lambda:ap-northeast-2:676206945897:layer:ku-swt-common-layer:3";

    // ==========================================================================
    // Environment Variables
    // ==========================================================================
    const commonEnv = {
      DB_HOST: process.env.DB_HOST!,
      DB_PORT: process.env.DB_PORT || "5432",
      DB_NAME: process.env.DB_NAME!,
      DB_USER: process.env.DB_USER!,
      DB_PASSWORD: process.env.DB_PASSWORD!,
    };

    const authEnv = {
      ...commonEnv,
      JWT_SECRET: process.env.JWT_SECRET!,
    };

    const weatherEnv = {
      ...commonEnv,
      KMA_API_KEY: process.env.KMA_API_KEY!,
    };

    const coursesEnv = {
      ...commonEnv,
      DURUNUBI_SERVICE_KEY: process.env.DURUNUBI_SERVICE_KEY!,
      SEOUL_TRAIL_API_KEY: process.env.SEOUL_TRAIL_API_KEY!,
    };

    const medicalEnv = {
      ...commonEnv,
      NMC_HOSPITAL_ENDPOINT:
        process.env.NMC_HOSPITAL_ENDPOINT ||
        "http://apis.data.go.kr/B551182/hospInfoServicev2",
      NMC_HOSPITAL_KEY: process.env.NMC_HOSPITAL_KEY!,
    };

    // ==========================================================================
    // Lambda Function Common Settings (for Layer external modules)
    // ==========================================================================
    const nodejsConfig = {
      format: "cjs" as const,
      esbuild: {
        external: [
          "/opt/nodejs/utils/*",
          "/opt/nodejs/services/*",
          "/opt/nodejs/config/*",
          "/opt/nodejs/models/*",
        ],
      },
    };

    // ==========================================================================
    // DynamoDB Access Permission
    // ==========================================================================
    const dynamoDbPermissions = {
      actions: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
      ],
      resources: [
        dynamoDbArns.userTable,
        dynamoDbArns.authDataTable,
        dynamoDbArns.courseDataTable,
        dynamoDbArns.userCourseTable,
        `${dynamoDbArns.userTable}/index/*`,
        `${dynamoDbArns.authDataTable}/index/*`,
        `${dynamoDbArns.courseDataTable}/index/*`,
        `${dynamoDbArns.userCourseTable}/index/*`,
      ],
    };

    // ==========================================================================
    // API Gateway
    // ==========================================================================
    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"],
      },
    });

    // Lambda Authorizer 설정
    const jwtAuth = api.addAuthorizer({
      name: "jwt-authorizer",
      lambda: {
        function: {
          handler: "src/functions/authorizer/index.handler",
          layers: [commonLayerArn],
          memory: "128 MB",
          timeout: "5 seconds",
          permissions: [dynamoDbPermissions],
          environment: {
            JWT_SECRET: process.env.JWT_SECRET!,
          },
          nodejs: nodejsConfig,
        },
      },
    });

    // ==========================================================================
    // Auth Routes (No Auth Required)
    // ==========================================================================
    api.route("POST /auth/register", {
      handler: "src/functions/auth/register/index.handler",
      layers: [commonLayerArn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    api.route("POST /auth/login", {
      handler: "src/functions/auth/login/index.handler",
      layers: [commonLayerArn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    api.route("POST /auth/refresh-token", {
      handler: "src/functions/auth/refresh-token/index.handler",
      layers: [commonLayerArn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    api.route("POST /auth/forgot-password/send", {
      handler: "src/functions/auth/forgot-password-send/index.handler",
      layers: [commonLayerArn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    api.route("POST /auth/forgot-password/verify", {
      handler: "src/functions/auth/forgot-password-verify/index.handler",
      layers: [commonLayerArn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    // ==========================================================================
    // Auth Routes (Auth Required)
    // ==========================================================================
    api.route(
      "POST /auth/logout",
      {
        handler: "src/functions/auth/logout/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // Weather Routes
    // ==========================================================================
    api.route(
      "GET /weather",
      {
        handler: "src/functions/weather/integrated/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /weather/summary",
      {
        handler: "src/functions/weather/summary/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /weather/airquality",
      {
        handler: "src/functions/weather/airquality/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // Courses Routes
    // ==========================================================================
    api.route(
      "GET /courses/home",
      {
        handler: "src/functions/courses/home/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /courses/course",
      {
        handler: "src/functions/courses/list/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /courses/{courseId}",
      {
        handler: "src/functions/courses/detail/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /courses/{courseId}/coordinates",
      {
        handler: "src/functions/courses/coordinates/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // User Routes
    // ==========================================================================
    api.route(
      "GET /user/profile",
      {
        handler: "src/functions/user/profile/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "PATCH /user/settings",
      {
        handler: "src/functions/user/settings/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "PATCH /user/password",
      {
        handler: "src/functions/user/password/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "DELETE /user/withdraw",
      {
        handler: "src/functions/user/withdraw/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // User Coordinates & Stats Routes
    // ==========================================================================
    api.route(
      "PUT /user/coordinates",
      {
        handler: "src/functions/user/coordinates/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /user/stats",
      {
        handler: "src/functions/user/stats/get/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "POST /user/stats/walk",
      {
        handler: "src/functions/user/stats/walk/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // User Saved Courses Routes
    // ==========================================================================
    api.route(
      "GET /user/courses/saved-courses",
      {
        handler: "src/functions/user/saved-courses/get/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "PUT /user/courses/saved-courses/{courseId}",
      {
        handler: "src/functions/user/saved-courses/save/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "DELETE /user/courses/saved-courses/{courseId}",
      {
        handler: "src/functions/user/saved-courses/delete/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // User Recent Courses Routes
    // ==========================================================================
    api.route(
      "GET /user/courses/recent-courses",
      {
        handler: "src/functions/user/recent-courses/get/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "PUT /user/courses/recent-courses/{courseId}",
      {
        handler: "src/functions/user/recent-courses/add/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "DELETE /user/courses/recent-courses/{courseId}",
      {
        handler: "src/functions/user/recent-courses/delete/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // Medical Routes
    // ==========================================================================
    api.route(
      "GET /medical/search",
      {
        handler: "src/functions/medical/search/index.handler",
        layers: [commonLayerArn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: medicalEnv,
        nodejs: nodejsConfig,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    // ==========================================================================
    // Health Check (No Auth Required)
    // ==========================================================================
    api.route("GET /health", {
      handler: "src/functions/health/index.handler",
      layers: [commonLayerArn],
      memory: "128 MB",
      timeout: "5 seconds",
      nodejs: nodejsConfig,
    });

    // ==========================================================================
    // API Documentation (No Auth Required)
    // ==========================================================================
    api.route("GET /api-docs", {
      handler: "src/functions/docs/index.handler",
      memory: "128 MB",
      timeout: "5 seconds",
      nodejs: nodejsConfig,
    });

    api.route("GET /api-docs/json", {
      handler: "src/functions/docs/json.handler",
      memory: "128 MB",
      timeout: "5 seconds",
      nodejs: nodejsConfig,
    });

    // ==========================================================================
    // CloudWatch Alarms (Production Only)
    // ==========================================================================
    if ($app.stage === "production") {
      // SNS Topic for alarm notifications
      const alarmTopic = new sst.aws.SnsTopic("AlarmTopic");

      // API Gateway 5xx Error Alarm
      new aws.cloudwatch.MetricAlarm("Api5xxAlarm", {
        alarmName: "ku-swt-api-5xx-errors",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "5XXError",
        namespace: "AWS/ApiGateway",
        period: 300,
        statistic: "Sum",
        threshold: 10,
        alarmDescription: "API Gateway 5xx errors exceeded threshold",
        dimensions: {
          ApiId: api.nodes.api.id,
        },
        alarmActions: [alarmTopic.arn],
      });

      // API Gateway 4xx Error Alarm
      new aws.cloudwatch.MetricAlarm("Api4xxAlarm", {
        alarmName: "ku-swt-api-4xx-errors",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "4XXError",
        namespace: "AWS/ApiGateway",
        period: 300,
        statistic: "Sum",
        threshold: 100,
        alarmDescription: "API Gateway 4xx errors exceeded threshold",
        dimensions: {
          ApiId: api.nodes.api.id,
        },
        alarmActions: [alarmTopic.arn],
      });

      // API Gateway Latency Alarm
      new aws.cloudwatch.MetricAlarm("ApiLatencyAlarm", {
        alarmName: "ku-swt-api-high-latency",
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 2,
        metricName: "Latency",
        namespace: "AWS/ApiGateway",
        period: 300,
        statistic: "Average",
        threshold: 3000,
        alarmDescription: "API Gateway average latency exceeded 3 seconds",
        dimensions: {
          ApiId: api.nodes.api.id,
        },
        alarmActions: [alarmTopic.arn],
      });
    }

    // ==========================================================================
    // Outputs
    // ==========================================================================
    return {
      api: api.url,
    };
  },
});
