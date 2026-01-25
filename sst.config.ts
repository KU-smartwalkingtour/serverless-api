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
    // Cognito User Pool
    // ==========================================================================
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      usernames: ["email"],
      transform: {
        userPool: {
          autoVerifiedAttributes: [],
          // SES 이용하여 이메일 보내기 
          // https://www.pulumi.com/registry/packages/aws/api-docs/cognito/userpool/#userpoolemailconfiguration
          emailConfiguration: {
            emailSendingAccount: "DEVELOPER",
            fromEmailAddress: "KU 둘레길 <no-reply@ku-smartwalkingtour.site>",
            sourceArn: `arn:aws:ses:ap-northeast-2:${process.env.AWS_ACCOUNT_ID!}:identity/ku-smartwalkingtour.site`
          },
        },
      },
    });

    const userPoolClient = userPool.addClient("UserPoolClient", {
      transform: {
        client: {
          explicitAuthFlows: [
            "ALLOW_USER_PASSWORD_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
          ],
        },
      },
    });

    // ==========================================================================
    // Environment Variables
    // ==========================================================================
    const commonEnv = {
      // JWT_SECRET // removed as we use Cognito Authorizer
    };

    const authEnv = {
      ...commonEnv,
      COGNITO_USER_POOL_ID: userPool.id,
      COGNITO_CLIENT_ID: userPoolClient.id,
    };

    const weatherEnv = {
      ...commonEnv,
      KMA_API_KEY: process.env.KMA_API_KEY!,
      AIRKOREA_API_KEY: process.env.AIRKOREA_API_KEY!,
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
    // Lambda Function Common Settings
    // ==========================================================================
    const nodejsConfig = {
      format: "cjs" as const,
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
    // Cognito Permission
    // ==========================================================================
    const cognitoPermissions = {
      actions: ["cognito-idp:*"],
      resources: ["*"],
    };

    // ==========================================================================
    // SES Permission (Email)
    // ==========================================================================
    const sesPermissions = {
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
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

    // ==========================================================================
    // S3 Permission (GPX Storage)
    // ==========================================================================
    const s3Permissions = {
      actions: ["s3:GetObject"], // 읽기 권한 (필요시 s3:PutObject 등 추가)
      resources: [
        "arn:aws:s3:::ku-smartwalkingtour-seoultrail-gpxstorage-bucket",
        "arn:aws:s3:::ku-smartwalkingtour-seoultrail-gpxstorage-bucket/*" 
      ],
    };

    // Cognito Authorizer 설정
    const jwtAuth = api.addAuthorizer({
      name: "user-pool-authorizer",
      jwt: {
        audiences: [userPoolClient.id],
        issuer: $interpolate`https://cognito-idp.ap-northeast-2.amazonaws.com/${userPool.id}`,
      },
    });

    // ==========================================================================
    // Domain Functions
    // ==========================================================================
    
    // Auth Function
    const authFunction = new sst.aws.Function("AuthFunction", {
      handler: "src/functions/auth/index.handler",
      memory: "256 MB" as const,
      timeout: "10 seconds" as const,
      permissions: [dynamoDbPermissions, sesPermissions, cognitoPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    // Weather Function
    const weatherFunction = new sst.aws.Function("WeatherFunction", {
      handler: "src/functions/weather/index.handler",
      memory: "256 MB" as const,
      timeout: "15 seconds" as const,
      permissions: [dynamoDbPermissions],
      environment: weatherEnv,
      nodejs: nodejsConfig,
    });

    // Courses Function
    const coursesFunction = new sst.aws.Function("CoursesFunction", {
      handler: "src/functions/courses/index.handler",
      memory: "256 MB" as const,
      timeout: "10 seconds" as const,
      permissions: [dynamoDbPermissions, s3Permissions],
      environment: coursesEnv,
      nodejs: nodejsConfig,
    });

    // User Function
    const userFunction = new sst.aws.Function("UserFunction", {
      handler: "src/functions/user/index.handler",
      memory: "256 MB" as const,
      timeout: "10 seconds" as const,
      permissions: [dynamoDbPermissions],
      environment: authEnv,
      nodejs: nodejsConfig,
    });

    // Medical Function
    const medicalFunction = new sst.aws.Function("MedicalFunction", {
      handler: "src/functions/medical/index.handler",
      memory: "256 MB" as const,
      timeout: "15 seconds" as const,
      permissions: [dynamoDbPermissions],
      environment: medicalEnv,
      nodejs: nodejsConfig,
    });

    // ==========================================================================
    // Auth Routes
    // ==========================================================================
    api.route("POST /auth/register", authFunction.arn);
    api.route("POST /auth/login", authFunction.arn);
    api.route("POST /auth/refresh-token", authFunction.arn);
    api.route("POST /auth/forgot-password/send", authFunction.arn);
    api.route("POST /auth/forgot-password/verify", authFunction.arn);

    api.route(
      "POST /auth/logout",
      authFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // Weather Routes
    // ==========================================================================
    api.route(
      "GET /weather",
      weatherFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /weather/summary",
      weatherFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /weather/airquality",
      weatherFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // Courses Routes
    // ==========================================================================
    api.route(
      "GET /courses/home",
      coursesFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /courses/course",
      coursesFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /courses/{courseId}",
      coursesFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /courses/{courseId}/coordinates",
      coursesFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // User Routes
    // ==========================================================================
    api.route(
      "GET /user/profile",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "PATCH /user/settings",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "PATCH /user/password",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "DELETE /user/withdraw",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // User Coordinates & Stats Routes
    // ==========================================================================
    api.route(
      "PUT /user/coordinates",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "GET /user/stats",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "POST /user/stats/walk",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // User Saved Courses Routes
    // ==========================================================================
    api.route(
      "GET /user/courses/saved-courses",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "PUT /user/courses/saved-courses/{courseId}",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "DELETE /user/courses/saved-courses/{courseId}",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // User Recent Courses Routes
    // ==========================================================================
    api.route(
      "GET /user/courses/recent-courses",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "PUT /user/courses/recent-courses/{courseId}",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    api.route(
      "DELETE /user/courses/recent-courses/{courseId}",
      userFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // Medical Routes
    // ==========================================================================
    api.route(
      "GET /medical/search",
      medicalFunction.arn,
      {
        auth: {
          jwt: {
            authorizer: jwtAuth.id,
          },
        },
      }
    );

    // ==========================================================================
    // Health Check (No Auth Required)
    // ==========================================================================
    api.route("GET /health", {
      handler: "src/functions/health/index.handler",
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
        name: "ku-swt-api-5xx-errors",
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
        name: "ku-swt-api-4xx-errors",
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
        name: "ku-swt-api-high-latency",
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
