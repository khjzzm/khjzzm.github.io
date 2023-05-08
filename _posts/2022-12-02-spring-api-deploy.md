---
layout: post
title: spring boot rest api deploy
---


## 스프링 부트로 제작한 rest api 배포하기 

- Jenkins  : 61.80.148.63:9091 [admin/khj59shj121!]
- API : 61.80.148.63:463
- MariaDB : 61.80.148.63:3306 [root/khj59shj121!]
- Redis : 61.80.148.63:6379 [qwerredis5678]
- Grafana : 61.80.148.63:3001  [admin/qwer1234]

## Spring Boot
- version '2.7.4'
- 


## Docker

~~~dockerfile
FROM adoptopenjdk:11-jdk-hotspot
LABEL maintainer="khjzzm@gmail.com"
ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
EXPOSE 463
ENTRYPOINT ["java", "-Dspring.profiles.active=${SERVER_MODE}", "-Djasypt.encryptor.password=${JASYPT}", "-jar", "app.jar"]
~~~