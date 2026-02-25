---
layout: post
title: Java 25 + Spring Boot 4 + Kotlin 2.3 REST API 서버 구축 가이드
tags: [ spring, kotlin, java ]
---

Spring Boot 4가 출시되면서 기반 프레임워크가 전면 교체되었다. Spring Framework 7, Jakarta EE 11, Jackson 3, Spring Security 7. 메이저 버전이 동시에 올라간 만큼 기존 설정을 그대로 가져다 쓸 수 없는 부분이 많다. 이 글에서는 Java 25 + Spring Boot 4 + Kotlin 2.3 조합으로 REST API 서버를 처음부터 구성할 때 필요한 설정을 전부 정리한다.

## 핵심 변경점 요약

### Spring Boot 4

| 항목               | Spring Boot 3                 | Spring Boot 4                          |
|------------------|-------------------------------|----------------------------------------|
| Spring Framework | 6.x                           | 7.x                                    |
| Jakarta EE       | 10                            | 11                                     |
| Jackson          | 2.x (`com.fasterxml.jackson`) | 3.x (`tools.jackson`)                  |
| Servlet          | 6.0                           | 6.1                                    |
| 내장 서버            | Tomcat, Jetty, Undertow       | Tomcat, Jetty (Undertow 제거)            |
| Null Safety      | Spring 자체 어노테이션               | JSpecify 어노테이션                         |
| Observability    | Micrometer + 수동 설정            | `spring-boot-starter-opentelemetry` 제공 |
| Health Probe     | 수동 활성화                        | liveness/readiness 기본 활성화              |

### Java 25

- **Virtual Threads**: synchronized 블록에서의 pinning 문제 해결. 프로덕션 사용에 문제 없음
- **Structured Concurrency** (5th Preview): 병렬 작업의 라이프사이클을 구조적으로 관리
- **Scoped Values**: ThreadLocal 대체. Virtual Thread 환경에서 더 효율적인 데이터 전파

### Kotlin 2.3

- K2 컴파일러 정식 적용. 증분 컴파일 속도 2~3배 향상
- JSpecify null-safety 통합. Java API 호출 시 컴파일 타임 null 체크
- Spring Framework 7과의 전략적 파트너십으로 코루틴, DSL, 확장 함수 지원 강화

---

## 1. 프로젝트 초기 설정

### build.gradle.kts

```kotlin
plugins {
    id("org.springframework.boot") version "4.0.0"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("jvm") version "2.3.0"
    kotlin("plugin.spring") version "2.3.0"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Web
    implementation("org.springframework.boot:spring-boot-starter-web")

    // Database
    implementation("org.springframework.boot:spring-boot-starter-jooq")
    runtimeOnly("org.postgresql:postgresql")

    // Security
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")

    // HTTP Client
    implementation("org.springframework.boot:spring-boot-starter-webflux") // WebClient

    // Observability
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")

    // Validation
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // Jackson Kotlin
    implementation("tools.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

몇 가지 주의점이 있다.

**Jackson 3 패키지 변경**: `com.fasterxml.jackson` → `tools.jackson`. Spring Boot 4가 Jackson 3을 기본으로 사용하므로 `jackson-module-kotlin` 의존성의 group도 `tools.jackson.module`이다. 기존 코드에서 Jackson import 경로를 전부 변경해야 한다.

**`-Xjsr305=strict`**: Kotlin 컴파일러가 Java의 null-safety 어노테이션(`@Nullable`, `@NonNull`, JSpecify)을 엄격하게 해석한다. Spring Framework 7이 JSpecify를 전면 적용했기 때문에, 이 옵션 없이는 null 관련 버그를 컴파일 타임에 잡을 수 없다.

**`kotlin("plugin.spring")`**: Kotlin 클래스는 기본적으로 `final`이다. Spring의 프록시 기반 AOP(`@Transactional`, `@Cacheable` 등)가 동작하려면 클래스가 `open`이어야 한다. 이 플러그인이 `@Component`, `@Configuration`, `@Service` 등이 붙은 클래스를 자동으로 `open`으로 만들어준다.

---

## 2. application.yml 기본 설정

### 서버 설정

```yaml
server:
  port: 8080
  shutdown: graceful
  tomcat:
    threads:
      virtual: true

spring:
  application:
    name: my-api
  lifecycle:
    timeout-per-shutdown-phase: 30s
  threads:
    virtual:
      enabled: true
```

**Graceful Shutdown**: `server.shutdown=graceful`로 설정하면 종료 신호(SIGTERM)를 받았을 때 새로운 요청을 거부하고, 진행 중인 요청이 완료될 때까지 최대 30초 대기한 후 종료한다. Kubernetes 환경에서 Pod 교체 시 요청 유실을 방지한다.

**Virtual Threads**: `spring.threads.virtual.enabled=true`를 설정하면 Spring MVC의 요청 처리 스레드가 Virtual Thread로 전환된다. 기존 플랫폼 스레드 풀(기본 200개) 대신 요청마다 Virtual Thread를 생성하므로, I/O 대기 시 플랫폼 스레드를 반환한다. DB 쿼리나 외부 API 호출이 많은 서버에서 처리량이 크게 향상된다.

> Spring Boot 3에서는 `spring.threads.virtual.enabled` 프로퍼티만 있었지만, Spring Boot 4에서는 Tomcat의 `threads.virtual` 설정도 추가되었다. 둘 다 `true`로 설정해야 완전한 Virtual Thread 기반 처리가 된다.

### Jackson 설정

```yaml
spring:
  jackson:
    property-naming-strategy: SNAKE_CASE
    deserialization:
      fail-on-unknown-properties: false
    serialization:
      write-dates-as-timestamps: false
    default-property-inclusion: non_null
    time-zone: Asia/Seoul
```

`fail-on-unknown-properties: false`는 클라이언트가 보낸 JSON에 서버 DTO에 없는 필드가 있어도 에러를 발생시키지 않는다. API 버전이 다른 클라이언트와의 호환성을 위해 거의 필수다.

`write-dates-as-timestamps: false`는 `LocalDateTime`을 `"2026-02-24T10:30:00"` 형태의 ISO-8601 문자열로 직렬화한다. 타임스탬프(숫자)보다 디버깅과 API 문서화에 유리하다.

### 프로파일 분리

```yaml
# application.yml (공통)
spring:
  profiles:
    active: local

---
# application-local.yml
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: dev
    password: dev

---
# application-prod.yml
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:postgresql://prod-db:5432/mydb
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
```

프로덕션 환경의 민감 정보(DB 비밀번호, API 키 등)는 YAML에 직접 적지 않는다. `${DB_PASSWORD}` 형태로 환경변수를 참조하거나, Spring Cloud Config Server, HashiCorp Vault 같은 외부 설정 서버를 사용한다.

**설정 우선순위** (높은 것이 낮은 것을 덮어씀):

```
1. 커맨드라인 인자 (--server.port=9090)
2. Java 시스템 프로퍼티 (-Dserver.port=9090)
3. 환경변수 (SERVER_PORT=9090)
4. 프로파일별 application-{profile}.yml
5. application.yml
```

---

## 3. Database 설정

### HikariCP 커넥션 풀

Spring Boot의 기본 커넥션 풀은 HikariCP다. 기본값으로도 동작하지만, 프로덕션에서는 반드시 튜닝해야 한다.

```yaml
spring:
  datasource:
    hikari:
      pool-name: MyApiPool
      maximum-pool-size: 20
      minimum-idle: 10
      max-lifetime: 1740000       # 29분 (DB wait_timeout보다 짧게)
      idle-timeout: 600000        # 10분
      connection-timeout: 3000    # 3초
      validation-timeout: 5000    # 5초
      leak-detection-threshold: 60000  # 1분
```

**`maximum-pool-size`**: 공식은 `(CPU 코어 수 * 2) + 유효 디스크 수`다. 4코어 서버라면 10 정도가 적정하고, 최대 20을 넘기지 않는 것이 좋다. 커넥션 수를 늘린다고 처리량이 비례해서 증가하지 않는다. 오히려 DB 서버에 과부하를 주고, 컨텍스트 스위칭 비용이 증가한다.

**`max-lifetime`**: DB 서버의 `wait_timeout`보다 2~3분 짧게 설정한다. MySQL 기본 `wait_timeout`이 28800초(8시간)라면 HikariCP의 `max-lifetime`을 28500000ms(약 7시간 55분) 정도로 설정한다. DB가 먼저 커넥션을 끊어버리면 애플리케이션에서 커넥션 에러가 발생한다.

**`leak-detection-threshold`**: 커넥션을 획득한 후 이 시간 내에 반환하지 않으면 로그에 경고를 남긴다. 트랜잭션이 너무 오래 열려있는 코드를 찾는 데 유용하다.

### jOOQ 설정

Spring Boot 4는 jOOQ를 Auto-Configuration으로 지원한다. `spring-boot-starter-jooq`를 추가하면 `DSLContext` 빈이 자동 생성된다.

```yaml
spring:
  jooq:
    sql-dialect: POSTGRES
```

별도 설정이 필요하면 `DefaultConfigurationCustomizer`를 빈으로 등록한다.

```kotlin
@Configuration
class JooqConfig {

    @Bean
    fun jooqCustomizer(): DefaultConfigurationCustomizer {
        return DefaultConfigurationCustomizer { config ->
            config.set(SQLDialect.POSTGRES)
            config.settings()
                .withRenderNameCase(RenderNameCase.LOWER)
                .withRenderQuotedNames(RenderQuotedNames.NEVER)
                .withMapConstructorParameterNamesInKotlin(true)
        }
    }
}
```

`withMapConstructorParameterNamesInKotlin(true)`는 jOOQ가 쿼리 결과를 Kotlin data class에 매핑할 때 생성자 파라미터명을 사용하도록 한다. 이 설정 없이는 필드 순서에 의존해서 매핑 오류가 발생할 수 있다.

### 트랜잭션 관리

jOOQ는 Spring의 `PlatformTransactionManager`와 자동으로 통합된다. `@Transactional`을 그대로 사용하면 된다.

```kotlin
@Service
class UserService(
    private val dsl: DSLContext
) {

    @Transactional
    fun createUser(name: String, email: String): UserRecord {
        return dsl.insertInto(USERS)
            .set(USERS.NAME, name)
            .set(USERS.EMAIL, email)
            .returning()
            .fetchOne()!!
    }

    @Transactional(readOnly = true)
    fun findUserById(id: Long): UserRecord? {
        return dsl.selectFrom(USERS)
            .where(USERS.ID.eq(id))
            .fetchOne()
    }
}
```

`@Transactional(readOnly = true)`는 단순 조회용 트랜잭션에 사용한다. DB 드라이버나 커넥션 풀이 이 힌트를 활용해서 읽기 전용 커넥션을 할당하거나, 레플리카로 라우팅할 수 있다.

### DB 마이그레이션 (Flyway)

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
```

마이그레이션 파일은 `src/main/resources/db/migration/`에 위치한다.

```
db/migration/
├── V1__create_users_table.sql
├── V2__create_orders_table.sql
└── V3__add_email_index.sql
```

파일명 컨벤션은 `V{버전}__{설명}.sql`이다. 버전은 정수나 타임스탬프를 사용한다. 한번 적용된 마이그레이션 파일은 절대 수정하지 않는다. 변경이 필요하면 새로운 버전의 마이그레이션을 추가한다.

---

## 4. Spring Security 설정

### SecurityFilterChain

Spring Security 7부터 `WebSecurityConfigurerAdapter`는 완전히 제거되었다. `SecurityFilterChain` 빈을 직접 등록한다.

```kotlin
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        return http
            .csrf { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it.requestMatchers("/api/public/**", "/actuator/health/**").permitAll()
                it.requestMatchers("/api/admin/**").hasRole("ADMIN")
                it.anyRequest().authenticated()
            }
            .oauth2ResourceServer { it.jwt { } }
            .build()
    }
}
```

### CSRF 비활성화 - 왜?

CSRF(Cross-Site Request Forgery)는 "사용자가 의도하지 않은 요청을 보내게 만드는 공격"이다. 공격 시나리오를 보면 왜 REST API에서는 끌 수 있는지 이해된다.

```
[CSRF가 위험한 경우 - 세션 쿠키 기반]

1. 사용자가 bank.com에 로그인 → 브라우저에 세션 쿠키 저장
2. 사용자가 악성 사이트 evil.com 방문
3. evil.com 페이지에 숨겨진 코드:
   <form action="https://bank.com/transfer" method="POST">
     <input name="to" value="해커계좌" />
     <input name="amount" value="1000000" />
   </form>
   <script>document.forms[0].submit()</script>
4. 브라우저가 bank.com으로 요청을 보낼 때 쿠키를 자동 첨부
5. bank.com 서버는 정상 요청으로 인식 → 송금 실행
```

핵심은 **브라우저가 쿠키를 자동으로 첨부한다**는 것이다. 사용자가 직접 요청을 보내지 않아도, 해당 도메인으로의 요청에 쿠키가 따라붙는다.

```
[CSRF가 무의미한 경우 - JWT 기반]

1. 사용자가 로그인 → JWT를 받아서 JavaScript 변수(또는 메모리)에 저장
2. API 호출 시 코드에서 직접 헤더에 넣음:
   Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
3. evil.com에서 bank.com API를 호출해도 → Authorization 헤더가 없음
4. JWT는 쿠키처럼 자동 첨부되지 않으므로 → 공격 불가
```

JWT는 개발자가 코드로 명시적으로 헤더에 넣어야 전달된다. 브라우저가 자동으로 붙여주는 쿠키와 근본적으로 다르다. 그래서 `.csrf { it.disable() }`이 안전하다.

### Session STATELESS - 왜?

전통적인 웹 서버는 로그인하면 서버 메모리에 세션을 만들고, 세션 ID를 쿠키로 내려준다.

```
[세션 기반 - Stateful]

클라이언트                              서버
   ── POST /login ──────────────────→  세션 생성 (메모리에 저장)
   ←── Set-Cookie: JSESSIONID=abc ──   sessionStore["abc"] = {userId: 1, role: ADMIN}
   ── GET /api/users (Cookie: abc) ─→  sessionStore["abc"] 조회 → 인증 확인
```

JWT 기반에서는 서버가 아무것도 기억하지 않는다. 토큰 자체에 모든 정보가 들어있다.

```
[JWT 기반 - Stateless]

클라이언트                              서버
   ── POST /login ──────────────────→  JWT 생성 (서버에 저장하지 않음)
   ←── { token: "eyJ..." } ─────────   토큰 안에 {userId: 1, role: ADMIN} 포함
   ── GET /api/users ───────────────→  토큰의 서명만 검증 → 인증 확인
      Authorization: Bearer eyJ...      (DB 조회도, 메모리 조회도 없음)
```

`SessionCreationPolicy.STATELESS`로 설정하면 Spring Security가 세션을 생성하지도, 사용하지도 않는다. 서버가 상태를 갖지 않으므로 수평 확장(서버 여러 대)이 쉬워진다. 어떤 서버로 요청이 가도 토큰만 검증하면 되기 때문이다.

### OAuth2 Resource Server (JWT) - 역할 이해하기

OAuth2에는 세 가지 역할이 있다. 이것부터 구분해야 한다.

```
[Authorization Server]         [Resource Server]          [Client]
 "신분증 발급소"                  "경비원이 있는 건물"            "방문자"
 ┌─────────────────┐          ┌─────────────────┐       ┌──────────┐
 │ 로그인 처리       │          │ REST API 서버    │       │ 프론트엔드 │
 │ JWT 발급         │          │ JWT 검증         │       │ 모바일 앱  │
 │ (Keycloak, Auth0 │          │ 데이터 제공       │       │          │
 │  자체 구현 등)    │          │                 │       │          │
 └─────────────────┘          └─────────────────┘       └──────────┘
```

**우리가 만드는 REST API 서버는 Resource Server다.** 토큰을 직접 발급하지 않는다. 누군가(Authorization Server)가 발급한 토큰이 유효한지 **검증만** 한다.

전체 흐름:

```
1. [Client → Authorization Server]
   사용자가 로그인
   → Authorization Server가 JWT 발급

2. [Client → Resource Server (우리 API)]
   클라이언트가 API 호출 시 JWT를 헤더에 포함
   → Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...

3. [Resource Server 내부]
   Spring Security가 JWT를 검증:
   a) 서명 검증: 이 토큰이 진짜 Authorization Server가 만든 것인가? (공개키로 확인)
   b) 만료 검증: exp 클레임이 현재 시각 이후인가?
   c) 발급자 검증: iss 클레임이 설정한 issuer-uri와 일치하는가?
   d) 대상 검증: aud 클레임에 my-api가 포함되어 있는가?

4. 모든 검증 통과 → 인증 성공 → API 응답
```

설정은 이것뿐이다:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://auth.example.com    # Authorization Server 주소
          audiences: my-api                        # 이 토큰이 "내 API용"인지 확인
```

`issuer-uri`를 설정하면 Spring Security가 시작 시 `https://auth.example.com/.well-known/openid-configuration`에 접속해서 공개키(JWK Set)를 자동으로 가져온다. 이 공개키로 JWT 서명을 검증한다. 개발자가 별도로 키를 관리할 필요가 없다.

### JWT 안의 권한 정보 추출

JWT 내부(payload)는 이런 구조다:

```json
{
  "sub": "user-123",
  "iss": "https://auth.example.com",
  "aud": "my-api",
  "exp": 1740000000,
  "roles": [
    "ADMIN",
    "USER"
  ]
  ←
  권한
  정보가
  여기에
}
```

Spring Security는 기본적으로 `scope` 클레임에서 권한을 읽는다. 하지만 Authorization Server마다 권한을 넣는 클레임 이름이 다르다. `roles`라는 이름을 쓴다면 커스텀 컨버터가 필요하다:

```kotlin
@Bean
fun jwtAuthenticationConverter(): JwtAuthenticationConverter {
    val grantedAuthoritiesConverter = JwtGrantedAuthoritiesConverter().apply {
        setAuthoritiesClaimName("roles")     // "scope" 대신 "roles" 클레임에서 읽음
        setAuthorityPrefix("ROLE_")          // ADMIN → ROLE_ADMIN으로 변환
    }

    return JwtAuthenticationConverter().apply {
        setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter)
    }
}
```

이 설정이 있으면 JWT의 `roles: ["ADMIN"]`이 Spring Security의 `ROLE_ADMIN` 권한으로 변환되어, `.hasRole("ADMIN")` 검사가 동작한다.

### CORS 설정

```kotlin
@Bean
fun corsConfigurationSource(): CorsConfigurationSource {
    val configuration = CorsConfiguration().apply {
        allowedOrigins = listOf("https://example.com", "https://admin.example.com")
        allowedMethods = listOf("GET", "POST", "PUT", "DELETE", "PATCH")
        allowedHeaders = listOf("*")
        allowCredentials = true
        maxAge = 3600
    }

    return UrlBasedCorsConfigurationSource().apply {
        registerCorsConfiguration("/api/**", configuration)
    }
}
```

`allowedOrigins`에 `"*"`를 쓰면 안 된다. 특히 `allowCredentials = true`와 함께 사용하면 브라우저가 요청을 차단한다. 프로덕션에서는 반드시 허용할 도메인을 명시한다.

---

## 5. HTTP 클라이언트 설정

Spring Boot 4에서 외부 API를 호출하는 방법은 세 가지다.

|            | RestClient              | WebClient           | @HttpExchange                  |
|------------|-------------------------|---------------------|--------------------------------|
| **방식**     | 동기 (블로킹)                | 비동기 (논블로킹)          | 선언적 (인터페이스)                    |
| **위치**     | Spring Boot 4 **기본 권장** | 리액티브 스택             | RestClient 또는 WebClient 위에서 동작 |
| **적합한 상황** | 일반적인 API 호출             | 스트리밍, SSE, 동시 다건 호출 | 외부 API가 여러 개일 때                |

대부분의 경우 **RestClient**로 충분하다. Java 25의 Virtual Threads 환경에서는 동기 코드도 I/O 대기 시 플랫폼 스레드를 반환하기 때문에, "비동기 성능이 필요해서" WebClient를 선택할 이유가 대부분 사라진다.

각 방식의 설정, 에러 핸들링, 재시도, 테스트 전략, 프로덕션 체크리스트 등 자세한 내용은 별도 포스트로 정리했다.

> [Spring Boot 4 HTTP 클라이언트 완전 가이드 - RestClient, WebClient, @HttpExchange](/spring-boot4-http-client)

---

## 6. 예외 처리

### ProblemDetail — RFC 9457 표준 에러 응답

Spring Boot 4에서는 커스텀 에러 응답 DTO를 만들 필요 없이 `ProblemDetail`을 사용한다. RFC 9457(HTTP API 에러 응답 표준)을 Spring이 기본 지원한다.

```yaml
# application.yml
spring:
  mvc:
    problemdetail:
      enabled: true
```

이 설정을 켜면 `@ExceptionHandler`가 없는 예외도 자동으로 표준 형식으로 응답된다.

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Failed to convert 'downtimeSeq' with value: 'abc'",
  "instance": "/api/downtimes"
}
```

> Spring Boot 3 이전에는 커스텀 `ApiErrorResponse` 같은 DTO를 직접 만들어야 했다. Spring Boot 4에서는 `ProblemDetail`이 그 역할을 대체한다. 커스텀 필드도 `setProperty()`로 자유롭게 확장 가능하다.

### ErrorCode 체계

```kotlin
interface ErrorCode {
    val status: HttpStatus
    val code: String
    val message: String
}

enum class CommonErrorCode(
    override val status: HttpStatus,
    override val code: String,
    override val message: String
) : ErrorCode {
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "COMMON_001", "잘못된 입력값입니다"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMON_002", "리소스를 찾을 수 없습니다"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_003", "내부 서버 오류가 발생했습니다");
}
```

도메인별로 별도의 ErrorCode enum을 만든다.

```kotlin
enum class DowntimeErrorCode(
    override val status: HttpStatus,
    override val code: String,
    override val message: String
) : ErrorCode {
    INVALID_PERIOD(HttpStatus.BAD_REQUEST, "DOWNTIME_001", "시작시간이 종료시간보다 늦습니다"),
    ALREADY_DELETED(HttpStatus.BAD_REQUEST, "DOWNTIME_002", "이미 삭제된 다운타임입니다");
}
```

### 비즈니스 예외

```kotlin
class BusinessException(
    val errorCode: ErrorCode,
    override val message: String? = errorCode.message
) : RuntimeException(message)
```

### 글로벌 예외 핸들러

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    // 공통 확장: 모든 ProblemDetail에 traceId, timestamp 추가
    private fun ProblemDetail.withTrace(request: HttpServletRequest): ProblemDetail {
        this.instance = URI.create(request.requestURI)
        this.setProperty("traceId", MDC.get("traceId"))
        this.setProperty("timestamp", LocalDateTime.now())
        return this
    }

    @ExceptionHandler(BusinessException::class)
    fun handleBusinessException(
        e: BusinessException,
        request: HttpServletRequest
    ): ProblemDetail {
        log.warn("BusinessException: {} - {}", e.errorCode.code, e.message)

        return ProblemDetail.forStatusAndDetail(e.errorCode.status, e.message)
            .apply {
                title = e.errorCode.code
                setProperty("errorCode", e.errorCode.code)
            }
            .withTrace(request)
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidationException(
        e: MethodArgumentNotValidException,
        request: HttpServletRequest
    ): ProblemDetail {
        val fieldErrors = e.bindingResult.fieldErrors.map { error ->
            mapOf(
                "field" to error.field,
                "rejectedValue" to error.rejectedValue,
                "message" to error.defaultMessage
            )
        }

        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "입력값 검증에 실패했습니다")
            .apply {
                title = "Validation Failed"
                setProperty("fieldErrors", fieldErrors)
            }
            .withTrace(request)
    }

    @ExceptionHandler(Exception::class)
    fun handleException(
        e: Exception,
        request: HttpServletRequest
    ): ProblemDetail {
        log.error("Unhandled exception", e)

        return ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR,
                CommonErrorCode.INTERNAL_ERROR.message
            )
            .withTrace(request)
    }
}
```

마지막 `handleException`은 예상하지 못한 예외의 안전망이다. 클라이언트에게는 내부 오류 메시지를 노출하지 않고 일반적인 메시지를 반환하면서, 서버 로그에는 전체 스택트레이스를 남긴다.

`BusinessException` 응답 예시:

```json
{
  "type": "about:blank",
  "title": "DOWNTIME_001",
  "status": 400,
  "detail": "시작시간이 종료시간보다 늦습니다",
  "instance": "/api/downtimes",
  "errorCode": "DOWNTIME_001",
  "traceId": "abc123def456",
  "timestamp": "2026-02-25T14:30:00"
}
```

ProblemDetail의 구조, `ErrorResponseException` 상속 방식, 기존 에러 응답에서의 마이그레이션 전략 등 자세한 내용은 별도 포스트로 정리했다.

> [ProblemDetail - Spring Boot 4의 표준 에러 응답](/spring-problemdetail)

---

## 7. 로깅

### 기본 구조

Spring Boot는 SLF4J(파사드) + Logback(구현체)을 기본으로 사용한다. 별도 의존성 추가 없이 바로 사용할 수 있다.

```kotlin
@Service
class UserService {

    private val log = LoggerFactory.getLogger(javaClass)

    fun createUser(request: CreateUserRequest) {
        log.info("사용자 생성 요청: email={}", request.email)
        // ...
        log.debug("사용자 생성 완료: userId={}", user.id)
    }
}
```

### 프로파일별 로그 레벨

```yaml
# application.yml (공통)
logging:
  level:
    root: INFO
    com.example.myapi: DEBUG
    org.springframework.web: INFO
    org.jooq: INFO

---
# application-local.yml
logging:
  level:
    org.springframework.web: DEBUG
    org.jooq: DEBUG

---
# application-prod.yml
logging:
  level:
    root: WARN
    com.example.myapi: INFO
```

로컬에서는 SQL 쿼리와 HTTP 요청/응답을 상세히 보고, 프로덕션에서는 비즈니스 로직 중심의 INFO 레벨만 남긴다.

### 구조화 로깅 (JSON)

프로덕션 환경에서 ELK, Loki 같은 로그 수집 시스템을 사용한다면 JSON 포맷이 필수다.

`logback-spring.xml`:

```xml

<configuration>
    <springProfile name="local">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
            </encoder>
        </appender>
        <root level="DEBUG">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="ch.qos.logback.classic.encoder.JsonEncoder"/>
        </appender>
        <root level="INFO">
            <appender-ref ref="JSON"/>
        </root>
    </springProfile>
</configuration>
```

로컬에서는 읽기 좋은 텍스트 포맷, 프로덕션에서는 JSON 포맷으로 출력한다. JSON 포맷은 로그 수집 시스템이 파싱하기 쉽고, 필드 단위 검색이 가능해진다.

### MDC 요청 추적

#### 문제: 로그가 섞인다

서버에 동시에 100개의 요청이 들어오면 로그가 이렇게 섞인다:

```
10:30:01 INFO  UserService - 사용자 조회: userId=42
10:30:01 INFO  OrderService - 주문 생성 시작
10:30:01 INFO  UserService - 사용자 조회: userId=7
10:30:01 ERROR PaymentService - 결제 실패
10:30:01 INFO  OrderService - 주문 생성 완료
10:30:01 ERROR OrderService - 주문 생성 실패
```

"결제 실패"가 어떤 요청에서 발생한 건지, "주문 생성 실패"와 같은 요청인지 알 수 없다. 사용자가 "에러가 났어요"라고 신고하면 그 사용자의 요청 로그만 골라내야 하는데, 방법이 없다.

#### 해결: 요청마다 고유 ID를 붙인다

MDC(Mapped Diagnostic Context)는 SLF4J가 제공하는 **스레드별 저장소**다. 여기에 값을 넣으면 해당 스레드에서 찍히는 **모든 로그에 자동으로 포함**된다.

```
[동작 원리]

1. 요청 들어옴 → 필터에서 traceId 생성 (예: "abc-123")
2. MDC에 저장: MDC.put("traceId", "abc-123")
3. 이후 이 요청을 처리하는 동안 찍히는 모든 log에 traceId가 자동 포함
4. 요청 처리 완료 → MDC 정리: MDC.clear()
```

적용하면 로그가 이렇게 바뀐다:

```
10:30:01 [abc-123] INFO  UserService - 사용자 조회: userId=42
10:30:01 [def-456] INFO  OrderService - 주문 생성 시작
10:30:01 [ghi-789] INFO  UserService - 사용자 조회: userId=7
10:30:01 [def-456] ERROR PaymentService - 결제 실패
10:30:01 [ghi-789] INFO  OrderService - 주문 생성 완료
10:30:01 [def-456] ERROR OrderService - 주문 생성 실패
```

이제 `[def-456]`으로 검색하면 하나의 요청이 거쳐간 전체 경로를 볼 수 있다:

```
10:30:01 [def-456] INFO  OrderService - 주문 생성 시작
10:30:01 [def-456] ERROR PaymentService - 결제 실패       ← 원인
10:30:01 [def-456] ERROR OrderService - 주문 생성 실패     ← 결과
```

#### 구현

요청이 들어올 때 traceId를 생성하고, 나갈 때 정리하는 필터:

```kotlin
@Component
class MdcFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        // 외부에서 전달된 traceId가 있으면 그대로 사용, 없으면 새로 생성
        val traceId = request.getHeader("X-Trace-Id") ?: UUID.randomUUID().toString()
        MDC.put("traceId", traceId)
        response.setHeader("X-Trace-Id", traceId)  // 응답에도 포함 (클라이언트가 문의 시 활용)
        try {
            filterChain.doFilter(request, response)
        } finally {
            MDC.clear()  // 스레드 반환 전 반드시 정리 (스레드 풀에서 재사용되므로)
        }
    }
}
```

Logback 패턴에 `%X{traceId}`를 추가하면 로그에 자동 출력된다:

```xml

<pattern>%d{HH:mm:ss.SSS} [%X{traceId}] %-5level %logger{36} - %msg%n</pattern>
```

#### MSA 환경에서의 활용

서비스 간 호출 시 traceId를 헤더로 전파하면 **여러 서비스에 걸친 하나의 요청**을 추적할 수 있다.

```
[사용자 요청]
    │  X-Trace-Id: abc-123
    ▼
[API Gateway] ── abc-123 ──→ [주문 서비스] ── abc-123 ──→ [결제 서비스]
    로그: [abc-123] 요청 수신     로그: [abc-123] 주문 생성     로그: [abc-123] 결제 처리
```

세 서비스의 로그를 `abc-123`으로 검색하면 전체 흐름이 한눈에 보인다.

> OpenTelemetry를 사용한다면 이 필터를 직접 만들 필요가 없다. OpenTelemetry가 traceId 생성과 서비스 간 전파를 자동으로 처리한다. 9장에서 다룬다.

---

## 8. 테스트

### 컨트롤러 단위 테스트 (@WebMvcTest)

웹 레이어만 로드하므로 빠르다. Service, Repository는 Mock으로 대체한다.

```kotlin
@WebMvcTest(UserController::class)
class UserControllerTest(
    @Autowired private val mockMvc: MockMvc,
    @MockitoBean private val userService: UserService
) {

    @Test
    fun `사용자 조회 - 존재하는 사용자`() {
        // given
        val user = UserDto(id = 1, name = "홍길동", email = "hong@example.com")
        given(userService.findById(1)).willReturn(user)

        // when & then
        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("홍길동"))
            .andExpect(jsonPath("$.email").value("hong@example.com"))
    }

    @Test
    fun `사용자 조회 - 존재하지 않는 사용자`() {
        // given
        given(userService.findById(999))
            .willThrow(BusinessException(UserErrorCode.USER_NOT_FOUND))

        // when & then
        mockMvc.perform(get("/api/users/999"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.code").value("USER_002"))
    }
}
```

> Spring Boot 4에서 `@MockBean`은 deprecated되고 `@MockitoBean`으로 변경되었다. 동일한 기능이지만 패키지가 다르다.

### 통합 테스트 (@SpringBootTest + Testcontainers)

실제 DB와 연동하는 통합 테스트에는 Testcontainers를 사용한다. `@ServiceConnection`이 DataSource를 자동 구성해준다.

```kotlin
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class UserServiceIntegrationTest {

    companion object {
        @Container
        @ServiceConnection
        val postgres = PostgreSQLContainer("postgres:17-alpine")
    }

    @Autowired
    private lateinit var userService: UserService

    @Test
    fun `사용자 생성 및 조회`() {
        // given
        val request = CreateUserRequest(name = "홍길동", email = "hong@example.com")

        // when
        val created = userService.createUser(request)
        val found = userService.findById(created.id)

        // then
        assertThat(found).isNotNull()
        assertThat(found!!.name).isEqualTo("홍길동")
        assertThat(found.email).isEqualTo("hong@example.com")
    }
}
```

`@ServiceConnection`은 Spring Boot 4의 Testcontainers 통합 핵심이다. PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ 등을 컨테이너로 실행하고 해당 커넥션 설정을 자동으로 주입한다. `application-test.yml`에 DB URL을 따로 적을 필요가 없다.

### 테스트 분리 전략

| 테스트 유형 | 어노테이션             | 네이밍                | 속도 | 용도            |
|--------|-------------------|--------------------|----|---------------|
| 단위 테스트 | `@WebMvcTest`, 없음 | `*Test`            | 빠름 | 개별 클래스/메서드 검증 |
| 통합 테스트 | `@SpringBootTest` | `*IntegrationTest` | 느림 | 전체 흐름 검증      |

Gradle에서 분리 실행:

```kotlin
// build.gradle.kts
tasks.register<Test>("integrationTest") {
    useJUnitPlatform {
        includeTags("integration")
    }
}
```

---

## 9. Observability (관측 가능성)

Observability는 Logs(무슨 일이 일어났는가), Metrics(지금 상태가 어떤가), Traces(요청이 어디를 거쳐갔는가) 세 축으로 구성된다. Spring Boot 4에서 `spring-boot-starter-opentelemetry`가 추가되면서 이 셋을 하나의 의존성으로 통합할 수 있게 되었다.

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
}
```

```yaml
management:
  otlp:
    tracing:
      export:
        url: http://localhost:4318/v1/traces
    metrics:
      export:
        url: http://localhost:4318/v1/metrics
        step: 30s
  tracing:
    sampling:
      probability: 1.0   # 개발: 100%, 프로덕션: 0.1 (10%)
```

이것만으로 모든 로그에 traceId/spanId가 자동 주입되고, HTTP 요청, DB 쿼리, 외부 API 호출이 자동 추적되며, JVM/HTTP/커넥션 풀 메트릭이 자동 수집된다.

OpenTelemetry 설정, 실제 로그 출력 예시, Actuator 헬스체크(Liveness/Readiness), 커스텀 메트릭, 프로덕션 모니터링 전략(RED/USE Method)에 대한 자세한 내용은 별도 포스트로 정리했다.

> [Spring Boot 4 Observability - OpenTelemetry, Actuator, Metrics 완전 가이드](/spring-boot4-observability)

---

## 10. 컨테이너 배포

### Dockerfile

```dockerfile
# Stage 1: Build
FROM eclipse-temurin:25-jdk AS builder
WORKDIR /app
COPY gradle/ gradle/
COPY gradlew build.gradle.kts settings.gradle.kts ./
RUN ./gradlew dependencies --no-daemon
COPY src/ src/
RUN ./gradlew bootJar --no-daemon

# Stage 2: Runtime
FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar

ENTRYPOINT ["java", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseZGC", \
    "-jar", "app.jar"]
```

**Multi-stage 빌드**: 빌드 이미지(JDK)와 런타임 이미지(JRE)를 분리한다. 최종 이미지 크기가 450MB에서 270MB 수준으로 줄어든다.

**레이어 캐싱**: `gradle/`, `gradlew`, `build.gradle.kts`를 먼저 복사하고 `dependencies`를 실행한다. 의존성이 변경되지 않으면 이 레이어가 캐시되어 빌드가 빨라진다.

**Non-root 유저**: 컨테이너 내부에서 root로 실행하면 보안 취약점이 된다. 전용 유저를 만들어서 실행한다.

**JVM 옵션**:

- `-XX:MaxRAMPercentage=75.0`: 컨테이너 메모리 제한의 75%를 JVM 힙에 할당한다. 나머지 25%는 metaspace, 스택, 네이티브 메모리에 사용된다
- `-XX:+UseZGC`: 낮은 지연시간이 필요한 API 서버에 적합한 GC. Java 25에서 성능이 더 개선되었다

### Docker Compose (개발 환경)

```yaml
services:
  app:
    build: .
    ports:
    - "8080:8080"
    environment:
    - SPRING_PROFILES_ACTIVE=local
    - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/mydb
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
    - "5432:5432"
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U dev -d mydb" ]
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
    - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

`depends_on`에 `condition: service_healthy`를 설정하면 DB가 완전히 준비된 후에 애플리케이션이 시작된다. healthcheck 없이 `depends_on`만 쓰면 컨테이너가 시작된 것만 확인하고, DB가 실제로 접속 가능한지는 확인하지 않는다.

---

## 11. 놓치기 쉬운 프로덕션 체크리스트

### 시크릿 관리

절대 `application.yml`에 비밀번호를 직접 적지 않는다.

```yaml
# 잘못된 방법
spring:
  datasource:
    password: mySecretPassword123

# 올바른 방법
spring:
  datasource:
    password: ${DB_PASSWORD}
```

Kubernetes라면 Secret 오브젝트를, 클라우드라면 AWS Secrets Manager, GCP Secret Manager를 사용한다. 더 나아가면 HashiCorp Vault로 시크릿을 중앙 관리하고 자동 로테이션한다.

### API 버저닝

```kotlin
@RestController
@RequestMapping("/api/v1/users")
class UserV1Controller { /* ... */ }

@RestController
@RequestMapping("/api/v2/users")
class UserV2Controller { /* ... */ }
```

URI 경로에 버전을 포함하는 방식이 가장 직관적이고 널리 쓰인다. 헤더 기반 버저닝(`Accept: application/vnd.myapi.v2+json`)도 있지만 디버깅이 어렵다.

### Rate Limiting

Spring Boot 단독으로는 Rate Limiting 기능이 없다. API Gateway(Spring Cloud Gateway, Kong, Nginx)에서 처리하거나, Bucket4j 같은 라이브러리를 사용한다.

```kotlin
// Bucket4j 예시
@Component
class RateLimitInterceptor : HandlerInterceptor {

    private val buckets = ConcurrentHashMap<String, Bucket>()

    override fun preHandle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any
    ): Boolean {
        val clientIp = request.remoteAddr
        val bucket = buckets.computeIfAbsent(clientIp) { createBucket() }

        return if (bucket.tryConsume(1)) {
            true
        } else {
            response.status = HttpStatus.TOO_MANY_REQUESTS.value()
            false
        }
    }

    private fun createBucket(): Bucket {
        return Bucket.builder()
            .addLimit(
                BandwidthBuilder.builder()
                    .capacity(100)
                    .refillGreedy(100, Duration.ofMinutes(1))
                    .build()
            )
            .build()
    }
}
```

### Circuit Breaker (Resilience4j)

외부 서비스 호출에는 반드시 Circuit Breaker를 적용한다. 외부 서비스가 장애 상태일 때 계속 호출하면 자신의 스레드 풀까지 고갈된다.

```kotlin
@Service
class ExternalApiClient(
    private val restClient: RestClient,
    private val circuitBreakerRegistry: CircuitBreakerRegistry
) {

    private val circuitBreaker = circuitBreakerRegistry.circuitBreaker("external-api")

    fun getUser(userId: Long): ExternalUser? {
        return circuitBreaker.executeSupplier {
            restClient.get()
                .uri("/users/{id}", userId)
                .retrieve()
                .body(ExternalUser::class.java)
        }
    }
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      external-api:
        sliding-window-size: 10
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
        permitted-number-of-calls-in-half-open-state: 3
```

10번의 호출 중 50% 이상 실패하면 회로가 열리고, 30초 동안 호출을 차단한다. 30초 후 반열림 상태에서 3번의 테스트 호출을 시도하여 복구 여부를 확인한다.

### 커넥션 풀 모니터링

HikariCP 메트릭을 Actuator로 노출하면 커넥션 풀 상태를 실시간으로 확인할 수 있다.

```yaml
management:
  metrics:
    enable:
      hikaricp: true
```

주요 모니터링 지표:

| 메트릭                            | 의미              | 위험 신호                 |
|--------------------------------|-----------------|-----------------------|
| `hikaricp.connections.active`  | 사용 중인 커넥션 수     | maximum-pool-size에 근접 |
| `hikaricp.connections.pending` | 커넥션 대기 중인 스레드 수 | 0보다 크면 풀 부족           |
| `hikaricp.connections.timeout` | 타임아웃 횟수         | 1 이상이면 즉시 조사          |

`pending`이 지속적으로 0보다 크거나 `timeout`이 발생하면 커넥션 풀 크기를 늘리거나, 트랜잭션이 너무 오래 열려있는 코드를 찾아야 한다.
