const ERROR_CODES = {
  // 인증 관련 (AUTH_*)
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_VERIFICATION_CODE: 'INVALID_VERIFICATION_CODE',
  VERIFICATION_CODE_EXPIRED: 'VERIFICATION_CODE_EXPIRED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // 요청 검증 관련 (VALIDATION_*)
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_QUERY_PARAMS: 'INVALID_QUERY_PARAMS',
  NO_FIELDS_TO_UPDATE: 'NO_FIELDS_TO_UPDATE',

  // 리소스 관련 (RESOURCE_*)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  USER_NOT_FOUND_FOR_RESOURCE: 'USER_NOT_FOUND_FOR_RESOURCE',

  // 외부 API 관련 (EXTERNAL_*)
  WEATHER_API_ERROR: 'WEATHER_API_ERROR',
  AIRKOREA_API_ERROR: 'AIRKOREA_API_ERROR',
  MEDICAL_API_ERROR: 'MEDICAL_API_ERROR',
  KMA_API_ERROR: 'KMA_API_ERROR',

  // 서버 오류 (SERVER_*)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
};

const ERROR_MESSAGES = {
  // 인증 관련
  [ERROR_CODES.EMAIL_ALREADY_EXISTS]: '이미 존재하는 이메일입니다.',
  [ERROR_CODES.INVALID_CREDENTIALS]: '이메일 또는 비밀번호가 일치하지 않습니다.',
  [ERROR_CODES.USER_NOT_FOUND]: '사용자를 찾을 수 없습니다.',
  [ERROR_CODES.INVALID_PASSWORD]: '현재 비밀번호가 일치하지 않습니다.',
  [ERROR_CODES.UNAUTHORIZED]: '인증되지 않은 요청입니다.',
  [ERROR_CODES.TOKEN_EXPIRED]: '토큰이 만료되었습니다.',
  [ERROR_CODES.TOKEN_REVOKED]: '토큰이 무효화되었습니다.',
  [ERROR_CODES.INVALID_TOKEN]: '유효하지 않은 토큰입니다.',
  [ERROR_CODES.INVALID_VERIFICATION_CODE]: '인증 코드가 일치하지 않습니다.',
  [ERROR_CODES.VERIFICATION_CODE_EXPIRED]: '인증 코드가 만료되었습니다.',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: '요청 횟수 제한을 초과했습니다.',

  // 요청 검증 관련
  [ERROR_CODES.MISSING_REQUIRED_FIELDS]: '필수 필드가 누락되었습니다.',
  [ERROR_CODES.INVALID_INPUT]: '입력값이 유효하지 않습니다.',
  [ERROR_CODES.INVALID_QUERY_PARAMS]: '쿼리 파라미터가 유효하지 않습니다.',
  [ERROR_CODES.NO_FIELDS_TO_UPDATE]: '업데이트할 필드가 제공되지 않았습니다.',

  // 리소스 관련
  [ERROR_CODES.RESOURCE_NOT_FOUND]: '요청한 리소스를 찾을 수 없습니다.',
  [ERROR_CODES.COURSE_NOT_FOUND]: '코스를 찾을 수 없습니다.',
  [ERROR_CODES.USER_NOT_FOUND_FOR_RESOURCE]: '사용자를 찾을 수 없습니다.',

  // 외부 API 관련
  [ERROR_CODES.WEATHER_API_ERROR]: '날씨 데이터를 조회하는 중 오류가 발생했습니다.',
  [ERROR_CODES.AIRKOREA_API_ERROR]: '대기질 데이터를 조회하는 중 오류가 발생했습니다.',
  [ERROR_CODES.MEDICAL_API_ERROR]: '병원/약국 데이터를 조회하는 중 오류가 발생했습니다.',
  [ERROR_CODES.KMA_API_ERROR]: '기상청 API 호출 중 오류가 발생했습니다.',

  // 서버 오류
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: '서버 내부 오류가 발생했습니다.',
  [ERROR_CODES.DATABASE_ERROR]: '데이터베이스 처리 중 오류가 발생했습니다.',
  [ERROR_CODES.UNEXPECTED_ERROR]: '예상치 못한 오류가 발생했습니다.',
};

class ServerError extends Error {
  constructor(code, statusCode = 500, details = {}) {
    const message = ERROR_MESSAGES[code] || '알 수 없는 오류가 발생했습니다.';
    super(message);

    this.name = 'ServerError';
    this.code = code;
    this.message = message;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerError);
    }
  }

  static isServerError(error) {
    return error instanceof ServerError;
  }

  toJSON() {
    const response = {
      error: {
        code: this.code,
        message: this.message,
      },
      timestamp: this.timestamp,
    };

    if (Object.keys(this.details).length > 0) {
      response.error.details = this.details;
    }

    return response;
  }
}

module.exports = { ServerError, ERROR_CODES, ERROR_MESSAGES };
