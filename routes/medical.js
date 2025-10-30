const express = require('express');
const router = express.Router();
const { searchFacilities } = require('@utils/medical');
const { ServerError, ERROR_CODES } = require('@utils/error');
const { logger } = require('@utils/logger');
const { authenticateToken } = require('@middleware/auth');

router.get('/test', (req, res) => {
  res.json({ message: 'medical.js test route SUCCESS!' });
}); // 테스트용 라우트

/**
 * @swagger
 * /medical/search:
 *   get:
 *     tags:
 *       - Medical
 *     summary: 병원/약국 조건 검색
 *     description: "주어진 조건(시/도, 시/군/구, 기관명 등)에 맞는 병원 및 약국 정보를 검색합니다."
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: Q0
 *         schema:
 *           type: string
 *         description: "주소(시도) (예: '서울특별시')"
 *       - in: query
 *         name: Q1
 *         schema:
 *           type: string
 *         description: "주소(시군구) (예: '강남구')"
 *       - in: query
 *         name: QZ
 *         schema:
 *           type: string
 *         description: "기관구분 (B:병원, C:의원 등)"
 *       - in: query
 *         name: QD
 *         schema:
 *           type: string
 *         description: "진료과목 (D001: 내과 등)"
 *       - in: query
 *         name: QT
 *         schema:
 *           type: string
 *         description: "진료요일 (1:월요일 ~ 7:일요일, 8:공휴일)"
 *       - in: query
 *         name: QN
 *         schema:
 *           type: string
 *         description: "기관명 (예: '삼성병원')"
 *       - in: query
 *         name: ORD
 *         schema:
 *           type: string
 *         description: "정렬 순서 (NAME: 이름순)"
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: integer
 *           default: 1
 *         description: "페이지 번호"
 *       - in: query
 *         name: numOfRows
 *         schema:
 *           type: integer
 *           default: 10
 *         description: "목록 건수"
 *     responses:
 *       '200':
 *         description: "병원/약국 목록이 성공적으로 검색되었습니다."
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MedicalFacility'
 *       '400':
 *         description: "잘못된 요청 파라미터입니다."
 *       '401':
 *         description: "인증되지 않음"
 *       '403':
 *         description: "접근 거부 (유효하지 않은 토큰)"
 *       '500':
 *         description: "병원/약국 데이터를 조회하는 중 오류가 발생했습니다."
 */



// 라우트 경로를 '/nearby'에서 '/search'로 변경
router.get('/search', authenticateToken, async (req, res) => {
  try {
    // req.query에서 lat, lon 대신 모든 쿼리 파라미터를 객체로 받음
    const searchOptions = req.query;

    // (선택적) 필수 파라미터 검증
    if (Object.keys(searchOptions).length === 0) {
      throw new ServerError(ERROR_CODES.INVALID_QUERY_PARAMS, 400, '하나 이상의 검색 조건이 필요합니다.');
    }

    // searchFacilities 함수에 쿼리 파라미터 객체를 그대로 전달
    const medicalFacilities = await searchFacilities(searchOptions);
    res.json(medicalFacilities);
  } catch (error) {
    if (ServerError.isServerError(error)) {
      return res.status(error.statusCode).json(error.toJSON());
    }

    logger.error(`병원/약국 데이터 검색 오류: ${error.message}`, { error: error.message });
    const serverError = new ServerError(ERROR_CODES.MEDICAL_API_ERROR, 500);
    res.status(500).json(serverError.toJSON());
  }
});

module.exports = router;