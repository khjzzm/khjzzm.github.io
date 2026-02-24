---
layout: post
title: Spring Boot 4 Observability - OpenTelemetry, Actuator, Metrics 완전 가이드
tags: [ spring ]
---

프로덕션에서 서버가 돌아가고 있을 때, 안에서 무슨 일이 벌어지는지 알 수 있는 능력. 이것이 Observability(관측 가능성)다. `println`이나 로그만으로는 한계가 있다.

## Observability의 세 축

```
                    Observability (관측 가능성)
                    ┌──────────┬──────────┬──────────┐
                    │  Logs    │ Metrics  │ Traces   │
                    │  (로그)   │ (메트릭)  │ (트레이스) │
                    └──────────┴──────────┴──────────┘
```

| 축           | 뭘 알 수 있나        | 예시                                         |
|-------------|-----------------|--------------------------------------------|
| **Logs**    | "무슨 일이 일어났는가"   | `ERROR PaymentService - 결제 실패: 잔액 부족`      |
| **Metrics** | "지금 상태가 어떤가"    | CPU 70%, 요청 처리 평균 200ms, 분당 에러 5건          |
| **Traces**  | "요청이 어디를 거쳐갔는가" | 사용자 → API Gateway → 주문 → 결제 → DB (총 350ms) |

### 실제 장애에서 셋이 어떻게 연계되는가

```
[새벽 3시, 알림 발생]

1. Metrics 대시보드 확인
   → "주문 API 응답 시간이 평소 200ms에서 5초로 급증"
   → "DB 커넥션 풀 pending이 30으로 급증"
   → 원인 범위 좁힘: DB 커넥션 문제

2. Traces 확인
   → 느린 요청 하나를 추적
   → 주문 서비스 → 결제 서비스 (50ms) → DB 쿼리 (4,800ms) ← 여기가 병목
   → 특정 쿼리가 느린 것을 확인

3. Logs 확인
   → 해당 시간대의 DB 로그 검색
   → "Lock wait timeout exceeded" 발견
   → 배치 작업이 테이블 락을 잡고 있었음
```

로그만으로는 "어디가 느린지" 알 수 없고, 메트릭만으로는 "왜 느린지" 알 수 없고, 트레이스만으로는 "전체적으로 어떤 상태인지" 알 수 없다. 셋이 함께 있어야 한다.

---

## Spring Boot 4의 접근: OpenTelemetry

Spring Boot 4 이전에는 메트릭(Micrometer), 트레이스(Zipkin/Jaeger), 로그(Logback)를 각각 따로 설정해야 했다. Spring Boot 4에서 `spring-boot-starter-opentelemetry`가 추가되면서 하나의 의존성으로 통합되었다.

```
[Spring Boot 4 이전]                      [Spring Boot 4]

Metrics → Micrometer → Prometheus           Metrics ─┐
Traces  → Brave     → Zipkin                Traces  ─┼→ Micrometer → OTLP → 아무 백엔드
Logs    → Logback   → ELK                   Logs    ─┘

(각각 설정, 각각 다른 백엔드)              (하나의 프로토콜, 백엔드 자유 선택)
```

**OTLP(OpenTelemetry Protocol)**가 핵심이다. 이것은 표준 프로토콜이기 때문에 수집 라이브러리와 백엔드를 독립적으로 선택할 수 있다. Grafana를 쓰다가 Datadog으로 바꿔도, 애플리케이션 코드는 수정할 필요가 없다. OTLP export URL만 변경하면 된다.

### 의존성

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
}
```

이 두 줄이면 Logs, Metrics, Traces 세 축이 전부 활성화된다.

### 설정

```yaml
spring:
  application:
    name: my-api   # 트레이스에 표시될 서비스 이름

management:
  otlp:
    tracing:
      export:
        url: http://localhost:4318/v1/traces    # OTLP 수신 서버 (Grafana Tempo, Jaeger 등)
    metrics:
      export:
        url: http://localhost:4318/v1/metrics   # OTLP 수신 서버 (Grafana Mimir, Prometheus 등)
        step: 30s                               # 메트릭 전송 주기
  tracing:
    sampling:
      probability: 1.0   # 개발: 1.0 (100%), 프로덕션: 0.1 (10%)
```

`sampling.probability`는 전체 요청 중 몇 퍼센트의 트레이스를 수집할지 결정한다. 프로덕션에서 100%로 수집하면 데이터 양이 폭증하므로 보통 10% 정도로 설정한다. 장애 조사 시 일시적으로 올릴 수 있다.

---

## Traces - 요청 추적

### 실제 로그가 어떻게 바뀌는가

`spring-boot-starter-opentelemetry`를 추가하면 **모든 로그에 traceId와 spanId가 자동으로 주입**된다. 코드를 수정하거나 MDC 필터를 만들 필요가 없다.

#### Before (OpenTelemetry 없음)

```
2026-02-24 10:30:01.123 INFO  [nio-8080-exec-1] c.e.m.order.OrderController    : 주문 조회 요청: orderId=123
2026-02-24 10:30:01.125 INFO  [nio-8080-exec-1] c.e.m.order.OrderService       : DB 조회 시작
2026-02-24 10:30:01.140 INFO  [nio-8080-exec-1] c.e.m.payment.PaymentClient    : 결제 상태 조회
2026-02-24 10:30:01.390 INFO  [nio-8080-exec-1] c.e.m.order.OrderService       : 주문 조회 완료
```

스레드 이름(`nio-8080-exec-1`)만으로는 요청을 구분할 수 없다. Virtual Threads 환경에서는 스레드가 매번 새로 생성되므로 더더욱 추적이 불가능하다.

#### After (OpenTelemetry 적용)

```
2026-02-24 10:30:01.123 INFO  [my-api,traceId=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4,spanId=1a2b3c4d5e6f7a8b] c.e.m.order.OrderController    : 주문 조회 요청: orderId=123
2026-02-24 10:30:01.125 INFO  [my-api,traceId=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4,spanId=2b3c4d5e6f7a8b9c] c.e.m.order.OrderService       : DB 조회 시작
2026-02-24 10:30:01.140 INFO  [my-api,traceId=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4,spanId=3c4d5e6f7a8b9c0d] c.e.m.payment.PaymentClient    : 결제 상태 조회
2026-02-24 10:30:01.390 INFO  [my-api,traceId=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4,spanId=2b3c4d5e6f7a8b9c] c.e.m.order.OrderService       : 주문 조회 완료
```

달라진 부분을 뜯어보면:

```
[my-api, traceId=a1b2c3d4..., spanId=1a2b3c4d...]
 ──┬──  ─────────┬─────────  ────────┬────────
   │             │                   │
   │             │                   └─ Span ID: 하나의 "작업 단위" 식별자
   │             │                      (Controller, Service, DB 쿼리 각각 다른 spanId)
   │             │
   │             └─ Trace ID: 하나의 "요청 전체" 식별자
   │                (같은 요청에서 나온 모든 로그가 동일한 traceId)
   │
   └─ 서비스 이름 (spring.application.name)
```

**traceId**: 하나의 요청이 시작부터 끝까지 동일한 값을 갖는다. 이 값으로 검색하면 해당 요청의 모든 로그를 모을 수 있다.

**spanId**: 요청 내부의 개별 작업 단위다. Controller → Service → DB 쿼리 각각이 하나의 span이다. 부모-자식 관계가 있어서 트리 구조로 표현된다.

### 동시 요청이 섞여도 구분 가능

```
10:30:01 [traceId=aaa...] INFO OrderController   : 주문 조회: orderId=123
10:30:01 [traceId=bbb...] INFO UserController    : 사용자 조회: userId=42
10:30:01 [traceId=aaa...] INFO OrderService      : DB 조회 시작
10:30:01 [traceId=ccc...] INFO OrderController   : 주문 조회: orderId=456
10:30:01 [traceId=bbb...] INFO UserService       : 사용자 조회 완료
10:30:01 [traceId=aaa...] ERROR PaymentClient    : 결제 상태 조회 실패
10:30:01 [traceId=aaa...] ERROR OrderService     : 주문 조회 실패
```

`traceId=aaa`로 필터링하면:

```
10:30:01 [traceId=aaa...] INFO  OrderController : 주문 조회: orderId=123
10:30:01 [traceId=aaa...] INFO  OrderService    : DB 조회 시작
10:30:01 [traceId=aaa...] ERROR PaymentClient   : 결제 상태 조회 실패    ← 원인
10:30:01 [traceId=aaa...] ERROR OrderService    : 주문 조회 실패         ← 결과
```

### 자동 추적되는 것들

`spring-boot-starter-opentelemetry`를 추가하면 **코드 변경 없이** 다음이 자동으로 추적된다:

```
자동 추적되는 것들:
├── HTTP 요청/응답 (Spring MVC)
├── DB 쿼리 (JDBC)
├── RestClient / WebClient 외부 호출
├── @Async 비동기 메서드
└── 메시지 큐 (Kafka, RabbitMQ)
```

하나의 API 호출이 내부에서 어떤 경로를 거치는지 시각적으로 볼 수 있다:

```
GET /api/orders/123                                    총 350ms
├── OrderController.getOrder()                         350ms
│   ├── OrderService.findById()                        300ms
│   │   ├── DB SELECT orders WHERE id=123              15ms
│   │   ├── PaymentClient.getPaymentStatus()           250ms  ← 외부 API 호출이 병목
│   │   └── DB SELECT order_items WHERE order_id=123   20ms
│   └── OrderMapper.toDto()                            2ms
└── Response 직렬화                                     5ms
```

### MSA 환경 - 서비스를 넘나드는 추적

OpenTelemetry의 진짜 힘은 서비스 간 호출에서 나온다. traceId가 HTTP 헤더(`traceparent`)를 통해 자동 전파된다.

```
[주문 서비스 로그]
10:30:01 [my-order,traceId=aaa...] INFO  OrderService   : 주문 생성 시작
10:30:01 [my-order,traceId=aaa...] INFO  PaymentClient  : 결제 서비스 호출

[결제 서비스 로그] ← 서비스가 다른데 traceId가 같다
10:30:01 [my-payment,traceId=aaa...] INFO  PaymentController : 결제 요청 수신
10:30:01 [my-payment,traceId=aaa...] INFO  PaymentService    : 카드사 API 호출
10:30:01 [my-payment,traceId=aaa...] INFO  PaymentService    : 결제 승인 완료

[주문 서비스 로그]
10:30:01 [my-order,traceId=aaa...] INFO  OrderService   : 주문 생성 완료
```

두 서비스의 로그를 `traceId=aaa`로 검색하면 전체 흐름이 시간순으로 합쳐진다. Grafana Tempo나 Jaeger 같은 트레이스 백엔드에서는 이것을 시각적으로 보여준다:

```
[Grafana Tempo / Jaeger UI에서 보이는 화면]

 traceId: aaa...                                           총 450ms
 ┌─────────────────────────────────────────────────────────────────┐
 │ my-order   OrderController.createOrder()                 450ms │
 │ ├── my-order   OrderService.createOrder()                440ms │
 │ │   ├── my-order   DB INSERT orders                       10ms │
 │ │   ├── my-payment  PaymentController.pay()              380ms │ ← 서비스 경계
 │ │   │   ├── my-payment  PaymentService.process()         370ms │
 │ │   │   │   ├── my-payment  HTTP POST 카드사 API         350ms │ ← 진짜 병목
 │ │   │   │   └── my-payment  DB INSERT payments            15ms │
 │ │   └── my-order   DB UPDATE orders SET status='PAID'      8ms │
 └─────────────────────────────────────────────────────────────────┘
```

이 화면 하나로 "어떤 서비스의 어떤 작업이 얼마나 걸렸는지"를 즉시 파악할 수 있다. 위 예시에서는 카드사 API 호출(350ms)이 전체 450ms의 대부분을 차지하는 것이 한눈에 보인다.

### JSON 로그에서의 모습

프로덕션에서 구조화 로깅(JSON)을 사용하면 로그가 이렇게 출력된다:

```json
{
  "timestamp": "2026-02-24T10:30:01.123Z",
  "level": "INFO",
  "logger": "com.example.myapi.order.OrderService",
  "message": "주문 조회 시작: orderId=123",
  "service.name": "my-api",
  "trace_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "span_id": "2b3c4d5e6f7a8b9c",
  "trace_flags": "01",
  "thread": "virtual-thread-42"
}
```

Grafana Loki 같은 로그 수집 시스템에서 `trace_id`로 필터링하거나, `trace_id` 클릭 한 번으로 Grafana Tempo의 트레이스 화면으로 바로 이동할 수 있다. 이것이 Logs → Traces 연계다.

---

## Actuator 헬스체크

Spring Boot Actuator는 애플리케이션의 상태를 HTTP 엔드포인트로 노출한다.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, metrics, prometheus
  endpoint:
    health:
      show-details: when_authorized   # 인증된 사용자에게만 상세 정보
      probes:
        enabled: true
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
```

> Spring Boot 4에서는 liveness/readiness probe가 기본 활성화되었다. Kubernetes 환경이라면 별도 설정 없이 바로 사용할 수 있다.

### Liveness vs Readiness

이 둘의 차이를 이해하려면 Kubernetes가 장애를 처리하는 방식을 알아야 한다.

```
[Liveness Probe] - "이 서버가 살아있는가?"
  GET /actuator/health/liveness

  응답 200 → 정상
  응답 503 → 비정상 → Kubernetes가 Pod를 재시작

  예: 데드락에 빠져서 완전히 응답 불가 상태
      → 재시작하는 것이 맞다


[Readiness Probe] - "이 서버가 요청을 받을 준비가 되었는가?"
  GET /actuator/health/readiness

  응답 200 → 정상 → 로드밸런서가 트래픽을 보냄
  응답 503 → 미준비 → 로드밸런서에서 제외 (재시작 안 함)

  예: 서버는 살아있지만 DB 커넥션이 일시적으로 끊김
      → 재시작이 아니라 잠시 트래픽을 빼는 것이 맞다
      → DB 복구되면 자동으로 다시 트래픽 수신
```

```
[실제 동작 흐름]

Pod 시작
  │
  ├─ Liveness: 200 ✓ (살아있음)
  ├─ Readiness: 503 ✗ (DB 연결 중...)
  │   → 로드밸런서에서 제외, 트래픽 안 받음
  │
  ├─ DB 연결 완료
  ├─ Readiness: 200 ✓ (준비 완료)
  │   → 로드밸런서에 등록, 트래픽 수신 시작
  │
  ├─ ... 정상 운영 중 ...
  │
  ├─ DB 일시 장애 발생
  ├─ Readiness: 503 ✗
  │   → 로드밸런서에서 제외 (재시작 안 함, 기다림)
  │
  ├─ DB 복구
  ├─ Readiness: 200 ✓
  │   → 다시 트래픽 수신
```

Kubernetes 배포 설정 예시:

```yaml
# k8s deployment.yaml
spec:
  containers:
  - name: my-api
    livenessProbe:
      httpGet:
        path: /actuator/health/liveness
        port: 8080
      initialDelaySeconds: 30    # 시작 후 30초 대기 (앱 부팅 시간)
      periodSeconds: 10          # 10초마다 체크
      failureThreshold: 3        # 3번 연속 실패 시 재시작
    readinessProbe:
      httpGet:
        path: /actuator/health/readiness
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 5
      failureThreshold: 3        # 3번 연속 실패 시 트래픽 제외
```

### 커스텀 Health Indicator

기본 제공되는 것(DB, 디스크, Redis 등) 외에 직접 만들 수도 있다.

```kotlin
@Component
class ExternalPaymentHealthIndicator(
    private val restClient: RestClient
) : HealthIndicator {

    override fun health(): Health {
        return try {
            val response = restClient.get()
                .uri("/health")
                .retrieve()
                .toBodilessEntity()

            if (response.statusCode.is2xxSuccessful) {
                Health.up()
                    .withDetail("payment-service", "정상")
                    .build()
            } else {
                Health.down()
                    .withDetail("payment-service", "응답 코드: ${response.statusCode}")
                    .build()
            }
        } catch (e: Exception) {
            Health.down(e)
                .withDetail("payment-service", "연결 불가")
                .build()
        }
    }
}
```

`/actuator/health` 응답에 자동으로 포함된다:

```json
{
  "status": "UP",
  "components": {
    "db": {
      "status": "UP"
    },
    "diskSpace": {
      "status": "UP"
    },
    "externalPayment": {
      "status": "UP",
      "details": {
        "payment-service": "정상"
      }
    }
  }
}
```

---

## Metrics - 숫자로 보는 서버 상태

### 자동 수집되는 메트릭

Micrometer가 자동으로 수집하는 메트릭이 상당히 많다.

```
자동 수집되는 메트릭:
├── JVM
│   ├── jvm.memory.used          (힙 메모리 사용량)
│   ├── jvm.gc.pause             (GC 멈춤 시간)
│   └── jvm.threads.live         (활성 스레드 수)
├── HTTP
│   ├── http.server.requests     (요청 수, 응답 시간, 상태 코드별)
│   └── http.client.requests     (RestClient/WebClient 외부 호출)
├── DB
│   ├── hikaricp.connections.active    (사용 중인 커넥션)
│   ├── hikaricp.connections.pending   (대기 중인 스레드)
│   └── hikaricp.connections.timeout   (타임아웃 횟수)
└── System
    ├── system.cpu.usage         (CPU 사용률)
    └── process.uptime           (서버 가동 시간)
```

별도 코드 없이 이 모든 것이 수집된다. `/actuator/metrics`에서 확인할 수 있다:

```bash
# 전체 메트릭 목록
curl http://localhost:8080/actuator/metrics

# 특정 메트릭 상세
curl http://localhost:8080/actuator/metrics/http.server.requests
```

응답 예시:

```json
{
  "name": "http.server.requests",
  "description": "Duration of HTTP server request handling",
  "measurements": [
    {
      "statistic": "COUNT",
      "value": 1523
    },
    {
      "statistic": "TOTAL_TIME",
      "value": 187.432
    },
    {
      "statistic": "MAX",
      "value": 2.105
    }
  ],
  "availableTags": [
    {
      "tag": "uri",
      "values": [
        "/api/users",
        "/api/orders",
        "/api/orders/{id}"
      ]
    },
    {
      "tag": "method",
      "values": [
        "GET",
        "POST",
        "DELETE"
      ]
    },
    {
      "tag": "status",
      "values": [
        "200",
        "404",
        "500"
      ]
    }
  ]
}
```

태그로 필터링도 가능하다:

```bash
# /api/orders에서 500 에러가 몇 번 났는지
curl "http://localhost:8080/actuator/metrics/http.server.requests?tag=uri:/api/orders&tag=status:500"
```

### 커스텀 메트릭

비즈니스에 중요한 숫자는 직접 메트릭으로 등록한다.

```kotlin
@Service
class OrderService(
    private val meterRegistry: MeterRegistry
) {

    // Counter: 누적 횟수 (계속 증가만 하는 값)
    private val orderCounter = Counter.builder("orders.created")
        .description("생성된 주문 수")
        .register(meterRegistry)

    // Timer: 소요 시간 (평균, 최대, 분포를 자동 계산)
    private val orderTimer = Timer.builder("orders.processing.time")
        .description("주문 처리 소요 시간")
        .register(meterRegistry)

    fun createOrder(request: CreateOrderRequest): Order {
        return orderTimer.recordCallable {
            // 이 블록의 실행 시간이 자동으로 측정된다
            orderCounter.increment()
            // ... 주문 처리 로직
        }!!
    }
}
```

### 메트릭 종류 네 가지

| 타입                       | 용도          | 예시             | 비유                  |
|--------------------------|-------------|----------------|---------------------|
| **Counter**              | 누적 횟수 (증가만) | 주문 수, 에러 수     | 자동차 주행거리계 (줄어들지 않음) |
| **Gauge**                | 현재 값 (오르내림) | 활성 사용자 수, 큐 크기 | 자동차 속도계 (실시간 변동)    |
| **Timer**                | 소요 시간 + 횟수  | API 응답 시간      | 스톱워치                |
| **Distribution Summary** | 값의 분포       | 주문 금액 분포       | 히스토그램               |

```kotlin
// Counter - 로그인 성공/실패 횟수
Counter.builder("auth.login")
    .tag("result", "success")   // 태그로 성공/실패 구분
    .register(meterRegistry)
    .increment()

// Gauge - 현재 대기열 크기
Gauge.builder("queue.size") { queue.size }
    .register(meterRegistry)
// 값을 직접 설정하지 않고 람다로 현재 값을 읽는다

// Timer - DB 쿼리 시간
Timer.builder("db.query.time")
    .tag("table", "orders")
    .register(meterRegistry)
    .record { dsl.selectFrom(ORDERS).fetch() }

// Distribution Summary - 주문 금액 분포
DistributionSummary.builder("order.amount")
    .baseUnit("won")
    .register(meterRegistry)
    .record(order.totalAmount.toDouble())
```

---

## 프로덕션 모니터링 전략

### RED Method (서비스 레벨)

서비스가 정상적으로 동작하고 있는지 판단하는 세 가지 지표:

```
[RED Method]
├── Rate:     초당 요청 수 (http.server.requests count)
├── Errors:   에러 비율 (http.server.requests에서 status=5xx 비율)
└── Duration: 응답 시간 (http.server.requests 평균/p99)
```

| 지표             | 정상         | 경고       | 위험              |
|----------------|------------|----------|-----------------|
| Rate           | 평소 수준 유지   | 급증 또는 급감 | 0에 가까움 (서비스 다운) |
| Errors         | 5xx < 0.1% | 5xx > 1% | 5xx > 5%        |
| Duration (p99) | < 500ms    | < 2s     | > 5s            |

### USE Method (리소스 레벨)

서버 리소스가 한계에 도달하고 있는지 판단하는 세 가지 지표:

```
[USE Method]
├── Utilization: CPU 사용률, 메모리 사용률, 커넥션 풀 사용률
├── Saturation:  커넥션 풀 pending, 스레드 풀 대기열
└── Errors:      커넥션 타임아웃, OOM 발생 여부
```

| 리소스      | 주요 메트릭                              | 위험 신호    |
|----------|-------------------------------------|----------|
| CPU      | `system.cpu.usage`                  | > 80% 지속 |
| Memory   | `jvm.memory.used / jvm.memory.max`  | > 85%    |
| 커넥션 풀    | `hikaricp.connections.active / max` | > 80%    |
| 커넥션 대기   | `hikaricp.connections.pending`      | > 0 지속   |
| 커넥션 타임아웃 | `hikaricp.connections.timeout`      | > 0      |

### 알림 설정 기준

```
[즉시 대응 - PagerDuty/슬랙 알림]
- 5xx 에러율 > 5% (5분 지속)
- 응답 시간 p99 > 5초 (5분 지속)
- 커넥션 풀 타임아웃 발생
- Pod readiness 실패

[주의 관찰 - 슬랙 알림]
- 5xx 에러율 > 1% (10분 지속)
- 커넥션 풀 pending > 0 (10분 지속)
- CPU > 80% (15분 지속)
- 메모리 > 85% (15분 지속)

[트렌드 확인 - 주간 리뷰]
- 응답 시간 평균 증가 추세
- 에러율 증가 추세
- 리소스 사용률 증가 추세
```

이 메트릭들을 Grafana 대시보드에 구성하면, 장애가 발생하기 **전에** 징후를 포착할 수 있다. 예를 들어 커넥션 풀 pending이 서서히 증가하는 추세가 보이면, 타임아웃 장애가 나기 전에 대응할 수 있다.
