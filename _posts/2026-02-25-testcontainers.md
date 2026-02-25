---
layout: post
title: Testcontainers - 테스트를 위한 Docker 컨테이너 자동화
tags: [ spring, kotlin, docker, test ]
---

## 테스트에 진짜 DB가 필요한 이유

단위 테스트에서 Repository를 Mocking하면 쿼리 자체는 검증되지 않는다. jOOQ의 타입 안전한 쿼리든, MyBatis의 XML 쿼리든, 실제 DB에 날려봐야 제대로 동작하는지 알 수 있다.

그래서 통합 테스트에는 진짜 DB가 필요하다. 문제는 그 "진짜 DB"를 어떻게 준비하느냐다.

### 흔한 방식들과 한계

**H2 인메모리 DB**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb
```

가장 쉽다. 하지만 PostgreSQL에서 되는 문법이 H2에서 안 되는 경우가 많다. `ON CONFLICT`, `RETURNING`, Window Function 등 DB 고유 문법을 쓰면 H2로는 테스트할 수 없다. "테스트는 통과했는데 운영에서 쿼리 에러"가 발생하는 원인이 된다.

**로컬에 DB 직접 설치**

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/downtime
    username: postgres
    password: postgres
```

운영과 같은 DB를 쓰니 쿼리 호환성 문제는 없다. 하지만:

- 새 팀원이 합류할 때마다 DB 설치/설정 필요
- CI 서버에도 DB 설치 및 관리 필요
- 로컬 DB 상태가 테스트에 영향을 줌 (이전에 넣은 데이터가 남아있다거나)
- 여러 모듈이 같은 DB를 쓰면 병렬 테스트 시 race condition

**Testcontainers**

```kotlin
@Container
@ServiceConnection
val postgres = PostgreSQLContainer("postgres:17")
```

테스트 코드가 Docker로 PostgreSQL을 직접 띄운다. 테스트 끝나면 자동으로 삭제된다. Docker만 설치되어 있으면 된다.

---

## Testcontainers 동작 구조

### 전체 흐름

```
┌─────────────────────────────────────────────────────┐
│  JVM (테스트 실행)                                    │
│                                                     │
│  @Test                                              │
│  fun `다운타임 등록`() {                               │
│      service.register(dto)  ──── JDBC ────┐         │
│  }                                        │         │
│                                           ▼         │
│  ┌──────────────────────────────────────────┐       │
│  │  Testcontainers 라이브러리                  │       │
│  │  - Docker API로 컨테이너 생성/삭제           │       │
│  │  - 랜덤 포트 할당                           │       │
│  │  - spring.datasource.url 자동 주입          │       │
│  └──────────┬───────────────────────────────┘       │
└─────────────┼───────────────────────────────────────┘
              │ Docker API
              ▼
┌─────────────────────────────────────────────────────┐
│  Docker                                             │
│                                                     │
│  ┌─────────────────────┐                            │
│  │  PostgreSQL:17       │  ← 테스트 시작 시 자동 생성  │
│  │  port: 32789 (랜덤)  │  ← 테스트 끝나면 자동 삭제   │
│  │  db: test            │                            │
│  └─────────────────────┘                            │
└─────────────────────────────────────────────────────┘
```

Testcontainers 라이브러리가 내부적으로 Docker Engine API를 호출한다. 개발자가 Docker 명령어를 직접 쓸 필요가 없다.

### 라이프사이클

```
테스트 시작
    │
    ▼
① Docker에 PostgreSQL 컨테이너 생성 (이미지 없으면 pull)
    │
    ▼
② 컨테이너 준비 완료 대기 (health check)
    │
    ▼
③ 랜덤 포트 확인 (예: localhost:32789)
    │
    ▼
④ Spring에 접속 정보 자동 주입
   spring.datasource.url = jdbc:postgresql://localhost:32789/test
   spring.datasource.username = test
   spring.datasource.password = test
    │
    ▼
⑤ 테스트 실행 (평소처럼 jOOQ/JPA 사용)
    │
    ▼
⑥ 테스트 종료 → 컨테이너 자동 삭제
```

**랜덤 포트**가 핵심이다. 로컬의 5432 포트를 쓰는 게 아니라 매번 빈 포트를 할당하기 때문에, 로컬에서 돌리는 PostgreSQL과 절대 충돌하지 않는다.

---

## 의존성 설정

```kotlin
// build.gradle.kts
dependencies {
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:postgresql")
}
```

Spring Boot 4 BOM이 Testcontainers 버전을 관리하므로 버전 명시가 필요 없다. `spring-boot-testcontainers`가 `@ServiceConnection` 등 Spring Boot 통합 기능을 제공한다.

---

## 적용 방식

### 방식 1: `@DynamicPropertySource` — 수동 연결

Testcontainers 초기부터 쓰던 방식이다. 컨테이너의 접속 정보를 개발자가 직접 Spring에 전달한다.

```kotlin
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class DowntimeApiServiceTests {

    companion object {
        @Container
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:17")
            .withDatabaseName("downtime")

        @DynamicPropertySource
        @JvmStatic
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }

    @Test
    fun `다운타임 등록`() {
        // 테스트 코드
    }
}
```

**장점**

- Spring Boot 버전에 의존하지 않는다. Spring Boot 2.x 시절부터 사용 가능
- 어떤 속성이 주입되는지 코드에 명시적으로 드러난다
- `@ServiceConnection`이 지원하지 않는 커스텀 속성도 자유롭게 주입할 수 있다

```kotlin
// 예: jOOQ 전용 datasource 속성처럼 비표준 속성도 가능
registry.add("app.reporting-db.url", postgres::getJdbcUrl)
```

**단점**

- 보일러플레이트가 많다. `url`, `username`, `password` 3줄을 매번 반복
- 테스트 클래스마다 같은 코드를 복사해야 한다
- 속성 이름을 오타 내면 런타임에서야 발견된다

### 방식 2: `@ServiceConnection` — Spring Boot 4 권장

```kotlin
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class DowntimeApiServiceTests {

    companion object {
        @Container
        @ServiceConnection  // 이것만 붙이면 끝
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:17")
    }

    @Test
    fun `다운타임 등록`() {
        // 테스트 코드
    }
}
```

`@ServiceConnection`은 컨테이너 타입을 보고 알아서 판단한다.

| 컨테이너 타입               | 자동 설정하는 속성                                      |
|-----------------------|-------------------------------------------------|
| `PostgreSQLContainer` | `spring.datasource.url`, `username`, `password` |
| `MySQLContainer`      | `spring.datasource.url`, `username`, `password` |
| `RedisContainer`      | `spring.data.redis.host`, `port`                |
| `KafkaContainer`      | `spring.kafka.bootstrap-servers`                |
| `MongoDBContainer`    | `spring.data.mongodb.uri`                       |

DB뿐 아니라 Redis, Kafka, MongoDB 등도 동일한 패턴으로 사용할 수 있다.

**장점**

- 코드가 가장 짧다. `@ServiceConnection` 한 줄이면 끝
- 속성 이름 오타 위험이 없다. 컨테이너 타입 기반으로 자동 매핑
- Spring Boot가 공식 지원하는 방식이라 문서/예제가 풍부하다

**단점**

- Spring Boot 3.1+ 에서만 사용 가능 (이전 버전에서는 방식 1을 써야 한다)
- `@ServiceConnection`이 지원하는 컨테이너 타입만 자동 매핑된다. 지원 목록에 없는 컨테이너는 방식 1로 fallback 해야 한다
- 내부에서 어떤 속성이 주입되는지 코드만 봐서는 알 수 없다 (매직처럼 느껴질 수 있음)

### 방식 3: `@TestConfiguration` — 공통화

여러 테스트 클래스에서 같은 컨테이너 설정을 공유하고 싶을 때.

```kotlin
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfig {

    @Bean
    @ServiceConnection
    fun postgres(): PostgreSQLContainer<*> {
        return PostgreSQLContainer("postgres:17")
            .withDatabaseName("downtime")
    }
}
```

테스트 클래스에서 Import:

```kotlin
@SpringBootTest
@Import(TestcontainersConfig::class)
@ActiveProfiles("test")
class DowntimeApiServiceTests {

    @Test
    fun `다운타임 등록`() {
        // 컨테이너가 자동으로 시작되어 있다
    }
}
```

이 방식이면 `@Testcontainers`와 `@Container`가 필요 없다. Spring이 빈 라이프사이클로 컨테이너를 관리한다.

**장점**

- 컨테이너 설정이 한 곳에 모인다. 10개 테스트 클래스가 있어도 `TestcontainersConfig` 하나만 관리
- 컨테이너 옵션 변경(이미지 버전, init script 등)이 한 곳에서 끝난다
- `@Import`만 추가하면 되므로 테스트 클래스가 깔끔하다
- Spring 빈으로 관리되어 ApplicationContext 캐싱 혜택을 받는다. 같은 Config를 Import하는 테스트 클래스들은 컨테이너를 공유한다

**단점**

- 설정 파일이 하나 더 생긴다 (`TestcontainersConfig.kt`)
- 테스트 클래스마다 `@Import(TestcontainersConfig::class)`를 붙여야 한다. 빼먹으면 DB 연결 실패
- 특정 테스트만 다른 DB 설정이 필요한 경우 Config 분리가 필요하다

### 방식 비교 요약

|                       | 방식 1: `@DynamicPropertySource` | 방식 2: `@ServiceConnection` | 방식 3: `@TestConfiguration`           |
|-----------------------|--------------------------------|----------------------------|--------------------------------------|
| **코드량**               | 많음                             | 적음                         | 중간 (Config 클래스 분리)                   |
| **Spring Boot 최소 버전** | 2.x                            | 3.1+                       | 3.1+ (`@ServiceConnection` 사용 시)     |
| **커스텀 속성 주입**         | 자유롭게 가능                        | 지원 목록만 가능                  | `@ServiceConnection` + 추가 `@Bean` 조합 |
| **설정 공유**             | 상속 또는 복사                       | 상속 또는 복사                   | `@Import`로 공유                        |
| **권장 상황**             | 비표준 속성이 필요할 때                  | 단일 테스트 클래스                 | 여러 테스트 클래스가 같은 인프라를 공유할 때            |

> 실무에서는 **방식 3(`@TestConfiguration`) + 방식 2(`@ServiceConnection`) 조합**이 가장 많이 쓰인다. Config 클래스 안에서 `@ServiceConnection`을 붙인 빈을 정의하면 보일러플레이트도 적고, 설정도 한 곳에서 관리된다.

---

## 컨테이너 범위 (Scope)

### 테스트 클래스 단위 (기본)

```kotlin
companion object {
    @Container
    @ServiceConnection
    @JvmStatic
    val postgres = PostgreSQLContainer("postgres:17")
}
```

`companion object`에 선언하면 **클래스 내 모든 테스트가 하나의 컨테이너를 공유**한다.

```
DowntimeApiServiceTests 시작
  └─ PostgreSQL 컨테이너 생성
  └─ @Test 다운타임_등록       ← 같은 컨테이너
  └─ @Test 다운타임_삭제       ← 같은 컨테이너
  └─ @Test 다운타임_검색       ← 같은 컨테이너
  └─ PostgreSQL 컨테이너 삭제

DowntimeValidatorTests 시작
  └─ PostgreSQL 컨테이너 생성 (새로)
  └─ ...
```

### 테스트 메서드 단위

```kotlin
// companion object가 아닌 인스턴스 필드로 선언
@Container
@ServiceConnection
val postgres = PostgreSQLContainer("postgres:17")
```

메서드마다 새 컨테이너가 뜬다. 완전한 격리가 되지만 느리다. 일반적으로 권장하지 않는다.

### 싱글톤 패턴 — 전체 테스트 스위트에서 하나만

```kotlin
abstract class IntegrationTestBase {

    companion object {
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:17")
            .withDatabaseName("downtime")
            .apply { start() }  // 수동으로 start, JVM 종료 시 자동 정리

        @DynamicPropertySource
        @JvmStatic
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
```

```kotlin
@SpringBootTest
@ActiveProfiles("test")
class DowntimeApiServiceTests : IntegrationTestBase() {
    // 모든 테스트 클래스가 같은 PostgreSQL 컨테이너를 공유
}
```

컨테이너를 한 번만 띄우고 모든 테스트에서 재사용한다. Gradle 빌드 기준으로 **JVM이 종료될 때 Ryuk(Testcontainers의 가비지 컬렉터)이 컨테이너를 자동 삭제**한다.

```
Gradle 테스트 실행
  └─ PostgreSQL 컨테이너 생성 (한 번)
  └─ DowntimeApiServiceTests  ← 같은 컨테이너
  └─ DowntimeValidatorTests   ← 같은 컨테이너
  └─ 모든 테스트 완료
  └─ JVM 종료 → Ryuk이 컨테이너 삭제
```

가장 실용적인 방식이다. 테스트 간 데이터 격리는 `@Transactional` 롤백으로 처리한다.

---

## 초기 스키마와 테스트 데이터

컨테이너가 뜨면 빈 DB다. 테이블을 만들어야 한다.

### Spring SQL Init 활용

```yaml
# application-test.yml
spring:
  sql:
    init:
      mode: always
      schema-locations: classpath:database-downtime/schema.sql
      data-locations: classpath:database-downtime/data.sql
```

Spring Boot가 컨테이너 시작 후 자동으로 `schema.sql` → `data.sql` 순서로 실행한다.

### Flyway/Liquibase 활용

프로젝트에서 마이그레이션 도구를 쓰고 있다면 별도 설정 없이 자동으로 적용된다.

```yaml
# application-test.yml
spring:
  flyway:
    locations: classpath:db/migration
```

Testcontainers가 빈 DB를 만들고 → Flyway가 마이그레이션을 실행하고 → 테스트가 시작된다. 운영과 동일한 스키마가 보장된다.

### init script 직접 지정

```kotlin
val postgres = PostgreSQLContainer("postgres:17")
    .withDatabaseName("downtime")
    .withInitScript("database-downtime/schema.sql")
```

`withInitScript`로 컨테이너 시작 시 SQL 파일을 직접 실행할 수도 있다. Spring에 의존하지 않는 방식이다.

---

## 로컬 개발 환경 — `spring-boot-docker-compose`

Testcontainers는 테스트 실행 시에만 컨테이너를 띄운다. 로컬 개발(애플리케이션 실행) 시에도 같은 방식을 쓰고 싶다면 두 가지 선택지가 있다.

### TestApplication 방식

```kotlin
// src/test/kotlin/com/example/TestApplication.kt
fun main(args: Array<String>) {
    fromApplication<Application>()
        .with(TestcontainersConfig::class.java)
        .run(*args)
}
```

IDE에서 `TestApplication`을 실행하면 Testcontainers가 DB를 띄우고 애플리케이션이 시작된다. 별도 Docker Compose 파일이 필요 없다.

### spring-boot-docker-compose 방식

```kotlin
// build.gradle.kts
dependencies {
    developmentOnly("org.springframework.boot:spring-boot-docker-compose")
}
```

```yaml
# compose.yml
services:
  postgres:
    image: postgres:17
    ports:
    - "5432:5432"
    environment:
      POSTGRES_DB: downtime
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
```

`./gradlew bootRun` 하면 Spring Boot가 자동으로 `compose.yml`의 컨테이너를 띄운다. 애플리케이션 종료 시 컨테이너도 정리된다.

---

## 속도 최적화

### 첫 실행 vs 이후 실행

```
첫 실행:  이미지 pull (한 번만)          → 30초~1분
두 번째:  이미지 캐시, 컨테이너만 생성     → 2~3초
테스트:   일반 JDBC 연결과 동일           → 속도 차이 없음
```

Docker 이미지는 로컬에 캐시되므로 첫 실행만 느리다.

### 컨테이너 재사용 (reuse)

```kotlin
val postgres = PostgreSQLContainer("postgres:17")
    .withReuse(true)
```

```properties
# ~/.testcontainers.properties (사용자 홈 디렉토리)
testcontainers.reuse.enable=true
```

`withReuse(true)`를 설정하면 테스트가 끝나도 컨테이너를 삭제하지 않는다. 다음 테스트 실행 시 기존 컨테이너를 재사용한다. 로컬 개발 시 반복 실행 속도가 크게 향상된다.

```
reuse 미사용:  컨테이너 생성(3초) → 테스트 → 컨테이너 삭제  (매번 반복)
reuse 사용:    컨테이너 이미 있음  → 테스트                  (생성/삭제 생략)
```

> CI 환경에서는 `reuse`를 쓰지 않는 게 좋다. 이전 테스트의 데이터가 남아있을 수 있기 때문이다.

### 싱글톤 패턴 + @Transactional 조합

가장 실용적인 최적화다.

```
싱글톤:        전체 테스트 스위트에서 컨테이너 1개만 생성
@Transactional: 각 테스트가 끝나면 롤백 → DB 상태 자동 원복
```

컨테이너 생성 비용은 1번만 지불하고, 테스트 격리는 트랜잭션 롤백으로 해결한다.

---

## 다양한 컨테이너 지원

Testcontainers는 DB만 지원하는 게 아니다. Docker 이미지가 있는 모든 것을 테스트에 사용할 수 있다.

```kotlin
// PostgreSQL
val postgres = PostgreSQLContainer("postgres:17")

// MySQL
val mysql = MySQLContainer("mysql:8.4")

// Redis
val redis = GenericContainer("redis:7").withExposedPorts(6379)

// Kafka
val kafka = KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.8.0"))

// LocalStack (AWS S3, SQS 등)
val localstack = LocalStackContainer(DockerImageName.parse("localstack/localstack:4"))
    .withServices(LocalStackContainer.Service.S3, LocalStackContainer.Service.SQS)

// Elasticsearch
val elasticsearch = ElasticsearchContainer("elasticsearch:8.17.0")
```

모두 `@ServiceConnection`으로 Spring Boot 자동 설정이 가능하다.

### 여러 컨테이너 동시 사용

```kotlin
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfig {

    @Bean
    @ServiceConnection
    fun postgres(): PostgreSQLContainer<*> {
        return PostgreSQLContainer("postgres:17")
    }

    @Bean
    @ServiceConnection
    fun redis(): GenericContainer<*> {
        return GenericContainer("redis:7").withExposedPorts(6379)
    }
}
```

DB + Redis 조합처럼 여러 인프라를 동시에 컨테이너로 띄울 수 있다.

---

## Ryuk — 가비지 컬렉터

Testcontainers를 쓰면 Docker에 `testcontainers-ryuk`이라는 컨테이너가 하나 더 뜬다.

```
$ docker ps
CONTAINER ID   IMAGE                       PORTS
a1b2c3d4       postgres:17                 0.0.0.0:32789->5432/tcp
e5f6g7h8       testcontainers/ryuk:0.11    0.0.0.0:32790->8080/tcp
```

Ryuk의 역할은 **고아 컨테이너 정리**다. 테스트가 비정상 종료(kill, OutOfMemoryError 등)되어 컨테이너 정리 코드가 실행되지 못해도, Ryuk이 JVM과의 연결이 끊어진 것을 감지하고 관련 컨테이너를 삭제한다.

```
정상 종료:  테스트 완료 → 컨테이너 정리 코드 실행 → 삭제
비정상 종료: 테스트 kill → 정리 코드 실행 안 됨 → Ryuk이 감지 → 삭제
```

Docker에 좀비 컨테이너가 쌓이는 것을 방지한다.

---

## 정리

| 항목                   | H2 인메모리   | 로컬 DB 직접 설치 | Testcontainers |
|----------------------|-----------|-------------|----------------|
| **설치**               | 없음        | DB 수동 설치    | Docker만 필요     |
| **쿼리 호환성**           | DB마다 다름   | 운영과 동일      | 운영과 동일         |
| **환경 일관성**           | 높음        | 낮음 (개인별 다름) | 높음             |
| **CI/CD**            | 쉬움        | DB 설치 필요    | Docker만 있으면 됨  |
| **테스트 격리**           | 자동 (인메모리) | 수동 관리 필요    | 컨테이너 단위 격리     |
| **속도**               | 가장 빠름     | 빠름          | 초기 약간 느림       |
| **PostgreSQL 고유 기능** | 사용 불가     | 사용 가능       | 사용 가능          |

운영 DB와 다른 DB로 테스트하는 건 "연습은 맨손으로 하고 시합은 글러브 끼고 하는 것"과 같다. PostgreSQL을 쓴다면 테스트도 PostgreSQL에서 돌려야 한다. Testcontainers는 그 비용을 최소화해주는 도구다.
