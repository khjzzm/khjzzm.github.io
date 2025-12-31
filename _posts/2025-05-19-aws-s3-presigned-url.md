---
layout: post
title: AWS S3 Presigned URL
---

## Presigned URL이란?

Presigned URL은 **AWS S3 객체에 대해 제한된 시간 동안 업로드(PUT) 또는 다운로드(GET)를 허용하는 임시 URL**입니다.  
서버가 권한을 대신 부여하고, 클라이언트는 직접 S3에 접근하므로 **네트워크 부하를 줄이고 보안도 유지**할 수 있습니다.


```bash
# 1. Presigned URL 발급
RESPONSE=$(curl -s -X POST 람다+API게이트웨이 주소 \
  -H "Content-Type: application/json" \
  -d '{ "fileName": "test.png", "fileType": "image/png" }')

# 2. Presigned URL 추출
URL=$(echo "$RESPONSE" | jq -r .url)# 3. 파일 업로드 (PUT 방식)
curl -X PUT "$URL" \
  -H "Content-Type: image/png" \
  --upload-file ./test.png
```
jq가 필요합니다 → macOS: brew install jq 없을 경우 제거 

요청을 받아 S3 Presigned URL을 발급해주는 Lambda 함수는 다음과 같습니다:

~~~javascript
// AWS SDK에서 S3 클라이언트와 명령어 생성, URL 사전 서명을 위한 유틸리티 불러오기
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// S3 클라이언트 생성 (리전은 서울: ap-northeast-2)
const s3 = new S3Client({ region: 'ap-northeast-2' });

// Lambda 핸들러 함수 시작
exports.handler = async (event) => {
  // 클라이언트로부터 전달된 JSON body에서 fileName, fileType 추출
  const { fileName, fileType } = JSON.parse(event.body || '{}');

  // 환경변수로 설정한 버킷 이름 사용
  const bucket = process.env.BUCKET_NAME;

  // S3에 특정 파일을 업로드(PUT)할 명령 정의
  const command = new PutObjectCommand({
    Bucket: bucket,       // 대상 S3 버킷
    Key: fileName,        // 업로드할 객체의 이름 (예: 'WOD-20250520_093012.jpg')
    ContentType: fileType // 예: 'image/jpeg' 또는 'image/png'
  });

  // 해당 명령어에 대해 60초짜리 Presigned URL 생성
  // 이 URL은 클라이언트가 직접 S3에 업로드할 수 있도록 허용
  const url = await getSignedUrl(s3, command, { expiresIn: 60 });

  // 클라이언트에게 Presigned URL 반환
  return {
    statusCode: 200,
    body: JSON.stringify({ url }), // JSON 형태로 응답
  };
};
~~~

Presigned URL을 발급하려면 Lambda에 S3에 PutObject할 수 있는 권한이 있어야 합니다:
~~~json
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::notion-wod-s3/*"
}
~~~