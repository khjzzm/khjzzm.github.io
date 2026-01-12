---
layout: post
title: 여보야 런치 도커
tags: [docker]
---

## dockerfile
~~~dockerfile
## BUILDER
# 베이스 이미지로 gradle 7.3.1과 JDK 11 버전을 가지고 있는 이미지를 사용합니다
FROM gradle:7.3.1-jdk11 AS build

# 현재 위치의 모든 파일을 도커 컨테이너 내 /home/gradle/src 디렉토리에 복사합니다
COPY --chown=gradle:gradle . /home/gradle/src

# 도커에서 사용할 작업 디렉토리를 지정합니다
WORKDIR /home/gradle/src

# Gradle을 이용해 빌드를 수행하며, 데몬을 사용하지 않거나(test 제외) 빌드를 수행합니다
RUN gradle build --no-daemon -x test

## RUNNING
# 베이스 이미지로 adoptopenjdk의 11버전 jdk-hotspot 런타임을 사용합니다
FROM adoptopenjdk:11-jdk-hotspot

# 이미지를 유지보수하는 사람의 정보를 레이블 형식으로 명시합니다
LABEL maintainer="khjzzm@gmail.com"

# 컨테이너의 4463 포트를 이용하도록 설정합니다
EXPOSE 4463

# 이전 BUILDER 단계에서 빌드된 jar 파일을 app 디렉토리에 복사합니다
COPY --from=build /home/gradle/src/build/libs/*.jar /app/app.jar

# Docker 컨테이너가 생성되었을 때 실행될 명령어를 정의합니다
# 여기서는 자바 애플리케이션을 실행하는 java -jar command 를 정의하고 있습니다
# Spring 프로파일 환경변수로 "SERVER_MODE"값을 이용하며 /app/app.jar를 실행합니다
ENTRYPOINT [                                                 \
    "java",                                                  \
    "-Dspring.profiles.active=${SERVER_MODE}",               \
    "-jar",                                                  \
    "/app/app.jar"                                                \
]
~~~


## container
- 이미지: khjzzm/yeoboya-lunch-api:latest
- 컨테이너 이름: lunch-container
- 포트 매핑: 호스트의 4463 포트를 컨테이너의 4463 포트에 연결
- 볼륨 매핑: 로컬 경로 /Users/hyunjinkim/.aws를 컨테이너의 /root/.aws 경로에 연결
- 환경 변수: SERVER_MODE를 prod로 설정
~~~docker
docker run -d --name lunch-container -p 4463:4463 -v /Users/hyunjinkim/.aws:/root/.aws -e SERVER_MODE=prod khjzzm/yeoboya-lunch-api:latest
~~~

- docker run: 새 컨테이너를 실행하는 명령어입니다.
- -d: 컨테이너를 백그라운드에서 실행합니다(분리된 모드).
- --name lunch-container: lunch-container라는 이름을 컨테이너에 할당합니다.
- -p 4463:4463: 호스트의 4463 포트와 컨테이너의 4463 포트를 매핑합니다.
- -v /Users/hyunjinkim/.aws:/root/.aws: 호스트의 /Users/hyunjinkim/.aws 경로를 컨테이너의 /root/.aws 경로에 볼륨으로 마운트합니다.
- -e SERVER_MODE=prod: 컨테이너 내부에서 SERVER_MODE 환경 변수를 prod 값으로 설정합니다.
- khjzzm/yeoboya-lunch-api:latest: 컨테이너에 사용할 이미지를 지정합니다.


## ECS 에 Docker 이미지 push (Private registry)
1. Amazon Elastic Container Registry 생성
2. aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 133988310128.dkr.ecr.ap-northeast-2.amazonaws.com
   - IAM AmazonEC2ContainerRegistryFullAccess
3. docker tag khjzzm/yeoboya-lunch-api:latest 133988310128.dkr.ecr.ap-northeast-2.amazonaws.com/yeoboya-lunch-repository
   - Docker 이미지 태깅
4. docker push 133988310128.dkr.ecr.ap-northeast-2.amazonaws.com/yeoboya-lunch-repository:latest
   - 이미지 푸시

## Amazon Elastic Container Service
1. 클러스터 생성 - AWS Fargate(서버리스) 
2. 태스크 정의
--- 막힘..




