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
    // DynamoDB Tables
    // ==========================================================================
    const userTable = new sst.aws.Dynamo("UserTable", {
      fields: {
        user_id: "string",
        sort_key: "string",
        email: "string",
      },
      primaryIndex: { hashKey: "user_id", rangeKey: "sort_key" },
      globalIndexes: {
        EmailIndex: { hashKey: "email" },
      },
      transform: {
        table: {
          name: "USER_TABLE",
        },
      },
    });

    const authDataTable = new sst.aws.Dynamo("AuthDataTable", {
      fields: {
        user_id: "string",
        sort_key: "string",
        token_hash: "string",
      },
      primaryIndex: { hashKey: "user_id", rangeKey: "sort_key" },
      globalIndexes: {
        TokenHashIndex: { hashKey: "token_hash" },
      },
      transform: {
        table: {
          name: "AUTH_DATA_TABLE",
        },
      },
    });

    const courseDataTable = new sst.aws.Dynamo("CourseDataTable", {
      fields: {
        course_id: "string",
      },
      primaryIndex: { hashKey: "course_id" },
      transform: {
        table: {
          name: "COURSE_DATA_TABLE",
        },
      },
    });

    const userCourseTable = new sst.aws.Dynamo("UserCourseTable", {
      fields: {
        user_id: "string",
        sort_key: "string",
        saved_at: "string",
        updated_at: "string",
      },
      primaryIndex: { hashKey: "user_id", rangeKey: "sort_key" },
      globalIndexes: {
        usercourse_saved_at_index: { hashKey: "user_id", rangeKey: "saved_at" },
        usercourse_updated_at_index: { hashKey: "user_id", rangeKey: "updated_at" },
      },
      transform: {
        table: {
          name: "USER_COURSE_TABLE",
        },
      },
    });

    // ==========================================================================
    // Lambda Layer (using Pulumi aws provider)
    // ==========================================================================
    const commonLayer = new aws.lambda.LayerVersion("CommonLayer", {
      layerName: "ku-swt-common-layer",
      compatibleRuntimes: ["nodejs20.x"],
      code: new $util.asset.FileArchive("src/layers/common"),
    });

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
        userTable.arn,
        authDataTable.arn,
        courseDataTable.arn,
        userCourseTable.arn,
        $interpolate`${userTable.arn}/index/*`,
        $interpolate`${authDataTable.arn}/index/*`,
        $interpolate`${courseDataTable.arn}/index/*`,
        $interpolate`${userCourseTable.arn}/index/*`,
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
          layers: [commonLayer.arn],
          memory: "128 MB",
          timeout: "5 seconds",
          permissions: [dynamoDbPermissions],
          environment: {
            JWT_SECRET: process.env.JWT_SECRET!,
          },
        },
      },
    });

    // ==========================================================================
    // Auth Routes (No Auth Required)
    // ==========================================================================
    api.route("POST /auth/register", {
      handler: "src/functions/auth/register/index.handler",
      layers: [commonLayer.arn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
    });

    api.route("POST /auth/login", {
      handler: "src/functions/auth/login/index.handler",
      layers: [commonLayer.arn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
    });

    api.route("POST /auth/refresh-token", {
      handler: "src/functions/auth/refresh-token/index.handler",
      layers: [commonLayer.arn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
    });

    api.route("POST /auth/forgot-password/send", {
      handler: "src/functions/auth/forgot-password-send/index.handler",
      layers: [commonLayer.arn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
    });

    api.route("POST /auth/forgot-password/verify", {
      handler: "src/functions/auth/forgot-password-verify/index.handler",
      layers: [commonLayer.arn],
      memory: "256 MB",
      timeout: "10 seconds",
      permissions: [dynamoDbPermissions],
      environment: authEnv,
    });

    // ==========================================================================
    // Auth Routes (Auth Required)
    // ==========================================================================
    api.route(
      "POST /auth/logout",
      {
        handler: "src/functions/auth/logout/index.handler",
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
      },
      {
        auth: {
          lambda: jwtAuth.id,
        },
      }
    );

    api.route(
      "GET /weather/air-quality",
      {
        handler: "src/functions/weather/airquality/index.handler",
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: weatherEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: coursesEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "10 seconds",
        permissions: [dynamoDbPermissions],
        environment: authEnv,
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
        layers: [commonLayer.arn],
        memory: "256 MB",
        timeout: "15 seconds",
        permissions: [dynamoDbPermissions],
        environment: medicalEnv,
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
      layers: [commonLayer.arn],
      memory: "128 MB",
      timeout: "5 seconds",
    });

    // ==========================================================================
    // Outputs
    // ==========================================================================
    return {
      api: api.url,
    };
  },
});
