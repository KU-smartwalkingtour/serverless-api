/**
 * @fileoverview Seoul Trail GPX Data Fetcher
 *
 * 서울둘레길 공식 웹사이트에서 제공하는 전체 코스 GPX ZIP 파일을 다운로드하고,
 * 압축을 해제하여 저장하는 스크립트이다.
 *
 * --------------------------------------------------------------------------------
 * [Target Data Information]
 * - Source: 서울둘레길 공식 웹사이트 (서울시)
 * - Resource Type: GPX Archive (ZIP)
 * - URL: https://gil.seoul.go.kr/common/file/download.do?enc=...
 * --------------------------------------------------------------------------------
 *
 * [Data Processing Strategy]
 * 1. Preparation: 저장할 디렉토리 생성 (dt=YYYY-MM-DD 파티션).
 * 2. Download: 원격 ZIP 파일을 스트림으로 다운로드하여 임시 파일로 저장.
 * 3. Extraction: `yauzl` 라이브러리를 사용하여 ZIP 압축 해제.
 *    - `iconv-lite`를 사용하여 CP949(EUC-KR)로 인코딩된 한글 파일명을 UTF-8로 변환.
 * 4. Storage: `data/raw/trails/source=seoultrail/dt={YYYY-MM-DD}/gpx/` 폴더에 저장.
 * 5. Cleanup: 다운로드한 임시 ZIP 파일 삭제.
 * --------------------------------------------------------------------------------
 *
 * [Required Environment Variables]
 * - `LOG_LEVEL`: (Optional) 로그 레벨 (default: info)
 * --------------------------------------------------------------------------------
 *
 * @requires axios
 * @requires fs
 * @requires yauzl
 * @requires iconv-lite
 * @requires pino
 */

const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const yauzl = require('yauzl');
const iconv = require('iconv-lite');
const pino = require('pino');

// ============================================================================
// Logger Configuration
// ============================================================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  base: {
    service: 'seoultrail-fetcher',
    env: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// Constants & Configuration
// ============================================================================

const GPX_ZIP_URL = 'https://gil.seoul.go.kr/common/file/download.do?enc=f2QKqShZzs2jJPsw8o6KWrJf13uLHJ3yW0veGTDIaeE%3D';
const TEMP_ZIP_FILE = 'seoultrail_all.zip';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts a ZIP file handling CP949 encoded filenames.
 * @param {string} zipFilePath - Path to the ZIP file.
 * @param {string} targetDir - Directory to extract files into.
 * @returns {Promise<void>}
 */
const extractZip = (zipFilePath, targetDir) => {
  return new Promise((resolve, reject) => {
    // decodeStrings: false -> Get filename as Buffer to decode manually
    yauzl.open(zipFilePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        // Decode filename from CP949 (EUC-KR) to UTF-8
        let fileName;
        try {
          fileName = iconv.decode(entry.fileName, 'cp949');
        } catch (e) {
          logger.warn({ raw: entry.fileName }, 'Failed to decode filename, falling back to default');
          fileName = entry.fileName.toString();
        }

        // Directory entry
        if (/\/$/.test(fileName)) {
          zipfile.readEntry();
          return;
        }

        const savePath = path.join(targetDir, fileName);

        // Ensure parent directory exists
        const dir = path.dirname(savePath);
        fs.mkdir(dir, { recursive: true }, (mkdirErr) => {
          if (mkdirErr) return reject(mkdirErr);

          zipfile.openReadStream(entry, (readErr, readStream) => {
            if (readErr) return reject(readErr);

            const writeStream = fs.createWriteStream(savePath);
            readStream.on('end', () => {
              logger.debug({ fileName }, 'Extracted file');
              zipfile.readEntry();
            });
            readStream.pipe(writeStream);
          });
        });
      });

      zipfile.on('end', () => {
        resolve();
      });

      zipfile.on('error', (err) => {
        reject(err);
      });
    });
  });
};

/**
 * 현재 날짜를 YYYY-MM-DD 형식의 문자열로 반환합니다.
 */
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * Downloads and extracts the Seoul Trail GPX archive.
 */
const fetchAndExtractGpx = async () => {
  const dateStr = getTodayDateString();
  const outputDir = path.join(
    process.cwd(),
    'data',
    'raw',
    'trails',
    'source=seoultrail',
    `dt=${dateStr}`,
    'gpx'
  );

  logger.info({ outputDir, url: GPX_ZIP_URL }, 'Starting Seoul Trail GPX data fetch');

  const zipPath = path.join(outputDir, TEMP_ZIP_FILE);

  try {
    // 1. Prepare Directory
    await fsPromises.mkdir(outputDir, { recursive: true });

    // 2. Download ZIP
    logger.info('Downloading GPX archive...');
    
    const response = await axios({
      method: 'get',
      url: GPX_ZIP_URL,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    logger.info('Download complete. Extracting...');

    // 3. Extract ZIP
    await extractZip(zipPath, outputDir);
    logger.info('Extraction complete.');

    // 4. Cleanup
    await fsPromises.unlink(zipPath);
    logger.info('Temporary ZIP file removed.');

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to fetch or extract Seoul Trail GPX data');
    process.exit(1);
  }
};

// Execute
fetchAndExtractGpx();
