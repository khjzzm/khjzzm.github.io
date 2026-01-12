---
layout: post
title: AWS Lambda 완전 가이드
tags: [aws]
---

AWS Lambda는 서버 프로비저닝 없이 코드를 실행할 수 있는 서버리스 컴퓨팅 서비스다. 이벤트 기반으로 동작하며, 실행한 만큼만 비용을 지불한다.

---

## Lambda란?

### 서버리스 컴퓨팅

```
전통적 방식:
EC2 인스턴스 → 24시간 실행 → 사용하지 않아도 비용 발생

Lambda 방식:
이벤트 발생 → Lambda 실행 → 실행 시간만큼 비용 → 종료
```

### Lambda의 핵심 특징

| 특징 | 설명 |
|------|------|
| 서버리스 | 인프라 관리 불필요 |
| 이벤트 기반 | 다양한 AWS 서비스와 연동 |
| 자동 스케일링 | 요청량에 따라 자동 확장 |
| 초 단위 과금 | 1ms 단위로 실행 시간 계산 |
| 고가용성 | 멀티 AZ 자동 배포 |

---

## Lambda 작동 방식

### 실행 흐름

```
1. 이벤트 소스가 Lambda 호출
2. Lambda 서비스가 실행 환경 준비 (Cold Start)
3. 핸들러 함수 실행
4. 응답 반환
5. 일정 시간 후 실행 환경 제거 또는 재사용 (Warm)
```

### 호출 유형

```
동기 호출 (Synchronous)
├── API Gateway → Lambda
├── CLI/SDK 직접 호출
└── 호출자가 응답 대기

비동기 호출 (Asynchronous)
├── S3 이벤트
├── SNS
├── EventBridge
└── 즉시 반환, 백그라운드 실행

폴링 기반 호출 (Poll-based)
├── SQS
├── Kinesis
├── DynamoDB Streams
└── Lambda가 소스를 폴링
```

---

## 지원 런타임

### AWS 관리형 런타임

| 런타임 | 버전 | 식별자 |
|--------|------|--------|
| Node.js | 20.x, 18.x | `nodejs20.x`, `nodejs18.x` |
| Python | 3.12, 3.11, 3.10, 3.9 | `python3.12`, `python3.11` |
| Java | 21, 17, 11, 8 | `java21`, `java17`, `java11` |
| .NET | 8, 6 | `dotnet8`, `dotnet6` |
| Ruby | 3.3, 3.2 | `ruby3.3`, `ruby3.2` |
| Go | 1.x (AL2) | `provided.al2` |
| Rust | Custom Runtime | `provided.al2023` |

### 커스텀 런타임

```bash
# provided.al2023 사용
# bootstrap 파일 필요
#!/bin/sh
set -euo pipefail

while true
do
  # 이벤트 가져오기
  HEADERS="$(mktemp)"
  EVENT_DATA=$(curl -sS -LD "$HEADERS" \
    "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next")
  REQUEST_ID=$(grep -Fi Lambda-Runtime-Aws-Request-Id "$HEADERS" | tr -d '[:space:]' | cut -d: -f2)

  # 함수 실행
  RESPONSE=$(./handler "$EVENT_DATA")

  # 응답 전송
  curl -sS -X POST \
    "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/response" \
    -d "$RESPONSE"
done
```

---

## 핸들러 함수 작성

### Node.js

```javascript
// index.mjs (ES Module)
export const handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Hello from Lambda!',
            requestId: context.awsRequestId
        })
    };

    return response;
};
```

```javascript
// index.js (CommonJS)
exports.handler = async (event, context) => {
    // 남은 실행 시간 확인
    const remainingTime = context.getRemainingTimeInMillis();

    return {
        statusCode: 200,
        body: JSON.stringify({ remainingTime })
    };
};
```

### Python

```python
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event)}")

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps({
            'message': 'Hello from Lambda!',
            'requestId': context.aws_request_id
        })
    }
```

### Java

```java
package com.example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;

public class Handler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        context.getLogger().log("Request ID: " + context.getAwsRequestId());

        APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent();
        response.setStatusCode(200);
        response.setBody("{\"message\": \"Hello from Lambda!\"}");

        return response;
    }
}
```

```java
// POJO 방식
public class Handler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        Map<String, Object> response = new HashMap<>();
        response.put("statusCode", 200);
        response.put("body", "Hello!");
        return response;
    }
}
```

### Go

```go
package main

import (
    "context"
    "github.com/aws/aws-lambda-go/events"
    "github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
    return events.APIGatewayProxyResponse{
        StatusCode: 200,
        Body:       `{"message": "Hello from Lambda!"}`,
        Headers: map[string]string{
            "Content-Type": "application/json",
        },
    }, nil
}

func main() {
    lambda.Start(handler)
}
```

---

## Context 객체

### 주요 속성

| 속성 | 설명 |
|------|------|
| `awsRequestId` | 요청 고유 ID |
| `functionName` | Lambda 함수 이름 |
| `functionVersion` | 함수 버전 |
| `memoryLimitInMB` | 할당된 메모리 |
| `logGroupName` | CloudWatch 로그 그룹 |
| `logStreamName` | CloudWatch 로그 스트림 |
| `identity` | Cognito 자격 증명 (있는 경우) |
| `clientContext` | 클라이언트 컨텍스트 |

### 유용한 메서드

```javascript
// Node.js
context.getRemainingTimeInMillis()  // 남은 시간 (ms)

// Python
context.get_remaining_time_in_millis()

// Java
context.getRemainingTimeInMillis()
context.getLogger().log("message")
```

---

## 이벤트 소스와 트리거

### 주요 이벤트 소스

```
API 연동
├── API Gateway (REST, HTTP, WebSocket)
├── Application Load Balancer
└── Lambda Function URL

스토리지
├── S3 (객체 생성/삭제)
├── DynamoDB Streams
└── EFS

메시징
├── SQS
├── SNS
├── EventBridge
├── Kinesis
└── MSK (Kafka)

개발자 도구
├── CodeCommit
├── CodePipeline
└── CloudFormation

기타
├── CloudWatch Events/Logs
├── Cognito
├── Alexa
├── IoT
└── Step Functions
```

### S3 트리거 예시

```javascript
// S3 이벤트 처리
export const handler = async (event) => {
    for (const record of event.Records) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        const eventName = record.eventName;

        console.log(`Event: ${eventName}, Bucket: ${bucket}, Key: ${key}`);

        // S3 객체 처리 로직
    }
};
```

### SQS 트리거 예시

```python
def lambda_handler(event, context):
    batch_item_failures = []

    for record in event['Records']:
        try:
            message_body = record['body']
            # 메시지 처리
            process_message(message_body)
        except Exception as e:
            batch_item_failures.append({
                'itemIdentifier': record['messageId']
            })

    return {'batchItemFailures': batch_item_failures}
```

### DynamoDB Streams 예시

```javascript
export const handler = async (event) => {
    for (const record of event.Records) {
        const eventName = record.eventName;  // INSERT, MODIFY, REMOVE

        if (eventName === 'INSERT') {
            const newImage = record.dynamodb.NewImage;
            console.log('New item:', JSON.stringify(newImage));
        } else if (eventName === 'MODIFY') {
            const oldImage = record.dynamodb.OldImage;
            const newImage = record.dynamodb.NewImage;
            console.log('Updated:', JSON.stringify({ oldImage, newImage }));
        } else if (eventName === 'REMOVE') {
            const oldImage = record.dynamodb.OldImage;
            console.log('Deleted:', JSON.stringify(oldImage));
        }
    }
};
```

---

## Cold Start와 Warm Start

### Cold Start란?

```
Cold Start (최초 호출 또는 스케일 아웃 시)
1. 실행 환경 생성
2. 런타임 초기화
3. 의존성 로드
4. 핸들러 외부 코드 실행
5. 핸들러 함수 실행
→ 수백 ms ~ 수 초 지연

Warm Start (재사용)
1. 핸들러 함수 실행
→ ms 단위 응답
```

### Cold Start 영향 요소

| 요소 | Cold Start 영향 |
|------|----------------|
| 런타임 | Java, .NET > Node.js, Python |
| 메모리 크기 | 적을수록 느림 |
| 패키지 크기 | 클수록 느림 |
| VPC 연결 | 추가 지연 (개선됨) |
| Provisioned Concurrency | Cold Start 제거 |

### Cold Start 최적화

```javascript
// 핸들러 외부에서 초기화 (재사용됨)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});  // Cold Start 시 1회만 실행

export const handler = async (event) => {
    // 여기서는 client 재사용
    // ...
};
```

```python
import boto3

# 핸들러 외부 - 실행 환경 재사용 시 유지
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('MyTable')

def lambda_handler(event, context):
    # table 객체 재사용
    response = table.get_item(Key={'id': event['id']})
    return response
```

### Provisioned Concurrency

```bash
# Provisioned Concurrency 설정
aws lambda put-provisioned-concurrency-config \
    --function-name my-function \
    --qualifier prod \
    --provisioned-concurrent-executions 10
```

---

## Lambda 설정

### 기본 설정

| 설정 | 범위 | 기본값 |
|------|------|--------|
| 메모리 | 128MB ~ 10,240MB | 128MB |
| 타임아웃 | 1초 ~ 900초 (15분) | 3초 |
| 임시 스토리지 | 512MB ~ 10,240MB | 512MB |

### 메모리와 CPU

```
메모리 ↑ = CPU ↑ = 비용 ↑

128MB  → 최소 CPU
1,769MB → 1 vCPU
3,008MB → 2 vCPU
10,240MB → 6 vCPU
```

### 환경 변수

```yaml
# AWS SAM template.yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Environment:
        Variables:
          TABLE_NAME: my-table
          LOG_LEVEL: INFO
          API_ENDPOINT: https://api.example.com
```

```javascript
// Lambda에서 사용
const tableName = process.env.TABLE_NAME;
const logLevel = process.env.LOG_LEVEL;
```

### 암호화된 환경 변수

```javascript
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

const kmsClient = new KMSClient({});

// 암호화된 환경 변수 복호화
const decryptedValue = await kmsClient.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(process.env.ENCRYPTED_SECRET, 'base64')
}));

const secret = Buffer.from(decryptedValue.Plaintext).toString('utf-8');
```

---

## Lambda Layers

### Layer란?

```
Layer: 라이브러리, 런타임, 설정 등을 패키징하여 공유

함수 코드 (10MB)
    ↓
Layer 1: 공통 라이브러리 (50MB)
Layer 2: 설정 파일 (1MB)
    ↓
총 배포 패키지: 61MB
```

### Layer 생성

```bash
# 디렉토리 구조
layer/
└── nodejs/
    └── node_modules/
        ├── axios/
        └── lodash/

# 압축
cd layer
zip -r ../my-layer.zip .

# Layer 생성
aws lambda publish-layer-version \
    --layer-name my-shared-libs \
    --zip-file fileb://my-layer.zip \
    --compatible-runtimes nodejs18.x nodejs20.x
```

### Python Layer

```bash
# 디렉토리 구조
python/
└── lib/
    └── python3.11/
        └── site-packages/
            └── requests/

# 또는 간단히
python/
└── requests/
```

### Layer 사용

```bash
aws lambda update-function-configuration \
    --function-name my-function \
    --layers arn:aws:lambda:ap-northeast-2:123456789012:layer:my-shared-libs:1
```

### 제한사항

| 항목 | 제한 |
|------|------|
| 함수당 Layer 수 | 최대 5개 |
| 총 압축 해제 크기 | 250MB (코드 + 모든 Layer) |
| Layer 버전 수 | 무제한 |

---

## VPC 연결

### VPC Lambda 필요 케이스

```
VPC 내부 리소스 접근 시:
- RDS (Private Subnet)
- ElastiCache
- EC2 인스턴스
- 내부 API
```

### VPC 설정

```yaml
# SAM template
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      VpcConfig:
        SecurityGroupIds:
          - sg-12345678
        SubnetIds:
          - subnet-11111111
          - subnet-22222222
```

### NAT Gateway 구성 (인터넷 접근 필요 시)

```
VPC 구성:
├── Public Subnet
│   └── NAT Gateway
├── Private Subnet 1
│   └── Lambda (az-a)
└── Private Subnet 2
    └── Lambda (az-b)

Route Table (Private):
0.0.0.0/0 → NAT Gateway
```

### VPC Endpoints (NAT 없이 AWS 서비스 접근)

```
VPC Endpoint 활용:
├── S3 Gateway Endpoint (무료)
├── DynamoDB Gateway Endpoint (무료)
├── SQS Interface Endpoint
├── SNS Interface Endpoint
├── Secrets Manager Interface Endpoint
└── Systems Manager Interface Endpoint
```

---

## 버전과 별칭

### 버전 (Version)

```bash
# 버전 발행
aws lambda publish-version \
    --function-name my-function \
    --description "Production release v1.0"

# 결과
# arn:aws:lambda:region:account:function:my-function:1
```

### 별칭 (Alias)

```bash
# 별칭 생성
aws lambda create-alias \
    --function-name my-function \
    --name prod \
    --function-version 1

# 별칭 업데이트
aws lambda update-alias \
    --function-name my-function \
    --name prod \
    --function-version 2
```

### 가중치 기반 라우팅 (Canary 배포)

```bash
# 90% → 버전 1, 10% → 버전 2
aws lambda update-alias \
    --function-name my-function \
    --name prod \
    --function-version 1 \
    --routing-config AdditionalVersionWeights={"2"=0.1}
```

---

## 동시성 관리

### 동시성 유형

```
Reserved Concurrency (예약 동시성)
→ 특정 함수에 동시성 예약
→ 다른 함수가 사용 불가
→ 설정 무료

Provisioned Concurrency (프로비저닝된 동시성)
→ 미리 실행 환경 준비
→ Cold Start 제거
→ 추가 비용 발생
```

### 동시성 설정

```bash
# Reserved Concurrency 설정
aws lambda put-function-concurrency \
    --function-name my-function \
    --reserved-concurrent-executions 100

# 동시성 확인
aws lambda get-function-concurrency \
    --function-name my-function
```

### 계정 동시성 한도

```
기본 한도: 1,000 (리전별)
→ 증가 요청 가능

Burst 한도: 500 ~ 3,000 (리전별 상이)
```

### 스로틀링 처리

```javascript
// 비동기 호출 시 자동 재시도 (2회)
// 동기 호출 시 429 오류 반환

// 클라이언트에서 처리
try {
    await lambda.invoke({ ... });
} catch (error) {
    if (error.name === 'TooManyRequestsException') {
        // 재시도 로직
        await delay(1000);
        // retry...
    }
}
```

---

## 오류 처리

### 동기 호출 오류

```javascript
export const handler = async (event) => {
    try {
        const result = await processEvent(event);
        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error:', error);

        // API Gateway 형식
        return {
            statusCode: error.statusCode || 500,
            body: JSON.stringify({
                message: error.message,
                errorType: error.name
            })
        };
    }
};
```

### 비동기 호출 오류

```yaml
# 실패 시 DLQ로 전송
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      DeadLetterQueue:
        Type: SQS
        TargetArn: !GetAtt DeadLetterQueue.Arn
```

### 목적지 (Destinations)

```yaml
# 성공/실패 시 다른 서비스로 라우팅
EventInvokeConfig:
  DestinationConfig:
    OnSuccess:
      Type: SQS
      Destination: !GetAtt SuccessQueue.Arn
    OnFailure:
      Type: SNS
      Destination: !Ref FailureTopic
```

---

## Lambda 함수 URL

### Function URL이란?

```
API Gateway 없이 HTTPS 엔드포인트 제공
https://<url-id>.lambda-url.<region>.on.aws/
```

### 설정

```bash
# Function URL 생성
aws lambda create-function-url-config \
    --function-name my-function \
    --auth-type NONE  # 또는 AWS_IAM

# 리소스 정책 추가 (공개 접근)
aws lambda add-permission \
    --function-name my-function \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --statement-id public-access
```

### CORS 설정

```bash
aws lambda create-function-url-config \
    --function-name my-function \
    --auth-type NONE \
    --cors '{
        "AllowOrigins": ["https://example.com"],
        "AllowMethods": ["GET", "POST"],
        "AllowHeaders": ["content-type"],
        "MaxAge": 86400
    }'
```

---

## 모니터링과 로깅

### CloudWatch Logs

```javascript
// 자동으로 CloudWatch Logs에 기록
console.log('Info message');
console.error('Error message');
console.warn('Warning message');

// 구조화된 로깅
console.log(JSON.stringify({
    level: 'INFO',
    message: 'Processing request',
    requestId: context.awsRequestId,
    data: { userId: '123' }
}));
```

### CloudWatch Metrics

| 메트릭 | 설명 |
|--------|------|
| Invocations | 호출 횟수 |
| Duration | 실행 시간 |
| Errors | 오류 횟수 |
| Throttles | 스로틀 횟수 |
| ConcurrentExecutions | 동시 실행 수 |
| IteratorAge | 스트림 처리 지연 |

### X-Ray 추적

```javascript
import AWSXRay from 'aws-xray-sdk-core';
import AWS from 'aws-sdk';

// AWS SDK 래핑
const TracedAWS = AWSXRay.captureAWS(AWS);
const dynamodb = new TracedAWS.DynamoDB.DocumentClient();

export const handler = async (event) => {
    // 서브세그먼트 생성
    const segment = AWSXRay.getSegment();
    const subsegment = segment.addNewSubsegment('process-data');

    try {
        // 비즈니스 로직
        const result = await processData(event);
        subsegment.close();
        return result;
    } catch (error) {
        subsegment.addError(error);
        subsegment.close();
        throw error;
    }
};
```

### Lambda Insights

```yaml
# 향상된 모니터링
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Layers:
        - arn:aws:lambda:ap-northeast-2:580247275435:layer:LambdaInsightsExtension:21
      Policies:
        - CloudWatchLambdaInsightsExecutionRolePolicy
```

---

## 제한 및 할당량

### 함수 제한

| 항목 | 제한 |
|------|------|
| 메모리 | 128MB ~ 10,240MB |
| 타임아웃 | 최대 900초 (15분) |
| 환경 변수 크기 | 4KB |
| 임시 스토리지 (/tmp) | 512MB ~ 10,240MB |
| 함수 레이어 수 | 5개 |

### 배포 제한

| 항목 | 제한 |
|------|------|
| 압축 패키지 크기 (.zip) | 50MB (직접 업로드) |
| 압축 해제 크기 | 250MB |
| 컨테이너 이미지 | 10GB |
| 코드 + 레이어 합계 | 250MB |

### 동시성 제한

| 항목 | 제한 |
|------|------|
| 계정당 동시 실행 | 1,000 (기본, 증가 가능) |
| Burst 동시성 | 500 ~ 3,000 (리전별) |
| 함수별 Reserved | 계정 한도 - 100 |

---

## 요금

### 요금 구성

```
총 비용 = 요청 비용 + 컴퓨팅 비용

요청 비용:
- 100만 요청당 $0.20
- 첫 100만 요청/월 무료

컴퓨팅 비용:
- GB-초당 $0.0000166667
- 400,000 GB-초/월 무료
```

### 예시 계산

```
함수 설정: 512MB 메모리, 평균 200ms 실행
월 호출: 3,000,000회

요청 비용:
(3,000,000 - 1,000,000) × $0.0000002 = $0.40

컴퓨팅 비용:
GB-초 = 3,000,000 × 0.5GB × 0.2초 = 300,000 GB-초
무료 한도 내 → $0

총 비용: $0.40/월
```

### Provisioned Concurrency 비용

```
프로비저닝 비용 + 실행 비용

프로비저닝 비용:
- GB-시간당 $0.000004463

실행 비용:
- GB-초당 $0.0000041667 (일반 대비 저렴)
```

---

## 배포 방법

### AWS CLI

```bash
# 코드 패키징
zip -r function.zip index.js node_modules/

# 함수 생성
aws lambda create-function \
    --function-name my-function \
    --runtime nodejs20.x \
    --role arn:aws:iam::123456789012:role/lambda-role \
    --handler index.handler \
    --zip-file fileb://function.zip

# 코드 업데이트
aws lambda update-function-code \
    --function-name my-function \
    --zip-file fileb://function.zip
```

### AWS SAM

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 30
    MemorySize: 256

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: index.handler
      Events:
        Api:
          Type: Api
          Properties:
            Path: /hello
            Method: get
```

```bash
# 빌드 및 배포
sam build
sam deploy --guided
```

### Serverless Framework

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  region: ap-northeast-2

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
```

```bash
# 배포
serverless deploy
```

### 컨테이너 이미지

```dockerfile
# Dockerfile
FROM public.ecr.aws/lambda/nodejs:20

COPY index.js package*.json ./
RUN npm ci --production

CMD ["index.handler"]
```

```bash
# 빌드 및 푸시
docker build -t my-lambda .
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker tag my-lambda:latest $ECR_URI/my-lambda:latest
docker push $ECR_URI/my-lambda:latest

# Lambda 생성
aws lambda create-function \
    --function-name my-function \
    --package-type Image \
    --code ImageUri=$ECR_URI/my-lambda:latest \
    --role arn:aws:iam::123456789012:role/lambda-role
```

---

## Best Practices

### 코드 최적화

```javascript
// 1. 핸들러 외부에서 초기화
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
const client = new DynamoDBClient({});

// 2. Keep-Alive 사용 (HTTP 연결 재사용)
import https from 'https';
const agent = new https.Agent({ keepAlive: true });

// 3. 불필요한 의존성 제거
// package.json의 dependencies 최소화

export const handler = async (event) => {
    // 4. 비동기 작업 병렬 실행
    const [user, orders] = await Promise.all([
        getUser(event.userId),
        getOrders(event.userId)
    ]);

    return { user, orders };
};
```

### 보안

```javascript
// 1. 최소 권한 IAM 역할
// 필요한 권한만 부여

// 2. 민감 정보는 환경 변수 + KMS 암호화
// 또는 Secrets Manager 사용
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

// 캐싱 (Cold Start 시 1회만)
let cachedSecret;

async function getSecret() {
    if (!cachedSecret) {
        const response = await secretsClient.send(
            new GetSecretValueCommand({ SecretId: 'my-secret' })
        );
        cachedSecret = JSON.parse(response.SecretString);
    }
    return cachedSecret;
}

// 3. 입력 검증
export const handler = async (event) => {
    if (!event.userId || typeof event.userId !== 'string') {
        throw new Error('Invalid userId');
    }
    // ...
};
```

### 멱등성 보장

```javascript
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

export const handler = async (event) => {
    const requestId = event.requestContext?.requestId || event.Records[0].messageId;

    // 중복 처리 방지
    try {
        await client.send(new PutItemCommand({
            TableName: 'ProcessedRequests',
            Item: {
                requestId: { S: requestId },
                processedAt: { S: new Date().toISOString() }
            },
            ConditionExpression: 'attribute_not_exists(requestId)'
        }));

        // 실제 처리
        await processEvent(event);

    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log('Duplicate request, skipping');
            return;
        }
        throw error;
    }
};
```

---

## 실무 예제

### API Gateway + Lambda + DynamoDB

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
    const { httpMethod, pathParameters, body } = event;

    try {
        let result;

        switch (httpMethod) {
            case 'GET':
                if (pathParameters?.id) {
                    result = await getItem(pathParameters.id);
                } else {
                    result = await listItems();
                }
                break;
            case 'POST':
                result = await createItem(JSON.parse(body));
                break;
            case 'DELETE':
                result = await deleteItem(pathParameters.id);
                break;
            default:
                return response(405, { message: 'Method not allowed' });
        }

        return response(200, result);
    } catch (error) {
        console.error('Error:', error);
        return response(500, { message: error.message });
    }
};

async function getItem(id) {
    const { Item } = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return Item;
}

async function listItems() {
    const { Items } = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    return Items;
}

async function createItem(item) {
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...item, id: crypto.randomUUID() }
    }));
    return item;
}

async function deleteItem(id) {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return { deleted: true };
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    };
}
```

### S3 이미지 리사이징

```javascript
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});
const DEST_BUCKET = process.env.DEST_BUCKET;

export const handler = async (event) => {
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    // 원본 이미지 가져오기
    const { Body, ContentType } = await s3.send(new GetObjectCommand({
        Bucket: srcBucket,
        Key: srcKey
    }));

    const imageBuffer = await streamToBuffer(Body);

    // 리사이징
    const sizes = [
        { suffix: 'thumb', width: 150, height: 150 },
        { suffix: 'medium', width: 500, height: 500 },
        { suffix: 'large', width: 1000, height: 1000 }
    ];

    await Promise.all(sizes.map(async (size) => {
        const resized = await sharp(imageBuffer)
            .resize(size.width, size.height, { fit: 'inside' })
            .toBuffer();

        const destKey = srcKey.replace(/(\.[^.]+)$/, `-${size.suffix}$1`);

        await s3.send(new PutObjectCommand({
            Bucket: DEST_BUCKET,
            Key: destKey,
            Body: resized,
            ContentType
        }));
    }));

    console.log(`Resized ${srcKey} to ${sizes.length} sizes`);
};

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
```

---

## 정리

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js, Python, Java, Go, .NET, Ruby, Custom |
| 최대 실행 시간 | 15분 (900초) |
| 메모리 | 128MB ~ 10,240MB |
| 임시 스토리지 | 512MB ~ 10,240MB |
| 패키지 크기 | 50MB (압축), 250MB (압축 해제), 10GB (컨테이너) |
| 동시성 | 1,000 (기본, 증가 가능) |
| 무료 티어 | 100만 요청 + 400,000 GB-초/월 |

### Lambda 선택 기준

```
Lambda가 적합한 경우:
- 이벤트 기반 처리
- 간헐적인 워크로드
- 빠른 스케일링 필요
- 인프라 관리 최소화

Lambda가 부적합한 경우:
- 15분 이상 실행 필요
- 일정한 고성능 요구
- 특정 하드웨어 필요
- 복잡한 상태 관리
```

> Lambda는 서버리스 아키텍처의 핵심 서비스다.
> 적절한 설정과 최적화로 비용 효율적인 애플리케이션을 구축할 수 있다.
