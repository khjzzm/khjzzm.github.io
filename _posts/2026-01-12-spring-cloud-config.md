---
layout: post
title: Spring Cloud Config와 AWS Secrets Manager로 설정 관리하기 
---

## 실행 순서

```
bootstrap.yml → application.yml
```

**bootstrap.yml**이 먼저 로드되고, 그 다음 **application.yml**이 로드된다.

---

## bootstrap.yml

**역할:** 애플리케이션 컨텍스트가 시작되기 **전에** 필요한 설정

**주요 용도:**
- Spring Cloud Config Server 연결 정보
- 암호화/복호화 키 설정
- 애플리케이션 이름 (`spring.application.name`)
- Config Server에서 설정을 가져오기 위한 최소 정보

```yaml
spring:
  application:
    name: app-scheduler
  cloud:
    config:
      uri: http://config-server:8888
      fail-fast: true
```

---

## application.yml

**역할:** 애플리케이션의 **일반적인** 설정

**주요 용도:**
- 데이터베이스 연결 정보
- 서버 포트
- 로깅 설정
- 비즈니스 로직 관련 설정

```yaml
server:
  port: 8081

spring:
  datasource:
    url: jdbc:postgresql://localhost:54321/mydb

app:
  scheduler:
    job:
      enabled: true
      cron: '0/5 * * * * ?'
```

---

## 왜 분리되어 있는가?

Spring Cloud Config를 사용할 때:

1. **bootstrap.yml**: "Config Server 어디 있어?" 를 알려줌
2. Config Server에서 설정을 가져옴
3. **application.yml**: 로컬 설정과 병합됨

Config Server를 사용하지 않으면 bootstrap.yml은 필요 없다.

---

## bootstrap.yml이 먼저 실행되는 원리

**Spring Boot 자체의 기본 설정이 아니다.** `spring-cloud-context` 라이브러리가 이 동작을 제공한다.

```
spring-cloud-starter-config
    └── spring-cloud-config-client
            └── spring-cloud-context  ← 여기서 bootstrap 로딩 처리
```

`BootstrapApplicationListener` 클래스가 bootstrap.yml을 먼저 로드하는 역할을 한다.

---

## Spring Boot 2.4 이후 변경사항

Spring Boot 2.4부터는 bootstrap.yml 지원이 **기본 비활성화**되었다.

사용하려면 별도 의존성 추가 필요:

```gradle
implementation 'org.springframework.cloud:spring-cloud-starter-bootstrap'
```

또는 `spring.cloud.bootstrap.enabled=true` 설정 필요.

---

## 정리

| 구분 | bootstrap.yml | application.yml |
|------|---------------|-----------------|
| 실행 시점 | 애플리케이션 컨텍스트 시작 **전** | 애플리케이션 컨텍스트 시작 **후** |
| 주요 용도 | Config Server 연결 정보 | 일반 설정 |
| 제공 주체 | Spring Cloud Context | Spring Boot |
| 필수 여부 | Config Server 사용 시에만 필요 | 항상 필요 |
| Boot 2.4+ | 별도 의존성 필요 | 기본 지원 |

Spring Boot 2.4 미만에서는 `spring-cloud-starter-config`만 있으면 자동으로 bootstrap.yml을 먼저 읽는다.

---

## 실제 프로젝트 적용 사례

### 프로파일 기반 Config Server 활성화

실무에서는 로컬 개발과 운영 환경을 분리하기 위해 **프로파일 기반으로 Config Server 연동을 제어**한다.

```yaml
# bootstrap.yml
spring:
  application:
    name: order-service
  cloud:
    config:
      enabled: false  # 기본: 비활성화 (로컬 개발용)

---
spring.profiles: cloudconfig  # 운영 환경에서만 활성화
spring:
  cloud:
    config:
      enabled: true
      fail-fast: true
      uri: http://${CONFIG_SERVER_HOST}:${CONFIG_SERVER_PORT}
      request-connect-timeout: ${CONFIG_SERVER_CONNECT_TIMEOUT:60000}
      request-read-timeout: ${CONFIG_SERVER_READ_TIMEOUT:60000}
```

**실행 방법:**
```bash
# 로컬 개발 (Config Server 미사용)
java -jar app.jar

# 운영 환경 (Config Server 사용)
java -jar app.jar --spring.profiles.active=cloudconfig \
  -DCONFIG_SERVER_HOST=config-server \
  -DCONFIG_SERVER_PORT=8888
```

---

### 설정 흐름 다이어그램

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

---

### @ConfigurationProperties + @RefreshScope 활용

Config Server에서 가져온 설정을 구조화된 객체로 바인딩하고, 동적 리로드를 지원한다.

```java
@Component
@ConfigurationProperties(prefix = "app")
@RefreshScope  // Config Server 설정 변경 시 동적 리로드
@Getter
@Setter
public class AppProperties {

    private StorageProperties storage;
    private Integer maxRetryCount;

    @PostConstruct
    public void postConstruct() {
        log.info("AppProperties loaded: {}", this);
    }

    @Getter
    @Setter
    public static class StorageProperties {
        private String basePath;
        private String s3Bucket;
        private String uploadDir;
    }
}
```

**Config Server의 설정 파일 (application-common.yml):**
```yaml
app:
  storage:
    base-path: /mnt/data
    s3-bucket: my-service-prod
    upload-dir: ${app.storage.base-path}/uploads
  max-retry-count: 3
```

**사용:**
```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final AppProperties appProperties;

    public void process() {
        String basePath = appProperties.getStorage().getBasePath();
        // ...
    }
}
```

---

### 설정 우선순위

여러 소스에서 같은 키가 정의된 경우 우선순위:

```
1. Config Server (가장 높음)
2. application-{profile}.yml
3. application.yml
4. bootstrap.yml (가장 낮음)
```

**예시:**
```yaml
# Config Server (order-service.yml)
server.port: 8081

# 로컬 application.yml
server.port: 8080
```

→ Config Server 설정이 우선 적용되어 **8081** 포트로 실행된다.

---

### fail-fast와 타임아웃 설정

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

---

### 프로파일 포함 (include)

여러 프로파일을 조합해서 사용할 수 있다.

```yaml
# bootstrap.yml
spring:
  application:
    name: order-service
  profiles:
    include:
      - common   # application-common.yml 포함 (공통 설정)
      - secret   # application-secret.yml 포함 (민감 정보)
```

이렇게 하면 `order-service`, `common`, `secret` 세 가지 프로파일의 설정이 모두 병합된다.

---

## AWS Secrets Manager 통합

Config Server에서 민감한 정보(DB 비밀번호, API 키 등)를 AWS Secrets Manager와 통합하여 관리할 수 있다.

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Git Repository (일반 설정)                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ spring:                                                  │ │
│ │   datasource:                                            │ │
│ │     url: jdbc:postgresql://localhost/mydb                │ │
│ │     username: ${secrets@db.username:defaultUser}         │ │
│ │     password: ${secrets@db.password:defaultPass}         │ │
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
│ │ Secret ID: config-prod                                   │ │
│ │ {                                                        │ │
│ │   "db.username": "prod_user",                            │ │
│ │   "db.password": "super_secret_password",                │ │
│ │   "api.key": "sk-xxxxxxxxxxxx"                           │ │
│ │ }                                                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Client Application (최종 설정)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ spring:                                                  │ │
│ │   datasource:                                            │ │
│ │     url: jdbc:postgresql://localhost/mydb                │ │
│ │     username: prod_user           ← 치환됨               │ │
│ │     password: super_secret_password  ← 치환됨            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Config Server 설정

**application.yml:**
```yaml
server:
  port: 8888

spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/my-org/config-repo.git
          default-label: main

aws:
  secret-manager:
    secret-id: config-prod  # AWS Secrets Manager의 Secret ID
```

**build.gradle:**
```gradle
dependencies {
    implementation 'org.springframework.cloud:spring-cloud-config-server'

    // AWS SDK
    implementation 'software.amazon.awssdk:sts:2.29.2'
    implementation 'software.amazon.awssdk:secretsmanager:2.29.2'
}
```

### AWS Secrets Manager 설정값 치환 구현

**AWSSecretsManagerAdvice.java:**
```java
@RestControllerAdvice
@RequiredArgsConstructor
public class AWSSecretsManagerAdvice implements ResponseBodyAdvice<Environment> {

    private final AWSSecretsManagerService secretsManagerService;

    // ${secrets@key:defaultValue} 패턴
    private static final Pattern SECRETS_PATTERN =
        Pattern.compile("\\$\\{secrets@([^:}]+)(?::([^}]*))?\\}");

    @Override
    public boolean supports(MethodParameter returnType,
                           Class<? extends HttpMessageConverter<?>> converterType) {
        return Environment.class.isAssignableFrom(returnType.getParameterType());
    }

    @Override
    public Environment beforeBodyWrite(Environment body,
                                       MethodParameter returnType,
                                       MediaType selectedContentType,
                                       Class<? extends HttpMessageConverter<?>> converterType,
                                       ServerHttpRequest request,
                                       ServerHttpResponse response) {

        JsonNode secrets = secretsManagerService.getSecrets();

        for (PropertySource propertySource : body.getPropertySources()) {
            Map<String, Object> source = propertySource.getSource();

            for (Map.Entry<String, Object> entry : source.entrySet()) {
                Object value = entry.getValue();
                if (value instanceof String) {
                    String replaced = replaceSecrets((String) value, secrets);
                    source.put(entry.getKey(), replaced);
                }
            }
        }

        return body;
    }

    private String replaceSecrets(String value, JsonNode secrets) {
        Matcher matcher = SECRETS_PATTERN.matcher(value);
        StringBuffer result = new StringBuffer();

        while (matcher.find()) {
            String key = matcher.group(1);           // secrets@key
            String defaultValue = matcher.group(2);  // :defaultValue

            JsonNode secretValue = secrets.path(key);
            String replacement;

            if (!secretValue.isMissingNode()) {
                replacement = secretValue.asText();
            } else if (defaultValue != null) {
                replacement = defaultValue;
            } else {
                replacement = matcher.group(0);  // 원본 유지
            }

            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);

        return result.toString();
    }
}
```

**AWSSecretsManagerService.java:**
```java
@Service
@RequiredArgsConstructor
public class AWSSecretsManagerServiceImpl implements AWSSecretsManagerService {

    private final SecretsManagerClient secretsManagerClient;
    private final GetSecretValueRequest getSecretValueRequest;
    private final ObjectMapper objectMapper;

    @Override
    public JsonNode getSecrets() {
        try {
            GetSecretValueResponse response =
                secretsManagerClient.getSecretValue(getSecretValueRequest);
            return objectMapper.readTree(response.secretString());
        } catch (Exception e) {
            log.error("Failed to load secrets from AWS", e);
            return objectMapper.createObjectNode();  // 빈 노드 반환
        }
    }
}
```

**AWSSecretsManagerConfig.java:**
```java
@Configuration
@EnableConfigurationProperties(AWSProperties.class)
@RequiredArgsConstructor
public class AWSSecretsManagerConfig {

    private final AWSProperties awsProperties;

    @Bean
    public SecretsManagerClient secretsManagerClient() {
        return SecretsManagerClient.builder()
            .region(Region.AP_NORTHEAST_2)
            .build();
    }

    @Bean
    public GetSecretValueRequest getSecretValueRequest() {
        return GetSecretValueRequest.builder()
            .secretId(awsProperties.getSecretManager().getSecretId())
            .build();
    }
}
```

### 설정 파일 작성 방법

**Git 저장소의 설정 파일 (application-prod.yml):**
```yaml
spring:
  datasource:
    url: jdbc:postgresql://prod-db.example.com/mydb
    username: ${secrets@db.username}              # 기본값 없음 (필수)
    password: ${secrets@db.password}              # 기본값 없음 (필수)

external:
  api:
    key: ${secrets@api.key:default-key}           # 기본값 있음

logging:
  level:
    root: ${secrets@log.level:info}               # 기본값: info
```

### 패턴 문법

| 패턴 | 설명 |
|------|------|
| `${secrets@key}` | AWS Secrets Manager에서 key 조회 (없으면 원본 유지) |
| `${secrets@key:default}` | key가 없으면 default 값 사용 |
| `${secrets@nested.key}` | 중첩 키 지원 (JSON의 nested.key) |

### 타입 보존

Secrets Manager의 값 타입을 자동으로 보존한다:

```yaml
# Git 설정
app:
  enabled: ${secrets@app.enabled}        # Boolean
  max-retry: ${secrets@app.maxRetry}     # Integer/Long
  timeout: ${secrets@app.timeout}        # Double
  name: ${secrets@app.name}              # String
```

```json
// AWS Secrets Manager
{
  "app.enabled": true,
  "app.maxRetry": 3,
  "app.timeout": 30.5,
  "app.name": "my-application"
}
```

### 보안 장점

1. **민감 정보 분리**: Git에는 플레이스홀더만 저장, 실제 값은 AWS에서 관리
2. **접근 제어**: IAM 정책으로 Secret 접근 권한 관리
3. **감사 로그**: AWS CloudTrail로 Secret 접근 기록 추적
4. **자동 로테이션**: Secrets Manager의 자동 비밀번호 로테이션 기능 활용 가능
5. **암호화**: AWS KMS로 저장 시 암호화
