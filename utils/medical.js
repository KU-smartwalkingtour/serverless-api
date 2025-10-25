// utils/medical.js

const axios = require('axios');
const xml2js = require('xml2js'); // 💡 npm install xml2js 필요
const parser = new xml2js.Parser({ explicitArray: false });

// .env 파일에서 키와 엔드포인트를 불러옵니다.
const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;
const API_KEY = process.env.NMC_HOSPITAL_KEY;

/**
 * 국립중앙의료원 API를 호출하여 주변 병원/약국 정보를 가져옵니다.
 * @param {string} lat - 위도 (WGS84_Y)
 * @param {string} lon - 경도 (WGS84_X)
 * @returns {Array} 병원/약국 데이터 목록 (JSON)
 */
exports.fetchNearbyFacilities = async (lat, lon) => {
    // 1. API 호출 URL 구성 (API 문서를 참고하여 파라미터 WGS84_Y/X에 lat/lon을 할당)
    const apiUrl = `${ENDPOINT}?serviceKey=${API_KEY}&WGS84_Y=${lat}&WGS84_X=${lon}&numOfRows=10`;

    try {
        // 2. 외부 API 호출 (axios)
        const response = await axios.get(apiUrl);
        const xmlData = response.data;

        // 3. XML 데이터를 JSON으로 파싱 (Promise로 래핑)
        return new Promise((resolve, reject) => {
            parser.parseString(xmlData, (err, result) => {
                if (err) {
                    return reject(new Error("Failed to parse external API response (XML)."));
                }
                
                // 파싱된 결과에서 실제 데이터 목록을 추출
                const items = result.response?.body?.items?.item;

                // 데이터가 유효하면 배열 형태로 반환, 없으면 빈 배열 반환
                if (!items) {
                    resolve([]);
                } else {
                    resolve(Array.isArray(items) ? items : [items]);
                }
            });
        });

    } catch (error) {
        // 네트워크 또는 외부 API 호출 실패 에러 처리
        console.error('NMC API 통신 오류:', error.message);
        throw new Error("External medical API call failed.");
    }
};