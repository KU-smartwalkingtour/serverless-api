// utils/medical.js

const axios = require('axios');
const xml2js = require('xml2js'); // npm install xml2js 필요
const parser = new xml2js.Parser({ explicitArray: false });

// .env 파일에서 키와 엔드포인트를 불러옵니다.
const ENDPOINT = process.env.NMC_HOSPITAL_ENDPOINT;
const API_KEY = process.env.NMC_HOSPITAL_KEY;

/**
 * @param {string} lat - 위도 (WGS84_Y)
 * @param {string} lon - 경도 (WGS84_X)
 * @returns {Array} 병원/약국 데이터 목록 (JSON)
 */
exports.fetchNearbyFacilities = async (lat, lon) => {
    // 1. API 호출 URL 구성 (API 문서를 참고하여 파라미터 WGS84_Y/X에 lat/lon을 할당)
    const encodedKey = encodeURIComponent(API_KEY);
    const apiUrl = `${ENDPOINT}?serviceKey=${API_KEY}&WGS84_Y=${lat}&WGS84_X=${lon}&numOfRows=10`;

    const params = {
        serviceKey: API_KEY, // axios가 이 값을 자동으로 URL 인코딩
        WGS84_Y: lat,
        WGS84_X: lon,
        numOfRows: 10
    };
    try {
        const response = await axios.get(ENDPOINT, { params: params });
        // 2. 외부 API 호출 (axios)
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
        if (error.response) {
            console.error('NMC API 상세 오류 정보:');
            console.error('Status Code:', error.response.status); // 500이 찍힐 것
            console.error('Response Data:', error.response.data); // 외부 API가 보낸 RAW 데이터 (XML/HTML)
        } else {
            console.error('NMC API 네트워크 오류:', error.message);
        }
        throw new Error("External medical API call failed.");
    }
};