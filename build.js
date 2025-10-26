#!/usr/bin/env node

/**
 * 프로덕션 빌드 스크립트
 *
 * 기능:
 * 1. esbuild로 번들링 및 압축
 * 2. javascript-obfuscator로 난독화
 * 3. dist/ 디렉토리에 출력
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// ANSI 색상 코드
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

/**
 * 로깅 유틸리티
 * @type {{
 *   info: (msg: string) => void,
 *   success: (msg: string) => void,
 *   error: (msg: string) => void,
 *   warn: (msg: string) => void
 * }}
 */
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
};

// 빌드 설정
const DIST_DIR = path.join(__dirname, 'dist');
const ENTRY_POINT = path.join(__dirname, 'index.js');
const OUTPUT_FILE = path.join(DIST_DIR, 'index.js');

// 난독화 설정 (기본값: true)
const OBFUSCATE = process.env.OBFUSCATE !== 'false';

// package.json에서 dependencies 읽어오기
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const externalDependencies = Object.keys(packageJson.dependencies || {});

// dist 디렉토리 초기화
if (fs.existsSync(DIST_DIR)) {
  log.info('기존 dist/ 디렉토리 삭제 중...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
log.success('dist/ 디렉토리 생성 완료');

// esbuild 빌드
log.info('esbuild로 번들링 및 압축 시작...');

esbuild
  .build({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: OUTPUT_FILE,
    minify: true, // 압축 활성화
    sourcemap: false,
    external: externalDependencies, // package.json의 모든 dependencies를 외부 의존성으로 처리
    banner: {
      js: '#!/usr/bin/env node',
    },
  })
  .then(() => {
    log.success('번들링 및 압축 완료');

    // 파일 크기 확인
    const bundleStats = fs.statSync(OUTPUT_FILE);
    const bundleSize = (bundleStats.size / 1024).toFixed(2);
    log.info(`번들 크기: ${bundleSize} KB`);

    // 난독화 옵션이 활성화된 경우
    if (OBFUSCATE) {
      log.info('코드 난독화 시작...');

      const bundleCode = fs.readFileSync(OUTPUT_FILE, 'utf8');

      const obfuscatedCode = JavaScriptObfuscator.obfuscate(bundleCode, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false,
        debugProtectionInterval: 0,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 4,
        stringArrayWrappersType: 'function',
        stringArrayThreshold: 0.75,
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
      }).getObfuscatedCode();

      fs.writeFileSync(OUTPUT_FILE, obfuscatedCode);
      log.success('코드 난독화 완료');

      const obfuscatedStats = fs.statSync(OUTPUT_FILE);
      const obfuscatedSize = (obfuscatedStats.size / 1024).toFixed(2);
      log.info(`난독화 후 크기: ${obfuscatedSize} KB`);
    }

    // package.json 복사 (프로덕션 의존성만)
    log.info('package.json 복사 중...');

    const prodPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      main: 'index.js',
      scripts: {
        start: 'node index.js',
      },
      dependencies: packageJson.dependencies,
      _moduleAliases: packageJson._moduleAliases,
    };

    fs.writeFileSync(path.join(DIST_DIR, 'package.json'), JSON.stringify(prodPackageJson, null, 2));
    log.success('package.json 복사 완료');

    // .env.example 복사
    const envExamplePath = path.join(__dirname, '.env.example');
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, path.join(DIST_DIR, '.env.example'));
      log.success('.env.example 복사 완료');
    }

    console.log('\n' + '='.repeat(60));
    log.success('빌드 완료! (난독화: ' + (OBFUSCATE ? '활성화' : '비활성화') + ')');
    console.log('\n프로덕션 실행 방법:');
    console.log('  1. cd dist');
    console.log('  2. npm install --production (또는 yarn install --production)');
    console.log('  3. .env 파일 생성');
    console.log('  4. npm start\n');
    console.log('※ 난독화는 기본 활성화되어 있습니다.');
    console.log('  비활성화: OBFUSCATE=false npm run build');
    console.log('='.repeat(60));
  })
  .catch(
    /**
     * @param {Error} error
     */
    (error) => {
      log.error('빌드 실패');
      console.error(error);
      process.exit(1);
    }
  );
