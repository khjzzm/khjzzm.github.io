---
layout: post
title: 마이크로서비스 인증 아키텍처 - commons-web-client/server와 OAuth2 JWT 흐름
tags: [ kotlin, spring, oauth2, jwt, architecture ]
---

마이크로서비스 간 통신에서 OAuth2 Client Credentials + JWT + 암호화된 Session 전달이 어떻게 동작하는지 정리한다. commons-web-client, commons-web-server, auth 서버가 각각 어떤 역할을 하고, 하나의 서비스가 어떤 모듈로 구성되는지 다룬다.

## 서비스 구성 (멀티모듈 구조)

하나의 마이크로서비스는 다음 모듈들로 구성된다.

```
┌─────────────────────────────────────────────────────────────────┐
│                    하나의 마이크로서비스 (예: downtime)              │
│                                                                 │
│  ┌─ commons (공통 라이브러리) ─────────────────────────────────┐  │
│  │  commons-web-server  ← 세션, 인증, 쿼리 파싱               │  │
│  │  commons-web-client  ← 다른 서비스 호출용 HTTP 클라이언트    │  │
│  │  commons (core)      ← Session, Encryptor 등 공통 유틸     │  │
│  └────────────────────────────────────────────────────────────┘  │
│       ↑ 의존                                                     │
│  ┌─ downtime (도메인 core) ───────────────────────────────────┐  │
│  │  Downtime.kt         ← 도메인 엔티티                       │  │
│  │  DTO, enum 등        ← 순수 도메인 모델                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│       ↑ 의존                                                     │
│  ┌─ downtime-api (애플리케이션) ──────────────────────────────┐  │
│  │  Controller          ← @RequireSession, Session 주입       │  │
│  │  Service             ← 비즈니스 로직                        │  │
│  │  Repository          ← DB 접근 (jOOQ)                      │  │
│  │  application.yaml    ← OAuth2, DB 설정                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  실행 → downtime-api (Spring Boot Application)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 의존 방향

```
downtime-api
    ├── depends on → downtime (도메인)
    ├── depends on → commons-web-server (인증/쿼리)
    └── depends on → commons-web-client (타 서비스 호출 시)

downtime (도메인)
    └── depends on → commons (core: Session, Encryptor 등)
```

### 각 모듈의 역할

| 모듈 | 계층 | 역할 | 변경 빈도 |
|------|------|------|----------|
| **commons** | 인프라 | 모든 서비스가 공유하는 유틸 (Session, 암호화, 에러 응답) | 낮음 |
| **commons-web-server** | 인프라 | 요청 수신 쪽 (세션 로딩, 인증, 쿼리 파싱) | 낮음 |
| **commons-web-client** | 인프라 | 요청 발신 쪽 (OAuth2 토큰, 세션 전달) | 낮음 |
| **도메인 모듈** | 도메인 | 순수 도메인 모델 (엔티티, DTO) | 중간 |
| **api 모듈** | 애플리케이션 | 실제 실행 단위 (컨트롤러, 서비스, 설정) | 높음 |

다른 서비스를 만들 때도 같은 패턴이다.

```
message-api  → message (도메인) → commons
user-api     → user (도메인)    → commons
downtime-api → downtime (도메인) → commons
```

---

## commons-web-client (요청 발신)

핵심 클래스 구성:

| 클래스 | 역할 |
|--------|------|
| **ApiClient** | RestClient 래핑. `get<T>()`, `post<T>()`, `put<T>()`, `delete<T>()` 제공 |
| **CommonsClientConfig** | RestClient 자동 구성 (OAuth2 인터셉터, 타임아웃, 에러 핸들러) |
| **ApiClientErrorHandler** | HTTP 에러 응답을 파싱하여 `ApiClientException`으로 변환 |
| **ApiClientProperties** | 타임아웃 설정 (connect: 5초, read: 30초 기본값) |

### ApiClient 핵심 코드

```kotlin
class ApiClient(
    @PublishedApi internal val restClient: RestClient,
    @PublishedApi internal val objectMapper: ObjectMapper,
    @PublishedApi internal val baseUrl: String,
    @PublishedApi internal val clientRegistrationId: String
) {
    companion object {
        private const val K_SESSION_ID = "KSESSIONID"
    }

    inline fun <reified T : Any> get(path: String, session: Session? = null): T? {
        return restClient.get()
            .uri("$baseUrl$path")
            .applyAuth(session)
            .retrieve()
            .body(typeRef<T>())
    }

    inline fun <reified T : Any> post(path: String, body: Any?, session: Session? = null): T? {
        return restClient.post()
            .uri("$baseUrl$path")
            .applyAuthForBody(session)
            .contentType(MediaType.APPLICATION_JSON)
            .body(body ?: "")
            .retrieve()
            .body(typeRef<T>())
    }
}
```

### 주요 코틀린 문법

**`inline` + `reified`** — 제네릭 타입 정보를 런타임에 보존한다. Java에서는 type erasure로 불가능한 것을 코틀린에서 해결한다.

```kotlin
// 코틀린: 타입만 명시하면 됨
val user = apiClient.get<User>("/users/1", session)

// Java였다면: Class 파라미터를 직접 넘겨야 함
// apiClient.get("/users/1", User.class, session)
```

**`@PublishedApi internal`** — `internal`(모듈 내 접근)이지만, `inline` 함수에서 사용되므로 `@PublishedApi`로 외부 인라이닝을 허용한다.

**확장 함수** — 원본 클래스를 수정하지 않고 메서드를 추가한다.

```kotlin
// RestClient.RequestHeadersSpec에 applyAuth 메서드 추가
internal fun RestClient.RequestHeadersSpec<*>.applyAuth(session: Session?): RestClient.RequestHeadersSpec<*> {
    attributes(clientRegistrationId(clientRegistrationId))
    if (session != null) {
        headers { addSessionHeaders(it, session) }
    }
    return this
}
```

**super type token 패턴** — 익명 객체로 제네릭 타입 정보를 보존한다.

```kotlin
internal inline fun <reified T : Any> typeRef(): ParameterizedTypeReference<T> {
    return object : ParameterizedTypeReference<T>() {}
}
```

### CommonsClientConfig

```kotlin
class CommonsClientConfig(
    private val objectMapper: ObjectMapper,
    private val apiClientProperties: ApiClientProperties
) {
    @Bean
    fun restClient(
        clientHttpRequestFactory: ClientHttpRequestFactory,
        authorizedClientManager: OAuth2AuthorizedClientManager?  // nullable
    ): RestClient {
        val builder = RestClient.builder()
            .requestFactory(clientHttpRequestFactory)
            .defaultStatusHandler({ status -> status.isError }) { _, response ->
                errorHandler.handleError(response)
            }

        // OAuth2 설정이 있을 때만 인터셉터 추가
        authorizedClientManager?.let {
            builder.requestInterceptor(OAuth2ClientHttpRequestInterceptor(it))
        }

        return builder.build()
    }
}
```

`OAuth2AuthorizedClientManager?`가 nullable인 이유: OAuth2 설정이 없는 서비스에서도 RestClient를 사용할 수 있도록 하기 위해서다.

---

## commons-web-server (요청 수신)

Servlet + Reactive 듀얼 스택을 지원하며 4가지 영역으로 나뉜다.

### 세션 관리

| 클래스 | 역할 |
|--------|------|
| SessionLoadInterceptor/Filter | 쿠키 → 헤더 → JWT 순으로 KSESSIONID 추출/복호화 |
| RequireSessionInterceptor/Filter | `@RequireSession`으로 brand/sessionType 권한 검증 |
| SessionArgumentResolver | 컨트롤러 파라미터에 Session 자동 주입 |

### Strapi 스타일 쿼리 처리

| 클래스 | 역할 |
|--------|------|
| StrapiQueryParser | `filters[field][$eq]=value` → FilterNode 트리 파싱 |
| FilterOperator | 19개 연산자 ($eq, $in, $contains, $between 등) |
| JooqQueryBuilder | FilterNode → jOOQ Condition 변환 |
| MybatisQueryBuilder | FilterNode → MyBatis SQL WHERE절 변환 |

### 기타

| 클래스 | 역할 |
|--------|------|
| JwtHelper | RSA-256 기반 JWT 생성/검증 |
| RequestTimingInterceptor/Filter | 요청 소요시간 → `X-KNET-DURATION` 헤더 |
| GlobalExceptionHandler | 예외 → ErrorResponse 포맷팅 |

---

## OAuth2 + JWT 인증 흐름

### 1. 토큰 발급 (auth 서버)

서비스가 다른 서비스를 호출하려면 먼저 auth 서버에서 JWT 토큰을 발급받아야 한다.

#### application.yml 설정 (클라이언트 쪽)

```yaml
spring:
  security:
    oauth2:
      client:
        provider:
          knet:
            token-uri: http://localhost:8082/auth/oauth/token
        registration:
          knet:                                    # ← clientRegistrationId("knet")이 이 설정을 찾음
            authorization-grant-type: client_credentials
            client-id: message-scheduler
            scopes: scheduler
```

#### auth 서버의 클라이언트 검증

클라이언트 정보는 DB의 `oauth_client_details` 테이블에 저장되어 있다.

```sql
CREATE TABLE "oauth_client_details" (
    "client_id"               VARCHAR(256) PRIMARY KEY,  -- "message-scheduler"
    "client_secret"           VARCHAR(256),
    "scope"                   VARCHAR(256),               -- "scheduler"
    "authorized_grant_types"  VARCHAR(256),               -- "client_credentials"
    "access_token_validity"   INT,                        -- 토큰 만료 시간(초)
    "additional_information"  VARCHAR(4096),              -- Session 메타 정보 JSON
    ...
);
```

`additional_information` 컬럼에 세션 메타 정보가 JSON으로 들어있다.

```json
{"sessionType": "MANAGER", "brand": "BAROBILL", "identifierType": "ID"}
```

#### JWT 토큰 생성 과정 (3단계)

**Step 1. RSA 키 쌍 준비** — `AuthorizationConfig`

```java
@Bean
public JwtAccessTokenConverter jwtAccessTokenConverter() {
    KeyPair keyPair = OAuth2Util.getKeyPair();  // JKS 파일에서 RSA 키 쌍 로드
    JwtAccessTokenConverter converter = new JwtAccessTokenConverter();
    converter.setKeyPair(keyPair);              // 개인키로 서명, 공개키로 검증
    return converter;
}
```

**Step 2. 토큰에 Session 정보 추가** — `CustomTokenEnhancer`

sessionType에 따라 다른 정보를 JWT claims에 넣는다.

```java
public OAuth2AccessToken enhance(OAuth2AccessToken accessToken, OAuth2Authentication authentication) {
    UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

    switch (userDetails.getSessionType()) {
        case MANAGER:
            session = Session.builder()
                .brand(...)
                .product(...)
                .doSessionType(userDetails.getSessionType())
                .doSessionSeq(userDetails.getManager().getManagerSeq())
                .doIp(...)
                .build();
            break;
        case PARTNER:
            session = Session.builder()
                .partnerSeq(userDetails.getPartnerUser().getPartnerSeq())
                // 대리 로그인 지원
                .doSessionType(userDetails.getDoSessionType() != null
                    ? userDetails.getDoSessionType() : userDetails.getSessionType())
                .doSessionSeq(userDetails.getDoSessionSeq() != null
                    ? userDetails.getDoSessionSeq() : userDetails.getPartnerUser().getPartnerSeq())
                .build();
            break;
        case USER:
            session = Session.builder()
                .memberSeq(userDetails.getUser().getMemberSeq())
                .userSeq(userDetails.getUser().getUserSeq())
                .build();
            break;
    }

    // JWT claims에 session JSON 추가
    Map<String, Object> additionalInfo = Maps.newHashMap();
    additionalInfo.put("session", objectMapper.writeValueAsString(session));
    ((DefaultOAuth2AccessToken) accessToken).setAdditionalInformation(additionalInfo);
    return accessToken;
}
```

| 세션 타입 | 핵심 필드 |
|-----------|----------|
| MANAGER | `managerSeq` |
| PARTNER | `partnerSeq` + 대리 로그인 (`doSessionType/doSessionSeq`) |
| USER | `memberSeq` + `userSeq` + 대리 로그인 |

**Step 3. 토큰 체인 실행** — `AuthorizationConfig`

```java
TokenEnhancerChain tokenEnhancerChain = new TokenEnhancerChain();
tokenEnhancerChain.setTokenEnhancers(
    Lists.newArrayList(customTokenEnhancer, jwtAccessTokenConverter())
);
//                    ↑ (1) Session 추가     ↑ (2) RSA 서명 → JWT 변환
```

순서: 기본 토큰 → Session claim 추가 → RSA 서명 → JWT 문자열

#### 최종 JWT 토큰 구조

```
eyJhbGciOiJSUzI1NiJ9.eyJzZXNzaW9uIjoie...}.서명값

┌─ Header ──────────────────────────┐
│ { "alg": "RS256" }                │  RSA-SHA256 서명
└───────────────────────────────────┘
┌─ Payload (Claims) ────────────────┐
│ {                                 │
│   "client_id": "message-scheduler"│  Spring이 자동으로 넣음
│   "scope": ["scheduler"],         │
│   "exp": 1711382400,              │  만료 시간
│   "jti": "abc-123-...",           │  토큰 고유 ID
│   "session": "{                   │  CustomTokenEnhancer가 넣음
│     \"brand\": \"BAROBILL\",      │
│     \"product\": \"message-...\", │
│     \"partnerSeq\": 12345,        │
│     \"doSessionType\": \"USER\",  │
│     \"doIp\": \"192.168.1.1\"     │
│   }"                              │
│ }                                 │
└───────────────────────────────────┘
┌─ Signature ───────────────────────┐
│ RSA 개인키로 서명된 값             │  위변조 방지
└───────────────────────────────────┘
```

---

### 2. 서비스 간 통신 전체 흐름

```
message-scheduler 서비스                    auth 서버 (localhost:8082)
─────────────────────                      ──────────────────────────

ApiClient 요청 발생
  ↓
clientRegistrationId("knet")
  ↓ yml에서 설정 조회
  ↓
POST /auth/oauth/token
  grant_type=client_credentials
  client_id=message-scheduler     ────→  1. oauth_client_details 테이블 조회
  scope=scheduler                        2. client_id 검증
                                         3. CustomTokenEnhancer로 Session 추가
                                         4. RSA 서명 → JWT 반환
  ↓                               ←────
Authorization: Bearer eyJhbG...
  + KSESSIONID: AES암호화된Session
  ↓
상대 서비스 (Resource Server)
  ↓
SessionLoadFilter
  → 쿠키/헤더/JWT에서 KSESSIONID 추출
  → AES 복호화 → Session 객체 복원
  ↓
RequireSessionInterceptor
  → @RequireSession 어노테이션 검사
  → brand/sessionType 권한 검증
  ↓
Controller (Session 자동 주입)
  → StrapiQuery 파싱
  → 비즈니스 로직 처리
  → 응답 반환
```

### 3. 설정이 없을 때

| 상황 | 결과 |
|------|------|
| yml에 OAuth2 설정 자체가 없음 | `OAuth2AuthorizedClientManager`가 null → 인터셉터 안 붙음 → 토큰 없이 요청 → **401** |
| yml은 있는데 `"knet"` registration이 없음 | 런타임에 찾을 수 없음 → **OAuth2AuthorizationException** |
| DB에 `client_id`가 없음 | auth 서버가 인증 거부 → **401** |
| `token-uri`가 틀림 | 토큰 발급 요청 실패 → **연결 에러** |

---

## 요약

```
┌─ yml 설정 ─────────────────────────┐
│ registration.knet                  │──→ "나는 누구인가"
│   client-id: message-scheduler     │
│   token-uri: .../auth/oauth/token  │──→ "토큰을 어디서 받는가"
└────────────────────────────────────┘
              ↓
┌─ auth 서버 DB ─────────────────────┐
│ oauth_client_details 테이블        │──→ "이 클라이언트가 유효한가"
│   client_id = message-scheduler    │
│   additional_information = {...}   │──→ "JWT에 뭘 넣어줄 것인가"
└────────────────────────────────────┘
              ↓
┌─ JWT 토큰 ─────────────────────────┐
│ { session: {brand, product,        │──→ 상대 서비스가 이걸 읽어서 인증/인가
│   sessionType, ...} }              │
└────────────────────────────────────┘
```

commons는 **공통 뼈대**, 도메인 모듈은 **비즈니스 핵심**, api 모듈은 **실행 가능한 애플리케이션**. 이 3계층이 하나의 서비스를 이루고, auth 서버가 OAuth2 토큰을 발급하여 서비스 간 신뢰를 보장한다.
