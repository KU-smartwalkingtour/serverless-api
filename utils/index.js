const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const xml2js = require('xml2js');
const gpxParse = require('gpx-parse');

const s3Client = new S3Client({ region: 'ap-northeast-2' }); // VPC 엔드포인트를 통해 통신하므로 별도 인증 정보 설정이 필요 없습니다.
const BUCKET_NAME = 'ku-smartwalkingtour-seoultrail-gpxstorage-bucket';
const GPX_PREFIX = 'gpx_files/';

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });


function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

async function main(){
    const parser = new xml2js.Parser({ explicitArray: false });
    const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: GPX_PREFIX,
    });

    const listedObjects = await s3Client.send(listCommand);

    //console.log(listedObjects);

    const gpxFiles = listedObjects.Contents.filter(obj => obj.Key.endsWith('.gpx'));
    
    const coursePromises = gpxFiles.map(async (file) => {
        try {
            const getCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: file.Key,
            });
            const s3Object = await s3Client.send(getCommand);
            const data = await streamToString(s3Object.Body);

            //console.log(data);
            const result = await parser.parseStringPromise(data);

            const extensions = result.gpx.trk.extensions;
            const fileLon = parseFloat(extensions['ogr:COORD_X']);
            const fileLat = parseFloat(extensions['ogr:COORD_Y']);
            //console.log(fileLon);
            //console.log(fileLat);
            if (!isNaN(fileLat) && !isNaN(fileLon)) {
                const distance = getDistance(37.482783, 127.060644, fileLat, fileLon);
                console.log(distance);
                //const courseNameMatch = file.Key.match(/서울둘레길2\.0_(\d+)코스\.gpx/);
                //if (courseNameMatch) {
                //    console.log({ course: courseNameMatch[1], distance: distance });
                //}
            }
        } catch (error) {
            console.error(`Error processing file ${file.Key}:`, error);
        }
        return null;
    });
}

main();


