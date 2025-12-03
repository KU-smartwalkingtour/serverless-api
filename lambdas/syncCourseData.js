// lambdas/syncCourseData.js
const { DynamoDBClient, QueryCommand, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");

// DynamoDB 클라이언트 초기화 (Lambda 환경 변수 사용)
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-2" });

const TABLE_NAME = process.env.COURSE_SERVICE_TABLE_NAME || "Prod-CourseService";
const GSI2_NAME = "GSI2";

exports.handler = async (event) => {
  console.log(`Processing ${event.Records.length} records...`);

  const promises = event.Records.map(async (record) => {
    // 1. MODIFY 이벤트만 처리
    if (record.eventName !== 'MODIFY') return;

    const oldImage = unmarshall(record.dynamodb.OldImage);
    const newImage = unmarshall(record.dynamodb.NewImage);
    
    // SK가 'METADATA'가 아니거나, PK가 'COURSE#'로 시작하지 않으면 무시
    if (newImage.SK !== 'METADATA' || !newImage.PK.startsWith('COURSE#')) return;
    
    // 2. 변경 여부 확인 (비용 절감)
    if (oldImage.course_name === newImage.course_name && oldImage.course_length === newImage.course_length) {
        console.log(`No relevant changes detected for course ${newImage.PK}. Skipping.`);
        return;
    }

    console.log(`Course ${newImage.PK} modified. Starting sync.`);

    try {
      // 3. 관련 아이템 조회 (GSI2)
      const itemsToUpdate = await getAllItemsForCourse(newImage.PK);

      if (itemsToUpdate.length === 0) {
        console.log(`No users have saved course ${newImage.PK}.`);
        return;
      }

      // 4. BatchWriteItem으로 업데이트
      await batchUpdateItems(itemsToUpdate, newImage);
      
      console.log(`Updated ${itemsToUpdate.length} items for course ${newImage.PK}.`);

    } catch (error) {
      console.error(`Failed to process update for course ${newImage.PK}:`, error);
      throw error; // Lambda 재시도를 위해 에러 throw
    }
  });

  await Promise.all(promises);

  return {
    statusCode: 200,
    body: JSON.stringify('Successfully processed records.'),
  };
};

// GSI2 쿼리 함수 (Pagination 지원)
async function getAllItemsForCourse(coursePK) {
  let allItems = [];
  let lastEvaluatedKey;

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: GSI2_NAME,
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: coursePK } },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const command = new QueryCommand(params);
    const data = await client.send(command);

    if (data.Items) {
      allItems.push(...data.Items.map(item => unmarshall(item)));
    }
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

// Batch Update 함수
async function batchUpdateItems(items, updatedCourseData) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const writeRequests = chunk.map(item => {
      const updatedItem = {
        ...item,
        course_name: updatedCourseData.course_name, // 비정규화 데이터 동기화
        course_length: updatedCourseData.course_length,
      };

      return {
        PutRequest: { Item: marshall(updatedItem) },
      };
    });

    const params = {
      RequestItems: { [TABLE_NAME]: writeRequests },
    };

    const command = new BatchWriteItemCommand(params);
    const result = await client.send(command);
    
    if (result.UnprocessedItems && result.UnprocessedItems[TABLE_NAME]) {
        console.warn('Warning: Unprocessed items detected.');
    }
  }
}