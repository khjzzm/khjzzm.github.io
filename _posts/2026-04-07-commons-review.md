---
layout: post
title: Commons 라이브러리 코드 리뷰 가이드
tags: [ kotlin, spring-boot, review ]
---


> 마이크로서비스 공통 라이브러리 전체 분석 문서 (팀 공유용)
>
> **구 버전**: `commons-util` (Java, Spring Boot 2.3, WebClient 기반)
> **신 버전**: `commons` (Kotlin, Spring Boot 4.x + Java 25, RestClient/WebFlux 이중 지원)

---

## 1. 프로젝트 개요

### 1.1 목적
- 마이크로서비스 간 **공통으로 사용하는 코드**를 라이브러리로 분리
- 세션 관리, API 호출, 에러 처리, 쿼리 빌딩 등을 표준화
- Nexus에 배포하여 각 서비스에서 의존성으로 사용

**MSA에서 의존성 추가:**
```kotlin
// build.gradle.kts
dependencies {
    implementation("com.knet.commons:commons:${knetVersion}")              // 핵심 (enum, Session, ErrorCode 등)
    implementation("com.knet.commons:commons-web-server:${knetVersion}")   // 서버 웹 (세션, 보안, 에러 핸들링 등)
    implementation("com.knet.commons:commons-web-client:${knetVersion}")   // API 클라이언트 (선택)
}
```

### 1.2 기술 스택

| 항목 | 기술 |
|------|------|
| 언어 | Kotlin |
| JDK | Java 25 |
| 프레임워크 | Spring Boot (Servlet + WebFlux 이중 지원) |
| 빌드 | Gradle (Kotlin DSL), Nx (모노레포 관리) |
| 보안 | Spring Security OAuth2 Resource Server (JWT) |
| DB 프레임워크 | MyBatis, jOOQ (선택적) |
| CI/CD | Jenkins, Nexus (Maven 저장소) |
| 직렬화 | Jackson (tools.jackson.databind) |

### 1.3 모듈 구조

```
commons/
├── kotlin/commons/                  # 핵심 모듈 (의존성 없음)
├── kotlin/commons-web-server/       # 서버 웹 모듈 (Spring MVC + WebFlux)
└── kotlin/commons-web-client/       # API 클라이언트 모듈
```

**의존 관계:**
```
commons-web-server  ──▶  commons
commons-web-client  ──▶  commons
```

### 1.4 빌드 설정 핵심 포인트

- **Java 25 Toolchain**: `JavaLanguageVersion.of(25)` — 모든 모듈을 Java 25 기준으로 일관 빌드
- **버전 관리**: 각 모듈의 `package.json`에서 version 읽음 (Nx 기반 릴리즈)
- **Nexus 배포**: `maven-publish` 플러그인으로 `nexus-hosted` 저장소에 발행
- **Branch 전략**: `main` → `latest.release`, 그 외 → `latest.integration`
- **Kotlin 컴파일러 옵션**: `-Xjsr305=strict` (null 안전성 강화), `-Xannotation-default-target=param-property`

---

## 2. commons 모듈 (핵심)

> 패키지: `com.knet.commons`
>
> 외부 의존성이 거의 없는 순수한 공통 코드

### 2.1 예외 처리 체계

#### ErrorCode 인터페이스
```kotlin
// 위치: exception/ErrorCode.kt
interface ErrorCode {
    val status: Int    // HTTP 상태 코드 (400, 404, 500 등)
    val code: String   // 에러 코드 문자열 ("NOT_FOUND" 등)
    val text: String   // 사용자 표시용 메시지
}
```

**설계 의도:** 각 도메인 서비스에서 자체 ErrorCode enum을 만들 수 있도록 인터페이스로 제공.

#### BusinessException
```kotlin
// 위치: exception/BusinessException.kt
class BusinessException(
    val errorCode: ErrorCode,
    val errorDetail: String? = null,  // 추가 상세 정보
    cause: Throwable? = null
) : RuntimeException(...)
```

**핵심 동작:**
- `buildMessage()`로 `"CODE: 메시지 (상세)"` 형태 메시지 자동 생성
- 모든 비즈니스 로직 예외는 이 클래스를 통해 발생
- 예외 발생 시 `errorCode.status`가 HTTP 응답 코드로 매핑됨

#### ErrorResponse DTO
```kotlin
// 위치: response/ErrorResponse.kt
data class ErrorResponse(
    val code: String,      // 에러 코드
    val message: String,   // 에러 메시지
    val detail: String?,   // 상세 정보 (선택)
    val trace: String?,    // 스택 트레이스 (설정에 따라)
    val status: Int        // HTTP 상태 코드
)
```

**팩토리 메서드:**
- `ErrorResponse.of(errorCode, detail, trace)` — ErrorCode로부터 생성
- `ErrorResponse.of(exception, trace)` — BusinessException으로부터 생성

**흐름 정리:**
```
비즈니스 로직에서 예외 발생
  → throw BusinessException(MyErrorCode.NOT_FOUND)
  → GlobalExceptionHandler가 catch
  → ErrorResponse.of(exception) 생성
  → HTTP 응답으로 반환 (status, code, message, detail)
```

---

### 2.2 세션 모델

#### Session 데이터 클래스
```kotlin
// 위치: session/Session.kt
data class Session(
    var brand: Brand? = null,           // 서비스 브랜드 (바로빌, 비즈포인 등)
    var product: String? = null,        // 제품명
    var partnerSeq: Int? = null,        // 파트너 번호
    var memberSeq: Int? = null,         // 회원 번호
    var userSeq: Int? = null,           // 사용자 번호
    var doSessionType: SessionType? = null,  // 세션 타입 (SYSTEM, MANAGER 등)
    var doSessionSeq: Int? = null,      // 세션 주체 번호
    var doDt: LocalDateTime? = null,    // 요청 일시
    var doIp: String? = null            // 요청 IP
)
```

**`columns()` 메서드의 활용:**
```kotlin
Session.columns()           // ["brand", "product", "partnerSeq", ...]
Session.columns("delete")  // ["deleteBrand", "deleteProduct", "deletePartnerSeq", ...]
```
- DB 테이블에 `do_brand`, `do_product` 같은 감사(audit) 컬럼이 있을 때
- prefix를 붙여 insert/delete 시 세션 정보 컬럼을 자동 매핑하는 데 사용

#### Brand enum
```kotlin
enum class Brand(val text: String) {
    BAROBILL("바로빌"),
    BAROBILL_TESTBED("바로빌 테스트베드"),
    BAROBILL_DEVELOPERS("바로빌 개발자센터"),
    CERT_CENTER("공인인증센터"),
    BIZ4IN("비즈포인"),
    AD_CENTER("광고센터")
}
```

#### SessionType enum
```kotlin
enum class SessionType(val text: String) {
    SYSTEM("시스템"),
    MANAGER("관리자"),
    PARTNER("파트너"),
    USER("사용자"),
    GUEST("비회원")
}
```

---

### 2.3 유틸리티

#### Encryptor (AES 암호화)
```kotlin
// 위치: util/Encryptor.kt
object Encryptor {
    fun encryptAES(value: String): String   // AES/CBC/PKCS5Padding 암호화 → Base64
    fun decryptAES(value: String): String   // Base64 → AES 복호화
}
```

**사용처:**
- 마이크로서비스 간 세션 전달 시 **KSESSIONID** 쿠키/헤더에 암호화된 Session JSON 저장
- `SessionLoadFilter`/`SessionLoadInterceptor`에서 복호화하여 Session 객체로 복원

**암호화 방식:**
1. 키/IV를 MD5 해시하여 128비트 AES 키 생성
2. AES/CBC/PKCS5Padding 알고리즘으로 암호화
3. Base64 인코딩

**AES 키가 코드에 하드코딩된 이유:** 모든 MSA가 **동일한 키**를 써야 세션 암복호화가 호환된다. 서비스 A가 암호화한 세션을 서비스 B가 복호화하려면 같은 키여야 하므로, 환경변수로 분리하지 않고 commons 라이브러리에 고정한 것이다.

#### String 확장 함수
```kotlin
// 위치: util/StringExtensions.kt
fun String.toSnakeCase(): String  // "partnerSeq" → "partner_seq"
fun String.toCamelCase(): String  // "partner_seq" → "partnerSeq"
```

**사용처:** 쿼리 빌더에서 Kotlin 프로퍼티명(camelCase)을 DB 컬럼명(snake_case)으로 변환할 때

---

### 2.4 MyBatis 타입 핸들러

MyBatis는 `String ↔ TEXT`, `Int ↔ INTEGER` 같은 기본 타입 변환은 알고 있지만, `UUID`나 `List<String>` 같은 타입은 DB와 어떻게 변환하는지 모른다. TypeHandler는 MyBatis에게 "이 타입은 이렇게 변환해"라고 가르쳐주는 번역기 역할이다.

```
Kotlin 코드               DB (PostgreSQL)
──────────────            ──────────────
UUID                  ↔   uuid / text        → UuidTypeHandler
List<String>          ↔   text[] (배열)      → StringListArrayTypeHandler
```

#### StringListArrayTypeHandler
```kotlin
// 위치: mybatis/typehandler/StringListArrayTypeHandler.kt
// List<String> ↔ PostgreSQL text[] 배열 컬럼 매핑
```

#### UuidTypeHandler
```kotlin
// 위치: mybatis/typehandler/UuidTypeHandler.kt
// java.util.UUID ↔ PostgreSQL UUID 컬럼 매핑
```

#### NoArg 어노테이션
```kotlin
// 위치: kotlin/NoArg.kt
@Target(AnnotationTarget.CLASS)
annotation class NoArg
```
- `kotlin-noarg` 컴파일러 플러그인과 함께 사용
- 이 어노테이션이 붙은 data class에 기본 생성자를 자동 생성 (MyBatis 매핑 필요)

**MSA 프로젝트 build.gradle.kts에 필요한 설정:**
```kotlin
plugins {
    kotlin("plugin.noarg") version "..."  // kotlin-noarg 플러그인 추가
}

noArg {
    annotation("com.knet.commons.kotlin.NoArg")  // 이 어노테이션이 붙은 클래스에 기본 생성자 생성
}
```
> `@NoArg`만 붙이고 이 플러그인 설정을 안 하면 MyBatis 매핑 시 기본 생성자가 없다는 에러 발생

#### TypeHandler 등록 방법 (3가지)

MyBatis를 쓰는 MSA에서 commons의 TypeHandler를 사용하려면 아래 중 하나로 등록:

**방법 1: mybatis-config.xml**
```xml
<configuration>
    <typeHandlers>
        <typeHandler handler="com.knet.commons.mybatis.typehandler.UuidTypeHandler"/>
        <typeHandler handler="com.knet.commons.mybatis.typehandler.StringListArrayTypeHandler"/>
    </typeHandlers>
</configuration>
```

**방법 2: application.yaml (패키지 스캔)**
```yaml
mybatis:
  type-handlers-package: com.knet.commons.mybatis.typehandler
```

**방법 3: SqlSessionFactory Java Config**
```kotlin
@Bean
fun sqlSessionFactory(dataSource: DataSource): SqlSessionFactory {
    val factory = SqlSessionFactoryBean()
    factory.setDataSource(dataSource)
    factory.setTypeHandlersPackage("com.knet.commons.mybatis.typehandler")
    return factory.getObject()!!
}
```

> **참고:** jOOQ를 쓰는 프로젝트(downtime-api 등)에서는 TypeHandler 세팅이 필요 없다. jOOQ는 빌드 시 DB 스키마에서 코드를 생성하므로 타입 매핑을 이미 알고 있다.

---

## 3. commons-web-server 모듈

> 패키지: `com.knet.commons.web.server`
>
> Spring MVC(Servlet)와 Spring WebFlux(Reactive) **이중 지원**

### 3.1 아키텍처 개요

이 모듈은 **동일한 기능**을 Servlet과 Reactive 두 가지 스택으로 제공합니다:

| 기능 | Servlet (MVC) | Reactive (WebFlux) |
|------|-------------|-------------------|
| 세션 로드 | `SessionLoadInterceptor` | `SessionLoadFilter` |
| 세션 검증 | `RequireSessionInterceptor` | `RequireSessionFilter` |
| 응답 시간 측정 | `RequestTimingInterceptor` | `RequestTimingFilter` |
| 세션 주입 | `SessionArgumentResolver` | `SessionArgumentResolver` |
| 쿼리 파라미터 주입 | `StrapiQueryArgumentResolver` | `StrapiQueryArgumentResolver` |
| 보안 설정 | `CommonsSecurityAutoConfiguration` | `CommonsReactiveSecurityAutoConfiguration` |
| 웹 설정 | `CommonsWebAutoConfiguration` | `CommonsReactiveWebAutoConfiguration` |
| 에러 유틸 | `ErrorResponses` | `ErrorResponses` |

**파일별 한줄 요약 (Servlet):**

| 파일 | 역할 |
|------|------|
| `SessionLoadInterceptor` | 쿠키→헤더→JWT 순서로 세션을 추출하여 요청 속성에 저장 |
| `RequireSessionInterceptor` | `@RequireSession` 어노테이션이 붙은 핸들러의 세션 존재 여부와 브랜드/세션타입 권한 검증 |
| `RequestTimingInterceptor` | 요청 처리 시간을 측정하여 `X-Response-Time` 헤더에 추가 |
| `SessionArgumentResolver` | 컨트롤러 메서드에 `Session` 타입 파라미터를 자동 주입 |
| `StrapiQueryArgumentResolver` | HTTP 쿼리 파라미터를 `StrapiQuery` 객체로 변환하여 주입 |
| `ErrorResponses` | 예외 스택 트레이스와 응답 시간 헤더를 처리하는 유틸리티 |
| `CommonsSecurityAutoConfiguration` | JWT 기반 OAuth2 인증/인가 및 에러 처리를 자동 등록하는 보안 설정 |
| `CommonsWebAutoConfiguration` | 인터셉터, 아규먼트 리졸버, 전역 예외 처리기를 자동 등록하는 웹 MVC 설정 |

**파일별 한줄 요약 (Reactive):**

| 파일 | 역할 |
|------|------|
| `SessionLoadFilter` | 쿠키→헤더→JWT 순서로 세션을 추출하여 exchange 속성에 저장 |
| `RequireSessionFilter` | `@RequireSession` 어노테이션이 붙은 핸들러의 세션과 권한 검증 |
| `RequestTimingFilter` | 요청 처리 시간을 측정하여 `X-Response-Time` 헤더에 추가 |
| `SessionArgumentResolver` | 리액티브 환경에서 `Session` 타입 파라미터를 자동 주입 |
| `StrapiQueryArgumentResolver` | 리액티브 환경에서 HTTP 쿼리 파라미터를 `StrapiQuery` 객체로 변환하여 주입 |
| `ErrorResponses` | 예외 스택 트레이스를 처리하는 리액티브 유틸리티 |
| `CommonsReactiveSecurityAutoConfiguration` | JWT 기반 OAuth2 인증/인가 및 에러 처리를 자동 등록하는 리액티브 보안 설정 |
| `CommonsReactiveWebAutoConfiguration` | 필터, 아규먼트 리졸버, 전역 예외 처리기를 자동 등록하는 WebFlux 설정 |

**네이밍 규칙:**
- **이름이 같은 것** (`SessionArgumentResolver`, `StrapiQueryArgumentResolver`, `ErrorResponses`): 역할과 사용법이 동일. 패키지(`servlet` vs `reactive`)로 구분
- **이름이 다른 것** (`~Interceptor` vs `~Filter`, `Commons~` vs `CommonsReactive~`): Spring 스택의 확장 포인트가 달라서 구현 방식이 다름. MVC는 `HandlerInterceptor`, WebFlux는 `WebFilter`를 확장해야 하므로 부모 클래스가 다르고, AutoConfiguration도 `@ConditionalOnWebApplication(SERVLET)` vs `(REACTIVE)` 활성화 조건이 달라 이름으로 구분

**자동 활성화 조건:**
```yaml
# application.yml
knet:
  commons:
    web:
      enabled: true       # 웹 설정 활성화
    security:
      enabled: true       # 보안 설정 활성화 (선택)
```

Spring Boot AutoConfiguration이 `ConditionalOnWebApplication` 조건으로 Servlet/Reactive를 **자동 감지**합니다. 별도 설정이 아니라, `build.gradle.kts`에 어떤 starter를 넣었느냐로 결정됩니다:

```
spring-boot-starter-web     → 클래스패스에 DispatcherServlet 존재     → SERVLET
spring-boot-starter-webflux → 클래스패스에 ReactiveWebApplicationContext 존재 → REACTIVE
```

예: downtime-api는 `spring-boot-starter-webflux`를 의존하므로, `CommonsReactiveSecurityAutoConfiguration`(Reactive)만 활성화되고 `CommonsSecurityAutoConfiguration`(Servlet)은 무시됩니다.

---

### 3.2 세션 처리 파이프라인

#### 전체 흐름 (요청 → 응답)

```
HTTP 요청 (KSESSIONID 쿠키/헤더 or JWT 토큰)
  │
  ▼
┌─────────────────────────────────┐
│  ① SessionLoadFilter/Interceptor │  세션 추출 & 복호화
│     - 쿠키 KSESSIONID           │
│     - 헤더 KSESSIONID           │
│     - JWT claim "session"       │
│     → exchange/request attribute │
│       "KSESSION"에 Session 저장  │
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│  ② RequireSessionFilter/        │  @RequireSession 검증
│     Interceptor                  │
│     - 세션 존재 확인 → 401       │
│     - brand 허용 확인 → 403     │
│     - sessionType 허용 확인 → 403│
└─────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────┐
│  ③ SessionArgumentResolver      │  컨트롤러 파라미터 자동 주입
│     fun handler(session: Session)│
└─────────────────────────────────┘
```

#### 세션 추출 우선순위

세 가지는 **같은 Session을 다른 방식으로 전달하는 경로**이며, 먼저 찾은 걸 사용한다 (쿠키에 있으면 JWT는 안 봄):

| 우선순위 | 경로 | 전달 방식 | 누가 보내나 |
|:---:|------|-----------|-----------|
| 1 | 쿠키 (`KSESSIONID`) | AES 암호화된 Session JSON | 브라우저 또는 **ApiClient** (쿠키+헤더 동시 전송) |
| 2 | 헤더 (`KSESSIONID`) | AES 암호화된 Session JSON | **ApiClient** (쿠키와 동시 전송, 쿠키 실패 시 폴백) |
| 3 | JWT (`Authorization: Bearer ...`) | JWT claims 안에 Session JSON | Auth Server가 발급한 토큰 |

> **참고:** `ApiClient`(MSA 간 내부 호출)는 쿠키와 헤더에 **동시에** 암호화된 세션을 보낸다. 수신 측에서는 1순위인 쿠키에서 먼저 찾게 되고, 프록시 등으로 쿠키를 못 읽는 경우 2순위 헤더에서 찾는다.

```
경로 1, 2: Session을 AES로 암호화해서 직접 전달 (JWT 안 씀)
           → Encryptor.decryptAES → ObjectMapper.readValue → Session

경로 3:   Authorization: Bearer 토큰 안에 Session이 들어있음
           → Spring Security가 JWT 검증 → SecurityContext 저장
           → SessionLoadFilter가 claims["session"] 추출 → ObjectMapper.readValue → Session
```

#### @RequireSession 어노테이션
```kotlin
// 클래스 레벨 적용 (모든 메서드에 세션 필요)
@RequireSession
class UserController { ... }

// 메서드 레벨 적용 (특정 메서드만)
@RequireSession(brands = [Brand.BAROBILL], sessionTypes = [SessionType.MANAGER])
fun adminOnly(session: Session) { ... }
```

- `brands`가 비어있으면 → 모든 브랜드 허용
- `sessionTypes`가 비어있으면 → 모든 세션 타입 허용
- 세션이 없으면 → 401 UNAUTHORIZED
- 브랜드/타입이 불일치하면 → 403 FORBIDDEN

---

### 3.3 Strapi 스타일 쿼리 시스템

> 패키지: `com.knet.commons.web.server.query`
>
> 프론트엔드에서 복잡한 검색 조건을 HTTP 쿼리 파라미터로 전달하는 표준화된 방식

**파일별 한줄 요약:**

| 파일 | 역할 |
|------|------|
| `StrapiQueryParser` | HTTP 쿼리 파라미터를 `StrapiQuery`로 파싱하는 Strapi 스타일 쿼리 파서 |
| `FilterCondition` | 필터 조건과 정렬 조건을 나타내는 데이터 클래스 및 sealed class 정의 |
| `FilterOperator` | Strapi 필터 연산자(`$eq`, `$ne`, `$in`, `$contains` 등)와 SQL 템플릿을 정의하는 enum |
| `JooqQueryBuilder` | FilterNode를 jOOQ `Condition` 및 `SortField`로 변환하는 쿼리 빌더 |
| `JooqSearchCriteria` | `StrapiQuery`를 jOOQ 조건과 정렬 정보로 변환하여 담는 검색 조건 클래스 |
| `JooqExtensions` | jOOQ Record에서 동적 필드 선택 시 안전하게 값에 접근하는 확장 함수 (`getOrNull`, `getOrDefault`) |
| `MybatisQueryBuilder` | FilterNode를 MyBatis SQL 문자열로 변환하는 동적 쿼리 빌더 |
| `MybatisSearchCriteria` | `StrapiQuery`를 MyBatis SQL 쿼리 절로 변환하여 담는 검색 조건 클래스 |
| `MybatisSqlProvider` | MyBatis SQL Provider 기본 클래스로 동적 검색 쿼리 생성의 공통 로직 제공 |

**처리 흐름:** `StrapiQueryParser`는 만드는 놈(파서), `FilterCondition.kt`는 만들어진 결과물(데이터 구조)이다.

```
HTTP 쿼리 파라미터 (문자열)
  ?filters[serviceType][$eq]=FAX&filters[startDt][$gt]=2026-04-01&page=0&size=20
        │
        ▼  StrapiQueryParser (문자열 → 객체로 변환)
        │
  StrapiQuery (파싱 결과물)
  ├── filters: FilterNode.LogicalGroup(AND)
  │     ├── Condition(field="serviceType", operator=$eq, value="FAX")
  │     └── Condition(field="startDt", operator=$gt, value=2026-04-01)
  ├── page: 0, size: 20
        │
        ▼  JooqQueryBuilder 또는 MybatisQueryBuilder (객체 → SQL로 변환)
        │
  WHERE service_type = 'FAX' AND start_dt > '2026-04-01' LIMIT 20 OFFSET 0
```

#### 지원하는 쿼리 파라미터 형식

**필터링:**
```
# 단순 조건
GET /items?filters[serviceType][$eq]=FAX
GET /items?filters[name][$contains]=홍

# OR 조건
GET /items?filters[$or][0][status][$eq]=ACTIVE&filters[$or][1][status][$eq]=PENDING

# AND 조건 (기본)
GET /items?filters[startDate][$gte]=2024-01-01&filters[endDate][$lte]=2024-12-31

# NOT 조건
GET /items?filters[$not][status][$eq]=DELETED

# IN 조건
GET /items?filters[type][$in][0]=FAX&filters[type][$in][1]=EMAIL
```

**정렬:**
```
GET /items?sort=doDt,desc
GET /items?sort=name,asc&sort=doDt,desc   # 다중 정렬
```

**페이징:**
```
GET /items?page=0&size=20
GET /items?unpaged=true                    # 전체 조회
```

**필드 선택:**
```
GET /items?fields=name,status,doDt
```

#### 지원 연산자 목록

| 연산자 | 의미 | SQL |
|--------|------|-----|
| `$eq` | 같음 | `column = value` |
| `$eqi` | 같음 (대소문자 무시) | `LOWER(column) = LOWER(value)` |
| `$ne` | 같지 않음 | `column != value` |
| `$nei` | 같지 않음 (대소문자 무시) | `LOWER(column) != LOWER(value)` |
| `$lt` | 미만 | `column < value` |
| `$lte` | 이하 | `column <= value` |
| `$gt` | 초과 | `column > value` |
| `$gte` | 이상 | `column >= value` |
| `$in` | 포함 | `column IN (...)` |
| `$notIn` | 미포함 | `column NOT IN (...)` |
| `$contains` | 포함 (LIKE) | `column LIKE '%value%'` |
| `$containsi` | 포함 (대소문자 무시) | `LOWER(column) LIKE LOWER('%value%')` |
| `$notContains` | 미포함 | `column NOT LIKE '%value%'` |
| `$notContainsi` | 미포함 (대소문자 무시) | `LOWER(column) NOT LIKE LOWER('%value%')` |
| `$startsWith` | 시작 | `column LIKE 'value%'` |
| `$startsWithi` | 시작 (대소문자 무시) | `LOWER(column) LIKE LOWER('value%')` |
| `$endsWith` | 끝남 | `column LIKE '%value'` |
| `$endsWithi` | 끝남 (대소문자 무시) | `LOWER(column) LIKE LOWER('%value')` |
| `$null` | NULL | `column IS NULL` |
| `$notNull` | NOT NULL | `column IS NOT NULL` |
| `$between` | 범위 | `column BETWEEN v0 AND v1` |

#### 처리 흐름

```
HTTP 쿼리 파라미터
  │
  ▼
┌─────────────────────────────────┐
│  StrapiQueryParser               │
│  unflattenParams(): flat Map →   │
│    중첩 Map으로 변환              │
│  parseFilters(): FilterNode 트리 │
│  parseFields(): 필드 목록        │
│  parseSort(): 정렬 조건          │
└─────────────────────────────────┘
  │
  ▼  StrapiQuery (중간 표현)
  │
  ├──▶ JooqSearchCriteria.from(query, fieldMap)
  │      → jOOQ Condition, SortField 등으로 변환
  │
  └──▶ MybatisSearchCriteria.from(query, fields)
         → SQL WHERE절, ORDER BY절 문자열로 변환
```

#### StrapiQuery 데이터 모델
```kotlin
data class StrapiQuery(
    val filters: FilterNode?,       // 필터 조건 트리 (AND/OR/NOT 중첩 가능)
    val fields: List<String>,       // 조회할 필드
    val page: Int,                  // 페이지 번호 (0부터)
    val size: Int,                  // 페이지 크기
    val sort: List<SortOrder>,      // 정렬 조건
    val unpaged: Boolean = false    // 페이징 무시
)
```

#### FilterNode (필터 조건 트리)
```kotlin
sealed class FilterNode {
    data class Condition(
        val field: String,           // 필드명 (camelCase)
        val operator: FilterOperator, // 연산자 ($eq, $contains 등)
        val value: Any?              // 비교값
    ) : FilterNode()

    data class LogicalGroup(
        val logic: Logic,            // AND, OR, NOT
        val children: List<FilterNode>
    ) : FilterNode()
}
```

---

### 3.4 쿼리 빌더 (jOOQ / MyBatis 공통 구조)

`JooqQueryBuilder`와 `MybatisQueryBuilder`는 **하는 일은 동일**하고 **출력 형식만 다르다.** 둘 다 같은 `FilterNode` 트리를 받아서 WHERE 절로 변환하며, jOOQ를 쓰느냐 MyBatis를 쓰느냐에 따라 출력 포맷만 달라진다. 3.4는 jOOQ 쪽, 3.5는 MyBatis 쪽 상세 설명.

```
FilterNode (공통 입력)
    ├──► JooqQueryBuilder    → jOOQ Condition 객체 (타입 안전, 컴파일 타임 검증) → 3.4
    └──► MybatisQueryBuilder → SQL 문자열          (plain text, 런타임 문자열)   → 3.5
```

#### JooqQueryBuilder
```kotlin
// FilterNode → jOOQ Condition 변환
val condition = JooqQueryBuilder.buildCondition(query.filters)
val sortFields = JooqQueryBuilder.buildSortFields(query.sort)
```

**특징:**
- camelCase → snake_case 자동 변환 (`toSnakeCase()`)
- 대소문자 무시 연산자는 `DSL.lower()` 사용
- LIKE 연산자에 와일드카드 자동 추가

#### JooqSearchCriteria

**도메인 클래스에 FIELD_MAP / FIELD_EXPANSIONS 작성 방법:**
```kotlin
class Downtime(...) {
    companion object {
        // 리플렉션으로 생성자 파라미터명 → jOOQ 컬럼 자동 매핑 (애플리케이션 구동 시 1회)
        val FIELD_MAP: Map<String, Field<*>> = Downtime::class.primaryConstructor?.parameters
            ?.mapNotNull { param ->
                param.name?.let { name -> DOWNTIMES.field(name.toSnakeCase())?.let { name to it } }
            }
            ?.toMap() ?: emptyMap()
        // 결과: { "serviceType" → DOWNTIMES.SERVICE_TYPE, "startDt" → DOWNTIMES.START_DT, ... }
        // session, deleteSession은 DB에 "session" 컬럼이 없으므로 자동 제외됨 → FIELD_EXPANSIONS에서 보완

        // 가상 필드 확장: "session" 요청 시 9개 컬럼으로 확장
        val FIELD_EXPANSIONS: Map<String, List<Field<*>>> = mapOf(
            "session" to Session.columns().mapNotNull { DOWNTIMES.field(it.toSnakeCase()) },
            "deleteSession" to Session.columns("delete").mapNotNull { DOWNTIMES.field(it.toSnakeCase()) }
        )
    }
}
```

**사용 예시 (도메인 서비스에서):**
```kotlin
val criteria = JooqSearchCriteria.from(
    query = strapiQuery,
    fieldMap = DomainClass.FIELD_MAP,          // 필드명 → jOOQ Field 매핑
    fieldExpansions = DomainClass.FIELD_EXPANSIONS  // "session" → [brand, product, ...] 확장
)

// jOOQ 쿼리에 적용
dslContext.select(criteria.selectFields)
    .from(TABLE)
    .where(criteria.condition)
    .orderBy(criteria.sortFields)
    .limit(criteria.limit)
    .offset(criteria.offset)
```

#### jOOQ Record 확장 함수
```kotlin
// 동적 필드 선택 시 안전한 값 접근
record.getOrNull(field)          // 필드 없으면 null
record.getOrDefault(field, default)  // 필드 없으면 기본값
```

---

### 3.5 쿼리 빌더 — MyBatis 상세

#### MybatisQueryBuilder
```kotlin
val builder = MybatisQueryBuilder()
val params = mutableMapOf<String, Any?>()
val whereClause = builder.buildWhereClause(filters, params)
val selectClause = builder.buildSelectClause(fields, fieldExpansions)
val orderByClause = builder.buildOrderByClause(sort)
```

**특징:**
- 파라미터 바인딩 방식: `#{params.paramName}` 형태로 SQL Injection 방지
- IN 절은 MyBatis `<foreach>` 문법 사용 후 `MybatisSqlProvider`에서 인덱스 참조로 변환
- 컬럼명에 `"` 따옴표를 감싸 대소문자 구분 (PostgreSQL)

#### MybatisSearchCriteria
```kotlin
val criteria = MybatisSearchCriteria.from(
    query = strapiQuery,
    fields = DomainClass.FIELDS,
    fieldExpansions = DomainClass.FIELD_EXPANSIONS
)
// criteria.selectClause  → "brand", "product", "partner_seq"
// criteria.whereClause   → "partner_seq" = #{params.partnerSeq_0_0}
// criteria.orderByClause → "do_dt" DESC
// criteria.params        → {partnerSeq_0_0: 123}
```

#### MybatisSqlProvider (추상 클래스)
```kotlin
// 도메인별 SqlProvider 정의
class FaxSqlProvider : MybatisSqlProvider(
    tableName = "fax",
    defaultCondition = """"is_deleted" = FALSE""",
    defaultOrderBy = """"do_dt" DESC"""
)
```

**자동 생성하는 SQL:**
- `search()`: SELECT + FROM + WHERE + ORDER BY + LIMIT OFFSET
- `searchCount()`: SELECT COUNT(*) + FROM + WHERE
- `buildWhereSql()`: `<foreach>` 태그를 실제 인덱스 참조로 변환 (`#{params.key[0]}`)

---

### 3.6 Security Auto Configuration

#### JWT 인증 흐름 (상세)

```
클라이언트 요청
  Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzZXNzaW9uIjoie...}
        │
        ▼
┌─ Spring Security Filter ─────────────────────────────────────┐
│                                                               │
│  1. JWT 토큰 추출                                             │
│     Authorization 헤더에서 "Bearer " 이후 문자열 추출          │
│                                                               │
│  2. JWT 검증 (JwtDecoder)                                     │
│     ├── jwtkeystore.jks에서 RSA 공개키 로드                   │
│     ├── 서명 검증 (RS256): 위변조 여부 확인                    │
│     └── 만료 검증: exp 클레임 < 현재 시각이면 EXPIRED_TOKEN    │
│                                                               │
│     실패 시 → authenticationEntryPoint                        │
│     ├── JwtValidationException (만료) → EXPIRED_TOKEN (401)   │
│     ├── InvalidBearerTokenException   → INVALID_TOKEN (401)   │
│     └── 그 외                         → UNAUTHORIZED  (401)   │
│                                                               │
│  3. Authentication 객체 생성                                   │
│     JwtAuthenticationToken(token, emptyList())                │
│     → SecurityContext에 저장                                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ SessionLoadInterceptor/Filter ──────────────────────────────┐
│                                                               │
│  4. 세션 추출 (쿠키 → 헤더 → JWT 순서)                        │
│     JWT에서 추출하는 경우:                                     │
│     ├── SecurityContext에서 JwtAuthenticationToken 가져옴      │
│     ├── token.claims["session"] → JSON 문자열                 │
│     └── ObjectMapper로 역직렬화 → Session 객체                │
│                                                               │
│  5. request/exchange attribute에 Session 저장                  │
│     doDt = LocalDateTime.now()로 요청 시각 갱신               │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ RequireSessionInterceptor/Filter (선택) ────────────────────┐
│                                                               │
│  6. @RequireSession이 있으면 세션 필수 검증                    │
│     ├── Session 없으면 → UNAUTHORIZED (401)                   │
│     └── 브랜드/세션타입 권한 불일치 → FORBIDDEN (403)          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Controller ─────────────────────────────────────────────────┐
│                                                               │
│  7. SessionArgumentResolver가 Session 파라미터 주입            │
│     suspend fun insert(dto, session: Session?)                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**`permitAll()`인데 JWT 검증을 하는 이유:**
- `anyRequest().permitAll()` → 모든 요청 **접근 허용** (JWT 없어도 요청 가능)
- `oauth2ResourceServer { jwt { ... } }` → JWT가 **있으면** 검증은 함
- 즉 JWT는 **세션 전달 수단**이고, `@RequireSession`이 붙은 엔드포인트만 세션 필수

**JWT 토큰 구조:**
```
Header:  { "alg": "RS256" }
Payload: {
  "iat": 1712505600,
  "exp": 1712509200,
  "session": "{\"brand\":\"BAROBILL\",\"doSessionType\":\"USER\",...}"
}
Signature: RSA-SHA256(header + payload, privateKey)
```

**키 관리:**
- `jwtkeystore.jks` (Java KeyStore) 안에 RSA 키 쌍 보관
- 토큰 생성 시: `privateKey`로 서명 (`JwtHelper.generate` - 테스트용)
- 토큰 검증 시: `publicKey`로 서명 확인 (`JwtDecoder` - 운영용)

#### JwtHelper
```kotlin
// JWT 검증용 공개키 로드 (classpath:jwtkeystore.jks)
JwtHelper.loadPublicKey(): RSAPublicKey

// 테스트용 JWT 토큰 생성
JwtHelper(objectMapper).generate(session, expirationSeconds)
```

- JKS (Java KeyStore)에서 RSA 키 쌍 로드
- RS256 알고리즘으로 서명
- claim에 Session JSON 포함

#### 인증 에러 처리
```
JWT 검증 실패 시:
├── 만료된 토큰 → EXPIRED_TOKEN (401)
├── 유효하지 않은 토큰 → INVALID_TOKEN (401)
├── 인증 정보 없음 → UNAUTHORIZED (401)
└── 접근 권한 없음 → FORBIDDEN (403)
```

#### 핵심 설정

**Servlet (CommonsSecurityAutoConfiguration):**
```kotlin
http
    .csrf { it.disable() }
    .authorizeHttpRequests { it.anyRequest().permitAll() }
    .oauth2ResourceServer { jwt → ... }
```

**Reactive (CommonsReactiveSecurityAutoConfiguration):**
```kotlin
http
    .csrf { it.disable() }
    .headers { it.disable() }
    .authorizeExchange { it.anyExchange().permitAll() }
    .oauth2ResourceServer { jwt → ... }
```

> **중요:** `permitAll()`로 모든 요청을 허용하되, `@RequireSession` 어노테이션으로 세션 기반 인가를 별도로 처리합니다. JWT는 **세션 전달 수단**으로만 사용됩니다.

---

### 3.7 전역 예외 처리

**에러 처리기가 2개 존재하는 이유:** 예외 발생 위치에 따라 처리기가 다르다. Controller 안에서 발생하면 `@RestControllerAdvice`가 잡고, Filter 단계에서 발생하면 `@RestControllerAdvice`에 도달하지 않으므로 `WebExceptionHandler`가 잡는다.

#### 전체 에러 처리 계층도 (Reactive 기준, downtime-api 등)

```
요청 들어옴
    │
    ▼
┌─ Spring Security Filter ──────────────────────────┐
│  JWT 검증 실패 → authenticationEntryPoint          │
│  (UNAUTHORIZED / INVALID_TOKEN / EXPIRED_TOKEN)    │
└────────────────────────────────────────────────────┘
    │
    ▼
┌─ BusinessExceptionWebExceptionHandler (Filter 단계)┐
│  Filter에서 던진 BusinessException 처리             │
│  예: RequireSessionFilter → UNAUTHORIZED            │
│  @Order(HIGHEST_PRECEDENCE) 최우선 순위             │
└────────────────────────────────────────────────────┘
    │
    ▼
┌─ Controller → Service → Validator ─────────────────┐
│  비즈니스 로직 실행                                  │
└────────────────────────────────────────────────────┘
    │ 예외 발생 시
    ▼
┌─ ReactiveGlobalExceptionHandler (@RestControllerAdvice)┐
│  ├── BusinessException     → 도메인 에러코드 반환       │
│  ├── WebExchangeBindException → VALIDATION_ERROR        │
│  ├── ServerWebInputException  → BAD_REQUEST             │
│  ├── AccessDeniedException    → FORBIDDEN               │
│  └── Exception (그 외 전부)   → INTERNAL_SERVER_ERROR    │
└────────────────────────────────────────────────────────┘
    │
    ▼
  ErrorResponse JSON 반환
```

**핵심:** 각 MSA에서 에러 코드를 정의(`DowntimeErrorCode`)하고 `BusinessException`으로 던지기만 하면, JSON 변환/HTTP 상태코드 설정은 **전부 commons가 자동으로 처리**한다.

#### Servlet (GlobalExceptionHandler)

| 예외 | 에러 코드 | HTTP 상태 |
|------|----------|-----------|
| `BusinessException` | 동적 (errorCode에 따라) | 동적 |
| `MethodArgumentNotValidException` | VALIDATION_ERROR | 400 |
| `MethodArgumentTypeMismatchException` | TYPE_MISMATCH | 400 |
| `MissingServletRequestParameterException` | BAD_REQUEST | 400 |
| `HttpRequestMethodNotSupportedException` | METHOD_NOT_ALLOWED | 405 |
| `AccessDeniedException` | FORBIDDEN | 403 |
| `Exception` (기타) | INTERNAL_SERVER_ERROR | 500 |

#### Reactive (ReactiveGlobalExceptionHandler)

| 예외 | 에러 코드 | HTTP 상태 |
|------|----------|-----------|
| `BusinessException` | 동적 | 동적 |
| `WebExchangeBindException` | VALIDATION_ERROR | 400 |
| `ServerWebInputException` | BAD_REQUEST | 400 |
| `AccessDeniedException` | FORBIDDEN | 403 |
| `Exception` (기타) | INTERNAL_SERVER_ERROR | 500 |

**Reactive에만 추가 구성이 필요한 이유:**

```
MVC:     Filter → DispatcherServlet → [Interceptor → Controller] → @RestControllerAdvice
                                       ^^^^^^^^^^^^^^^^^^^^^^^^
                                       이 범위 안의 예외는 전부 잡힘 (Interceptor 포함)

WebFlux: [WebFilter] → DispatcherHandler → [Controller] → @RestControllerAdvice
         ^^^^^^^^^^                         ^^^^^^^^^^^^
         여기 예외는 못 잡힘                   여기 예외만 잡힘
         → WebExceptionHandler 필요
```

MVC의 `HandlerInterceptor`에서 던진 예외는 `DispatcherServlet`이 `@RestControllerAdvice`로 전달해준다. 하지만 WebFlux의 `WebFilter`는 `DispatcherHandler` **바깥에서** 동작하므로 예외가 `@RestControllerAdvice`에 도달하지 않는다.

- `BusinessExceptionWebExceptionHandler` (WebExceptionHandler): WebFilter 단계의 BusinessException 처리
  - `@Order(Ordered.HIGHEST_PRECEDENCE)`로 최우선 순위
  - 예: `RequireSessionFilter`에서 세션 없으면 throw → 이 핸들러가 잡아서 401 응답

#### GlobalBinderAdvice (Servlet 전용)
```kotlin
@InitBinder
fun initBinder(binder: WebDataBinder) {
    binder.initDirectFieldAccess()
}
```
- Setter 대신 **필드 직접 접근** 방식으로 바인딩
- Kotlin data class의 프로퍼티에 직접 값 설정

---

### 3.8 응답 시간 측정

#### Servlet: RequestTimingInterceptor
```
preHandle → request에 시작 시각 저장
afterCompletion → X-Response-Time: {duration}ms 헤더 설정
```
- `response.isCommitted` 확인 후 헤더 설정 (이미 커밋된 응답 방어)

#### Reactive: RequestTimingFilter
```kotlin
exchange.response.beforeCommit {
    val duration = System.currentTimeMillis() - startTime
    exchange.response.headers.set("X-Response-Time", "${duration}ms")
    Mono.empty()
}
```
- `beforeCommit` 콜백으로 응답 전송 직전에 헤더 추가

---

### 3.9 Auto Configuration 등록

파일: `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
```
com.knet.commons.web.server.servlet.config.CommonsWebAutoConfiguration
com.knet.commons.web.server.servlet.config.CommonsSecurityAutoConfiguration
com.knet.commons.web.server.reactive.config.CommonsReactiveWebAutoConfiguration
com.knet.commons.web.server.reactive.config.CommonsReactiveSecurityAutoConfiguration
```

**왜 이 파일이 필요한가:** Spring Boot는 기본적으로 자기 패키지(`com.knet.msa.downtime.api`)만 스캔한다. commons 패키지(`com.knet.commons.web.server`)는 외부 JAR이므로 스캔 대상이 아니다. 이 파일이 "이 클래스들도 자동으로 등록해줘"라고 Spring Boot에 알려주는 **등록부** 역할을 한다.

**동작 흐름:**
```
1. MSA가 commons-web-server를 의존성에 추가

2. Spring Boot 시작 → 모든 의존 JAR의 META-INF/spring/*.imports 스캔

3. 파일에 적힌 4개 클래스를 후보로 등록

4. 각 클래스의 @Conditional 조건 평가:
   ├── @ConditionalOnWebApplication(SERVLET or REACTIVE) → starter로 자동 판단
   ├── @ConditionalOnProperty("knet.commons.web.enabled=true") → yaml 확인
   └── @ConditionalOnProperty("knet.commons.security.enabled=true") → yaml 확인

5. 조건 통과한 것만 실제 Bean 등록
   (예: webflux 프로젝트면 Reactive 쪽만 활성화, Servlet 쪽은 무시)
```

**Spring Boot 2.x vs 3.x:** 2.x에서는 `META-INF/spring.factories`에 등록했으나 deprecated됨. 3.x부터 `.imports` 파일에 한 줄씩 클래스명을 적는 방식으로 변경.

**MSA 개발자 입장:** 이 Auto Configuration 덕분에 의존성 추가 + yaml 설정만 하면 세션 처리, 보안, 에러 핸들링, Strapi 쿼리 등이 전부 자동 적용된다. `@Import`나 `@ComponentScan` 같은 코드가 필요 없다.

---

## 4. commons-web-client 모듈

> 패키지: `com.knet.commons.web.client`
>
> 마이크로서비스 간 API 호출 표준 클라이언트

**파일별 한줄 요약:**

| 파일 | 역할 |
|------|------|
| `ApiClientProperties` | `api.client.connect-timeout`, `read-timeout` 설정 읽기 |
| `CommonsClientConfig` | RestClient Bean 생성 (타임아웃 + OAuth2 인터셉터 + 에러 핸들러 등록) |
| `ApiClient` | 실제 API 호출 (get/post/put/delete 4개 메서드, Session 암호화 전달) |
| `ApiClientErrorHandler` | 에러 응답 JSON → `ApiClientException`으로 변환 |
| `ApiClientException` | 원격 API 에러를 담는 예외 클래스 |

**호출 흐름:**
```
ApiClient.get<Downtime>("/api/downtimes/1", session)
    → CommonsClientConfig가 만든 RestClient 사용
    → OAuth2 토큰 자동 획득 (Authorization: Bearer)
    → Session을 AES 암호화해서 KSESSIONID 쿠키+헤더에 추가
    → 요청 전송
    → 성공: JSON → Downtime 객체 반환
    → 실패: ApiClientErrorHandler → ApiClientException 발생
```

### 4.1 ApiClient

```kotlin
class ApiClient(
    val restClient: RestClient,           // Spring RestClient
    val objectMapper: ObjectMapper,       // JSON 직렬화
    val baseUrl: String,                  // API 기본 URL
    val clientRegistrationId: String      // OAuth2 등록 ID
)
```

#### 제공 메서드

| 메서드 | 설명 |
|--------|------|
| `get\<T\>(path, session?)` | GET 요청 |
| `post\<T\>(path, body, session?)` | POST 요청 |
| `put\<T\>(path, body, session?)` | PUT 요청 |
| `delete\<T\>(path, session?)` | DELETE 요청 |

- **모든 메서드는 `inline` + `reified`** → 제네릭 타입 정보 유지, 런타임에 타입 소거 없음. `reified` 없으면 매번 `Class<T>`를 수동으로 넘겨야 하지만(`client.get("/url", Downtime::class.java)`), `reified`가 있으면 타입만 지정하면 끝(`client.get<Downtime>("/url")`). `inline`은 함수 본문을 호출 지점에 **복사**하면서 `T`를 실제 타입으로 치환하기 때문에 `reified`와 세트로 사용. 복사 방식이므로 컴파일된 바이트코드 크기는 호출 횟수만큼 늘어나지만, ApiClient 메서드가 짧고(각 10줄 이내) 호출 횟수도 MSA당 몇 개 수준이라 실질적 문제 없음

#### 인증 흐름
```
ApiClient.get("/users/1", session)
  │
  ├── OAuth2ClientHttpRequestInterceptor
  │   → Authorization: Bearer <access_token> 자동 추가
  │
  └── Session 전달 (session != null일 때)
      → KSESSIONID 헤더: Encryptor.encryptAES(sessionJson)
      → Cookie 헤더: KSESSIONID=<encrypted>
```

#### 사용 예시
```kotlin
// Bean 등록
@Configuration
@Import(CommonsClientConfig::class)
class MyConfig(
    private val restClient: RestClient,
    private val objectMapper: ObjectMapper
) {
    @Bean
    fun userApiClient() = ApiClient(
        restClient = restClient,
        objectMapper = objectMapper,
        baseUrl = "http://user-service",
        clientRegistrationId = "knet"
    )
}

// 서비스에서 사용
@Service
class UserService(private val userApiClient: ApiClient) {
    fun getUser(id: Long, session: Session): User? {
        return userApiClient.get<User>("/users/$id", session)
    }
}
```

### 4.2 CommonsClientConfig

> **주의:** commons-web-server는 AutoConfiguration으로 자동 등록되지만, **commons-web-client는 수동 `@Import`가 필수**다. `CommonsClientConfig`는 `@AutoConfiguration`이 아닌 일반 클래스이므로 자동 등록되지 않는다.

```kotlin
// MSA 프로젝트에서 사용 시 반드시 @Import 필요
@Configuration
@Import(CommonsClientConfig::class)
class MyApiClientConfig { ... }
```

```kotlin
@EnableConfigurationProperties(ApiClientProperties::class)
class CommonsClientConfig {
    @Bean fun clientHttpRequestFactory()  // 타임아웃 설정
    @Bean fun restClient()                // OAuth2 인터셉터 + 에러 핸들러 자동 적용
}
```

**타임아웃 설정:**
```yaml
api:
  client:
    connect-timeout: 5s    # 기본값 5초
    read-timeout: 30s      # 기본값 30초
```

**OAuth2 Client Credentials 설정 (필수):**
```yaml
# ApiClient가 다른 MSA를 호출할 때 자동으로 OAuth2 토큰을 획득하기 위한 설정
spring:
  security:
    oauth2:
      client:
        provider:
          knet:
            token-uri: http://auth-server/oauth/token
        registration:
          knet:                              # ← ApiClient의 clientRegistrationId와 일치해야 함
            client-id: my-service
            client-secret: my-secret
            authorization-grant-type: client_credentials
```

### 4.3 에러 처리

#### ApiClientErrorHandler
```kotlin
// 원격 API 에러 응답 처리
class ApiClientErrorHandler(objectMapper: ObjectMapper) {
    fun handleError(response: ClientHttpResponse) {
        // 1. 응답 본문을 ErrorResponse로 파싱 시도
        // 2. 파싱 실패 시 UNKNOWN_ERROR ErrorResponse 생성
        // 3. ApiClientException throw
    }
}
```

#### ApiClientException
```kotlin
class ApiClientException(
    val errorResponse: ErrorResponse  // 원격 API의 에러 응답 그대로 전달
) : RuntimeException(errorResponse.message)
```

**에러 전파 흐름:**
```
서비스 A → ApiClient → 서비스 B
                          │
                      에러 발생!
                          │
                          ▼
                    ErrorResponse (JSON)
                          │
                          ▼
              ApiClientErrorHandler.handleError()
                          │
                          ▼
              throw ApiClientException(errorResponse)
                          │
                          ▼
              서비스 A에서 catch 또는 GlobalExceptionHandler로 전파
```

---

## 5. Servlet vs Reactive 비교

이 라이브러리가 두 스택을 이중 지원하는 이유와 차이점:

### 5.1 왜 이중 지원?
- 기존 서비스는 Spring MVC(Servlet) 기반
- 신규 서비스는 Spring WebFlux(Reactive) 기반
- 공통 라이브러리가 **둘 다 지원**해야 어떤 서비스에서든 사용 가능

### 5.2 핵심 차이

| 항목 | Servlet | Reactive |
|------|---------|----------|
| 세션 저장소 | `HttpServletRequest.setAttribute()` | `ServerWebExchange.attributes[]` |
| 세션 읽기 | `SecurityContextHolder.getContext()` | `ReactiveSecurityContextHolder.getContext()` |
| 요청 처리 | `HandlerInterceptor` (동기) | `WebFilter` (비동기, Mono/Flux) |
| 예외 처리 | `@RestControllerAdvice` | `@RestControllerAdvice` + `WebExceptionHandler` |
| 반환 타입 | `ResponseEntity\<T\>` | `Mono\<T\>` |
| 필터 순서 | `InterceptorRegistry` 등록 순서 | `@Order` 어노테이션 |

### 5.3 필터 실행 순서

**Servlet:**
```
RequestTimingInterceptor (preHandle)
  → SessionLoadInterceptor (preHandle)
    → RequireSessionInterceptor (preHandle)
      → Controller
    ← (postHandle)
  ← (afterCompletion)
← RequestTimingInterceptor (afterCompletion) + X-Response-Time 헤더
```

**Reactive:**
```
RequestTimingFilter (@Order HIGHEST_PRECEDENCE)
  → SessionLoadFilter (@Order 0)
    → RequireSessionFilter (@Order 1)
      → Controller
    ← 
  ←
← beforeCommit → X-Response-Time 헤더
```

---

## 6. 설정 프로퍼티 요약

```yaml
# 웹 공통 기능 활성화
knet:
  commons:
    web:
      enabled: true              # 필수: 웹 설정 전체 ON/OFF
      trace-enabled: false       # 에러 응답에 스택 트레이스 포함 (개발용)
    security:
      enabled: true              # 선택: JWT 보안 설정 ON/OFF

# API 클라이언트 타임아웃
api:
  client:
    connect-timeout: 5s
    read-timeout: 30s
```

---

## 7. 전체 의존 관계도

```
┌─────────────────────────────────────────────────────┐
│                 마이크로서비스 (예: fax-api)           │
│                                                      │
│  @RequireSession                                     │
│  fun handler(@StrapiQueryParam query, session: Session)│
│                                                      │
│  val criteria = JooqSearchCriteria.from(query, ...)  │
│  faxApiClient.get<Fax>("/fax/$id", session)          │
└──────────┬──────────────────────────┬────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐    ┌──────────────────────┐
│ commons-web-server│    │  commons-web-client   │
│                  │    │                      │
│ - AutoConfig     │    │ - ApiClient          │
│ - SessionLoad    │    │ - CommonsClientConfig│
│ - RequireSession │    │ - ApiClientErrorHandler│
│ - StrapiQuery    │    │                      │
│ - JooqBuilder    │    └──────────┬───────────┘
│ - MybatisBuilder │               │
│ - JWT/Security   │               │
└──────────┬───────┘               │
           │                       │
           ▼                       ▼
     ┌─────────────────────────────────┐
     │          commons                 │
     │                                  │
     │ - Session, Brand, SessionType   │
     │ - BusinessException, ErrorCode  │
     │ - ErrorResponse                 │
     │ - Encryptor (AES)               │
     │ - StringExtensions              │
     │ - TypeHandlers (MyBatis)        │
     │ - NoArg                         │
     └─────────────────────────────────┘
```

---

## 8. 자주 쓰는 사용 패턴 정리

### 8.1 기본 CRUD 컨트롤러
```kotlin
@RestController
@RequestMapping("/fax")
@RequireSession  // 전체 컨트롤러에 세션 필요
class FaxController(private val faxService: FaxService) {

    @GetMapping
    fun search(@StrapiQueryParam query: StrapiQuery, session: Session): Page<Fax> {
        return faxService.search(query)
    }

    @GetMapping("/{id}")
    fun get(@PathVariable id: Long, session: Session): Fax {
        return faxService.getById(id)
    }

    @PostMapping
    fun create(@RequestBody request: CreateFaxRequest, session: Session): Fax {
        return faxService.create(request, session)
    }
}
```

### 8.2 서비스에서 검색 쿼리 사용 (jOOQ)
```kotlin
@Service
class FaxService(private val dslContext: DSLContext) {

    fun search(query: StrapiQuery): Page<Fax> {
        val criteria = JooqSearchCriteria.from(query, Fax.FIELD_MAP, Fax.FIELD_EXPANSIONS)

        val total = dslContext.selectCount()
            .from(FAX)
            .where(criteria.condition)
            .fetchOne(0, Long::class.java) ?: 0

        val records = dslContext.select(criteria.selectFields)
            .from(FAX)
            .where(criteria.condition)
            .orderBy(criteria.sortFields)
            .limit(criteria.limit)
            .offset(criteria.offset)
            .fetch()

        return PageImpl(records.map { ... }, query.toPageable(), total)
    }
}
```

### 8.3 서비스 간 API 호출
```kotlin
@Service
class NotificationService(private val userApiClient: ApiClient) {

    fun notifyUser(userId: Long, message: String, session: Session) {
        val user = userApiClient.get<User>("/users/$userId", session)
            ?: throw BusinessException(MyErrorCode.USER_NOT_FOUND)
        // ... 알림 발송 로직
    }
}
```

### 8.4 커스텀 ErrorCode 정의
```kotlin
enum class FaxErrorCode(
    override val status: Int,
    override val text: String
) : ErrorCode {
    FAX_NOT_FOUND(404, "팩스를 찾을 수 없음."),
    FAX_SEND_FAILED(500, "팩스 발송 실패."),
    FAX_ALREADY_SENT(400, "이미 발송된 팩스.");

    override val code: String get() = this.name
}
```

---

## 9. 최근 주요 변경 이력

| 커밋 | 내용 |
|------|------|
| `085c1fc` | SessionLoadFilter/RequireSessionFilter 필터 체인 이중 실행 버그 수정 |
| `9656cf9` | RequestTimingFilter read-only 응답 헤더 UnsupportedOperationException 방어 |
| `cd39cea` | Reactive ErrorResponses.addDurationHeader 제거 (Reactive에서는 불필요) |
| `855c202` | RequestTimingFilter를 beforeCommit 방식으로 변경 |
| `80acd3d` | 버전 1.0.0 시작 |

---

## 10. 핵심 설계 원칙 요약

1. **AutoConfiguration 기반**: 의존성 추가 + 프로퍼티 설정만으로 모든 공통 기능 활성화
2. **Servlet/Reactive 이중 지원**: 어떤 스택의 서비스든 동일한 라이브러리 사용
3. **세션 전파 표준화**: KSESSIONID (쿠키/헤더) + JWT claim으로 마이크로서비스 간 세션 전달
4. **에러 응답 표준화**: ErrorCode → BusinessException → ErrorResponse 일관된 흐름
5. **쿼리 추상화**: Strapi 스타일 파라미터 → FilterNode → jOOQ/MyBatis SQL 자동 변환
6. **선택적 의존성**: jOOQ, MyBatis는 `compileOnly`로 사용처에서 선택

---

## 11. commons-util → commons 마이그레이션 변경 사항

> 구 버전(`commons-util`, Java/Spring Boot 2.3)에서 신 버전(`commons`, Kotlin/Spring Boot 4.x)으로 전환하면서 **제거, 수정, 신규 추가**된 내용을 정리합니다.

### 11.1 전체 구조 변화

| 항목 | 구 버전 (commons-util) | 신 버전 (commons) |
|------|----------------------|------------------|
| **언어** | Java | Kotlin |
| **Spring Boot** | 2.3.0 (Hoxton) | 4.0.3 |
| **JDK** | Java 8~11 | Java 25 |
| **모듈 수** | 16개 (java 15 + node 1) | 3개 (commons, web-server, web-client) |
| **HTTP 클라이언트** | WebClient (Reactive) | RestClient (동기) |
| **API 응답 형식** | ApiResponse 래핑 구조 | 직접 반환 (래핑 제거) |
| **설정 방식** | 수동 @Configuration | AutoConfiguration 자동 등록 |
| **웹 스택** | Servlet(MVC)만 지원 | Servlet + Reactive 이중 지원 |
| **OAuth2** | Spring Security OAuth2 (deprecated) | Spring Security OAuth2 Resource Server |
| **Jackson** | com.fasterxml.jackson | tools.jackson (Jackson 3.x) |
| **빌드** | Gradle (Groovy DSL) | Gradle (Kotlin DSL) + Nx |

### 11.2 모듈 매핑표

```
commons-util (구)                    commons (신)
─────────────────────────────────    ────────────────────────────────
session-util                    ──▶  commons (session 패키지)
rest-api-util (exception)       ──▶  commons (exception 패키지)
rest-api-util (interceptor)     ──▶  commons-web-server (servlet + reactive)
rest-api-util (resolver)        ──▶  commons-web-server (resolver)
rest-api-util (config)          ──▶  commons-web-server (AutoConfiguration)
rest-api-util (ApiClient)       ──▶  commons-web-client (ApiClient)
rest-api-oauth2-util            ──▶  commons-web-server (Security) + commons-web-client
commons-util (encrypt)          ──▶  commons (Encryptor)
datasource-util (TypeHandler)   ──▶  commons (mybatis 패키지)

rest-api-util (ApiResponse 등)  ──▶  ❌ 제거됨
rest-api-util (AOP)             ──▶  ❌ 제거됨
http-util                       ──▶  ❌ 제거됨 (RestClient로 대체)
pageable-util                   ──▶  ❌ 제거됨 (StrapiQuery로 대체)
commons-util (StringUtil 등)    ──▶  ❌ 제거됨 (필요 시 서비스에서 직접)

batch-util                      ──▶  미이관 (기존 commons-util에서 계속 사용)
cert-util                       ──▶  미이관
hometax-util                    ──▶  미이관
mail-util                       ──▶  미이관
image-util                      ──▶  미이관
windows-util                    ──▶  미이관
oauth2-util                     ──▶  미이관
recaptcha-util                  ──▶  미이관
restdocs-util                   ──▶  미이관
```

---

### 11.3 제거된 항목 (REMOVED)

#### A. ApiResponse 래핑 구조 전체 제거

**구 버전:**
```java
// 모든 API 응답을 ApiResponse로 래핑
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String code;
    private String message;
    private String detail;
    private Session session;
    private long duration;
}

// 타입별 추가 래핑 클래스
ApiListResponse<T>      // List<T> 응답용
ApiMapResponse<K,V>     // Map<K,V> 응답용
ApiPageableResponse<T>  // Page<T> 응답용
```

**신 버전:** 전부 제거됨. 컨트롤러에서 데이터를 직접 반환합니다.
```kotlin
// 에러일 때만 ErrorResponse 사용, 정상 응답은 직접 반환
@GetMapping("/{id}")
fun get(@PathVariable id: Long): Fax {
    return faxService.getById(id)
}
```

**제거 이유:** 
- 클라이언트에서 `response.data`로 한 단계 더 꺼내야 하는 불편함
- `success`, `duration`, `session` 등 불필요한 정보가 응답에 포함
- REST API 표준 관행에 맞지 않음

**영향받는 파일들:**

| 제거된 파일 | 설명 |
|------------|------|
| `ApiResponse.java` | 단건 응답 래핑 |
| `ApiListResponse.java` | 리스트 응답 래핑 |
| `ApiMapResponse.java` | 맵 응답 래핑 |
| `ApiPageableResponse.java` | 페이징 응답 래핑 |

---

#### B. ApiControllerAspect (AOP 응답 래핑) 제거

**구 버전:**
```java
// AOP로 컨트롤러 반환값을 자동으로 ApiResponse로 래핑
@Aspect
public class ApiControllerAspect {
    @Around("@within(org.springframework.web.bind.annotation.RestController)")
    public Object wrapResponse(ProceedingJoinPoint joinPoint) {
        Object result = joinPoint.proceed();
        return ApiResponse.success(result, session, duration);
    }
}
```

**신 버전:** 전부 제거됨. 컨트롤러가 직접 응답 타입을 반환합니다.

**제거 이유:** AOP 자동 래핑이 디버깅을 어렵게 하고, 응답 형식을 예측하기 힘들게 만듦

---

#### C. ApiRequester 제거

**구 버전:**
```java
// 마이크로서비스 호출 후 ApiResponse로 반환
public class ApiRequester {
    public ApiResponse<T> get(url, headers, session)
    public ApiListResponse<T> getList(url, headers, session)
    public ApiMapResponse<K,V> getMap(url, headers, session)
    public ApiPageableResponse<T> getPageable(url, headers, session)
    // POST, PUT, PATCH, DELETE도 각각 오버로드
}
```

**신 버전:** 제거됨. `ApiClient`로 통합, 제네릭으로 직접 타입 지정.
```kotlin
// 신 버전: 단순하고 직관적
apiClient.get<User>("/users/1", session)
apiClient.get<List<User>>("/users", session)
```

---

#### D. SessionUtil 제거

**구 버전:**
```java
public class SessionUtil {
    public static Session getSession(HttpServletRequest request) {
        // 쿠키/헤더에서 세션 추출
    }
}
```

**신 버전:** 로직이 `SessionLoadInterceptor`/`SessionLoadFilter`에 직접 통합됨. 별도 유틸 클래스 불필요.

---

#### E. SessionSerializer / SessionDeserializer 제거

**구 버전:**
```java
// Jackson 직렬화기로 Session ↔ 암호화된 JSON 변환
public class SessionSerializer extends JsonSerializer<Session> {
    // Session → AES 암호화 JSON
}
public class SessionDeserializer extends JsonDeserializer<Session> {
    // AES 암호화 JSON → Session
}
```

**신 버전:** 제거됨. `Encryptor.encryptAES()` / `decryptAES()`와 `ObjectMapper`를 직접 조합하여 사용.
```kotlin
// 암호화: objectMapper → JSON → Encryptor.encryptAES
// 복호화: Encryptor.decryptAES → JSON → objectMapper.readValue
```

**제거 이유:** Session이 항상 암호화되어야 할 필요가 없고, 용도에 따라 선택적으로 암호화/복호화

---

#### F. SessionSearchDto / DateTimeRange 제거

**구 버전:**
```java
// 검색 조건 DTO (쉼표 구분 문자열)
public class SessionSearchDto {
    private String brands;      // "BAROBILL,BIZ4IN"
    private String sessionTypes; // "USER,PARTNER"
    // getter에서 split 후 파싱
}

// 날짜 범위
public class DateTimeRange {
    private LocalDateTime startDT;
    private LocalDateTime endDT;
}
```

**신 버전:** 제거됨. Strapi 쿼리 시스템으로 완전 대체.
```
# 구: brands=BAROBILL,BIZ4IN
# 신: filters[brand][$in][0]=BAROBILL&filters[brand][$in][1]=BIZ4IN

# 구: DateTimeRange (startDT, endDT)
# 신: filters[doDt][$gte]=2024-01-01&filters[doDt][$lte]=2024-12-31
```

---

#### G. SnakeToCamelPageableArgumentResolver 제거

**구 버전:**
```java
// snake_case 정렬 파라미터를 camelCase로 변환
public class SnakeToCamelPageableArgumentResolver 
    extends PageableHandlerMethodArgumentResolver {
    // sort=partner_seq,desc → partnerSeq DESC
}
```

**신 버전:** 제거됨. `StrapiQueryArgumentResolver`가 정렬을 포함한 전체 쿼리 파라미터를 처리.

---

#### H. 암호화 유틸리티 대폭 축소

| 구 버전 파일 | 신 버전 | 상태 |
|-------------|--------|------|
| `EncryptUtil.java` (AES, SEED, SHA-512, URL인코딩) | `Encryptor.kt` (AES만) | **축소** |
| `StringEncrypter.java` (커스텀 키 AES) | — | **제거** |
| `Base64Encoder.java` (커스텀 Base64) | — | **제거** (Java stdlib `java.util.Base64` 사용) |
| `RSA.java` (RSA 키 관리) | `JwtHelper.kt` | **JWT로 대체** |
| `KISA_SEED_CBC.java` (SEED 암호화) | — | **제거** |

**제거 이유:** 신규 서비스에서는 SEED 암호화, 커스텀 Base64 등이 불필요. AES만 세션 암호화에 사용.

---

#### I. 범용 유틸리티 제거

| 구 버전 파일 | 상태 | 이유 |
|-------------|------|------|
| `StringUtil.java` (사업자번호 검증, 핸드폰 검증, camelToSnake 등) | **제거** | `toSnakeCase()`/`toCamelCase()`만 Kotlin 확장함수로 이관. 나머지는 각 서비스에서 직접 |
| `FileUtil.java` (파일 읽기/쓰기/복사 등) | **제거** | 공통 라이브러리에 불필요 |
| `BigDecimalUtil.java` | **제거** | 공통 라이브러리에 불필요 |

---

#### J. HTTP 유틸리티 모듈 전체 제거

| 구 버전 파일 | 상태 | 대체 |
|-------------|------|------|
| `HttpUtil.java` (HttpURLConnection 기반) | **제거** | `RestClient` / `WebClient` 사용 |
| `HttpResponse.java` | **제거** | Spring의 `ResponseEntity` 사용 |
| `CookieUtil.java` (쿠키 생성/읽기) | **제거** | Spring의 Cookie 처리 사용 |
| `IpUtil.java` (IP 추출) | **제거** | 필요 시 서비스에서 직접 구현 |

---

#### K. 페이징 유틸리티 모듈 전체 제거

| 구 버전 파일 | 상태 | 대체 |
|-------------|------|------|
| `PageableInfo.java` | **제거** | `StrapiQuery.toPageable()` 사용 |
| `SimplePage.java` | **제거** | Spring Data `Page\<T\>` 직접 사용 |
| `SimplePageImpl.java` | **제거** | Spring Data `PageImpl\<T\>` 직접 사용 |

---

#### L. 테스트 유틸리티 제거

| 구 버전 파일 | 하던 일 | 상태 | 대체 |
|-------------|---------|------|------|
| `MockMvcExpectHandlers.java` | MockMvc 테스트 실패 시 요청/응답 로깅 | **제거** | `WebTestClient`가 실패 시 자동 로깅 내장 |
| `ControllerTestUtil.java` | DTO → `MultiValueMap` 변환 (GET 쿼리 파라미터용) | **제거** | `StrapiQuery` 도입으로 커스텀 SearchDTO 자체가 없어져서 변환 유틸 불필요. 쿼리 파라미터는 `uriBuilder`로 직접 작성 |

---

### 11.4 수정된 항목 (MODIFIED)

#### A. Session 데이터 모델

**구 버전 (Session.java):**
```java
public class Session {
    private Brand brand;
    private String product;
    private Integer partnerSeq;
    private Integer memberSeq;
    private Integer userSeq;
    private SessionType doSessionType;
    private Integer doSessionSeq;
    private LocalDateTime doDt;
    private String doIp;

    // Wrapper 내부 클래스 (Session을 JsonNode로 래핑)
    public static class Wrapper { ... }
    // WrappedSession (Session을 암호화 문자열로 래핑)
    public static class WrappedSession { ... }

    // 빌더 패턴
    public static Session ofSystem(brand, product) { ... }
    public static Session ofGuest(brand, product) { ... }
}
```

**신 버전 (Session.kt):**
```kotlin
data class Session(
    var brand: Brand? = null,
    var product: String? = null,
    var partnerSeq: Int? = null,
    var memberSeq: Int? = null,
    var userSeq: Int? = null,
    var doSessionType: SessionType? = null,
    var doSessionSeq: Int? = null,
    var doDt: LocalDateTime? = null,
    var doIp: String? = null
) {
    companion object {
        fun columns(prefix: String = ""): List<String>
    }
}
```

**주요 변경:**

| 항목 | 구 | 신 |
|------|---|---|
| 클래스 타입 | POJO (getter/setter) | Kotlin data class |
| Wrapper/WrappedSession | 존재 | **제거** |
| 빌더 패턴 (ofSystem, ofGuest) | 존재 | **제거** (기본값 null로 충분) |
| columns() 메서드 | 없음 | **추가** (DB 컬럼 매핑용) |

---

#### B. ErrorCode / BusinessException

**구 버전:**
```java
// ErrorCode 인터페이스 (동일한 구조)
public interface ErrorCode {
    int getStatus();
    String getCode();
    String getText();
}

// DefaultErrorCode (6개 에러 코드)
public enum DefaultErrorCode implements ErrorCode {
    BAD_REQUEST(400, "BAD_REQUEST", "잘못된 요청"),
    UNAUTHORIZED(401, ...),
    ACCESS_DENIED(403, ...),
    METHOD_NOT_ALLOWED(405, ...),
    TYPE_MISMATCH(400, ...),
    INTERNAL_SERVER_ERROR(500, ...)
}

// BusinessException (다양한 생성자)
public class BusinessException extends RuntimeException {
    private ErrorCode errorCode;
    private Session session;         // 세션 포함
    private String detail;
    private ApiResponse apiResponse; // ApiResponse 포함 가능
    // 6개 이상의 생성자 오버로드
}
```

**신 버전:**
```kotlin
// ErrorCode (동일)
interface ErrorCode {
    val status: Int
    val code: String
    val text: String
}

// CommonWebServerErrorCode (10개로 확대)
enum class CommonWebServerErrorCode : ErrorCode {
    BAD_REQUEST, TYPE_MISMATCH, VALIDATION_ERROR,    // 400 (VALIDATION_ERROR 추가)
    UNAUTHORIZED, INVALID_TOKEN, EXPIRED_TOKEN,       // 401 (토큰 에러 세분화)
    FORBIDDEN,                                        // 403 (이름 변경: ACCESS_DENIED → FORBIDDEN)
    NOT_FOUND,                                        // 404 (신규)
    METHOD_NOT_ALLOWED,                               // 405
    INTERNAL_SERVER_ERROR                              // 500
}

// BusinessException (단순화)
class BusinessException(
    val errorCode: ErrorCode,
    val errorDetail: String? = null,
    cause: Throwable? = null
) : RuntimeException(...)
```

**주요 변경:**

| 항목 | 구 | 신 |
|------|---|---|
| 에러 코드 수 | 6개 | 10개 (토큰 관련 세분화) |
| `ACCESS_DENIED` | 존재 | `FORBIDDEN`으로 이름 변경 |
| `VALIDATION_ERROR` | 없음 | **추가** |
| `NOT_FOUND` | 없음 | **추가** |
| `INVALID_TOKEN` / `EXPIRED_TOKEN` | 없음 | **추가** (JWT 에러 구분) |
| BusinessException.session | 포함 | **제거** |
| BusinessException.apiResponse | 포함 | **제거** |
| 생성자 수 | 6개+ 오버로드 | 1개 (기본값 활용) |

---

#### C. RequireSession 어노테이션

**구 버전:**
```java
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireSession {
    // 속성 없음 — 세션 유무만 확인
}
```

**신 버전:**
```kotlin
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequireSession(
    val brands: Array<Brand> = [],           // 허용 브랜드 필터
    val sessionTypes: Array<SessionType> = [] // 허용 세션 타입 필터
)
```

**변경 포인트:** 단순 세션 존재 확인 → **브랜드/세션타입 기반 인가(Authorization)** 기능 추가

---

#### D. SessionLoadInterceptor

**구 버전:**
```java
public class SessionLoadInterceptor implements HandlerInterceptor {
    // SessionUtil.getSession(request)로 세션 추출
    // 쿠키 → 헤더 순서로 KSESSIONID 확인
    // JWT/OAuth2 지원 없음 (별도 OAuth2SessionLoadInterceptor에서 처리)
}
```

**신 버전:**
```kotlin
class SessionLoadInterceptor(private val objectMapper: ObjectMapper) : HandlerInterceptor {
    // 세션 추출 우선순위: 쿠키 → 헤더 → JWT(SecurityContext)
    // JWT에서 session claim 추출 기능 내장
    // Reactive 버전(SessionLoadFilter)도 동시 제공
}
```

**변경 포인트:**
- JWT 세션 추출이 **통합됨** (구: OAuth2SessionLoadInterceptor 별도)
- ObjectMapper 주입으로 더 유연한 역직렬화
- Reactive(WebFlux) 버전 추가

---

#### E. ApiClient (HTTP 클라이언트)

**구 버전 (ApiClient.java):**
```java
public class ApiClient {
    private WebClient webClient;   // Reactive WebClient 기반
    private ObjectMapper objectMapper;

    // 메서드마다 4~5개씩 오버로드
    public <T> T get(url, Class<T> clazz)
    public <T> T get(url, Class<T> clazz, session)
    public <T> T get(url, Class<T> clazz, headers)
    public <T> T get(url, Class<T> clazz, headers, session)
    public <T> List<T> getList(url, Class<T> clazz, session)
    public <K,V> Map<K,V> getMap(url, Class<K>, Class<V>, session)
    // ... POST, PUT, PATCH, DELETE도 각각 오버로드
    // 총 40개 이상의 메서드
}
```

**신 버전 (ApiClient.kt):**
```kotlin
class ApiClient(
    val restClient: RestClient,          // 동기 RestClient 기반
    val objectMapper: ObjectMapper,
    val baseUrl: String,
    val clientRegistrationId: String     // OAuth2 자동 인증
) {
    inline fun <reified T : Any> get(path: String, session: Session? = null): T?
    inline fun <reified T : Any> post(path: String, body: Any?, session: Session? = null): T?
    inline fun <reified T : Any> put(path: String, body: Any?, session: Session? = null): T?
    inline fun <reified T : Any> delete(path: String, session: Session? = null): T?
    // 총 4개 메서드
}
```

**주요 변경:**

| 항목 | 구 | 신 |
|------|---|---|
| HTTP 클라이언트 | WebClient (Reactive) | RestClient (동기) |
| 메서드 수 | 40개+ (오버로드) | 4개 (reified 제네릭) |
| 타입 지정 | `Class\<T\>` 파라미터 | `reified T` (자동 추론) |
| List/Map 전용 메서드 | `getList()`, `getMap()` | `get\<List\<T\>\>()` (제네릭으로 통합) |
| 인증 | 수동 헤더 설정 | OAuth2ClientHttpRequestInterceptor 자동 |
| baseUrl | 매 호출시 전체 URL | 생성자에서 baseUrl 설정, path만 전달 |
| 에러 처리 | `.onStatus()` 체인 | `ApiClientErrorHandler` 분리 |

**WebClient → RestClient로 바꿔도 괜찮은 이유:** 구 버전은 WebClient(비동기)를 쓰면서 `.block()`으로 결과를 기다렸다. 즉 **비동기 클라이언트를 동기로 쓰는 상태**였고, WebClient의 장점(Non-blocking)을 활용하지 않으면서 복잡성만 가져갔다.

```java
// 구 버전: WebClient인데 결국 .block()으로 동기 전환
return requestHeadersSpec.retrieve()
    .bodyToMono(String.class)
    .block();                    // ← Reactive를 강제로 블로킹!
```

```kotlin
// 신 버전: 처음부터 동기인 RestClient
return restClient.get()
    .uri("$baseUrl$path")
    .retrieve()
    .body(typeRef<T>())          // ← 원래 동기
```

어차피 둘 다 동기 동작인데, 신 버전이 더 단순하고 정직한 구조. WebFlux 프로젝트에서 동기 RestClient를 써도 문제없는 이유는 MSA 간 API 호출은 빈도가 높지 않고(주요 부하는 DB I/O → R2DBC로 Non-blocking), 진짜 비동기가 필요하면 `WebClient`를 직접 쓰면 됨

---

#### F. OAuth2 설정

**구 버전:**
```java
// 수동 설정
AbstractOAuth2ClientConfig          // WebClient + ReactiveOAuth2 기반
OAuth2ApiWebMvcConfig               // MVC 인터셉터 등록
SessionAccessTokenConverter         // OAuth2 토큰 → Session 변환
OAuth2SessionLoadInterceptor        // OAuth2 인증 → 세션 로드
```

**신 버전:**
```kotlin
// AutoConfiguration으로 자동 등록
CommonsSecurityAutoConfiguration      // JWT 검증 + 에러 처리 자동 등록
CommonsReactiveSecurityAutoConfiguration  // Reactive 버전
CommonsClientConfig                   // RestClient + OAuth2 인터셉터 자동 구성
JwtHelper                            // JWT 키 로드/생성
```

**주요 변경:**

| 항목 | 구 | 신 |
|------|---|---|
| 인증 방식 | Spring Security OAuth2 (deprecated) | Spring Security JWT Resource Server |
| 토큰 형식 | OAuth2 Access Token | JWT (RS256 서명) |
| 세션 전달 | `SessionAccessTokenConverter` | JWT claim `session` |
| 설정 방식 | 상속 기반 (`extends AbstractOAuth2ClientConfig`) | 프로퍼티 기반 (`knet.commons.security.enabled=true`) |
| 클라이언트 인증 | Reactive `ReactiveOAuth2AuthorizedClientManager` | `OAuth2AuthorizedClientManager` (동기) |

---

#### G. 웹 설정 (ApiWebMvcConfig → AutoConfiguration)

**구 버전:**
```java
// 서비스마다 수동으로 상속해서 사용
@Configuration
public class MyWebConfig extends ApiWebMvcConfig {
    // 필요 시 오버라이드
}
```

**신 버전:**
```yaml
# application.yml 한 줄로 자동 활성화
knet:
  commons:
    web:
      enabled: true
```

**변경 포인트:** 상속 기반 → AutoConfiguration 기반. 서비스 코드에서 설정 클래스 작성 불필요.

---

#### H. TypeHandler

**구 버전:**
```java
// StringArrayTypeHandler → String[] 매핑
@MappedTypes(String[].class)
public class StringArrayTypeHandler extends BaseTypeHandler<String[]> { ... }

// UuidTypeHandler
public class UuidTypeHandler extends BaseTypeHandler<UUID> { ... }
```

**신 버전:**
```kotlin
// StringListArrayTypeHandler → List<String> 매핑 (배열→리스트)
@MappedTypes(List::class)
class StringListArrayTypeHandler : BaseTypeHandler<List<String>>() { ... }

// UuidTypeHandler (동일 구조)
class UuidTypeHandler : BaseTypeHandler<UUID>() { ... }
```

**변경 포인트:** `String[]` → `List<String>`. Kotlin에서는 배열보다 리스트를 표준 컬렉션으로 사용한다. `List`는 기본 불변(수정 불가)이고, `.map()`, `.filter()`, `.groupBy()` 등 컬렉션 함수가 풍부하며, 제네릭 지원이 완벽하다. 배열(`String[]`)은 항상 가변이고 컬렉션 함수가 제한적이라 Kotlin에서는 거의 쓰지 않는다. Kotlin 공식 문서, Spring 공식 예제 모두 `List`를 사용하므로 TypeHandler도 이에 맞춘 것

---

#### I. 에러 응답 형식

**구 버전 (ApiResponse 실패 시):**
```json
{
  "success": false,
  "data": null,
  "code": "BAD_REQUEST",
  "message": "잘못된 요청",
  "detail": "필수 파라미터 누락",
  "session": { ... },
  "duration": 123
}
```

**신 버전 (ErrorResponse):**
```json
{
  "code": "BAD_REQUEST",
  "message": "잘못된 요청.",
  "detail": "필수 파라미터 'name'이(가) 누락되었습니다.",
  "trace": null,
  "status": 400
}
```

**변경 포인트:**
- `success`, `data`, `session`, `duration` 필드 제거
- `status` (HTTP 상태 코드) 추가
- `trace` (스택 트레이스, 개발 모드 전용) 추가
- 정상 응답에서는 ErrorResponse를 사용하지 않음 (데이터 직접 반환)

---

### 11.5 신규 추가된 항목 (NEW)

#### A. Strapi 스타일 쿼리 시스템 (완전 신규)

구 버전에는 없던 기능. 프론트엔드에서 복잡한 검색 조건을 표준화된 쿼리 파라미터로 전달.

| 신규 클래스 | 역할 |
|------------|------|
| `StrapiQueryParser` | HTTP 파라미터 → StrapiQuery 파싱 |
| `StrapiQuery` / `FilterNode` | 중간 표현 (필터 트리) |
| `FilterOperator` | 21개 연산자 ($eq, $nei, $contains, $containsi, $in 등) |
| `@StrapiQueryParam` | 컨트롤러 어노테이션 |
| `StrapiQueryArgumentResolver` | 파라미터 자동 주입 (Servlet + Reactive) |
| `JooqQueryBuilder` / `JooqSearchCriteria` | jOOQ 변환 |
| `MybatisQueryBuilder` / `MybatisSearchCriteria` | MyBatis 변환 |
| `MybatisSqlProvider` | 동적 SQL 생성 추상 클래스 |
| `JooqExtensions` | jOOQ Record 확장 함수 |

---

#### B. Reactive(WebFlux) 지원 (완전 신규)

구 버전은 Servlet(MVC)만 지원. 신 버전은 모든 기능의 Reactive 버전 제공.

| 신규 Reactive 클래스 | 대응하는 Servlet 클래스 |
|---------------------|----------------------|
| `SessionLoadFilter` | `SessionLoadInterceptor` |
| `RequireSessionFilter` | `RequireSessionInterceptor` |
| `RequestTimingFilter` | `RequestTimingInterceptor` |
| `SessionArgumentResolver` (reactive) | `SessionArgumentResolver` (servlet) |
| `StrapiQueryArgumentResolver` (reactive) | `StrapiQueryArgumentResolver` (servlet) |
| `CommonsReactiveWebAutoConfiguration` | `CommonsWebAutoConfiguration` |
| `CommonsReactiveSecurityAutoConfiguration` | `CommonsSecurityAutoConfiguration` |
| `ErrorResponses` (reactive) | `ErrorResponses` (servlet) |

---

#### C. RequestTimingInterceptor/Filter (신규)

구 버전에 없던 응답 시간 측정 기능. 요청 처리에 걸린 시간을 측정해서 **응답 헤더에 추가**한다. 네트워크 지연이 아닌 순수 서버 처리 시간을 알 수 있어 성능 디버깅에 유용.

```
요청 들어옴 → 시작 시각 기록 → Controller 처리 → 종료 시각 기록 → 응답 헤더에 추가

응답 헤더:
X-Response-Time: 45ms
```

---

#### D. JwtHelper (신규)

구 버전의 `SessionAccessTokenConverter`를 대체하는 JWT 전용 헬퍼. 두 가지 일만 한다:

- **`loadPublicKey()`**: `jwtkeystore.jks`에서 RSA 공개키를 꺼냄. 각 MSA의 `CommonsSecurityAutoConfiguration`에서 `JwtDecoder` 생성 시 자동 호출되어 토큰 서명을 검증
- **`generate(session)`**: Session 객체를 JWT claims에 넣고 개인키로 서명하여 토큰 생성. **테스트 전용** (운영에서는 Auth Server가 발급)

```kotlin
JwtHelper.loadPublicKey()                    // RSA 공개키 로드 (운영: JWT 검증용)
JwtHelper(objectMapper).generate(session)    // JWT 토큰 생성 (테스트용)
```

**구 버전과의 차이:** `SessionAccessTokenConverter`는 Spring Security OAuth2의 `AccessTokenConverter` 인터페이스에 종속. 신 버전은 프레임워크 의존 없이 순수하게 RSA 키 로드 + JWT 생성만 담당하여 더 단순

---

#### E. GlobalBinderAdvice (신규, Servlet 전용)

```kotlin
@InitBinder
fun initBinder(binder: WebDataBinder) {
    binder.initDirectFieldAccess()  // Setter 대신 필드 직접 접근
}
```

**왜 필요한가:** Spring MVC는 기본적으로 **Setter를 통해** 쿼리 파라미터를 바인딩한다. 그런데 Kotlin `data class`는 생성자에서 프로퍼티를 정의하므로, Java 스타일의 `setXxx()` Setter가 없다. `initDirectFieldAccess()`를 설정하면 Setter 없이 **필드에 직접 값을 넣어줘서** Kotlin data class에서도 파라미터 바인딩이 동작한다. Servlet(MVC) 전용이고, WebFlux는 바인딩 방식이 달라서 불필요.

---

#### F. BusinessExceptionWebExceptionHandler (신규, Reactive 전용)

```kotlin
// 필터에서 throw된 BusinessException을 처리하는 WebExceptionHandler
@Order(Ordered.HIGHEST_PRECEDENCE)
class BusinessExceptionWebExceptionHandler : WebExceptionHandler { ... }
```

**왜 필요한가:** `@RestControllerAdvice`는 **Controller 안에서 발생한 예외**만 잡는다. 그런데 `RequireSessionFilter` 같은 Filter에서 `BusinessException`을 던지면 Controller에 도달하기 전이라 `@RestControllerAdvice`가 잡지 못한다. 그래서 Filter 단계의 예외를 처리하기 위해 `WebExceptionHandler`를 별도로 등록한 것. `@Order(HIGHEST_PRECEDENCE)`로 최우선 순위를 줘서 다른 핸들러보다 먼저 처리한다. Servlet에서는 Interceptor의 예외가 `@RestControllerAdvice`로 전달되므로 불필요.

---

#### G. String 확장 함수 (신규)

```kotlin
fun String.toSnakeCase(): String  // "partnerSeq" → "partner_seq"
fun String.toCamelCase(): String  // "partner_seq" → "partnerSeq"
```

구 버전 `StringUtil.camelToSnake()` / `snakeToCamel()`의 Kotlin 관용적 대체. Java에서는 `StringUtil.camelToSnake(str)` 형태로 유틸 클래스를 통해 호출했지만, Kotlin의 **확장 함수**로 만들면 `str.toSnakeCase()`처럼 문자열 자체의 메서드처럼 호출 가능. 실제 사용 예: `Downtime.FIELD_MAP`에서 프로퍼티명(`partnerSeq`)을 DB 컬럼명(`partner_seq`)으로 변환할 때 사용.

---

#### H. Session.columns() (신규)

```kotlin
Session.columns()           // ["brand", "product", "partnerSeq", ...]
Session.columns("delete")  // ["deleteBrand", "deleteProduct", ...]
```

DB 감사(audit) 컬럼 매핑을 위한 유틸리티. 구 버전에는 없던 기능. Session은 9개 필드로 구성되는데, DB에 등록 세션/삭제 세션을 각각 저장하므로 컬럼이 18개다. `columns("delete")`를 호출하면 9개 필드명에 `delete` 접두어를 자동으로 붙여준다(`brand` → `deleteBrand`). downtime-api의 `Downtime.FIELD_EXPANSIONS`에서 `?fields=session` 요청 시 9개 컬럼으로 확장하는 데 사용.

---

#### I. NoArg 어노테이션 (신규)

```kotlin
@NoArg
data class MyEntity(val id: Long, val name: String)
// → kotlin-noarg 플러그인이 기본 생성자 자동 생성 (MyBatis 매핑용)
```

**왜 필요한가:** MyBatis는 DB 결과를 객체로 매핑할 때 **기본 생성자(파라미터 없는 생성자)**가 있어야 한다. 그런데 Kotlin `data class`는 모든 프로퍼티를 생성자에서 받으므로 기본 생성자가 없다. `@NoArg`를 붙이면 `kotlin-noarg` 컴파일러 플러그인이 **빌드 시 기본 생성자를 자동 생성**해서 MyBatis 매핑이 동작한다. jOOQ를 쓰는 프로젝트(downtime-api)에서는 불필요하고, MyBatis를 쓰는 기존 MSA를 위한 것.

---

### 11.6 마이그레이션 체크리스트

서비스에서 `commons-util` → `commons`로 전환할 때 확인할 사항:

| # | 확인 항목 | 조치 |
|---|----------|------|
| 1 | `ApiResponse` 반환 타입 제거 | 컨트롤러에서 데이터 직접 반환으로 변경 |
| 2 | `ApiControllerAspect` 제거 | AOP 래핑 삭제 |
| 3 | `ApiRequester` → `ApiClient` | 메서드 시그니처 변경 (`getList()` → `get\<List\<T\>\>()`) |
| 4 | `import com.knet.commons.util.api.*` | `import com.knet.commons.web.client.*` 로 변경 |
| 5 | `import com.knet.commons.util.session.*` | `import com.knet.commons.session.*` 로 변경 |
| 6 | `import com.knet.commons.util.api.exception.*` | `import com.knet.commons.exception.*` 로 변경 |
| 7 | `DefaultErrorCode` 참조 | `CommonWebServerErrorCode` 또는 도메인별 ErrorCode로 변경 |
| 8 | `extends ApiWebMvcConfig` | 삭제 (AutoConfiguration 자동 적용) |
| 9 | `extends AbstractOAuth2ClientConfig` | `@Import(CommonsClientConfig::class)` 로 변경 |
| 10 | `SessionSearchDto` 사용 | `@StrapiQueryParam query: StrapiQuery` 로 변경 |
| 11 | `SnakeToCamelPageableArgumentResolver` | `StrapiQueryArgumentResolver` 자동 등록 |
| 12 | `String[]` TypeHandler | `List\<String\>` TypeHandler로 변경 |
| 13 | `SessionSerializer/Deserializer` | 삭제 (Encryptor + ObjectMapper 직접 사용) |
| 14 | `application.yml` 추가 | `knet.commons.web.enabled: true` 설정 |
| 15 | Java → Kotlin | Session, Brand, SessionType 등 import 경로 변경 |

---

## 12. 예상 질문 & 답변 (Q&A)

> 발표 시 팀원들이 궁금해할 만한 질문과 답변 정리

---

### Q1. 기존 commons-util을 쓰는 서비스는 당장 마이그레이션 해야 하나요?

**아닙니다.** 두 라이브러리는 독립적으로 공존합니다.

- `commons-util`은 그대로 유지됩니다. 특히 `batch-util`, `cert-util`, `hometax-util` 등 미이관 모듈은 계속 `commons-util`에서 사용합니다.
- **신규 서비스**를 만들 때 `commons`를 사용하면 됩니다.
- 기존 서비스는 리팩토링이나 Spring Boot 3 업그레이드 시점에 맞춰 점진적으로 전환하면 됩니다.
- 단, 두 라이브러리를 **동시에 의존**하는 것은 패키지 충돌 위험이 있으므로 피하는 게 좋습니다. (예: `Session` 클래스가 양쪽에 존재)

---

### Q2. ApiResponse 래핑을 제거하면, 프론트엔드에서 응답 파싱 로직을 다 바꿔야 하는 거 아닌가요?

**맞습니다.** 프론트엔드와 함께 변경해야 합니다.

**구 버전 프론트 코드:**
```javascript
const res = await api.get("/users/1");
const user = res.data;           // 한 단계 꺼내야 함
if (!res.success) { ... }        // success 플래그 확인
```

**신 버전 프론트 코드:**
```javascript
const user = await api.get("/users/1");  // 바로 데이터
// 에러 시 HTTP 상태 코드로 분기 (4xx, 5xx)
```

**전환 팁:**
- 정상 응답: HTTP 200 + 데이터 직접 반환
- 에러 응답: HTTP 4xx/5xx + `ErrorResponse` 형태 (`{ code, message, detail, status }`)
- 프론트에서는 HTTP 상태 코드로 성공/실패 판단 → REST API 표준 관행과 동일

---

### Q3. WebClient에서 RestClient로 바꾼 이유는? WebClient가 더 최신 아닌가요?

둘 다 Spring 6에서 지원하는 현역 클라이언트이지만, **용도가 다릅니다.**

| 항목 | WebClient | RestClient |
|------|-----------|------------|
| 프로그래밍 모델 | Reactive (Mono/Flux) | 동기 (블로킹) |
| 도입 시기 | Spring 5 (2017) | Spring 6.1 (2023) |
| 주 사용처 | WebFlux 기반 서비스 | MVC 기반 서비스 |
| 사용 편의성 | `.block()` 필요 (동기 환경에서) | 직관적인 동기 호출 |

**바꾼 이유:**
- 구 버전에서 WebClient를 MVC 서비스에서 사용하면서 `.block()`으로 동기 변환 → 비효율적
- RestClient는 Spring 6.1에서 **MVC 환경을 위해 새로 만든** 동기 HTTP 클라이언트
- RestClient도 내부적으로 WebClient와 동일한 HTTP 엔진 사용 가능 (성능 차이 없음)
- OAuth2 인터셉터도 RestClient 네이티브 지원 (`OAuth2ClientHttpRequestInterceptor`)

---

### Q4. Strapi 쿼리 시스템이 뭔가요? 왜 도입했나요?

**Strapi**는 오픈소스 CMS인데, 여기서는 Strapi의 **쿼리 파라미터 규격만 차용**했습니다.

**도입 전 문제점:**
- 각 서비스마다 검색 API의 파라미터 형식이 제각각
- `SessionSearchDto` 같은 전용 DTO를 매번 만들어야 함
- OR 조건, 중첩 필터 등 복잡한 검색이 불가능

**도입 후:**
- 모든 검색 API가 **동일한 쿼리 파라미터 규격** 사용
- 컨트롤러에 `@StrapiQueryParam query: StrapiQuery` 하나면 필터/정렬/페이징 전부 처리
- 프론트엔드에서 `filters[field][$operator]=value` 형태로 자유롭게 조합
- jOOQ/MyBatis 어디든 자동 변환 (`JooqSearchCriteria`, `MybatisSearchCriteria`)

**예시 — 같은 검색을 구/신으로 비교:**
```
# 구: 전용 DTO 필요
GET /fax?brands=BAROBILL&sessionTypes=USER&startDate=2024-01-01&endDate=2024-12-31&sort=partner_seq,desc&page=0&size=20

# 신: 표준화된 Strapi 형식
GET /fax?filters[brand][$eq]=BAROBILL&filters[doSessionType][$eq]=USER&filters[doDt][$gte]=2024-01-01&filters[doDt][$lte]=2024-12-31&sort=doDt,desc&page=0&size=20
```

**장점:**
- 검색 필드를 추가해도 **백엔드 코드 수정 불필요** (DTO에 필드 추가 + MyBatis XML 수정이 없어짐)
- `$eq`, `$ne`, `$gt`, `$lt`, `$in`, `$contains` 등 **연산자 지원** (구 버전은 IN 검색만 가능했음)
- `$or`, `$and`, `$not` 으로 **복잡한 논리 조합** 가능 (구 버전은 AND만 가능)
- 모든 MSA가 동일한 쿼리 형식 → 프론트엔드 개발자가 **한 번 배우면 모든 API에 적용**

**단점:**
- URL이 길어지고 가독성이 떨어짐 (`filters[serviceType][$eq]=FAX` vs `serviceType=FAX`)
- 프론트엔드 개발자가 Strapi 쿼리 규격을 **새로 학습**해야 함
- 쿼리 파라미터 파싱 로직(`StrapiQueryParser`)이 복잡함 (중첩 Map 변환, 재귀 파싱 등)
- 모든 필드를 열어두므로, 검색을 허용하면 안 되는 필드에 대한 **별도 제한 로직**이 필요할 수 있음

---

### Q5. Servlet과 Reactive를 이중 지원하는데, 서비스에서 둘 다 설정되면 충돌 안 나나요?

**충돌 나지 않습니다.** Spring Boot의 `@ConditionalOnWebApplication` 조건이 자동으로 구분합니다.

```kotlin
// Servlet 전용 — MVC 프로젝트에서만 활성화
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class CommonsWebAutoConfiguration

// Reactive 전용 — WebFlux 프로젝트에서만 활성화
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.REACTIVE)
class CommonsReactiveWebAutoConfiguration
```

- `spring-boot-starter-web` 의존성 → Servlet 모드 → `CommonsWebAutoConfiguration`만 활성화
- `spring-boot-starter-webflux` 의존성 → Reactive 모드 → `CommonsReactiveWebAutoConfiguration`만 활성화
- 둘 다 있으면 Spring Boot가 **Servlet을 우선** 선택 (Spring Boot 기본 동작)

`commons-web-server`의 모든 의존성이 `compileOnly`이므로 빌드 시에도 충돌 없습니다.

---

### Q6. `permitAll()`로 모든 요청을 허용하면, 보안은 어떻게 처리되나요?

두 단계로 나눠서 이해해야 합니다:

**1단계 — Spring Security (JWT 검증)**
```
permitAll() = 토큰이 없어도 요청 자체는 통과시킴
```
- 단, **JWT 토큰이 있으면** 검증은 수행합니다 (유효하지 않으면 401)
- 토큰이 없으면 인증 없이 통과 → 이후 단계에서 세션 확인

**2단계 — @RequireSession (세션 기반 인가)**
```
@RequireSession = 세션이 없으면 401, 브랜드/타입 불일치면 403
```

**이렇게 설계한 이유:**
- 모든 API가 JWT를 필요로 하는 건 아닙니다 (공개 API, 헬스체크 등)
- **마이크로서비스 간 호출**은 OAuth2 Client Credentials로 토큰을 받고, 세션은 KSESSIONID로 전달
- 따라서 "인증은 JWT/OAuth2", "인가는 @RequireSession"으로 역할이 분리되어 있습니다

---

### Q7. AES 암호화 키가 코드에 하드코딩되어 있는데, 보안상 문제 없나요?

**현재 상태:** `Encryptor.kt`에 키(`KNET_ENCRYPT_KEY`)와 IV(`KNET_ENCRYPT_IV`)가 하드코딩

```kotlin
private const val AES_KEY = "KNET_ENCRYPT_KEY"
private const val AES_IV = "KNET_ENCRYPT_IV"
```

**이것이 허용되는 이유:**
- 이 암호화는 **마이크로서비스 내부 통신 전용**입니다 (외부 노출 X)
- KSESSIONID는 내부 서비스 간에만 주고받는 값
- 외부 클라이언트(브라우저)에서는 JWT 토큰을 사용하고, KSESSIONID를 직접 생성하지 않음
- 내부 네트워크(K8s 클러스터) 안에서만 유통되므로 키 유출 위험이 낮음

**다만 개선이 필요한 부분:**
- 환경변수나 Vault 등으로 키를 외부화하면 더 안전합니다
- 구 버전(`EncryptUtil`)도 동일하게 하드코딩이므로, 이 부분은 양쪽 동일한 설계입니다

---

### Q8. Jackson이 `com.fasterxml.jackson`에서 `tools.jackson`으로 바뀌었는데, 호환성 문제는?

**Jackson 3.x (tools.jackson)은 패키지가 완전히 다릅니다.**

```java
// 구 (Jackson 2.x)
import com.fasterxml.jackson.databind.ObjectMapper;

// 신 (Jackson 3.x)
import tools.jackson.databind.ObjectMapper;
```

**영향:**
- `commons` 라이브러리 내부에서는 이미 `tools.jackson`을 사용합니다
- `commons`를 의존하는 서비스도 **동일한 Spring/Jackson 메이저 라인으로 맞춰야** 합니다 (현재 Spring Boot 4.x + Jackson 3.x)
- 기존 Spring Boot 2.x 서비스에서는 `commons`를 사용할 수 없습니다 → `commons-util` 계속 사용

**주의:** Jackson 2.x(`com.fasterxml`)와 3.x(`tools.jackson`)는 **공존 불가**합니다. 하나의 서비스에서 양쪽을 동시에 쓸 수 없으므로, Spring Boot 4.x 업그레이드가 전제 조건입니다.

---

### Q9. Reactive 필터에서 BusinessExceptionWebExceptionHandler를 별도로 만든 이유가 뭔가요?

**Reactive 환경에서 예외 처리 레이어가 두 곳**이기 때문입니다:

```
HTTP 요청
  │
  ▼
  WebFilter (SessionLoadFilter, RequireSessionFilter)  ← 여기서 예외 발생 시?
  │
  ▼
  Controller                                           ← 여기서 예외 발생 시?
  │
  ▼
  @RestControllerAdvice (ReactiveGlobalExceptionHandler) ← 컨트롤러 예외만 처리
```

- `@RestControllerAdvice`는 **컨트롤러 내부**에서 발생한 예외만 잡습니다
- `RequireSessionFilter`에서 `throw BusinessException(UNAUTHORIZED)`하면 → `@RestControllerAdvice`에 도달하지 않음
- 따라서 필터 레벨 예외를 잡기 위해 `WebExceptionHandler`가 필요합니다

**Servlet은 왜 안 만들었나?**
- Servlet의 `HandlerInterceptor`에서 발생한 예외는 Spring MVC의 예외 처리 체인을 타서 `@RestControllerAdvice`에 도달합니다
- 따라서 Servlet에서는 별도 핸들러가 불필요합니다

---

### Q10. `Session`의 필드가 전부 `var`이고 nullable인데, data class에서 `val`로 불변으로 만드는 게 낫지 않나요?

**맞는 지적이지만, 의도적인 설계입니다.**

`var`인 이유:
- `SessionLoadFilter`에서 세션을 로드한 후 `session.copy(doDt = LocalDateTime.now())`로 요청 시각을 덮어씁니다
- MyBatis 매핑 시 기본 생성자로 생성 후 setter로 값을 주입하는 패턴 (`@NoArg` + `var`)
- Jackson 역직렬화 시에도 기본 생성자 + setter 방식이 가장 호환성이 좋습니다

nullable인 이유:
- 모든 필드가 항상 존재하지 않습니다 (예: 비회원 요청 시 `userSeq = null`)
- 세션 추출 실패 시 Session 객체 자체가 null이 아니라 각 필드가 null
- `@RequireSession`이 없는 API에서는 Session이 부분적으로만 채워질 수 있음

**`copy()`를 쓰고 있으므로** 실질적으로 불변처럼 사용하고 있습니다. `var`이지만 컨트롤러/서비스에서 직접 필드를 수정하는 것은 권장하지 않습니다.
