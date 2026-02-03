---
layout: post
title: Spring MSA 환경에서 OAuth2 + Session 전파 구조
tags: [ spring, msa, oauth2, security ]
---

## MSA에서 Session 전파 문제

모놀리식 아키텍처에서는 하나의 서버가 세션을 관리하면 된다. 하지만 MSA 환경에서는 여러 서비스가 독립적으로 동작하므로, 서비스 간 호출 시 **Session 정보를 어떻게 전달할 것인가**가 문제가 된다.

이 글에서는 OAuth2 JWT 토큰에 Session 정보를 담아 전파하는 구조를 설명한다.

---

## 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  batch-service (요청하는 쪽 - Client)                                        │
│                                                                             │
│  AbstractOAuth2ClientConfig                                                 │
│  └─ WebClient + OAuth2 Filter                                               │
│     └─ 자동으로 JWT 토큰 발급/갱신                                            │
│     └─ JWT에 Session 정보 포함                                               │
└─────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        │ HTTP               │ HTTP               │ HTTP
        │ Authorization:     │ Authorization:     │ Authorization:
        │ Bearer {JWT}       │ Bearer {JWT}       │ Bearer {JWT}
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  user-service│    │ order-service│    │  file-service    │
│  (Server)    │    │  (Server)    │    │  (Server)        │
│              │    │              │    │                  │
│ OAuth2Api    │    │ OAuth2Api    │    │ OAuth2Api        │
│ WebMvcConfig │    │ WebMvcConfig │    │ WebMvcConfig     │
│      ↓       │    │      ↓       │    │      ↓           │
│ JWT에서      │    │ JWT에서      │    │ JWT에서          │
│ Session 추출 │    │ Session 추출 │    │ Session 추출     │
└──────────────┘    └──────────────┘    └──────────────────┘
```

---

## Client 측 구현

### AbstractOAuth2ClientConfig

OAuth2 토큰을 자동으로 발급/갱신하는 WebClient를 생성하는 추상 클래스다.

```kotlin
abstract class AbstractOAuth2ClientConfig {

    // 서브클래스에서 구현
    protected abstract fun getRegistrationId(): String  // 클라이언트 식별자
    protected abstract fun getTokenUri(): String        // 토큰 발급 URL
    protected abstract fun getClientId(): String        // OAuth2 Client ID
    protected abstract fun getScopes(): String          // 권한 범위

    @Bean
    open fun clientRegistrations(): ReactiveClientRegistrationRepository {
        return InMemoryReactiveClientRegistrationRepository(
            ClientRegistration
                .withRegistrationId(getRegistrationId())
                .tokenUri(getTokenUri())
                .clientId(getClientId())
                .scope(*getScopes().split(",").toTypedArray())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                .build()
        )
    }

    protected fun buildOAuth2WebClient(
        baseUrl: String,
        connectTimeoutMillis: Int? = null,
        readTimeoutMillis: Int? = null,
        writeTimeoutMillis: Int? = null
    ): WebClient {
        val oauth = ServerOAuth2AuthorizedClientExchangeFilterFunction(
            AuthorizedClientServiceReactiveOAuth2AuthorizedClientManager(
                clientRegistrations(),
                internalAuthorizedClientService()
            )
        )
        oauth.setDefaultClientRegistrationId(getRegistrationId())

        val webClientBuilder = WebClient.builder()
            .baseUrl(baseUrl)
            .filter(oauth)  // 모든 요청에 자동으로 Bearer 토큰 추가
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)

        // 타임아웃 설정 (선택)
        if (connectTimeoutMillis != null && readTimeoutMillis != null && writeTimeoutMillis != null) {
            webClientBuilder.clientConnector(
                ReactorClientHttpConnector(
                    HttpClient.create()
                        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeoutMillis)
                        .doOnConnected { connection ->
                            connection.addHandlerFirst(ReadTimeoutHandler(readTimeoutMillis.toLong(), TimeUnit.MILLISECONDS))
                            connection.addHandlerFirst(WriteTimeoutHandler(writeTimeoutMillis.toLong(), TimeUnit.MILLISECONDS))
                        }
                )
            )
        }

        return webClientBuilder.build()
    }
}
```

### 실제 구현 클래스

```kotlin
@Configuration
class BatchOAuth2ClientConfig : AbstractOAuth2ClientConfig() {

    @Value("\${spring.security.oauth2.client.provider.internal.token-uri}")
    private lateinit var tokenUri: String

    @Value("\${spring.security.oauth2.client.registration.internal.client-id}")
    private lateinit var clientId: String

    @Value("\${spring.security.oauth2.client.registration.internal.scope}")
    private lateinit var scope: String

    override fun getRegistrationId(): String = "internal"
    override fun getTokenUri(): String = tokenUri
    override fun getClientId(): String = clientId
    override fun getScopes(): String = scope

    @Bean
    fun userApiRequester(jsonMapper: JsonMapper, properties: ApiProperties): ApiRequester =
        ApiRequester(buildOAuth2WebClient(properties.user.url), jsonMapper)

    @Bean
    fun orderApiRequester(jsonMapper: JsonMapper, properties: ApiProperties): ApiRequester =
        ApiRequester(buildOAuth2WebClient(properties.order.url), jsonMapper)
}
```

### WebClient 동작 흐름

```
WebClient.get("/api/users").retrieve()
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ServerOAuth2AuthorizedClientExchangeFilterFunction             │
│                                                                  │
│  1. 캐시된 토큰 확인                                             │
│     └─ 있고 유효함 → 사용                                        │
│     └─ 없거나 만료 → Token URI로 새 토큰 요청                    │
│                                                                  │
│  2. Authorization: Bearer {JWT} 헤더 추가                        │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
HTTP Request → user-service 서버
```

---

## Server 측 구현

### 상속 구조

```
WebMvcConfigurer (Spring 인터페이스)
        △
        │
ApiWebMvcConfig
   └─ SessionLoadInterceptor (헤더에서 Session 추출)
   └─ ExceptionHandler들
        △
        │ 오버라이드
        │
OAuth2ApiWebMvcConfig
   └─ OAuth2SessionLoadInterceptor (JWT에서 Session 추출)
        △
        │
UserApiWebMvcConfig (실제 사용)
```

### ApiWebMvcConfig

기본 API 설정 클래스. 헤더에서 Session을 추출한다.

```kotlin
open class ApiWebMvcConfig : WebMvcConfigurer {

    @Bean
    open fun sessionLoadInterceptor(): SessionLoadInterceptor = SessionLoadInterceptor()

    @Bean
    open fun requireSessionInterceptor(): RequireSessionInterceptor = RequireSessionInterceptor()

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(sessionLoadInterceptor()).order(0).addPathPatterns("/**")
        registry.addInterceptor(requireSessionInterceptor()).order(0).addPathPatterns("/**")
    }

    // ExceptionHandler들...
    @ExceptionHandler(MethodArgumentNotValidException::class)
    protected fun handleMethodArgumentNotValidException(...): ResponseEntity<ApiResponse<*>> {
        ...
    }

    @ExceptionHandler(BusinessException::class)
    protected fun handleBusinessException(...): ResponseEntity<Any> {
        ...
    }

    @ExceptionHandler(Exception::class)
    open fun handleGlobalException(...): ResponseEntity<ApiResponse<*>> {
        ...
    }
}
```

### OAuth2ApiWebMvcConfig

OAuth2/JWT 기반 API 설정. `addInterceptors()`를 오버라이드하여 JWT에서 Session을 추출한다.

```kotlin
open class OAuth2ApiWebMvcConfig : ApiWebMvcConfig() {

    @Bean
    open fun oauth2SessionLoadInterceptor(): OAuth2SessionLoadInterceptor {
        return OAuth2SessionLoadInterceptor()
    }

    override fun addInterceptors(registry: InterceptorRegistry) {
        // JWT에서 Session 추출하는 인터셉터로 교체
        registry.addInterceptor(oauth2SessionLoadInterceptor()).order(0).addPathPatterns("/**")
        registry.addInterceptor(requireSessionInterceptor()).order(0).addPathPatterns("/**")
    }
}
```

### OAuth2SessionLoadInterceptor

JWT 토큰에서 Session 정보를 추출하는 인터셉터.

```kotlin
class OAuth2SessionLoadInterceptor : SessionLoadInterceptor(), HandlerInterceptor {

    override fun preHandle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any
    ): Boolean {
        // 부모 클래스의 preHandle 먼저 실행 (헤더에서 Session 추출 시도)
        super<SessionLoadInterceptor>.preHandle(request, response, handler)

        var session = request.getAttribute(REQ_ATTR_SESSION) as? Session

        // Request에 Session이 없으면 JWT에서 추출
        if (session == null) {
            val authentication = SecurityContextHolder.getContext().authentication

            if (authentication is JwtAuthenticationToken) {
                val jwt: Jwt = authentication.token
                val sessionClaim = jwt.getClaimAsString("session")

                if (sessionClaim != null) {
                    session = objectMapper.readValue(sessionClaim, Session::class.java)
                    session.doDT = LocalDateTime.now()

                    request.setAttribute(REQ_ATTR_SESSION, session)
                }
            }
        }

        return true
    }
}
```

### 실제 사용

```kotlin
@Configuration
@ControllerAdvice  // ExceptionHandler 활성화
class UserApiWebMvcConfig : OAuth2ApiWebMvcConfig()
```

---

## 인터셉터 역할 분리

### 왜 인터셉터가 2개인가?

```kotlin
override fun addInterceptors(registry: InterceptorRegistry) {
    registry.addInterceptor(oauth2SessionLoadInterceptor()).order(0).addPathPatterns("/**")
    registry.addInterceptor(requireSessionInterceptor()).order(0).addPathPatterns("/**")
}
```

| 인터셉터                           | 역할                                       |
|--------------------------------|------------------------------------------|
| `OAuth2SessionLoadInterceptor` | Session **추출** (JWT → request attribute) |
| `RequireSessionInterceptor`    | Session **검증** (`@RequireSession` 체크)    |

### 단일 책임 원칙 (SRP)

```
OAuth2SessionLoadInterceptor → 추출만 담당 (Session 없어도 통과)
RequireSessionInterceptor    → 검증만 담당 (@RequireSession 있을 때만 체크)
```

### RequireSessionInterceptor 코드

```kotlin
class RequireSessionInterceptor : HandlerInterceptor {

    override fun preHandle(request, response, handler): Boolean {
        if (handler !is HandlerMethod) return true  // Controller 아니면 통과

        // @RequireSession 어노테이션 확인 (메서드 또는 클래스)
        val required = handler.hasMethodAnnotation(RequireSession::class.java) ||
                handler.beanType.isAnnotationPresent(RequireSession::class.java)

        if (!required) return true  // 어노테이션 없으면 통과

        // Session 없으면 401 에러
        request.getAttribute("session") as? Session
            ?: throw BusinessException(DefaultErrorCode.UNAUTHORIZED)

        return true
    }
}
```

### 인터셉터 실행 흐름

```
요청 도착
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  OAuth2SessionLoadInterceptor                                    │
│                                                                  │
│  - JWT에서 session claim 추출                                    │
│  - request.setAttribute("session", session)                     │
│  - Session 없어도 통과 (추출만 담당)                              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  RequireSessionInterceptor                                       │
│                                                                  │
│  - @RequireSession 어노테이션 확인                               │
│  - 어노테이션 있으면 → Session 필수 체크                          │
│  - Session 없으면 → 401 UNAUTHORIZED 에러                        │
│  - 어노테이션 없으면 → 그냥 통과                                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
Controller
```

### @RequireSession 사용 예시

```kotlin
// 클래스 레벨 - 모든 메서드에 Session 필수
@RestController
@RequireSession
class OrderController {

    @GetMapping("/api/orders")
    fun getOrders(): List<Order> {
        ...
    }  // Session 필수

    @GetMapping("/api/orders/{id}")
    fun getOrder(@PathVariable id: Long): Order {
        ...
    }  // Session 필수
}

// 메서드 레벨 - 특정 메서드만 Session 필수
@RestController
class PublicController {

    @GetMapping("/api/health")
    fun health(): String = "OK"  // Session 불필요

    @RequireSession
    @GetMapping("/api/me")
    fun getMe(): User {
        ...
    }  // Session 필수
}
```

### 분리의 장점

**1. 유연한 조합**

```kotlin
// Session 추출만 필요한 경우 (검증 없이)
registry.addInterceptor(oauth2SessionLoadInterceptor())

// Session 필수인 경우
registry.addInterceptor(oauth2SessionLoadInterceptor())
registry.addInterceptor(requireSessionInterceptor())
```

**2. 선택적 검증**

```kotlin
// 공개 API - Session 있으면 사용, 없어도 OK
@GetMapping("/api/products")
fun getProducts(session: Session?): List<Product> {
    // session이 null일 수 있음
}

// 인증 필수 API - Session 없으면 401
@RequireSession
@GetMapping("/api/orders")
fun getOrders(session: Session): List<Order> {
    // session이 반드시 있음
}
```

---

## 요청 처리 흐름

```
1. batch-service가 user-service API 호출
   │
   ▼
2. WebClient의 OAuth2 Filter
   - Auth Server에서 JWT 토큰 발급
   - JWT에 Session 정보 포함 (claim)
   │
   ▼
3. HTTP 요청 전송
   Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
   │
   ▼
4. user-service 서버 수신
   │
   ▼
5. Spring Security Filter
   - JWT 서명 검증
   - SecurityContextHolder에 JwtAuthenticationToken 저장
   │
   ▼
6. OAuth2SessionLoadInterceptor.preHandle()
   - SecurityContext에서 JWT 가져옴
   - JWT의 "session" claim 추출
   - JSON → Session 객체 변환
   - request.setAttribute("session", session)
   │
   ▼
7. RequireSessionInterceptor.preHandle()
   - @RequireSession 체크
   │
   ▼
8. Controller
   - Session 사용 가능
```

---

## JWT 토큰 구조

```json
{
  "sub": "batch-service",
  "scope": [
    "user:read",
    "user:write"
  ],
  "session": "{\"companyId\":100,\"userId\":200}",
  "iat": 1699999000,
  "exp": 1699999999
}
```

| 필드        | 설명                    |
|-----------|-----------------------|
| `sub`     | 클라이언트 식별자             |
| `scope`   | 권한 범위                 |
| `session` | Session 정보 (JSON 문자열) |
| `iat`     | 발급 시간                 |
| `exp`     | 만료 시간                 |

---

## @Configuration vs @ControllerAdvice

| 어노테이션               | 역할               | 동작하는 것            |
|---------------------|------------------|-------------------|
| `@Configuration`    | Bean 등록, 인터셉터 등록 | Interceptor       |
| `@ControllerAdvice` | 예외 처리 활성화        | @ExceptionHandler |

```kotlin
// 인터셉터만 동작
@Configuration
class UserApiWebMvcConfig : OAuth2ApiWebMvcConfig()

// 인터셉터 + 예외 처리 둘 다 동작
@Configuration
@ControllerAdvice
class UserApiWebMvcConfig : OAuth2ApiWebMvcConfig()
```

---

## 정리

### Client 측 (요청하는 쪽)

| 클래스                          | 역할                            |
|------------------------------|-------------------------------|
| `AbstractOAuth2ClientConfig` | OAuth2 WebClient 생성, 토큰 자동 발급 |
| `BatchOAuth2ClientConfig`    | 실제 구현, API별 WebClient Bean 등록 |

### Server 측 (요청받는 쪽)

| 클래스                            | 역할                          |
|--------------------------------|-----------------------------|
| `ApiWebMvcConfig`              | 기본 WebMvc 설정, 헤더 기반 Session |
| `OAuth2ApiWebMvcConfig`        | JWT 기반 Session으로 오버라이드      |
| `OAuth2SessionLoadInterceptor` | JWT에서 Session claim 추출      |

### 핵심 포인트

1. **토큰 자동 관리**: Client의 WebClient가 토큰 발급/갱신/캐싱을 자동으로 처리
2. **Session 전파**: JWT의 claim에 Session 정보를 JSON으로 담아 전달
3. **투명한 추출**: Server의 Interceptor가 자동으로 Session 추출하여 Controller에서 사용 가능
4. **상속 구조**: 공통 로직은 상위 클래스에, 환경별 설정은 하위 클래스에서 오버라이드
