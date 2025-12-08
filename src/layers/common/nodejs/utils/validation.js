const { z } = require('zod');
const { logger } = require('./logger');

const validateBody = (schema, body) => {
  try {
    return { success: true, data: schema.parse(body) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      logger.warn('입력 검증 실패', { errors });
      return { success: false, errors };
    }
    throw error;
  }
};

// ===== 인증 관련 스키마 =====

const registerSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
  nickname: z.string().min(1, '닉네임은 최소 1자 이상이어야 합니다.').optional(),
});

const loginSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '리프레시 토큰을 입력해주세요.'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
});

const verifyCodeSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  code: z.string().length(6, '인증 코드는 6자리여야 합니다.'),
  password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
});

// ===== 사용자 관련 스키마 =====

const updateProfileSchema = z.object({
  nickname: z.string().min(1, '닉네임은 최소 1자 이상이어야 합니다.').optional(),
  language: z.string().optional(),
  distance_unit: z
    .enum(['km', 'mi'], {
      errorMap: () => ({ message: '거리 단위는 km 또는 mi만 가능합니다.' }),
    })
    .optional(),
});

const updateLocationSchema = z.object({
  latitude: z
    .number({
      required_error: '위도는 필수입니다.',
      invalid_type_error: '위도는 숫자여야 합니다.',
    })
    .min(-90, '위도는 -90 이상이어야 합니다.')
    .max(90, '위도는 90 이하여야 합니다.'),
  longitude: z
    .number({
      required_error: '경도는 필수입니다.',
      invalid_type_error: '경도는 숫자여야 합니다.',
    })
    .min(-180, '경도는 -180 이상이어야 합니다.')
    .max(180, '경도는 180 이하여야 합니다.'),
});

const logWalkSchema = z.object({
  distance_km: z
    .number({
      required_error: '걷기 거리는 필수입니다.',
      invalid_type_error: '걷기 거리는 숫자여야 합니다.',
    })
    .positive('걷기 거리는 양수여야 합니다.'),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요.'),
  newPassword: z.string().min(8, '새 비밀번호는 최소 8자 이상이어야 합니다.'),
});

const saveCourseSchema = z.object({
  courseId: z.string().min(1, '코스 ID는 필수입니다.'),
});

module.exports = {
  validateBody,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyCodeSchema,
  resetPasswordSchema,
  updateProfileSchema,
  updateLocationSchema,
  logWalkSchema,
  updatePasswordSchema,
  saveCourseSchema,
};
