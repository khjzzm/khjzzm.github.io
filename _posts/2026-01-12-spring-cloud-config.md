---
layout: post
title: Spring Cloud Config와 AWS Secrets Manager로 설정 관리하기
tags: [spring, aws, architecture]
---

## 개요

Spring Cloud Config Server와 AWS Secrets Manager를 통합한 중앙 집중식 설정 관리 구조를 정리한다.
일반 설정은 Git 저장소에서 관리하고, 민감한 정보(비밀번호, 인증키 등)는 AWS Secrets Manager에서 관리하는 방식이다.

## 전체 아키텍처

```
┌─────────────────┐     GET /{app}/{profile}     ┌──────────────────┐
│ 클라이언트       │ ──────────────────────────▶ │ Config Server    │
│ (각 서비스)      │                              │ (8888)           │
└─────────────────┘                              └────────┬─────────┘
       ▲                                                  │
       │                                                  │ 1. Git에서 설정 로드
       │                                                  ▼
       │                                         ┌──────────────────┐
       │                                         │ cloud-config-repo │
       │                                         │ (Git 저장소)       │
       │                                         └──────────────────┘
       │                                                  │
       │                                                  │ 2. ${secrets@...} 치환
       │                                                  ▼
       │                                         ┌──────────────────┐
       │                                         │ AWS Secrets      │
       │                                         │ Manager          │
       │                                         └──────────────────┘
       │                                                  │
       └────────────────── 치환된 설정 응답 ──────────────┘
```

## bootstrap.yml vs application.yml

### 실행 순서

```
bootstrap.yml → application.yml
```

**bootstrap.yml**이 먼저 로드되고, 그 다음 **application.yml**이 로드된다.

### bootstrap.yml

**역할:** 애플리케이션 컨텍스트가 시작되기 **전에** 필요한 설정

**주요 용도:**
- Spring Cloud Config Server 연결 정보
- 암호화/복호화 키 설정
- 애플리케이션 이름 (`spring.application.name`)
- Config Server에서 설정을 가져오기 위한 최소 정보

```yaml
spring:
  application:
    name: order-api
  cloud:
    config:
      uri: http://config-server:8888
      fail-fast: true
```

### application.yml

**역할:** 애플리케이션의 **일반적인** 설정

**주요 용도:**
- 데이터베이스 연결 정보
- 서버 포트
- 로깅 설정
- 비즈니스 로직 관련 설정

```yaml
server:
  port: 8081
logging:
  level:
    root: info
    com.example: debug
```

### 왜 분리되어 있는가?

Spring Cloud Config를 사용할 때:

1. **bootstrap.yml**: "Config Server 어디 있어?"를 알려줌
2. Config Server에서 설정을 가져옴
3. **application.yml**: 로컬 설정과 병합됨

Config Server를 사용하지 않으면 bootstrap.yml은 필요 없다.

### bootstrap.yml이 먼저 실행되는 원리

**Spring Boot 자체의 기본 설정이 아니다.** `spring-cloud-context` 라이브러리가 이 동작을 제공한다.

```
spring-cloud-starter-config
    └── spring-cloud-config-client
            └── spring-cloud-context  ← 여기서 bootstrap 로딩 처리
```

`BootstrapApplicationListener` 클래스가 bootstrap.yml을 먼저 로드하는 역할을 한다.

### Spring Boot 2.4 이후 변경사항

Spring Boot 2.4부터는 bootstrap.yml 지원이 **기본 비활성화**되었다.

사용하려면 별도 의존성 추가 필요:

```gradle
implementation 'org.springframework.cloud:spring-cloud-starter-bootstrap'
```

또는 `spring.cloud.bootstrap.enabled=true` 설정 필요.

### 설정 파일 비교

| 구분 | bootstrap.yml | application.yml |
|------|---------------|-----------------|
| 실행 시점 | 애플리케이션 컨텍스트 시작 **전** | 애플리케이션 컨텍스트 시작 **후** |
| 주요 용도 | Config Server 연결 정보 | 일반 설정 |
| 제공 주체 | Spring Cloud Context | Spring Boot |
| 필수 여부 | Config Server 사용 시에만 필요 | 항상 필요 |
| Boot 2.4+ | 별도 의존성 필요 | 기본 지원 |

## 프로젝트 구조

두 개의 프로젝트로 구성된다.

### 1. cloud-config (Config Server)

설정을 배포하는 서버 애플리케이션이다.

```
cloud-config/
├── config-server/
│   ├── src/main/java/.../
│   │   ├── CloudConfigServerApplication.java
│   │   ├── advice/
│   │   │   └── AWSSecretsManagerAdvice.java    # 설정값 치환 로직
│   │   ├── config/
│   │   │   └── AWSSecretsManagerConfig.java    # AWS SDK 설정
│   │   └── service/
│   │       └── AWSSecretsManagerServiceImpl.java
│   └── src/main/resources/
│       ├── application.yml     # 서버 설정 (포트: 8888)
│       └── bootstrap.yml
└── test-client/                # 테스트용 클라이언트
```

### 2. cloud-config-repo (설정 저장소)

실제 설정 파일들이 저장된 Git 저장소다.

```
cloud-config-repo/
├── config/                     # 운영 환경 설정
│   ├── order/
│   │   ├── order-api.yml
│   │   └── application-order.yml
│   ├── payment/
│   ├── notification/
│   └── ...
├── config-staging/             # 스테이징 환경 설정
└── config-test/                # 테스트 환경 설정
```

## 핵심 연결 설정

### Config Server → Git 저장소

`config-server/src/main/resources/application.yml`:

```yaml
server:
  port: 8888
spring:
  cloud:
    config:
      server:
        git:
          clone-on-start: true
          timeout: 60000
          uri: https://github.com/my-org/cloud-config-repo.git
          username: ${SPRING_CLOUD_CONFIG_SERVER_REPO_USERNAME}
          password: ${SPRING_CLOUD_CONFIG_SERVER_REPO_PASSWORD}
          default-label: main
          search-paths: config/**
aws:
  secret-manager:
    secret-id: config-prod
```

- `uri`: Git 저장소 주소
- `search-paths`: 설정 파일을 검색할 경로 패턴
- `default-label`: 기본 브랜치

## 설정 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Bootstrap Phase (애플리케이션 컨텍스트 시작 전)            │
│    └── bootstrap.yml 로드                                   │
│        └── spring.profiles=cloudconfig 체크                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
        cloudconfig              기본 프로파일
        프로파일 활성화                  │
              │                         │
              ▼                         ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ 2. Config Server 연결    │   │ 2. 로컬 설정만 사용      │
│    - 외부 설정 가져오기   │   │    - application.yml    │
│    - 비밀값 주입         │   │    - application-{p}.yml│
└───────────┬─────────────┘   └───────────┬─────────────┘
            │                             │
            └──────────────┬──────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Application Phase                                        │
│    └── application.yml 로드                                 │
│    └── application-{profile}.yml 로드                       │
│    └── Config Server 설정과 병합 (우선순위: Config Server)   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. @ConfigurationProperties 바인딩                          │
│    └── @RefreshScope: 설정 변경 시 동적 리로드               │
└─────────────────────────────────────────────────────────────┘
```

## 실제 클라이언트 적용 예시 (order-api)

실제 MSA 서비스에서 Config Client를 어떻게 사용하는지 살펴본다.

### 클라이언트 bootstrap.yml

`order-api/src/main/resources/bootstrap.yml`:

```yaml
spring:
  application:
    name: order-api
  profiles:
    include:
    - order
  cloud:
    config:
      enabled: false    # 기본값: 비활성화
---
# cloudconfig 프로필 활성화 시
spring.profiles: cloudconfig
spring:
  cloud:
    config:
      enabled: true
      fail-fast: true
      uri: http://${CONFIG_SERVER_HOST}:${CONFIG_SERVER_PORT}
      request-connect-timeout: ${CONFIG_SERVER_CONNECT_TIMEOUT:60000}
      request-read-timeout: ${CONFIG_SERVER_READ_TIMEOUT:60000}
```

- `spring.application.name: order-api`: 이 이름으로 설정 파일 검색
- `spring.profiles.include: order`: `application-order.yml` 설정도 함께 로드
- `cloudconfig` 프로필: 운영 환경에서만 Config Server 연결 활성화
- 환경변수로 Config Server 주소 주입 (K8s, Docker 등)

### 설정 저장소의 파일 구조

`cloud-config-repo/config/order/`:

```
config/order/
├── order-api.yml           # order-api 전용 설정
└── application-order.yml   # order 프로필 공통 설정 (모든 order-* 서비스 공유)
```

### 설정 파일 예시

`cloud-config-repo/config/order/application-order.yml`:

```yaml
spring.profiles: dev,prod
order:
  datasource:
    primary:
      driver-class-name: org.postgresql.Driver
      jdbc-url: jdbc:postgresql://${secrets@order.datasource.primary.host}:${secrets@order.datasource.primary.port:5432}/${secrets@order.datasource.primary.database}
      username: ${secrets@order.datasource.primary.username}
      password: ${secrets@order.datasource.primary.password}
    replica:
      driver-class-name: org.postgresql.Driver
      jdbc-url: jdbc:postgresql://${secrets@order.datasource.replica.host}:${secrets@order.datasource.replica.port:5432}/${secrets@order.datasource.replica.database}
      username: ${secrets@order.datasource.replica.username}
      password: ${secrets@order.datasource.replica.password}
  storage:
    base-path: /app/files
    s3-bucket: my-service-dev
---
spring.profiles: prod
order:
  storage:
    s3-bucket: my-service-prod
```

- DB 접속 정보(host, username, password)는 `${secrets@...}`로 AWS Secrets Manager에서 조회
- 포트는 기본값 지정: `${secrets@...port:5432}`
- 프로필별 설정 분리: `dev,prod` 공통 설정 + `prod` 전용 오버라이드

### 설정 로드 순서

```
1. order-api 로컬 application.yml (포트, 로깅 등 기본값)
     ↓
2. Config Server 요청: GET /order-api/dev,order
     ↓
3. 로드되는 파일들:
   - config/order/order-api.yml (application-name 매칭)
   - config/order/application-order.yml (profiles.include: order 매칭)
     ↓
4. AWS Secrets Manager 값 치환
     ↓
5. 최종 설정 주입
```

### 실행 예시

```bash
# 로컬 개발 (Config Server 미사용)
java -jar order-api.jar

# 운영 환경 (Config Server 사용)
java -jar order-api.jar \
  --spring.profiles.active=cloudconfig,dev \
  -DCONFIG_SERVER_HOST=config-server \
  -DCONFIG_SERVER_PORT=8888
```

### 파일 매핑 규칙

| 클라이언트 요청 | 매핑되는 파일 |
|----------------|--------------|
| `order-api` + `dev,order` 프로필 | `config/order/order-api.yml`, `config/order/application-order.yml` |
| `payment-api` + `prod` | `config/payment/payment-api.yml` |

### 설정 우선순위

여러 소스에서 같은 키가 정의된 경우 우선순위:

```
1. Config Server (가장 높음)
2. application-{profile}.yml
3. application.yml
4. bootstrap.yml (가장 낮음)
```

## AWS Secrets Manager 통합

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Git Repository (일반 설정)                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ order:                                                  │ │
│ │   datasource:                                           │ │
│ │     username: ${secrets@order.datasource.username}      │ │
│ │     password: ${secrets@order.datasource.password}      │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Config Server                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWSSecretsManagerAdvice (ResponseBodyAdvice)            │ │
│ │ - ${secrets@key} 패턴 탐지                               │ │
│ │ - AWS Secrets Manager에서 값 조회                        │ │
│ │ - 설정값 치환                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ AWS Secrets Manager                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Secret ID: config-prod                                  │ │
│ │ {                                                       │ │
│ │   "order.datasource.username": "prod_user",             │ │
│ │   "order.datasource.password": "super_secret"           │ │
│ │ }                                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Client Application (최종 설정)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ order:                                                  │ │
│ │   datasource:                                           │ │
│ │     username: prod_user           ← 치환됨              │ │
│ │     password: super_secret        ← 치환됨              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 패턴 문법

| 패턴 | 설명 |
|------|------|
| `${secrets@key}` | AWS Secrets Manager에서 key 조회 (없으면 원본 유지) |
| `${secrets@key:default}` | key가 없으면 default 값 사용 |
| `${secrets@nested.key}` | 중첩 키 지원 (JSON의 nested.key) |

### 치환 로직 (AWSSecretsManagerAdvice)

`@ControllerAdvice`를 활용하여 Config Server 응답 전에 값을 치환한다.

```java
@ControllerAdvice
@RequiredArgsConstructor
public class AWSSecretsManagerAdvice implements ResponseBodyAdvice<Object> {

    private final AWSSecretsManagerService awsSecretsManagerService;
    private static final Pattern ENV_PATTERN = Pattern.compile("\\$\\{([^}]+)}");
    private static final String SECRET_PREFIX = "secrets@";

    @Override
    public Object beforeBodyWrite(Object body, ...) {
        if (!(body instanceof Environment)) {
            return body;
        }

        JsonNode rootNode = this.awsSecretsManagerService.getSecret();

        for (PropertySource propertySource : ((Environment) body).getPropertySources()) {
            Map<String, Object> source = (Map<String, Object>) propertySource.getSource();
            for (Map.Entry<String, Object> entry : source.entrySet()) {
                entry.setValue(this.replaceSecret(rootNode, entry.getValue()));
            }
        }

        return body;
    }
}
```

### 타입 보존

치환 시 원래 타입을 유지한다.

```java
public Object getSecretValueAsType() {
    if (this.secretNode.isBoolean()) {
        return this.secretNode.booleanValue();
    } else if (this.secretNode.isNumber()) {
        if (this.secretNode.isFloat() || this.secretNode.isDouble()) {
            return this.secretNode.doubleValue();
        } else {
            return this.secretNode.longValue();
        }
    } else {
        return this.secretNode.textValue();
    }
}
```

**예시:**
```yaml
# Git 설정
app:
  enabled: ${secrets@app.enabled}        # Boolean
  max-retry: ${secrets@app.maxRetry}     # Integer/Long
  timeout: ${secrets@app.timeout}        # Double
```

```json
// AWS Secrets Manager
{
  "app.enabled": true,
  "app.maxRetry": 3,
  "app.timeout": 30.5
}
```

### 보안 장점

1. **민감 정보 분리**: Git에는 플레이스홀더만 저장, 실제 값은 AWS에서 관리
2. **접근 제어**: IAM 정책으로 Secret 접근 권한 관리
3. **감사 로그**: AWS CloudTrail로 Secret 접근 기록 추적
4. **자동 로테이션**: Secrets Manager의 자동 비밀번호 로테이션 기능 활용 가능
5. **암호화**: AWS KMS로 저장 시 암호화

## 실제 동작 흐름

```bash
# 1. 클라이언트(order-api)가 Config Server에 요청
GET http://config-server:8888/order-api/dev,order

# 2. Config Server가 Git에서 설정 로드
#    search-paths: config/** 에서 order-api.yml, application-order.yml 검색

# 3. AWSSecretsManagerAdvice가 응답 전 치환
#    ${secrets@order.datasource.password} → AWS 비밀값으로 대체

# 4. 최종 응답
{
  "name": "order-api",
  "profiles": ["dev", "order"],
  "propertySources": [{
    "source": {
      "order.datasource.jdbc-url": "jdbc:postgresql://10.0.0.1:5432/orderdb",
      "order.datasource.username": "order_user",
      "order.datasource.password": "실제AWS비밀값"
    }
  }]
}
```

## @ConfigurationProperties + @RefreshScope 활용

Config Server에서 가져온 설정을 구조화된 객체로 바인딩하고, 동적 리로드를 지원한다.

```java
@Component
@ConfigurationProperties(prefix = "order")
@RefreshScope  // Config Server 설정 변경 시 동적 리로드
@Getter
@Setter
public class OrderProperties {

    private Map<String, DataSourceProperties> datasource;
    private StorageProperties storage;

    @Getter
    @Setter
    public static class DataSourceProperties {
        private String driverClassName;
        private String jdbcUrl;
        private String username;
        private String password;
    }

    @Getter
    @Setter
    public static class StorageProperties {
        private String basePath;
        private String s3Bucket;
    }
}
```

**사용:**
```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderProperties orderProperties;

    public void process() {
        String s3Bucket = orderProperties.getStorage().getS3Bucket();
        // ...
    }
}
```

## fail-fast와 타임아웃 설정

운영 환경에서는 Config Server 연결 실패 시 애플리케이션 시작을 중단하는 것이 안전하다.

```yaml
spring:
  cloud:
    config:
      fail-fast: true  # 연결 실패 시 시작 중단
      request-connect-timeout: 60000  # 연결 타임아웃 (ms)
      request-read-timeout: 60000     # 읽기 타임아웃 (ms)
      retry:
        enabled: true
        initial-interval: 1000
        max-attempts: 6
        max-interval: 2000
        multiplier: 1.1
```

**retry 설정을 사용하려면 의존성 추가:**
```gradle
implementation 'org.springframework.retry:spring-retry'
```

## 기술 스택

| 카테고리 | 기술 | 버전 |
|---------|------|------|
| Language | Java | 1.8 |
| Framework | Spring Boot | 2.3.0.RELEASE |
| Cloud | Spring Cloud Config | Hoxton.SR4 |
| AWS | AWS SDK (STS, Secrets Manager) | 2.29.2 |

## 정리

- **Config Server**: Git 저장소에서 설정을 읽어 HTTP로 제공
- **Config Client**: `bootstrap.yml`로 Config Server 연결, 설정 주입
- **AWS Secrets Manager 연동**: 표준 Spring Cloud Config에 `@ControllerAdvice`로 커스텀 확장
- **설정 분리**: 일반 설정은 Git, 민감 정보는 AWS Secrets Manager
- **프로파일 기반 제어**: `cloudconfig` 프로파일로 환경별 Config Server 연동 제어

이 구조를 통해 설정의 중앙 집중 관리와 보안을 동시에 달성할 수 있다.
