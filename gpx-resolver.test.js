const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { getCoordinatesFromGpx, getCourseMetadataFromGpx } = require('./utils/gpx-resolver.js');

const testFilePath = path.join(__dirname, 'utils', 'gpx_files', '서울둘레길2.0_1코스.gpx');

const runTests = async () => {
  try {
    console.log('Running tests for gpx-resolver.js...');

    const gpxContent = fs.readFileSync(testFilePath, 'utf8');

    // Test 1: getCoordinatesFromGpx
    const coordinates = await getCoordinatesFromGpx(gpxContent);
    assert(Array.isArray(coordinates), 'getCoordinatesFromGpx should return an array.');
    assert(coordinates.length > 0, 'Coordinates array should not be empty.');
    assert(
      coordinates[0].hasOwnProperty('lat') && coordinates[0].hasOwnProperty('lon'),
      'Coordinate objects should have lat and lon properties.',
    );
    console.log('✓ getCoordinatesFromGpx passed.');

    // Test 2: getCourseMetadataFromGpx
    const metadata = await getCourseMetadataFromGpx(gpxContent);
    assert(
      typeof metadata === 'object' && metadata !== null,
      'getCourseMetadataFromGpx should return an object.',
    );
    assert.strictEqual(
      metadata['코스명'],
      '[1코스] 수락산코스',
      'Metadata should contain correct course name.',
    );
    assert.strictEqual(metadata['난이도'], '상', 'Metadata should contain correct difficulty.');
    console.log('✓ getCourseMetadataFromGpx passed.');

    console.log('\nAll tests passed! ✨');
  } catch (error) {
    console.error('\nTests failed! ❌');
    console.error(error);
    process.exit(1);
  }
};

runTests();
