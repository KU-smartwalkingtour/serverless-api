const axios = require('axios');
// const xml2js = require('xml2js'); // <--- [제거]
const { logger } = require('@utils/logger');

// XML 파서 인스턴스 (재사용 가능)
// const parser = new xml2js.Parser({ explicitArray: false }); // <--- [제거]

// API 설정
const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;
const API_KEY = process.env.NMC_HOSPITAL_KEY;
const DEFAULT_NUM_ROWS = 10;
//'조건 기반 검색' API의 운영(Operation) 이름
const OPERATION_NAME = '/getHsptlMdcncListInfoInqire';

// URLSearchParams 대체를 위한 querystring 모듈
const querystring = require('querystring');

/**
 * 필수 환경 변수 검증
 * @throws {Error} 필수 환경 변수가 누락된 경우
 */
const validateEnvironment = () => {
  if (!ENDPOINT || !API_KEY) {
    throw new Error('NMC_HOSPITAL_ENDPOINT and NMC_HOSPITAL_KEY must be configured');
  }
};

/**
 * 의료 시설 (병원 및 약국) 조건 검색
 * @param {object} searchOptions - 검색 조건 객체 (Q0, Q1, QN, pageNo, numOfRows 등)
 * @returns {Promise<Array>} 의료 시설 데이터 배열 (JSON)
 * @throws {Error} API 호출 실패 또는 응답 파싱 실패 시
 */
const searchFacilities = async (searchOptions = {}) => {
  // let xmlData = null; // <-- [제거]

  try {
    validateEnvironment();

    const API_KEY = process.env.NMC_HOSPITAL_KEY;
    const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;

    logger.info('API Key 확인:', {
      keyLength: API_KEY?.length,
      keyPreview: API_KEY?.substring(0, 10) + '...',
    });

    const params = {
      ServiceKey: API_KEY, // 디코딩된 키
      ...searchOptions,
    };
    if (!params.pageNo) {
      params.pageNo = 1;
    }
    if (!params.numOfRows) {
      params.numOfRows = DEFAULT_NUM_ROWS;
    }

    const fullUrl = ENDPOINT.replace(/\/+$/, '') + OPERATION_NAME;
    
    logger.info('API 요청 정보:', { 
      fullUrl,
      params: JSON.stringify({
        ...params,
        ServiceKey: `${String(params.ServiceKey).slice(0, 10)}...`,
      }),
    });
    
    const response = await axios.get(fullUrl, { params });

    // --- [핵심 수정] ---
    // axios가 이미 JSON 객체로 파싱해 줌.
    const result = response.data; 
    // const xmlData = response.data; // [제거]
    // const result = await parser.parseStringPromise(xmlData); // [제거]
    // ---------------

    // 공공데이터 API 오류 응답 처리 (response.header.resultCode !== '00')
    if (result.response?.header?.resultCode !== '00') {
      logger.warn('NMC API가 오류 응답을 반환했습니다.', {
        code: result.response?.header?.resultCode,
        msg: result.response?.header?.resultMsg,
      });
      return [];
    }

    const items = result.response?.body?.items?.item;

    if (!items) {
      logger.info('검색 조건에 맞는 의료시설을 찾을 수 없음'); // info로 변경
      return [];
    }

    return Array.isArray(items) ? items : [items];

  } catch (error) {
    // catch 블록은 원본 유지 (XML 파싱 오류는 이제 발생하지 않아야 함)
    if (error.response) {
      logger.error('--- 외부 API(NMC)가 HTTP 오류를 반환함 ---', {
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.message.includes('parseStringPromise') || error.message.includes('Non-whitespace')) {
      logger.error(`--- 의료 API XML 파싱 실패: ${error.message} ---`);
      // 이 오류는 이제 발생하면 안 됨
    } else {
      logger.error(`의료 API 네트워크/기타 오류: ${error.message}`);
    }
    throw new Error('의료시설 조건 검색 실패');
  }
};

module.exports = { searchFacilities };