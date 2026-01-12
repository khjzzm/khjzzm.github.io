---
layout: post
title: redis-docker Master/Slave 구성
tags: [docker, redis]
---

## redis.conf 파일 작성
~~~conf
requirepass password
replicaof master 6379
~~~
[redis conf 파일 6.0](https://raw.githubusercontent.com/redis/redis/6.0/redis.conf)


## docker-compose.yml 작성
~~~yml
version: '3.7'
services:
  master:
    container_name: master
    image: redis
    ports:
      - 6379:6379
  slave-a:
    container_name: slave-a
    image: redis
    ports:
      - 7001:6379
    volumes:
      - ./conf:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf
  slave-b:
    container_name: slave-b
    image: redis
    ports:
      - 7002:6379
    volumes:
      - ./conf:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf
~~~

실행
~~~
docker-compose up -d
~~~
