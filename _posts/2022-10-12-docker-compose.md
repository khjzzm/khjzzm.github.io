---
layout: post
title: docker 컴포즈
tags: [docker]
---


## 도커 컴포즈 설치 확인
~~~
docker-compose version
~~~

------------------------------------------------------------------------

## docker-compose.yml

~~~yml
version: '2'
services:
  db:
    image: mysql:5.7
    volumes:
      - ./mysql:/var/lib/mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: wordpress
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress
  wordpress:
    image: wordpress:latest
    volumes:
    - ./wp:/var/www/html
    ports:
    - "8000:80"
    restart: always
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_PASSWORD: wordpress
~~~

------------------------------------------------------------------------

# 도커 컴포즈 문법

## version
~~~
version: '3'   
~~~
docker-compose.yml 파일의 명세 버전, 버전에 따라 지원하는 도커 엔진 버전도 다름

## services
~~~
services:
 postgres:
 ...
 django:
 ...
 ~~~
실행할 컨테이너 정의 docker run --name django과 같다고 생각할 수 있음

## image
~~~
services:
 django:
 image: django-sample
 ~~~
컨테이너에 사용할 이미지 이름과 태그 태그를 생략하면 latest 이미지가 없으면 자동으로 pull

## ports
~~~
services:
 django:
 ...
 ports:
 - "8000:8000"
~~~
컨테이너와 연결할 포트(들) {호스트 포트}:{컨테이너 포트}

## environment
~~~
services:
 mysql:
 ...
 environment:
 - MYSQL_ROOT_PASSWORD=somewordpress: '3'
~~~
- 컨테이너에서 사용할 환경변수(들)
- {환경변수 이름}:{값}

## volumes
~~~
services:
 django:
 ...
 volumes:
 - ./app:/app
~~~
- 마운트하려는 디렉터리(들)
- {호스트 디렉터리}:{컨테이너 디렉터리}

## restart
~~~
services:
 django:
 restart: always
~~~
재시작 정책
- restart: "no"
- restart: always
- restart: on-failure
- restart: unless-stopped

## build
~~~
django:
 build:
 context: .
 dockerfile: ./compose/django/Dockerfile-dev
~~~

이미지를 자체 빌드 후 사용 image 속성 대신 사용함 여기에 사용할 별도의 도커 파일이 필요함

------------------------------------------------------------------------

# 도커 컴포즈 명령어

## up
docker-compose.yml에 정의된 컨테이너를 실행
- docker-compose up
- docker-compose up -d
  - docker run의 -d 옵션과 동일
- docker-compose up --force-recreate
  - 컨테이너를 새로 만들기
- docker-compose up --build
  - 도커 이미지를 다시 빌드(build로 선언했을 때만)


## start
멈춘 컨테이너를 재개
- docker-compose start
- docker-compose start wordpress
  - wordpress 컨테이너만 재개

## restart
컨테이너를 재시작
- docker-compose restart
- docker-compose restart wordpress
  - wordpress 컨테이너만 재시작

## stop
컨테이너 멈춤
- docker-compose stop
- docker-compose stop wordpress
  - wordpress 컨테이너만 멈춤

## down
컨테이너를 종료하고 삭제
- docker-compose down


## logs
컨테이너의 로그
- docker-compose logs
- docker-compose logs -f
  - 로그 follow

## ps
컨테이너 목록
- docker-compose ps

## exec
실행 중인 컨테이너에서 명령어 실행
- docker-compose exec {컨테이너 이름} {명령어}
- docker-compose exec wordpress bash

## build
컨테이너 build 부분에 정의된 내용대로 빌드
- build로 선언된 컨테이너만 빌드됨
- docker-compose build
- docker-compose build wordpress
  - wordpress 컨테이너만 build




