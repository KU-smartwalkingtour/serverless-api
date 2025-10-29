const axios = require('axios');
const xml2js = require('xml2js');
const { logger } = require('@utils/logger');

// XML 파서 인스턴스 (재사용 가능)
const parser = new xml2js.Parser({ explicitArray: false });

// API 설정
const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;
const API_KEY = process.env.NMC_HOSPITAL_KEY;
const DEFAULT_NUM_ROWS = 10;
// API 운영 이름 (조건 검색 API로 변경)
const OPERATION_NAME = '/getHsptlMdcncListInfoInqire';

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
 * @param {object} options - 검색 조건 객체
 * @param {string} [options.Q0] - 주소(시도) (예: '서울특별시')
 * @param {string} [options.Q1] - 주소(시군구) (예: '강남구')
 * @param {string} [options.QZ] - 기관구분 (예: 'B')
 * @param {string} [options.QD] - 진료과목 (예: 'D001')
 * @param {string} [options.QT] - 진료요일 (예: '1')
 * @param {string} [options.QN] - 기관명 (예: '삼성병원')
 * @param {string} [options.ORD] - 순서 (예: 'NAME')
 * @param {number} [options.pageNo=1] - 페이지 번호
 * @param {number} [options.numOfRows=10] - 목록 건수
 * @returns {Promise<Array>} 의료 시설 데이터 배열 (JSON)
 * @throws {Error} API 호출 실패 또는 응답 파싱 실패 시
 */
const searchFacilities = async (options = {}) => {
  try {
    validateEnvironment();

    const {
      Q0,
      Q1,
      QZ,
      QD,
      QT,
      QN,
      ORD,
      pageNo = 1,
      numOfRows = DEFAULT_NUM_ROWS,
    } = options;

    const params = {
      serviceKey: API_KEY,
      numOfRows,
      pageNo,
    };

    // 동적으로 파라미터 추가 (값이 있는 경우에만)
    if (Q0) params.Q0 = Q0;
    if (Q1) params.Q1 = Q1;
    if (QZ) params.QZ = QZ;
    if (QD) params.QD = QD;
    if (QT) params.QT = QT;
    if (QN) params.QN = QN;
    if (ORD) params.ORD = ORD;

    // Endpoint URL에 운영 이름(Operation Name)을 추가
    const fullUrl = ENDPOINT + OPERATION_NAME;

    logger.debug('의료 시설 조건 검색 중', { url: fullUrl, params });
    const response = await axios.get(fullUrl, { params });
    const xmlData = response.data;

    // async/await를 사용하여 XML 데이터를 JSON으로 파싱
    const result = await parser.parseStringPromise(xmlData);

    // 공공데이터 API 오류 응답 처리 (response.header.resultCode !== '00')
    if (result.response?.header?.resultCode !== '00') {
      logger.warn('NMC API가 오류 응답을 반환했습니다.', {
        code: result.response?.header?.resultCode,
        msg: result.response?.header?.resultMsg,
      });
      return [];
    }

    // 파싱된 결과에서 항목 추출
    const items = result.response?.body?.items?.item;

    if (!items) {
      logger.debug('검색 조건에 맞는 의료시설을 찾을 수 없음');
      return [];
    }

    return Array.isArray(items) ? items : [items];
  } catch (error) {
    if (error.response) {
      logger.error('NMC API 오류', {
        statusCode: error.response.status,
        data: error.response.data,
      });
    } else if (error.message.includes('parseStringPromise')) {
      logger.error('의료 API XML 응답 파싱 실패', { data: error.toString() });
    } else {
      logger.error(`의료 API 네트워크 오류: ${error.message}`);
    }
    throw new Error('의료시설 조회 실패');
  }
};

module.exports = { searchFacilities };

