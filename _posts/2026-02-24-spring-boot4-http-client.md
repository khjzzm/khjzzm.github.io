---
layout: post
title: Spring Boot 4 HTTP 클라이언트 완전 가이드 - RestClient, WebClient, @HttpExchange
tags: [ spring, kotlin ]
---

Spring Boot 4에서 외부 API를 호출하는 방법은 세 가지다. RestClient, WebClient, @HttpExchange. 각각 설계 철학이 다르고, 적합한 상황이 다르다. 이 글에서는 세 가지를 설정부터 에러 핸들링, 테스트, 프로덕션 운영까지 전부 다룬다.

## 세 가지 방식 한눈에 비교

|            | RestClient                | WebClient                     | @HttpExchange                  |
|------------|---------------------------|-------------------------------|--------------------------------|
| **방식**     | 동기 (블로킹)                  | 비동기 (논블로킹)                    | 선언적 (인터페이스)                    |
| **도입 시점**  | Spring Boot 3.2           | Spring Boot 2.0               | Spring Boot 3.0                |
| **위치**     | Spring Boot 4 **기본 권장**   | 리액티브 스택                       | RestClient 또는 WebClient 위에서 동작 |
| **의존성**    | `spring-boot-starter-web` | `spring-boot-starter-webflux` | 별도 의존성 불필요                     |
| **코드 스타일** | 메서드 체이닝                   | Mono/Flux 리액티브 체이닝            | 인터페이스 + 어노테이션                  |
| **학습 난이도** | 낮음                        | 높음 (리액티브 개념 필요)               | 낮음                             |
| **디버깅**    | 쉬움 (스택트레이스 직관적)           | 어려움 (리액티브 스택트레이스)             | 쉬움                             |
| **적합한 상황** | 일반적인 API 호출               | 스트리밍, SSE, 동시 다건 호출           | 외부 API가 여러 개일 때                |

### 선택 기준

```
리액티브 스택(WebFlux)을 사용하는가?
  └─ Yes → WebClient
  └─ No → 외부 API 엔드포인트가 많은가?
              └─ Yes → @HttpExchange (인터페이스로 깔끔하게 정리)
              └─ No  → RestClient (가장 단순)
```

**Virtual Threads 환경에서의 선택**: Java 25 + Virtual Threads를 사용하면 동기 코드도 I/O 대기 시 플랫폼 스레드를 반환한다. "비동기 성능이 필요해서" WebClient를 선택할 이유가 대부분 사라진다. 스트리밍이나 SSE 같은 특수한 요구사항이 아니라면 RestClient가 코드도 단순하고 디버깅도 쉽다.

### 같은 API를 세 가지 방식으로 호출하면

외부 사용자 API(`GET /users/{id}`)를 호출하는 코드를 비교해보자.

```kotlin
// 1. RestClient - 가장 직관적
fun getUser(id: Long): User {
    return restClient.get()
        .uri("/users/{id}", id)
        .retrieve()
        .body(User::class.java)!!
}

// 2. WebClient - 리액티브 타입 반환
fun getUser(id: Long): Mono<User> {
    return webClient.get()
        .uri("/users/{id}", id)
        .retrieve()
        .bodyToMono(User::class.java)
}

// 3. @HttpExchange - 인터페이스만 정의
@GetExchange("/users/{id}")
fun getUser(@PathVariable id: Long): User
```

RestClient와 @HttpExchange는 반환 타입이 `User`다. WebClient만 `Mono<User>`를 반환한다. 이 차이가 코드 전체에 영향을 미친다. Service에서 Mono를 다뤄야 하고, 에러 핸들링도 리액티브 방식이어야 한다.

---

## RestClient

### 왜 RestTemplate 대신 RestClient인가

Spring Boot 4에서 RestTemplate은 더 이상 권장하지 않는다. 동작은 하지만 새로운 기능이 추가되지 않는다.

```kotlin
// RestTemplate (레거시) - 응답을 꺼내려면 ResponseEntity를 경유
val response: ResponseEntity<User> = restTemplate.getForEntity("/users/1", User::class.java)
val user = response.body

// RestTemplate (레거시) - 에러 핸들링이 번거롭다
try {
    restTemplate.getForObject("/users/999", User::class.java)
} catch (e: HttpClientErrorException.NotFound) {
    // 404 처리
}

// RestClient - 체이닝으로 깔끔하게
val user = restClient.get()
    .uri("/users/{id}", 1)
    .retrieve()
    .body(User::class.java)

// RestClient - 에러 핸들링도 체이닝
val user = restClient.get()
    .uri("/users/{id}", 999)
    .retrieve()
    .onStatus(HttpStatusCode::is4xxClientError) { _, response ->
        throw UserNotFoundException(999)
    }
    .body(User::class.java)
```

### 설정

```kotlin
@Configuration
class RestClientConfig {

    @Bean
    fun restClient(builder: RestClient.Builder): RestClient {
        return builder
            .baseUrl("https://api.external.com")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
            .requestFactory(clientHttpRequestFactory())
            .build()
    }

    private fun clientHttpRequestFactory(): ClientHttpRequestFactory {
        return JdkClientHttpRequestFactory().apply {
            setReadTimeout(Duration.ofSeconds(5))
        }
    }
}
```

`RestClient.Builder`를 주입받아 사용하는 것이 중요하다. Spring Boot가 Auto-Configuration으로 제공하는 Builder에는 이미 Jackson ObjectMapper, 인터셉터 등이 설정되어 있다. `RestClient.create()`로 직접 생성하면 이런 혜택을 받지 못한다.

### CRUD 전체 예시

```kotlin
@Service
class UserApiClient(
    private val restClient: RestClient
) {

    // GET - 단건 조회
    fun getUser(id: Long): User {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .body(User::class.java)!!
    }

    // GET - 목록 조회 (제네릭 타입)
    fun getUsers(page: Int, size: Int): List<User> {
        return restClient.get()
            .uri("/users?page={page}&size={size}", page, size)
            .retrieve()
            .body(object : ParameterizedTypeReference<List<User>>() {})!!
    }

    // POST - 생성
    fun createUser(request: CreateUserRequest): User {
        return restClient.post()
            .uri("/users")
            .body(request)
            .retrieve()
            .body(User::class.java)!!
    }

    // PUT - 수정
    fun updateUser(id: Long, request: UpdateUserRequest): User {
        return restClient.put()
            .uri("/users/{id}", id)
            .body(request)
            .retrieve()
            .body(User::class.java)!!
    }

    // DELETE - 삭제
    fun deleteUser(id: Long) {
        restClient.delete()
            .uri("/users/{id}", id)
            .retrieve()
            .toBodilessEntity()
    }

    // 응답 헤더가 필요할 때
    fun getUserWithHeaders(id: Long): ResponseEntity<User> {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .toEntity(User::class.java)
    }
}
```

`List<User>` 같은 제네릭 타입은 `ParameterizedTypeReference`를 사용해야 한다. Java의 타입 소거(Type Erasure) 때문에 `List::class.java`로는 내부 타입 정보를 전달할 수 없다.

### 에러 핸들링

```kotlin
fun getUser(id: Long): User? {
    return restClient.get()
        .uri("/users/{id}", id)
        .retrieve()
        .onStatus(HttpStatusCode::is4xxClientError) { request, response ->
            when (response.statusCode) {
                HttpStatus.NOT_FOUND -> throw UserNotFoundException(id)
                HttpStatus.FORBIDDEN -> throw AccessDeniedException("사용자 $id 접근 권한 없음")
                else -> throw ExternalApiException("클라이언트 에러: ${response.statusCode}")
            }
        }
        .onStatus(HttpStatusCode::is5xxServerError) { _, response ->
            throw ExternalApiException("외부 API 서버 에러: ${response.statusCode}")
        }
        .body(User::class.java)
}
```

`onStatus`를 설정하지 않으면 4xx/5xx 응답 시 `RestClientResponseException`이 발생한다. 이것을 글로벌 예외 핸들러에서 잡아도 되지만, 클라이언트별로 다른 처리가 필요하면 `onStatus`로 변환하는 것이 명확하다.

### 인터셉터 - 공통 로직 주입

모든 요청에 인증 토큰을 넣거나, 로깅을 하거나, 요청/응답을 가공해야 할 때 사용한다.

```kotlin
@Bean
fun restClient(builder: RestClient.Builder): RestClient {
    return builder
        .baseUrl("https://api.external.com")
        .requestInterceptor(loggingInterceptor())
        .requestInterceptor(authInterceptor())
        .requestFactory(clientHttpRequestFactory())
        .build()
}

// 요청/응답 로깅
private fun loggingInterceptor() = ClientHttpRequestInterceptor { request, body, execution ->
    val log = LoggerFactory.getLogger("HttpClient")
    log.debug(">>> {} {}", request.method, request.uri)

    val response = execution.execute(request, body)

    log.debug("<<< {} ({}ms)", response.statusCode, /* elapsed */)
    response
}

// 인증 토큰 주입
private fun authInterceptor() = ClientHttpRequestInterceptor { request, body, execution ->
    request.headers.setBearerAuth(tokenProvider.getAccessToken())
    execution.execute(request, body)
}
```

인터셉터는 등록 순서대로 실행된다. 로깅 → 인증 순서로 등록하면, 로깅에 인증 헤더까지 포함된 요청이 기록된다.

### 타임아웃 설정

타임아웃은 두 가지를 구분해야 한다.

```
[Connection Timeout]
클라이언트 ──── TCP 연결 시도 ────→ 서버
                 ↑
           이 단계에서 대기하는 최대 시간
           (서버가 아예 응답하지 않는 경우)

[Read Timeout]
클라이언트 ←──── 응답 데이터 수신 ──── 서버
                      ↑
                 데이터가 오기까지 대기하는 최대 시간
                 (연결은 됐지만 응답이 늦는 경우)
```

```kotlin
private fun clientHttpRequestFactory(): ClientHttpRequestFactory {
    // JDK HttpClient 사용 (Java 25 권장)
    val httpClient = java.net.http.HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))    // Connection Timeout
        .build()

    return JdkClientHttpRequestFactory(httpClient).apply {
        setReadTimeout(Duration.ofSeconds(5))     // Read Timeout
    }
}
```

**Connection Timeout 3초**: 3초 안에 TCP 연결이 안 되면 서버가 죽었거나 네트워크 문제다. 더 기다릴 이유가 없다.

**Read Timeout 5초**: API 응답이 5초를 넘기면 타임아웃. 외부 API의 SLA에 따라 조정한다. 결제 API처럼 느릴 수 있는 경우 10~15초로 늘릴 수 있지만, 기본값은 5초가 적당하다.

---

## WebClient

### 언제 WebClient를 써야 하는가

Virtual Threads 시대에 WebClient를 선택해야 하는 명확한 이유가 있는 경우만 사용한다.

```
[WebClient가 필요한 경우]
1. 여러 외부 API를 동시에 호출하고 결과를 합쳐야 할 때
2. SSE(Server-Sent Events) 스트리밍 수신
3. 이미 리액티브 스택(WebFlux)을 사용하는 프로젝트
4. 응답을 스트림으로 처리해야 할 때 (대용량 JSON 등)

[WebClient가 필요하지 않은 경우]
1. 일반적인 REST API 호출 → RestClient
2. "비동기라서 성능이 좋을 것 같아서" → Virtual Threads가 해결
3. 단순히 최신 기술을 쓰고 싶어서 → 복잡도만 증가
```

### 설정

```kotlin
@Configuration
class WebClientConfig {

    @Bean
    fun webClient(builder: WebClient.Builder): WebClient {
        return builder
            .baseUrl("https://api.external.com")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .clientConnector(
                ReactorClientHttpConnector(
                    HttpClient.create()
                        .responseTimeout(Duration.ofSeconds(5))
                        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3000)
                )
            )
            .codecs { configurer ->
                configurer.defaultCodecs().maxInMemorySize(2 * 1024 * 1024) // 2MB
            }
            .build()
    }
}
```

`maxInMemorySize`는 응답 본문의 최대 버퍼 크기다. 기본값은 256KB인데, 큰 JSON 응답을 받으면 `DataBufferLimitException`이 발생한다. 필요에 따라 늘리되, 무제한(`-1`)은 메모리 폭주 위험이 있으므로 피한다.

### 동시 호출 - WebClient의 진짜 강점

3개의 외부 API를 호출해야 하는 상황:

```kotlin
// RestClient - 순차 실행 (총 650ms)
fun getUserDashboard(userId: Long): DashboardDto {
    val user = restClient.get().uri("/users/{id}", userId)       // 200ms
        .retrieve().body(User::class.java)!!
    val orders = restClient.get().uri("/users/{id}/orders", userId) // 300ms
        .retrieve().body(object : ParameterizedTypeReference<List<Order>>() {})!!
    val points = restClient.get().uri("/users/{id}/points", userId) // 150ms
        .retrieve().body(Points::class.java)!!

    return DashboardDto(user, orders, points)
    // 총: 200 + 300 + 150 = 650ms (순차)
}

// WebClient - 동시 실행 (총 300ms)
fun getUserDashboard(userId: Long): DashboardDto {
    val userMono = webClient.get().uri("/users/{id}", userId)
        .retrieve().bodyToMono(User::class.java)                   // 200ms ─┐
    val ordersMono = webClient.get().uri("/users/{id}/orders", userId)       // │
        .retrieve().bodyToFlux(Order::class.java).collectList()    // 300ms ─┤ 동시
    val pointsMono = webClient.get().uri("/users/{id}/points", userId)       // │
        .retrieve().bodyToMono(Points::class.java)                 // 150ms ─┘

    return Mono.zip(userMono, ordersMono, pointsMono)
        .map { (user, orders, points) -> DashboardDto(user, orders, points) }
        .block()!!
    // 총: max(200, 300, 150) = 300ms (동시)
}
```

```
[순차 실행 - RestClient]
user   |████████████████████|                                    200ms
orders                       |██████████████████████████████|    300ms
points                                                       |██████████| 150ms
                                                              총 650ms

[동시 실행 - WebClient]
user   |████████████████████|                                    200ms
orders |██████████████████████████████|                          300ms
points |██████████|                                              150ms
                              총 300ms (가장 느린 요청 기준)
```

650ms와 300ms. 차이가 크다. 외부 API 호출이 3~5개 이상이면 WebClient의 동시 호출이 체감될 정도의 차이를 만든다.

> 참고: Virtual Threads + RestClient 조합에서도 `StructuredTaskScope`를 사용하면 동시 호출이 가능하다. 하지만 아직 preview 기능이고, WebClient의 `Mono.zip`이 더 성숙한 방식이다.

### 에러 핸들링

```kotlin
fun getUser(id: Long): User {
    return webClient.get()
        .uri("/users/{id}", id)
        .retrieve()
        .onStatus({ it.is4xxClientError }) { response ->
            response.bodyToMono(String::class.java)
                .flatMap { body ->
                    Mono.error(ExternalApiException("4xx 에러: $body"))
                }
        }
        .onStatus({ it.is5xxServerError }) { response ->
            Mono.error(ExternalApiException("외부 서버 에러: ${response.statusCode()}"))
        }
        .bodyToMono(User::class.java)
        .timeout(Duration.ofSeconds(5))
        .retryWhen(
            Retry.backoff(3, Duration.ofMillis(500))
                .filter { it is WebClientResponseException.ServiceUnavailable }
                .onRetryExhaustedThrow { _, signal ->
                    ExternalApiException("3회 재시도 후에도 실패", signal.failure())
                }
        )
        .block()!!
}
```

WebClient의 에러 핸들링은 리액티브 체이닝으로 구성된다. `.timeout()`, `.retryWhen()` 같은 연산자를 체이닝으로 붙일 수 있는 것이 장점이다.

### 스트리밍 수신 (SSE)

WebClient만 가능한 기능이다.

```kotlin
// Server-Sent Events 수신
fun subscribeToEvents(): Flux<ServerEvent> {
    return webClient.get()
        .uri("/events/stream")
        .accept(MediaType.TEXT_EVENT_STREAM)
        .retrieve()
        .bodyToFlux(ServerEvent::class.java)
}

// 사용
subscribeToEvents()
    .doOnNext { event -> log.info("이벤트 수신: {}", event) }
    .doOnError { error -> log.error("스트림 에러", error) }
    .subscribe()
```

---

## @HttpExchange

### 왜 인터페이스 기반인가

외부 API가 10개, 20개의 엔드포인트를 가지고 있으면 RestClient로 일일이 작성하는 것은 반복 작업이다.

```kotlin
// RestClient 방식 - 엔드포인트마다 비슷한 코드 반복
@Service
class UserApiClient(private val restClient: RestClient) {
    fun getUser(id: Long): User = restClient.get().uri("/users/{id}", id).retrieve().body(User::class.java)!!
    fun createUser(req: CreateUserRequest): User = restClient.post().uri("/users").body(req).retrieve().body(User::class.java)!!
    fun updateUser(id: Long, req: UpdateUserRequest): User = restClient.put().uri("/users/{id}", id).body(req).retrieve().body(User::class.java)!!
    fun deleteUser(id: Long) = restClient.delete().uri("/users/{id}", id).retrieve().toBodilessEntity()
    fun getUsers(page: Int): List<User> = restClient.get().uri("/users?page={page}", page).retrieve().body(object : ParameterizedTypeReference<List<User>>() {})!!
}

// @HttpExchange 방식 - 인터페이스만 정의하면 끝
@HttpExchange("/users")
interface UserClient {
    @GetExchange("/{id}")
    fun getUser(@PathVariable id: Long): User

    @PostExchange
    fun createUser(@RequestBody request: CreateUserRequest): User

    @PutExchange("/{id}")
    fun updateUser(@PathVariable id: Long, @RequestBody request: UpdateUserRequest): User

    @DeleteExchange("/{id}")
    fun deleteUser(@PathVariable id: Long)

    @GetExchange
    fun getUsers(@RequestParam page: Int): List<User>
}
```

@HttpExchange의 장점:

1. **코드가 적다**: URI 조합, retrieve, body 변환 코드가 전부 사라진다
2. **계약이 명확하다**: 인터페이스만 보면 어떤 API를 호출하는지 한눈에 파악된다
3. **Spring MVC와 대칭**: `@GetMapping` ↔ `@GetExchange`, `@PostMapping` ↔ `@PostExchange`
4. **테스트가 쉽다**: 인터페이스이므로 Mock 구현이 간단하다

### 설정

```kotlin
@Configuration
class HttpServiceConfig {

    @Bean
    fun userClient(restClientBuilder: RestClient.Builder): UserClient {
        val restClient = restClientBuilder
            .baseUrl("https://api.user-service.com")
            .requestFactory(clientHttpRequestFactory())
            .build()

        val factory = HttpServiceProxyFactory
            .builderFor(RestClientAdapter.create(restClient))
            .build()

        return factory.createClient(UserClient::class.java)
    }

    @Bean
    fun paymentClient(restClientBuilder: RestClient.Builder): PaymentClient {
        val restClient = restClientBuilder
            .baseUrl("https://api.payment-service.com")
            .requestFactory(clientHttpRequestFactory())
            .build()

        val factory = HttpServiceProxyFactory
            .builderFor(RestClientAdapter.create(restClient))
            .build()

        return factory.createClient(PaymentClient::class.java)
    }

    private fun clientHttpRequestFactory(): ClientHttpRequestFactory {
        return JdkClientHttpRequestFactory().apply {
            setReadTimeout(Duration.ofSeconds(5))
        }
    }
}
```

외부 서비스마다 다른 `baseUrl`과 타임아웃을 설정할 수 있다. 결제 서비스는 10초, 일반 API는 5초 같은 차등 설정이 가능하다.

### Spring Boot 4: @ImportHttpServices

Spring Boot 4에서는 위의 수동 설정을 자동화할 수 있다.

```kotlin
@Configuration
@ImportHttpServices(
    group = "user-service",
    types = [UserClient::class]
)
@ImportHttpServices(
    group = "payment-service",
    types = [PaymentClient::class]
)
class HttpServiceConfig
```

```yaml
spring:
  http:
    client:
      user-service:
        url: https://api.user-service.com
        connect-timeout: 3s
        read-timeout: 5s
      payment-service:
        url: https://api.payment-service.com
        connect-timeout: 3s
        read-timeout: 10s
```

HTTP Service Registry가 그룹별로 RestClient를 자동 구성한다. Java 코드에는 URL이나 타임아웃이 없고, YAML에서 관리한다. 환경별(local/prod)로 URL을 다르게 설정하기도 쉽다.

### 어노테이션 상세

```kotlin
@HttpExchange("/orders")
interface OrderClient {

    // 기본 GET
    @GetExchange("/{id}")
    fun getOrder(@PathVariable id: Long): Order

    // 쿼리 파라미터
    @GetExchange
    fun searchOrders(
        @RequestParam status: String,
        @RequestParam(required = false) from: LocalDate?
    ): List<Order>

    // 헤더 추가
    @GetExchange("/{id}")
    fun getOrderWithAuth(
        @PathVariable id: Long,
        @RequestHeader("X-Api-Key") apiKey: String
    ): Order

    // POST with body
    @PostExchange
    fun createOrder(@RequestBody request: CreateOrderRequest): Order

    // 응답 전체 (헤더 포함)
    @GetExchange("/{id}")
    fun getOrderEntity(@PathVariable id: Long): ResponseEntity<Order>

    // PATCH
    @PatchExchange("/{id}")
    fun patchOrder(
        @PathVariable id: Long,
        @RequestBody patch: Map<String, Any>
    ): Order
}
```

---

## 공통: 에러 핸들링 전략

### 외부 API 전용 예외 클래스

```kotlin
// 외부 API 호출 실패를 표현하는 예외
class ExternalApiException(
    val serviceName: String,
    val statusCode: HttpStatusCode?,
    override val message: String,
    override val cause: Throwable? = null
) : RuntimeException(message, cause)

// 글로벌 예외 핸들러에 추가
@ExceptionHandler(ExternalApiException::class)
fun handleExternalApiException(
    e: ExternalApiException,
    request: HttpServletRequest
): ResponseEntity<ApiErrorResponse> {
    log.error("외부 API 호출 실패: service={}, status={}", e.serviceName, e.statusCode, e)

    return ResponseEntity
        .status(HttpStatus.BAD_GATEWAY)  // 502
        .body(
            ApiErrorResponse(
                traceId = MDC.get("traceId"),
                status = 502,
                code = "EXTERNAL_API_ERROR",
                message = "외부 서비스 연동 중 오류가 발생했습니다",
                path = request.requestURI
            )
        )
}
```

외부 API 장애를 클라이언트에게 그대로 전달하면 안 된다. "결제 서비스에서 Connection refused" 같은 메시지를 사용자에게 보여주는 것은 보안상으로도, UX상으로도 좋지 않다. 502 Bad Gateway로 래핑하고, 내부 로그에만 상세 정보를 남긴다.

### 재시도 (Retry)

일시적인 네트워크 문제로 실패하는 경우가 있다. 한 번 더 시도하면 성공하는 경우가 많다.

```kotlin
// RestClient - Spring Retry 사용
@Retryable(
    retryFor = [ResourceAccessException::class],
    maxAttempts = 3,
    backoff = Backoff(delay = 500, multiplier = 2.0)
)
fun getUser(id: Long): User {
    return restClient.get()
        .uri("/users/{id}", id)
        .retrieve()
        .body(User::class.java)!!
}
```

```
재시도 흐름 (exponential backoff):

1차 시도 → 실패 → 500ms 대기
2차 시도 → 실패 → 1000ms 대기 (500 × 2.0)
3차 시도 → 성공 ✓ (또는 최종 실패)
```

**재시도하면 안 되는 경우**:

| 상태 코드                     | 재시도 | 이유                        |
|---------------------------|-----|---------------------------|
| 400 Bad Request           | X   | 요청이 잘못된 것이므로 다시 보내도 같은 결과 |
| 401 Unauthorized          | X   | 인증 문제이므로 재시도 무의미          |
| 403 Forbidden             | X   | 권한 문제                     |
| 404 Not Found             | X   | 리소스가 없는 것                 |
| 409 Conflict              | X   | 비즈니스 충돌                   |
| 429 Too Many Requests     | O   | 잠시 후 재시도하면 성공 가능          |
| 500 Internal Server Error | △   | 서버 버그일 수도, 일시 장애일 수도      |
| 502 Bad Gateway           | O   | 일시적인 네트워크 문제일 가능성         |
| 503 Service Unavailable   | O   | 서버 과부하, 잠시 후 복구 가능        |
| Connection Timeout        | O   | 네트워크 일시 장애                |

**멱등성(Idempotency)도 고려해야 한다**: GET은 몇 번 재시도해도 안전하다. 하지만 POST(주문 생성, 결제)를 재시도하면 중복 처리될 수 있다. POST 재시도가 필요하면 Idempotency Key를 함께 전송해야 한다.

```kotlin
// 멱등성 키를 사용하는 결제 API 호출
fun processPayment(request: PaymentRequest): PaymentResponse {
    val idempotencyKey = UUID.randomUUID().toString()

    return restClient.post()
        .uri("/payments")
        .header("Idempotency-Key", idempotencyKey)
        .body(request)
        .retrieve()
        .body(PaymentResponse::class.java)!!
}
```

---

## 공통: 테스트

### RestClient 테스트 - MockRestServiceServer

```kotlin
@RestClientTest(UserApiClient::class)
class UserApiClientTest {

    @Autowired
    private lateinit var client: UserApiClient

    @Autowired
    private lateinit var server: MockRestServiceServer

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Test
    fun `사용자 조회 성공`() {
        val expected = User(id = 1, name = "홍길동", email = "hong@test.com")

        server.expect(requestTo("/users/1"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(
                withSuccess(
                    objectMapper.writeValueAsString(expected),
                    MediaType.APPLICATION_JSON
                )
            )

        val result = client.getUser(1)

        assertThat(result.name).isEqualTo("홍길동")
        server.verify()  // 기대한 요청이 실제로 발생했는지 검증
    }

    @Test
    fun `사용자 조회 404`() {
        server.expect(requestTo("/users/999"))
            .andRespond(withResourceNotFound())

        assertThrows<UserNotFoundException> {
            client.getUser(999)
        }
    }

    @Test
    fun `서버 에러 시 502 반환`() {
        server.expect(requestTo("/users/1"))
            .andRespond(withServerError())

        assertThrows<ExternalApiException> {
            client.getUser(1)
        }
    }
}
```

`MockRestServiceServer`는 실제 HTTP 통신 없이 RestClient의 요청/응답을 가로채서 테스트한다. 외부 API가 없어도 다양한 시나리오(성공, 404, 500, 타임아웃)를 검증할 수 있다.

### @HttpExchange 테스트 - Mock 인터페이스

```kotlin
@WebMvcTest(OrderController::class)
class OrderControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @MockitoBean
    private lateinit var orderClient: OrderClient  // 인터페이스라 Mock이 쉽다

    @Test
    fun `주문 조회`() {
        val order = Order(id = 1, status = "PAID", amount = 50000)
        given(orderClient.getOrder(1)).willReturn(order)

        mockMvc.perform(get("/api/orders/1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("PAID"))
    }
}
```

@HttpExchange의 테스트 장점이 여기서 드러난다. 인터페이스이므로 `@MockitoBean`으로 바로 Mock을 만들 수 있다. RestClient를 직접 사용하면 MockRestServiceServer 설정이 필요하지만, @HttpExchange는 일반 서비스 Mock과 동일하다.

### 통합 테스트 - WireMock

실제 HTTP 통신까지 검증하려면 WireMock을 사용한다.

```kotlin
@SpringBootTest
@WireMockTest(httpPort = 8089)
class UserApiClientIntegrationTest {

    @Autowired
    private lateinit var client: UserApiClient

    @Test
    fun `외부 API 타임아웃 시 예외 발생`(wireMock: WireMockRuntimeInfo) {
        stubFor(
            get("/users/1")
                .willReturn(ok().withFixedDelay(10_000))  // 10초 지연
        )

        assertThrows<ResourceAccessException> {
            client.getUser(1)   // Read Timeout 5초 → 타임아웃 예외
        }
    }

    @Test
    fun `외부 API 재시도 동작 확인`(wireMock: WireMockRuntimeInfo) {
        stubFor(
            get("/users/1")
                .inScenario("retry")
                .whenScenarioStateIs(Scenario.STARTED)
                .willReturn(serverError())         // 1차: 500 에러
                .willSetStateTo("second-attempt")
        )
        stubFor(
            get("/users/1")
                .inScenario("retry")
                .whenScenarioStateIs("second-attempt")
                .willReturn(okJson("""{"id":1,"name":"홍길동"}"""))  // 2차: 성공
        )

        val result = client.getUser(1)

        assertThat(result.name).isEqualTo("홍길동")
        verify(2, getRequestedFor(urlEqualTo("/users/1")))  // 2번 호출됨
    }
}
```

WireMock은 실제 HTTP 서버를 띄워서 요청을 수신하고 미리 정의한 응답을 반환한다. 타임아웃, 재시도, 네트워크 지연 같은 시나리오를 현실적으로 테스트할 수 있다.

---

## 프로덕션 체크리스트

### 여러 외부 서비스별 설정 분리

```kotlin
@Configuration
class HttpClientConfig {

    // 일반 API - 빠른 타임아웃
    @Bean
    fun defaultRestClient(builder: RestClient.Builder): RestClient {
        return builder
            .baseUrl("https://api.internal.com")
            .requestFactory(requestFactory(connectTimeout = 2, readTimeout = 5))
            .build()
    }

    // 결제 API - 느린 타임아웃 허용
    @Bean("paymentRestClient")
    fun paymentRestClient(builder: RestClient.Builder): RestClient {
        return builder
            .baseUrl("https://api.payment.com")
            .requestFactory(requestFactory(connectTimeout = 3, readTimeout = 15))
            .build()
    }

    // 파일 업로드 API - 매우 느린 타임아웃
    @Bean("fileRestClient")
    fun fileRestClient(builder: RestClient.Builder): RestClient {
        return builder
            .baseUrl("https://api.storage.com")
            .requestFactory(requestFactory(connectTimeout = 5, readTimeout = 60))
            .build()
    }

    private fun requestFactory(connectTimeout: Long, readTimeout: Long): ClientHttpRequestFactory {
        val httpClient = java.net.http.HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(connectTimeout))
            .build()
        return JdkClientHttpRequestFactory(httpClient).apply {
            setReadTimeout(Duration.ofSeconds(readTimeout))
        }
    }
}
```

모든 외부 API에 동일한 타임아웃을 설정하면 안 된다. 결제 API는 카드사 응답을 기다려야 하므로 15초가 필요할 수 있지만, 내부 API는 5초면 충분하다.

### 로깅 - 무엇을 남겨야 하는가

```kotlin
private fun loggingInterceptor() = ClientHttpRequestInterceptor { request, body, execution ->
    val log = LoggerFactory.getLogger("ExternalApi")
    val startTime = System.currentTimeMillis()

    log.info(">>> {} {} (body: {} bytes)", request.method, request.uri, body.size)

    val response = execution.execute(request, body)
    val elapsed = System.currentTimeMillis() - startTime

    log.info(
        "<<< {} {} ({}ms, body: {} bytes)",
        response.statusCode, request.uri, elapsed, response.headers.contentLength
    )

    // 에러 응답이면 본문도 로깅
    if (response.statusCode.isError) {
        // 주의: 응답 본문을 읽으면 스트림이 소비된다.
        // BufferingClientHttpResponseWrapper로 감싸야 재사용 가능
        log.error("에러 응답 본문: {}", response.bodyAsString())
    }

    response
}
```

**로깅할 것**: HTTP 메서드, URI, 상태 코드, 소요 시간, 에러 응답 본문
**로깅하지 말 것**: 요청 본문에 포함된 개인정보(비밀번호, 카드번호, 주민번호), 인증 토큰

### 커넥션 풀 관리

RestClient의 기본 `JdkClientHttpRequestFactory`는 JDK의 `HttpClient`를 사용하고, 이것은 내부적으로 커넥션 풀을 관리한다. 하지만 Apache HttpClient 5를 사용하면 커넥션 풀을 더 세밀하게 제어할 수 있다.

```kotlin
// Apache HttpClient 5 사용 시
private fun apacheRequestFactory(): ClientHttpRequestFactory {
    val connectionManager = PoolingHttpClientConnectionManagerBuilder.create()
        .setMaxConnTotal(100)        // 전체 커넥션 풀 크기
        .setMaxConnPerRoute(20)      // 호스트별 최대 커넥션
        .build()

    val httpClient = HttpClients.custom()
        .setConnectionManager(connectionManager)
        .build()

    return HttpComponentsClientHttpRequestFactory(httpClient).apply {
        setConnectTimeout(Duration.ofSeconds(3))
        setReadTimeout(Duration.ofSeconds(5))
    }
}
```

`MaxConnPerRoute`가 중요하다. 기본값이 5인데, 특정 외부 API에 동시 요청이 많으면 커넥션 대기가 발생한다. 외부 서비스별 예상 동시 호출 수에 맞춰 설정한다.

### 정리: 실무에서 자주 하는 실수

| 실수           | 결과                          | 해결                          |
|--------------|-----------------------------|-----------------------------|
| 타임아웃 미설정     | 외부 API 장애 시 자기 서버도 먹통       | 반드시 connect/read timeout 설정 |
| 모든 에러에 재시도   | POST 중복 처리, 불필요한 부하         | 멱등한 요청만 재시도                 |
| 에러 응답 그대로 전달 | 내부 정보 노출, 사용자 혼란            | 502로 래핑, 내부 로그에만 상세 기록      |
| 단일 타임아웃      | 결제 API 타임아웃 or 내부 API 무한 대기 | 서비스별 타임아웃 분리                |
| 로그에 토큰 노출    | 보안 사고                       | 민감 헤더 마스킹                   |
| 커넥션 풀 미설정    | 동시 요청 시 커넥션 대기              | MaxConnPerRoute 조정          |
