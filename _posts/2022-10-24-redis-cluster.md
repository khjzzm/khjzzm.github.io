---
layout: post
title: redis-docker cluster 구성
---

## redis.conf 파일 작성

```conf
port 7001

#cluster 사용 여부
cluster-enabled yes

#cluster 설정 파일 이름
cluster-config-file node.conf

#timeout 시간 지정 (ms)
cluster-node-timeout 5000

#failover된 redis node 재실행 시 이전 데이터를 다시 로드해올 수 있음
appendonly yes

port 7002

...
port 7003

...
port 7004

...
port 7005

...
port 7006

...

requirepass password
```

... 동일

첫번째 redis server는 각 redis들을 묶어줄 cluster의 master 개념이고 나머지 redis들은 저장소의 역할을 할 master-slave관계를 가질 redis들이다.

## docker-compose.yml 작성

```yml
version: "3.7"
services:
  node1:
    container_name: node1
    image: redis
    volumes:
      - ./conf1:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf
    ports:
      - 7001:7001
      - 7002:7002
      - 7003:7003
      - 7004:7004
      - 7005:7005

  node2:
    network_mode: "service:node1"
    container_name: node2
    image: redis
    volumes:
      - ./conf2:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf

  node3:
    network_mode: "service:node1"
    container_name: node3
    image: redis
    volumes:
      - ./conf3:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf

  node4:
    network_mode: "service:node1"
    container_name: node4
    image: redis
    volumes:
      - ./conf4:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf

  node5:
    network_mode: "service:node1"
    container_name: node5
    image: redis
    volumes:
      - ./conf5:/usr/local/etc/redis/
    command: redis-server /usr/local/etc/redis/redis.conf

  redis-cluster-entry:
    network_mode: "service:node1"
    image: redis
    container_name: redis-cluster
    command: redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 --cluster-replicas 1 --cluster-yes
    depends_on:
      - node1
      - node2
      - node3
      - node4
      - node5
```

실행

```
docker-compose up -d
```
