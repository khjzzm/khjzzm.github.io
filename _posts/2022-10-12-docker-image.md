---
layout: post
title: docker 이미지
tags: [docker]
---

# 이미지란

도커는 레이어드 파일 시스템 기반   
AUFS, BTRFS, Overlayfs, ...   
이미지는 프로세스가 실행되는 파일들의 집합(환경)   
프로세스는 환경(파일)을 변경할 수 있음   
이 환경을 저장해서 새로운 이미지를 만든다   


## 도커 이미지 만들기
~~~
docker build -t subicura/ubuntu:git01 .
~~~
docker build -t {이미지명:이미지태그} {빌드 컨텍스트} 

현재 디렉토리의 Dockerfile로 빌드
  - -f <Dockerfile 위치> 옵션을 사용해 다른 위치의 Dockerfile 파일 사용 가능
  - -t 명령어로 도커 이미지 이름을 지정
  - {네임스페이스}/{이미지이름}:{태그} 형식
마지막에는 빌드 컨텍스트 위치를 지정
  - 현재 디렉터리를 의미하는 점(.)을 주로 사용
  - 필요한 경우 다른 디렉터리를 지정할 수도 있음


## Dockerfile
  - FROM 기본 이미지
  - RUN 쉘 명령어 실행
  - CMD 컨테이너 기본 실행 명령어 (Entrypoint의 인자로 사용)
  - EXPOSE 오픈되는 포트 정보
  - ENV 환경변수 설정
  - ADD 파일 또는 디렉토리 추가. URL/ZIP 사용가능
  - COPY 파일 또는 디렉토리 추가
  - ENTRYPOINT 컨테이너 기본 실행 명령어
  - VOLUME 외부 마운트 포인트 생성
  - USER RUN, CMD, ENTRYPOINT를 실행하는 사용자
  - WORKDIR 작업 디렉토리 설정
  - ARGS 빌드타임 환경변수 설정
  - LABEL key - value 데이터
  - ONBUILD 다른 빌드의 베이스로 사용될때 사용하는 명령어

Git을 설치한 ubuntu 이미지
~~~
FROM ubuntu:latest
RUN apt-get update
RUN apt-get install -y git
~~~
~~~
docker build -t ubuntu:git-dockerfile . 
~~~
이처럼 도커파일로 관리하게 되면 도커 이미지의 history를 확인 할 수 있음.


## .dockerignore
.gitignore와 비슷한 역할    
도커 빌드 컨텍스트에서 지정된 패턴의 파일을 무시    
.git이나 민감한 정보를 제외하는 용도로 주로 사용    
.git이나 에셋 디렉터리만 제외시켜도 빌드 속도 개선    
이미지 빌드 시에 사용하는 파일은 제외시키면 안 됨    


TDD 하듯이    
한번에 성공하는 빌드는 없음    
파란불(빌드 성공)이 뜰 때까지 많은 빨간불(빌드 실패)를 경험함    
일단 파란불이 켜져도 리팩토링을 통해 더 최적화된 이미지 생성    

# 도커 이미지 만들기 - 웹 애플리케이션 (nodejs)

app.js
~~~javascript
// Require the framework and instantiate it
const fastify = require('fastify')({
  logger: true
})

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})

// Run the server!
fastify.listen(3000, '0.0.0.0', function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  fastify.log.info(`server listening on ${address}`)
})
~~~

Dockerfile
~~~
# 1. node 설치
FROM    ubuntu:22.04
RUN     apt-get update
RUN     DEBIAN_FRONTEND=noninteractive apt-get install -y curl
RUN     curl -sL https://deb.nodesource.com/setup_16.x | bash -
RUN     DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

# 2. 소스 복사
COPY    . /usr/src/app

# 3. Nodejs 패키지 설치
WORKDIR /usr/src/app
RUN     npm install

# 4. WEB 서버 실행 (Listen 포트 정의)
EXPOSE 3000
CMD    node app.js
~~~

.dockerignore
~~~
docker build -t subicura/app .
docker run --rm -d -p 3000:3000 subicura/app
~~~

Dockerfile(v2)
~~~
# 1. node 이미지 사용
FROM    node:16

# 2. 소스 복사
COPY    . /usr/src/app

# 3. Nodejs 패키지 설치
WORKDIR /usr/src/app
RUN     npm install

# 4. WEB 서버 실행 (Listen 포트 정의)
EXPOSE 3000
CMD    node app.js
~~~


Dockerfile(v3)
~~~
# 1. node 이미지 사용
FROM   node:16

# 2. 패키지 우선 복사
COPY    ./package* /usr/src/app/
WORKDIR /usr/src/app
RUN     npm install

# 3. 소스 복사
COPY . /usr/src/app

# 4. WEB 서버 실행 (Listen 포트 정의)
EXPOSE 3000
CMD    node app.js
~~~


Dockerfile(v4)
~~~
# 1. node 이미지 사용
FROM    node:16-alpine

# 2. 패키지 우선 복사
COPY    ./package* /usr/src/app/
WORKDIR /usr/src/app
RUN     npm install

# 3. 소스 복사
COPY . /usr/src/app

# 4. WEB 서버 실행 (Listen 포트 정의)
EXPOSE 3000
CMD    node app.js
~~~


## FROM
~~~
FROM [--platform=<platform>] <image>[:<tag>] [AS <name>]
~~~
베이스 이미지 지정
- FROM ubuntu:latest
- FROM node:12
- FROM python:3


## COPY
~~~
COPY [--chown=<user>:<group>] <src>... <dest>
~~~
파일 또는 디렉토리 추가   
- COPY index.html /var/www/html/   
- COPY ./app /usr/src/app   


## RUN
~~~
RUN <command>
~~~
명령어 실행
- RUN apt-get update
- RUN npm install


## WORKDIR
~~~
WORKDIR /path/to/workdir
~~~
작업 디렉토리 변경
- WORKDIR /app


## EXPOSE
~~~
EXPOSE 3000
~~~
컨테이너에서 사용하는 포트 정보
- EXPOSE 8000

## CMD
~~~
CMD ["executable","param1","param2"]
CMD command param1 param2
~~~
컨테이너 생성시 실행할 명령어
- CMD ["node", "app.js"]
- CMD node app.js


# 이미지 저장소

## 이미지 저장 명령어
- docker login
- docker push {ID}/example
- docker pull {ID}/example

[docker hub](hub.docker.com)


# 배포하기
~~~
docker run -d -p 3000:3000 subicura/app
~~~
컨테이너 실행 = 이미지 pull + 컨테이너 start


**추가적인 내용**
- 이미지를 만들기 위한 다양한 쉘 스크립트 & 환경변수 사용
- CI/CD 자동빌드, 자동배포, blue & green 배포 / 무중단 배포하기
- 모니터링, 로그
- 가상 네트워크
- 보안
- 쿠버네티스 (kubernetes)
- 이스티오 서비스매시 (istio)
