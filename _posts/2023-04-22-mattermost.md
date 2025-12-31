---
layout: post
title: Mattermost
---

사내 개발팀에서 Slack(슬랙)을 사용했었는데 비용 문제로 인해 셀프 호스팅이 가능한 오픈소스 프로젝트 Mattermost(매터모스트)를 설치해서 사용 하고있다.
기존 슬랙에 설정한 출퇴근 알림, 젠킨스 빌드&배포시 webhook(웹훅)등 편의 기능을 매터모스트에도 설정 하기 위한 과정을 블로그에 정리 해본다.

## TODO list
1. 젠킨스 빌드완료 시 (o)
2. 서비스 1:1 문의가 들어왔을 경우  (o)
3. API 에러로그 기능
4. 출퇴근 알림


### 웹후크 엔드포인트 생성
~~~
https://your-mattermost-server.com/hooks/xxx-generatedkey-xxx
~~~

### 수신 웹후크 사용
~~~http request
POST /hooks/xxx-generatedkey-xxx HTTP/1.1
Host: your-mattermost-server.com
Content-Type: application/json
Content-Length: 63

{
    "text": "Hello, this is some text\nThis is more text. 🎉"
}
~~~

~~~shell
curl -i -X POST -H 'Content-Type: application/json' -d '{"text": "Hello, this is some text\nThis is more text. 🎉"}' https://your-mattermost-server.com/hooks/xxx-generatedkey-xxx
~~~

#### response
~~~http request
HTTP/1.1 200 OK
Content-Type: text/plain
X-Request-Id: hoan6o9ws7rp5xj7wu9rmysrte
X-Version-Id: 4.7.1.dev.12799cd77e172e8a2eba0f9091ec1471.false
Date: Sun, 04 Mar 2018 17:19:09 GMT
Content-Length: 2

ok
~~~

## 젠킨스 빌드완료 시 with Execute Shell

## 서비스 1:1 문의가 들어왔을 경우 with java

## API 에러로그 기능

## 출퇴근 알림


