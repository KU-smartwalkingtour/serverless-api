const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../config/dynamodb');
const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');
const {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
} = require('../utils/validation');

// process.env.AWS_REGION
const client = new CognitoIdentityProviderClient({ region: "ap-northeast-2" });

const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

// Helper to map Cognito errors to ServerError
const handleCognitoError = (err) => {
  logger.error('Cognito Error', { name: err.name, message: err.message });
  switch (err.name) {
    case 'UsernameExistsException':
      throw new ServerError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
    case 'UserNotFoundException':
      throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
    case 'NotAuthorizedException':
      throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401, { message: '아이디 또는 비밀번호가 잘못되었습니다.' });
    case 'CodeMismatchException':
      throw new ServerError(ERROR_CODES.INVALID_VERIFICATION_CODE, 400);
    case 'ExpiredCodeException':
      throw new ServerError(ERROR_CODES.INVALID_VERIFICATION_CODE, 400, { message: '인증 코드가 만료되었습니다.' });
    case 'LimitExceededException':
      throw new ServerError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429);
    case 'InvalidParameterException':
        throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, { message: err.message });
    case 'UserNotConfirmedException':
        throw new ServerError(ERROR_CODES.UNAUTHORIZED, 401, { message: '이메일 인증이 완료되지 않았습니다.' });
    default:
      throw new ServerError(ERROR_CODES.UNEXPECTED_ERROR, 500, { originalError: err.message });
  }
};

async function register(body) {
  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, password, nickname } = body;

  try {
    // 1. Sign up with Cognito
    const signUpCommand = new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'nickname', Value: nickname || '' },
      ],
    });

    const signUpResponse = await client.send(signUpCommand);
    const userSub = signUpResponse.UserSub;

    // 2. Auto-confirm user and mark email as verified (Admin bypass)
    try {
      await client.send(new AdminConfirmSignUpCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
      }));
      
      await client.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email_verified', Value: 'true' }
        ]
      }));

      logger.info('User auto-confirmed and email verified via Admin commands', { email });
    } catch (confirmErr) {
      logger.error('Failed to auto-confirm user or verify email', { error: confirmErr.message, email });
    }

    // 3. Save user profile to DynamoDB "USER" Table
    const now = new Date().toISOString();
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USER,
        Item: {
          user_id: userSub,
          sort_key: 'USER_INFO_ITEM',
          email,
          nickname: nickname || null,
          is_active: true,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          language: 'ko',
          distance_unit: 'km',
          is_dark_mode_enabled: false,
          allow_location_storage: false,
        },
        ConditionExpression: 'attribute_not_exists(user_id)',
      })
    );

    logger.info('User registered in Cognito and DynamoDB', { userId: userSub, email });

    return {
      message: '회원가입이 완료되었습니다.',
      user: { id: userSub, email, nickname },
      userConfirmed: true, 
    };

  } catch (err) {
    handleCognitoError(err);
  }
}

async function login(body) {
  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, password } = body;

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await client.send(command);
    const result = response.AuthenticationResult;
    
    // Fetch user profile from DynamoDB to return consistent response structure
    // We need the userSub (from IdToken or AccessToken) but we don't parse it here easily without a library.
    // Instead, we query by email index to get the user profile.
    const { Items: users } = await docClient.send(
        new QueryCommand({
          TableName: TABLES.USER,
          IndexName: 'EmailIndex',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email },
        })
      );
    
    const userProfile = users && users.length > 0 ? users[0] : null;

    logger.info('User logged in via Cognito', { email });

    return {
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken,
      idToken: result.IdToken,
      expiresIn: result.ExpiresIn,
      user: userProfile ? {
          id: userProfile.user_id,
          email: userProfile.email,
          nickname: userProfile.nickname
      } : { email } // Fallback if DB sync failed or pending
    };

  } catch (err) {
    handleCognitoError(err);
  }
}

async function refreshToken(body) {
  const validation = refreshTokenSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { refreshToken } = body;

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const response = await client.send(command);
    const result = response.AuthenticationResult;

    logger.info('Token refreshed via Cognito');

    return {
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      expiresIn: result.ExpiresIn,
      // Cognito may not return a new Refresh Token unless the old one is rotating
      refreshToken: result.RefreshToken || undefined 
    };

  } catch (err) {
    handleCognitoError(err);
  }
}

async function logout(accessToken) {
  if (!accessToken) {
      // If no access token is provided, we can't globally sign out via API.
      // Client should just discard tokens.
      return { message: '로그아웃 되었습니다. (클라이언트 토큰 삭제 필요)' };
  }

  try {
    const command = new GlobalSignOutCommand({
      AccessToken: accessToken,
    });

    await client.send(command);
    logger.info('User globally signed out from Cognito');
    return { message: '로그아웃이 성공적으로 완료되었습니다.' };

  } catch (err) {
    // If token is invalid/expired, we still consider it "logged out" for the client
    logger.warn('Logout failed (token might be invalid)', { error: err.message });
    return { message: '로그아웃 되었습니다.' };
  }
}

async function forgotPasswordSend(body) {
  const validation = forgotPasswordSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email } = body;

  try {
    const command = new ForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
    });

    await client.send(command);
    logger.info('Password reset code sent via Cognito', { email });
    return { message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' };

  } catch (err) {
    handleCognitoError(err);
  }
}

async function forgotPasswordVerify(body) {
  const { z } = require('zod');
  const verifySchema = forgotPasswordSchema.extend({
    code: z.string().min(1, '인증 코드를 입력해주세요.'),
    newPassword: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
  });

  const validation = verifySchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, code, newPassword } = body;

  try {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    });

    await client.send(command);
    logger.info('Password reset confirmed via Cognito', { email });
    return { message: '비밀번호가 성공적으로 재설정되었습니다.' };

  } catch (err) {
    handleCognitoError(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  forgotPasswordSend,
  forgotPasswordVerify,
};