const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../config/dynamodb');
const { logger } = require('../utils/logger');
const { ServerError, ERROR_CODES } = require('../utils/error');
const { generateTokens, hashToken } = require('../utils/auth');
const { sendPasswordResetEmail } = require('../utils/sendEmail');
const {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
} = require('../utils/validation');

const BCRYPT_SALT_ROUNDS = 10;
const CODE_EXPIRY_MINUTES = 10;
const RATE_LIMIT_MINUTES = 5;

const sanitizeUser = (user) => ({
  id: user.user_id || user.id,
  email: user.email,
  nickname: user.nickname,
});

async function register(body) {
  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, password, nickname } = body;

  const { Items: existingUsers } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  if (existingUsers && existingUsers.length > 0) {
    logger.warn('Registration failed: email already exists', { email });
    throw new ServerError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
  }

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const now = new Date().toISOString();

  const { accessToken, refreshToken, refreshTokenPayload } =
    await generateTokens({ id: userId, email, nickname });

  const transactItems = [
    {
      Put: {
        TableName: TABLES.USER,
        Item: {
          user_id: userId,
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
      },
    },
    {
      Put: {
        TableName: TABLES.AUTH_DATA,
        Item: {
          user_id: userId,
          sort_key: 'PASSWORD_ITEM',
          password_hash: passwordHash,
          created_at: now,
          updated_at: now,
        },
      },
    },
    {
      Put: {
        TableName: TABLES.AUTH_DATA,
        Item: refreshTokenPayload,
      },
    },
  ];

  await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

  logger.info('User registered', { userId, email });

  return {
    accessToken,
    refreshToken,
    user: { id: userId, email, nickname },
  };
}

async function login(body) {
  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, password } = body;

  const { Items: users } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  const userProfile = users && users.length > 0 ? users[0] : null;

  if (!userProfile || userProfile.is_active === false) {
    logger.warn('Login failed: user not found or inactive', { email });
    throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
  }

  const userId = userProfile.user_id;

  const { Item: authData } = await docClient.send(
    new GetCommand({
      TableName: TABLES.AUTH_DATA,
      Key: { user_id: userId, sort_key: 'PASSWORD_ITEM' },
    })
  );

  if (!authData || !authData.password_hash) {
    logger.warn('Login failed: no password data', { userId });
    throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
  }

  const isPasswordValid = await bcrypt.compare(password, authData.password_hash);
  if (!isPasswordValid) {
    logger.warn('Login failed: password mismatch', { userId, email });
    throw new ServerError(ERROR_CODES.INVALID_CREDENTIALS, 401);
  }

  const { accessToken, refreshToken, refreshTokenPayload } =
    await generateTokens({
      id: userId,
      email: userProfile.email,
      nickname: userProfile.nickname,
    });

  await docClient.send(
    new PutCommand({
      TableName: TABLES.AUTH_DATA,
      Item: refreshTokenPayload,
    })
  );

  logger.info('User logged in', { userId, email });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(userProfile),
  };
}

async function logout(userId) {
  const { Items: activeTokens } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.AUTH_DATA,
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      FilterExpression: 'attribute_not_exists(revoked_at)',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':prefix': 'TOKEN#',
      },
    })
  );

  let invalidatedCount = 0;

  if (activeTokens && activeTokens.length > 0) {
    const updatePromises = activeTokens.map((token) =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLES.AUTH_DATA,
          Key: { user_id: userId, sort_key: token.sort_key },
          UpdateExpression: 'set revoked_at = :now',
          ExpressionAttributeValues: { ':now': new Date().toISOString() },
        })
      )
    );

    await Promise.all(updatePromises);
    invalidatedCount = activeTokens.length;
  }

  logger.info('User logged out', { userId, invalidatedCount });
  return { message: '로그아웃이 성공적으로 완료되었습니다.' };
}

async function refreshToken(body) {
  const validation = refreshTokenSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { refreshToken } = body;
  const requestTokenHash = hashToken(refreshToken);

  const { Items: tokens } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.AUTH_DATA,
      IndexName: 'TokenHashIndex',
      KeyConditionExpression: 'token_hash = :hash',
      FilterExpression: 'attribute_not_exists(revoked_at) AND expires_at > :now',
      ExpressionAttributeValues: {
        ':hash': requestTokenHash,
        ':now': new Date().toISOString(),
      },
    })
  );

  const storedToken = tokens && tokens.length > 0 ? tokens[0] : null;

  if (!storedToken) {
    logger.warn('Refresh token validation failed');
    throw new ServerError(ERROR_CODES.TOKEN_EXPIRED, 403);
  }

  const userId = storedToken.user_id;

  const { Item: userProfile } = await docClient.send(
    new GetCommand({
      TableName: TABLES.USER,
      Key: { user_id: userId, sort_key: 'USER_INFO_ITEM' },
    })
  );

  if (!userProfile || userProfile.is_active === false) {
    logger.warn('Token refresh failed: user not found or inactive', { userId });
    throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 403);
  }

  const {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    refreshTokenPayload,
  } = await generateTokens({
    id: userProfile.user_id,
    email: userProfile.email,
    nickname: userProfile.nickname,
  });

  const transactItems = [
    {
      Update: {
        TableName: TABLES.AUTH_DATA,
        Key: { user_id: userId, sort_key: storedToken.sort_key },
        UpdateExpression: 'set revoked_at = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      },
    },
    {
      Put: {
        TableName: TABLES.AUTH_DATA,
        Item: refreshTokenPayload,
      },
    },
  ];

  await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

  logger.info('Token refreshed', { userId });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

async function forgotPasswordSend(body) {
  const validation = forgotPasswordSchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email } = body;

  const { Items: users } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  const user = users && users.length > 0 ? users[0] : null;

  if (!user) {
    logger.warn('Forgot password failed: user not found', { email });
    throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
  }

  const userId = user.user_id;

  const { Items: resetRequests } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.AUTH_DATA,
      KeyConditionExpression: 'user_id = :uid AND begins_with(sort_key, :prefix)',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':prefix': 'RESET#',
      },
    })
  );

  if (resetRequests && resetRequests.length > 0) {
    resetRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastRequest = resetRequests[0];
    const timeDiff = Date.now() - new Date(lastRequest.created_at).getTime();
    const limitMs = RATE_LIMIT_MINUTES * 60 * 1000;

    if (timeDiff < limitMs) {
      const waitTimeSeconds = Math.ceil((limitMs - timeDiff) / 1000);
      throw new ServerError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429, {
        message: `비밀번호 재설정 요청은 ${RATE_LIMIT_MINUTES}분에 1회만 가능합니다.`,
        retryAfter: waitTimeSeconds,
      });
    }
  }

  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(
    Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();
  const now = new Date().toISOString();

  const transactItems = [];

  const activeRequests = resetRequests
    ? resetRequests.filter((r) => r.consumed === false)
    : [];

  if (activeRequests.length > 0) {
    activeRequests.forEach((req) => {
      transactItems.push({
        Update: {
          TableName: TABLES.AUTH_DATA,
          Key: { user_id: userId, sort_key: req.sort_key },
          UpdateExpression: 'set #c = :true, updated_at = :now',
          ExpressionAttributeNames: { '#c': 'consumed' },
          ExpressionAttributeValues: { ':true': true, ':now': now },
        },
      });
    });
  }

  transactItems.push({
    Put: {
      TableName: TABLES.AUTH_DATA,
      Item: {
        user_id: userId,
        sort_key: `RESET#${code}`,
        code,
        expires_at: expiresAt,
        created_at: now,
        consumed: false,
        type: 'RESET_CODE',
      },
    },
  });

  await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

  try {
    await sendPasswordResetEmail({ toEmail: user.email, code });
    logger.info('Password reset email sent', { userId });
  } catch (emailError) {
    logger.error('Email send failed', { error: emailError.message });
  }

  logger.info('[Dev] Password reset code', { userId, code });

  return { message: '해당 이메일로 비밀번호 재설정 코드가 전송되었습니다.' };
}

async function forgotPasswordVerify(body) {
  const { z } = require('zod');
  const verifySchema = forgotPasswordSchema.extend({
    code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
    newPassword: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
  });

  const validation = verifySchema.safeParse(body);
  if (!validation.success) {
    throw new ServerError(ERROR_CODES.VALIDATION_FAILED, 400, {
      errors: validation.error.errors,
    });
  }

  const { email, code, newPassword } = body;

  const { Items: users } = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  const user = users && users.length > 0 ? users[0] : null;

  if (!user) {
    throw new ServerError(ERROR_CODES.USER_NOT_FOUND, 404);
  }

  const userId = user.user_id;
  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  const now = new Date().toISOString();

  try {
    const transactParams = {
      TransactItems: [
        {
          Update: {
            TableName: TABLES.AUTH_DATA,
            Key: { user_id: userId, sort_key: `RESET#${code}` },
            UpdateExpression: 'set #c = :true, verified_at = :now',
            ConditionExpression: '#c = :false AND expires_at > :now',
            ExpressionAttributeNames: { '#c': 'consumed' },
            ExpressionAttributeValues: {
              ':true': true,
              ':false': false,
              ':now': now,
            },
          },
        },
        {
          Update: {
            TableName: TABLES.AUTH_DATA,
            Key: { user_id: userId, sort_key: 'PASSWORD_ITEM' },
            UpdateExpression: 'set password_hash = :hash, updated_at = :now',
            ExpressionAttributeValues: {
              ':hash': newPasswordHash,
              ':now': now,
            },
          },
        },
      ],
    };

    await docClient.send(new TransactWriteCommand(transactParams));

    logger.info('Password reset successful', { userId });
    return { message: '비밀번호가 성공적으로 재설정되었습니다.' };
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      logger.warn('Password reset failed: invalid/expired code', { email });
      throw new ServerError(ERROR_CODES.INVALID_VERIFICATION_CODE, 400);
    }
    throw err;
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
