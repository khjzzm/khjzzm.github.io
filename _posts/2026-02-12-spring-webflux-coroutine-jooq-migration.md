---
layout: post
title: Spring Reactive Programming - 기초부터 실전 마이그레이션까지
tags: [ spring, kotlin, database, architecture, performance ]
---

# fax-reactive 학습 노트

## 목차

### Part 1: 이론 — Reactive Programming 기초

- [1. 동기(Synchronous) 모델의 한계](#1-동기synchronous-모델의-한계)
- [2. Reactive Programming이란](#2-reactive-programming이란)
- [3. Reactive Streams 표준](#3-reactive-streams-표준)
- [4. Project Reactor 핵심](#4-project-reactor-핵심)
- [5. Spring WebFlux](#5-spring-webflux)
- [6. R2DBC - Non-blocking 데이터베이스](#6-r2dbc---non-blocking-데이터베이스)
- [7. Kotlin Coroutine과 WebFlux](#7-kotlin-coroutine과-webflux)
- [8. 전체 기술 스택 조감도](#8-전체-기술-스택-조감도)

### Part 2: 마이그레이션 계획

- [9. 실전: Spring MVC → WebFlux 마이그레이션](#9-실전-spring-mvc--webflux-마이그레이션)
- [10. 정리](#10-정리)

### Part 3: 실전 구현 — fax-reactive 모듈

- [11. 비동기 디버깅 + 리액티브의 미래](#11-비동기-디버깅--리액티브의-미래)
- [12. 모듈 구조 & 기술 스택](#12-모듈-구조--기술-스택)
- [13. application.yml — R2DBC 설정](#13-applicationyml--r2dbc-설정)
- [14. Fax.kt — 도메인 모델](#14-faxkt--도메인-모델)
- [15. JooqConfig.kt — R2DBC + jOOQ 연결](#15-jooqconfigkt--r2dbc--jooq-연결)
- [16. DatabaseInitConfig.kt — DB 초기화](#16-databaseinitconfigkt--db-초기화-스키마테이블-생성)
- [17. 레이어 구조 — Controller → Service → Repository](#17-레이어-구조--controller--service--repository)
- [18. FaxController.kt — REST 엔드포인트](#18-faxcontrollerkt--rest-엔드포인트)
- [19. SecurityConfig.kt — WebFlux 보안](#19-securityconfigkt--webflux-보안)
- [20. FaxControllerTests.kt — WebTestClient + REST Docs 테스트](#20-faxcontrollertestskt--webtestclient--rest-docs-테스트)
- [21. build.gradle.kts — 의존성 구성](#21-buildgradlekts--의존성-구성)
- [22. Gradle Version Catalog — libs.versions.toml](#22-gradle-version-catalog--libsversionstoml)
- [23. Repository 레이어 분리](#23-repository-레이어-분리--왜-jooq를-service에서-분리했는가)
- [24. jOOQ 코드 생성](#24-jooq-코드-생성--schemasql--타입-안전-클래스-자동-생성)
- [25. AOP 응답 래핑 — ReactiveApiResponse](#25-aop-응답-래핑--reactiveapiresponse)
- [26. Reactor Context + MDC 로그 전파](#26-reactor-context--mdc-로그-전파)
- [27. Global Error Handling — @ControllerAdvice](#27-global-error-handling--controlleradvice)
- [28. WebClient — 외부 API 호출](#28-webclient--외부-api-호출)

### 부록

- [FIXME: commons-util로 공통 모듈 추출](#fixme-commons-util로-공통-모듈-추출)

---

# Part 1: 이론 — Reactive Programming 기초

Spring MVC로 충분히 잘 동작하는 서비스가 있다. 그런데 왜 Reactive로 전환하려는 걸까?
이 글에서는 Reactive Programming의 근본적인 동기부터 시작해서, Reactive Streams 표준, Project Reactor, Spring WebFlux, R2DBC, Kotlin Coroutine까지 하나씩 짚어본다.
마지막에는 실제 운영 중인 fax-api 서비스를 Spring MVC + MyBatis에서 WebFlux + Coroutine + jOOQ + R2DBC로 전환하는 실전 마이그레이션 과정을 정리한다.

---

## 1. 동기(Synchronous) 모델의 한계

### Thread-per-Request 모델

Spring MVC의 기본 동작 방식은 단순하다. 요청 하나에 스레드 하나를 배정한다.

```
[요청 1] ──→ [Thread-1] ──→ DB 조회 (200ms 대기) ──→ 응답
[요청 2] ──→ [Thread-2] ──→ DB 조회 (200ms 대기) ──→ 응답
[요청 3] ──→ [Thread-3] ──→ 외부 API (500ms 대기) ──→ 응답
  ...
[요청 200] → [Thread-200] → DB 조회 (200ms 대기) ──→ 응답
[요청 201] → ??? (스레드 풀 고갈, 대기열 진입)
```

Tomcat의 기본 스레드 풀은 200개다. 201번째 요청부터는 앞선 스레드가 반환될 때까지 줄을 서야 한다.

### 스레드는 뭘 하고 있나?

문제는 스레드가 **바쁜 게 아니라 기다리고 있다**는 것이다.

```
Thread-1의 시간표:

[요청 수신] 0.1ms
[비즈니스 로직] 0.5ms
[DB 쿼리 전송] 0.1ms
[DB 응답 대기] ████████████████████ 200ms  ← 이 시간 동안 아무것도 안 함
[결과 처리] 0.3ms
[응답 전송] 0.1ms

총 201ms 중 실제 CPU를 쓴 시간: 약 1ms (0.5%)
```

스레드의 99.5%는 **I/O 대기** 시간이다. 스레드가 200개라는 건 동시에 200개의 I/O를 기다리면서 메모리를 점유하고 있다는 뜻이다.
스레드 하나당 약 1MB의 스택 메모리를 소비하므로, 200개면 200MB가 대기 상태에 묶인다.

### Blocking I/O가 병목인 이유

```
Blocking I/O                          Non-blocking I/O

Thread-1: ──[작업]██[대기]██[작업]──   Thread-1: ──[작업]──[작업]──[작업]──
Thread-2: ──[작업]██[대기]██[작업]──              [대기]는 OS에게 맡김
Thread-3: ──[작업]██[대기]██[작업]──              이벤트가 오면 그때 처리
  ...
Thread-200: (스레드 풀 한계)            소수의 스레드로 수천 개 요청 처리 가능
```

Blocking I/O에서 스레드는 `socket.read()`를 호출하면 데이터가 올 때까지 멈춘다. 이 멈춤이 동시 처리 능력의 병목이 된다.

### C10K 문제

1999년 Dan Kegel이 제기한 문제다. "한 대의 서버에서 1만 개의 동시 접속을 어떻게 처리할 것인가?"
Thread-per-request로는 1만 개 스레드가 필요하고, 이는 메모리와 컨텍스트 스위칭 비용으로 인해 현실적이지 않다.

이 문제의 해결책이 **이벤트 기반 I/O** (epoll, kqueue)이고, 이를 프로그래밍 모델로 추상화한 것이 **Reactive Programming**이다.

### Virtual Thread는 답이 아닌가?

Java 21의 Virtual Thread는 이 문제를 다른 방식으로 해결한다.
스레드를 가볍게 만들어서 수십만 개를 생성해도 부담이 없게 한다.

```
Virtual Thread: 스레드를 싸게 만들자 (Thread-per-request 유지)
Reactive:       스레드를 적게 쓰자 (이벤트 루프 모델)
```

둘 다 유효한 접근이다. Virtual Thread는 기존 코드를 거의 안 바꾸고 동시성을 높이는 장점이 있고, Reactive는 배압(backpressure) 제어와 스트리밍 처리에서 구조적 우위가 있다.

---

## 2. Reactive Programming이란

### 정의

> 비동기 데이터 스트림을 선언적으로 조합하여 처리하는 프로그래밍 패러다임

핵심 키워드 세 가지:

- **비동기**: 결과를 기다리지 않고 다음 작업을 진행한다
- **데이터 스트림**: 단일 값이 아니라 시간에 따라 흐르는 데이터 시퀀스를 다룬다
- **선언적 조합**: 데이터를 어떻게(how) 처리할지 명령하지 않고, 무엇을(what) 할지 선언한다

### 명령형 vs 선언형(Reactive)

```java
// 명령형 (Imperative) - 어떻게 하는지를 기술
List<String> results = new ArrayList<>();
for(
Fax fax :faxList){
	if(fax.

getStatus() ==SENT){
	results.

add(fax.getTitle().

toUpperCase());
	}
	}

// 선언형 (Reactive) - 무엇을 하는지를 기술
	Flux.

fromIterable(faxList)
    .

filter(fax ->fax.

getStatus() ==SENT)
	.

map(fax ->fax.

getTitle().

toUpperCase())
	.

subscribe(results::add);
```

### Observer 패턴에서 Reactive로

Reactive는 GoF의 Observer 패턴을 발전시킨 것이다.

```
Observer 패턴 (GoF)
├── Subject가 Observer에게 알림 (push)
├── onUpdate() 콜백
└── 한계: 에러 처리 없음, 완료 신호 없음, 배압 없음

  ↓ 진화

Reactive Streams
├── Publisher가 Subscriber에게 데이터 push
├── onNext(), onError(), onComplete()  ← 에러와 완료 추가
└── request(n) ← 배압(backpressure) 추가
```

### Backpressure (배압)

생산자가 소비자보다 빠르면 어떻게 되나?

```
배압 없는 경우:
Producer:  ──[1]──[2]──[3]──[4]──[5]──[6]──  (초당 1000개 생산)
Consumer:  ──[1]────────[2]────────[3]──────  (초당 3개 처리)
           → 메모리 폭발 (OutOfMemoryError)

배압 있는 경우:
Consumer → Producer: "나 3개만 줘" (request(3))
Producer:  ──[1]──[2]──[3]──(대기)──
Consumer:  ──[1]──[2]──[3]──"3개 더 줘" (request(3))
           → 안전하게 처리
```

`Subscription.request(n)` 으로 소비자가 처리할 수 있는 만큼만 요청한다. 이것이 Reactive Streams에서 가장 중요한 기능이다.

### Reactive Manifesto

Reactive 시스템이 갖춰야 할 4가지 특성:

```
         Responsive (응답성)
        /           \
   Resilient       Elastic
  (회복력)        (탄력성)
        \           /
      Message Driven
       (메시지 기반)
```

| 특성                 | 설명                         |
|--------------------|----------------------------|
| **Responsive**     | 일관된 응답 시간을 보장한다            |
| **Resilient**      | 장애가 발생해도 시스템이 응답한다         |
| **Elastic**        | 부하에 따라 자원을 늘리거나 줄인다        |
| **Message Driven** | 비동기 메시지 전달로 컴포넌트 간 결합을 낮춘다 |

---

## 3. Reactive Streams 표준

### 4개 인터페이스가 전부다

Reactive Streams는 JVM에서의 비동기 스트림 처리를 위한 **표준 스펙**이다.
인터페이스 4개가 전부이고, 나머지는 전부 이 위에 쌓은 것이다.

```java
public interface Publisher<T> {
	void subscribe(Subscriber<? super T> s);
}

public interface Subscriber<T> {
	void onSubscribe(Subscription s);

	void onNext(T t);          // 데이터 수신

	void onError(Throwable t); // 에러 (터미널 시그널)

	void onComplete();         // 완료 (터미널 시그널)
}

public interface Subscription {
	void request(long n);      // 배압 - "n개만 줘"

	void cancel();             // 구독 취소
}

public interface Processor<T, R> extends Subscriber<T>, Publisher<R> {
	// Subscriber이면서 Publisher (중간 처리자)
}
```

### 구독 흐름

```
Publisher                    Subscriber
    │                           │
    │    subscribe(subscriber)  │
    │ ◄──────────────────────── │
    │                           │
    │    onSubscribe(subscription)
    │ ────────────────────────► │
    │                           │
    │    request(3)             │  ← "3개만 보내줘"
    │ ◄──────────────────────── │
    │                           │
    │    onNext("data-1")       │
    │ ────────────────────────► │
    │    onNext("data-2")       │
    │ ────────────────────────► │
    │    onNext("data-3")       │
    │ ────────────────────────► │
    │                           │
    │    request(2)             │  ← "2개 더 줘"
    │ ◄──────────────────────── │
    │                           │
    │    onNext("data-4")       │
    │ ────────────────────────► │
    │    onComplete()           │  ← 더 이상 데이터 없음
    │ ────────────────────────► │
```

핵심 규칙:

- `onNext`는 `request(n)`에서 요청한 n개를 초과할 수 없다
- `onError`와 `onComplete`는 **터미널 시그널** — 둘 중 하나만, 한 번만 호출된다
- `subscribe()` 전까지 아무 일도 일어나지 않는다 (**lazy**)

### Java 9 Flow API

Java 9부터 `java.util.concurrent.Flow`에 동일한 인터페이스가 포함되었다.

```java
// Reactive Streams (외부 라이브러리)
org.reactivestreams.Publisher

// Java 9+ (JDK 내장)
java.util.concurrent.Flow.Publisher

// 둘은 1:1 대응, Flow.Publisher 어댑터로 변환 가능
```

### 구현체 비교

| 구현체                 | 핵심 타입                              | 특징                     | 선택한 프레임워크          |
|---------------------|------------------------------------|------------------------|--------------------|
| **Project Reactor** | `Mono`, `Flux`                     | Spring 생태계 통합          | **Spring WebFlux** |
| **RxJava**          | `Single`, `Observable`, `Flowable` | Android에서 강세, 풍부한 연산자  | Android, Vert.x    |
| **Akka Streams**    | `Source`, `Flow`, `Sink`           | Akka 액터 모델 기반, 그래프 DSL | Akka/Pekko         |

Spring을 쓴다면 선택지는 **Project Reactor**다.

---

## 4. Project Reactor 핵심

### Mono와 Flux

Reactor의 핵심 타입 두 가지:

```
Mono<T>  ── 0개 또는 1개의 데이터 ── 단건 조회, 저장, 삭제
             ├── Mono.just("hello")       → 값 1개
             ├── Mono.empty()             → 값 0개 (정상)
             └── Mono.error(new ...)      → 에러

Flux<T>  ── 0개 ~ N개의 데이터 ── 목록 조회, 스트리밍
             ├── Flux.just("a", "b", "c") → 값 3개
             ├── Flux.range(1, 10)        → 1부터 10까지
             ├── Flux.interval(Duration.ofSeconds(1)) → 매초 0, 1, 2, ...
             └── Flux.empty()             → 값 0개
```

```java
// Mono - 팩스 한 건 조회
Mono<Fax> fax = faxRepository.findById(faxSeq);

// Flux - 팩스 목록 조회
Flux<Fax> faxes = faxRepository.findByStatus(SENT);

// subscribe() 전까지 아무 일도 일어나지 않는다 (lazy)
fax.

subscribe(System.out::println);  // 이 시점에 실행
```

### 주요 연산자

Reactor의 강점은 풍부한 연산자로 데이터 파이프라인을 선언적으로 구성할 수 있다는 것이다.

#### 변환 (Transformation)

```java
// map - 동기 변환 (1:1)
Mono.just(fax)
    .

map(Fax::getTitle)               // Fax → String
    .

map(String::toUpperCase)          // String → String

// flatMap - 비동기 변환 (1:1, 내부에서 Mono/Flux 반환)
Mono.

just(faxSeq)
    .

flatMap(seq ->faxRepository.

findById(seq))  // Long → Mono<Fax>
	// flatMap은 Mono를 풀어서(flatten) 연결한다

// flatMapMany - Mono → Flux 변환
	Mono.

just(userId)
    .

flatMapMany(id ->faxRepository.

findByUserId(id))  // Mono → Flux
```

`map` vs `flatMap`의 차이:

```
map:     T → R              (동기 변환)
flatMap: T → Mono<R>        (비동기 변환, 다른 리액티브 호출과 연결)
```

#### 필터링 (Filtering)

```java
Flux.fromIterable(faxList)
    .

filter(fax ->fax.

getStatus() ==SENT)       // 조건에 맞는 것만
	.

distinct()                                     // 중복 제거
    .

take(10)                                       // 처음 10개만
    .

skip(5)                                        // 처음 5개 건너뛰기
```

#### 조합 (Combining)

```java
// zip - 두 소스를 1:1로 결합
Mono<Fax> fax = faxRepository.findById(seq);
Mono<User> user = userRepository.findById(userSeq);

Mono.

zip(fax, user)
    .

map(tuple ->new

FaxDetail(tuple.getT1(),tuple.

getT2()));
// 두 쿼리가 동시에 실행된다 (비동기)

// switchIfEmpty - 값이 없을 때 대체
	faxRepository.

findById(seq)
    .

switchIfEmpty(Mono.error(new FaxNotFoundException(seq)));

// concat - 순서대로 연결
	Flux.

concat(recentFaxes, archiveFaxes);  // 첫 번째가 끝나면 두 번째 시작
```

### 에러 처리

```java
faxRepository.findById(seq)
// 에러 시 대체값 반환
    .

onErrorReturn(Fax.empty())

	// 에러 시 다른 Mono로 전환
	.

onErrorResume(e ->{
	log.

warn("조회 실패: {}",e.getMessage());
	return Mono.

empty();
    })

		// 에러 변환 (래핑)
		.

onErrorMap(e ->new

FaxServiceException("팩스 조회 실패",e))

	// 에러 로깅 (스트림은 계속)
	.

doOnError(e ->log.

error("에러 발생",e));
```

### Scheduler와 스레드 제어

Reactor는 기본적으로 `subscribe()`를 호출한 스레드에서 실행된다.
스레드를 전환하려면 Scheduler를 사용한다.

```java
Flux.range(1,100)
    .

map(i ->

blockingOperation(i))  // 이 작업을 어디서 실행할 것인가?
	.

subscribeOn(Schedulers.boundedElastic())  // 구독 시점부터 별도 스레드
	.

subscribe();

Flux.

range(1,100)
    .

publishOn(Schedulers.parallel())  // 이 지점부터 다운스트림을 병렬 스레드로
	.

map(i ->

cpuIntensiveWork(i))
	.

subscribe();
```

| Scheduler                     | 용도                           |
|-------------------------------|------------------------------|
| `Schedulers.parallel()`       | CPU 집약 작업 (코어 수만큼 스레드)       |
| `Schedulers.boundedElastic()` | Blocking I/O 격리 (스레드 풀, 제한적) |
| `Schedulers.single()`         | 단일 스레드 (순차 실행 보장)            |
| `Schedulers.immediate()`      | 현재 스레드에서 실행 (기본값)            |

```
subscribeOn: 구독(소스)의 실행 스레드를 지정 — 체인 전체에 영향
publishOn:   이후 연산자의 실행 스레드를 전환 — 지정 위치부터만 영향
```

### Cold vs Hot Publisher

```java
// Cold Publisher - 구독할 때마다 새로 시작 (기본)
Flux<Integer> cold = Flux.range(1, 3);
cold.

subscribe(i ->System.out.

println("A: "+i));  // A: 1, 2, 3
	cold.

subscribe(i ->System.out.

println("B: "+i));  // B: 1, 2, 3 (처음부터 다시)

// Hot Publisher - 구독 시점부터 공유
Sinks.Many<String> sink = Sinks.many().multicast().onBackpressureBuffer();
Flux<String> hot = sink.asFlux();

hot.

subscribe(s ->System.out.

println("A: "+s));
	sink.

tryEmitNext("hello");  // A: hello
hot.

subscribe(s ->System.out.

println("B: "+s));
	sink.

tryEmitNext("world");  // A: world, B: world (B는 hello를 못 받음)
```

| 타입       | 비유               | 특징                        |
|----------|------------------|---------------------------|
| **Cold** | DVD (각자 처음부터 재생) | 구독마다 독립 실행, DB 쿼리/HTTP 요청 |
| **Hot**  | 라이브 방송 (시청 시점부터) | 모든 구독자가 같은 데이터 공유         |

### collectList() 안 쓰는 경우 — SSE (Server-Sent Events)

일반 REST API는 **"요청 1번 → 응답 1번"** 으로 끝난다:

```
클라이언트                    서버
   ──── GET /api/faxes ────→
   ←── [Fax1, Fax2, Fax3] ── (JSON 배열, 한 번에 전부)
   연결 종료
```

10만 건이면 서버가 메모리에 10만 건을 전부 올려서 JSON 배열로 한 번에 보낸다.

SSE는 **"요청 1번 → 응답 N번 (계속 흘려보냄)"** 이다:

```
클라이언트                    서버
   ──── GET /stream ────→
   ←── data: {"faxSeq":1, ...}      (1건 도착, 즉시 화면에 표시)
   ←── data: {"faxSeq":2, ...}      (1건 도착)
   ←── data: {"faxSeq":3, ...}      (1건 도착)
   ...                               (HTTP 연결 끊지 않고 열어둠)
   ←── data: {"faxSeq":100000, ...}  (마지막)
   연결 종료
```

HTTP 연결을 **끊지 않고 열어둔 채** 데이터가 준비되는 대로 1건씩 보낸다.

#### REST API vs SSE 비교

|              | REST API           | SSE (Server-Sent Events)   |
|--------------|--------------------|----------------------------|
| HTTP 연결      | 요청-응답 후 **즉시 종료**  | **열어둔 채** 계속 전송            |
| 응답 형태        | JSON 1덩어리 (배열)     | `text/event-stream` (줄 단위) |
| 메모리          | 전체 결과를 메모리에 올림     | **1건씩 흘려보냄** (메모리 고정)      |
| Content-Type | `application/json` | `text/event-stream`        |
| 실시간          | X — 클라이언트가 폴링해야 함  | **O — 서버가 push**           |

#### SSE 코드 예시

```kotlin
// REST API — 전부 모아서 한 번에 (현재 방식)
@GetMapping("/api/faxes")
suspend fun searchFaxes(): Map<String, Any> {
    val faxes = faxService.searchFaxes(...)      // List<Fax> — 메모리에 전부 올림
    return mapOf("content" to faxes)              // JSON 배열로 한 번에 응답
}

// SSE — 1건씩 흘려보냄
@GetMapping("/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
fun streamFaxes(): Flux<Fax> {
    return Flux.from(dsl.select().from(FAXES))
        .map { toFax(it) }
    // collectList() 안 함 → DB에서 읽는 대로 1건씩 클라이언트에 전송
}
```

#### SSE 실제 사용 사례

| 용도           | 설명                              |
|--------------|---------------------------------|
| **실시간 알림**   | 채팅 메시지, 주문 상태 변경이 오는 대로 push    |
| **대용량 스트리밍** | 10만 건을 메모리에 안 올리고 DB에서 읽는 대로 전송 |
| **실시간 모니터링** | 서버 CPU/메모리 수치를 1초마다 전송          |
| **진행률 표시**   | 팩스 발송 진행률을 실시간으로 보여줌            |

REST API로는 "팩스 발송 상태가 바뀌었는지" 알려면 클라이언트가 1초마다 반복 요청(폴링)해야 한다.
SSE는 서버가 바뀌었을 때만 보내준다.

#### 클라이언트 (JavaScript)

```javascript
// REST API — 1초마다 반복 요청 (폴링)
setInterval(async () => {
	const res = await fetch('/api/faxes/1');
	const fax = await res.json();
	updateUI(fax);                               // 바뀌었든 안 바뀌었든 매번 요청
}, 1000);

// SSE — 서버가 보내줄 때만 받음
const eventSource = new EventSource('/stream');
eventSource.onmessage = (event) => {
	const fax = JSON.parse(event.data);
	updateUI(fax);                               // 서버가 push할 때만 실행
};
```

폴링: 바뀐 게 없어도 매초 요청 → 서버 부하.
SSE: 서버가 변경사항이 있을 때만 전송 → 효율적.

#### SSE vs WebSocket

|        | SSE                  | WebSocket       |
|--------|----------------------|-----------------|
| 방향     | **서버 → 클라이언트** (단방향) | 양방향             |
| 프로토콜   | HTTP 그대로             | WS (별도 프로토콜)    |
| 자동 재접속 | O (브라우저 내장)          | X (직접 구현)       |
| 적합한 경우 | 알림, 모니터링, 스트리밍       | 채팅, 게임 (양방향 필요) |

팩스 상태 모니터링처럼 **서버 → 클라이언트 단방향**이면 SSE가 더 단순하고 적합하다.

### delay() vs Thread.sleep() — 논블로킹 대기 vs 블로킹 대기

둘 다 "1초 기다려"이지만 내부 동작이 완전히 다르다.

#### Thread.sleep() — 블로킹

```
스레드 A: [요청1 처리] → [sleep 1초 — 스레드 점유, 아무것도 못 함] → [나머지 처리]
스레드 B: (비어있음)

→ 스레드 A가 자고 있는 동안 다른 요청을 못 받음
```

스레드가 **잠자면서도 메모리를 차지**하고 있다. 요청이 100개면 스레드 100개가 전부 자고 있어야 한다.

#### delay() — 논블로킹 (코루틴)

```
스레드 A: [요청1 처리] → [delay 시작 — 스레드 반환] → [요청2 처리] → [요청3 처리]
                          ↓ (1초 후 타이머 완료)
스레드 A:                                              → [요청1 나머지 처리]

→ 스레드 A가 기다리는 동안 다른 요청을 처리함
```

`delay()`가 호출되면:

1. "1초 후에 깨워줘" 타이머만 등록
2. **스레드를 즉시 반환** (다른 일 처리 가능)
3. 1초 후 타이머가 코루틴을 다시 이어서 실행

#### 비유

|            | `Thread.sleep()`          | `delay()`               |
|------------|---------------------------|-------------------------|
| 비유         | 식당 의자에 앉아서 음식 기다림 (자리 차지) | 진동벨 받고 밖에서 기다림 (자리 비워줌) |
| 스레드        | 점유한 채 대기                  | 반환 후 대기                 |
| 동시 100명 대기 | 스레드 100개 필요               | 스레드 1~2개로 충분            |

#### 동시 요청 테스트 — 10초 대기

```
Thread.sleep(10000):
  브라우저A: [요청] → [스레드 점유 10초...] → [응답]
  브라우저B: [요청] → [스레드 없음 — 대기...] → 브라우저A 끝나야 처리

delay(10000):
  브라우저A: [요청] → [스레드 반환, 타이머 등록] → ... 10초 후 [응답]
  브라우저B: [요청] → [즉시 처리] → [응답]
```

WebFlux(Netty)는 기본 스레드가 **CPU 코어 수만큼**(보통 4~8개)밖에 없다.
`Thread.sleep()`으로 몇 개만 막히면 서버 전체가 마비되지만,
`delay()`는 스레드를 돌려주므로 동시에 수천 개 요청이 와도 문제없다.

#### 실제 코드 — SSE 엔드포인트의 delay

```kotlin
// 나쁜 예 — 스레드 블로킹 (절대 쓰면 안 됨)
.onEach { Thread.sleep(1000) }  // Netty 이벤트 루프 스레드가 멈춤 → 서버 전체 마비

// 좋은 예 — 코루틴 suspend (현재 코드)
    .onEach { delay(1000) }        // 스레드 반환 → 다른 요청 계속 처리
```

이것이 **리액티브/코루틴의 핵심 장점**이다 — 적은 스레드로 많은 동시 요청을 처리할 수 있는 이유.

---

## 5. Spring WebFlux

### 아키텍처

```
Spring MVC                              Spring WebFlux
─────────────                           ─────────────
Tomcat (Servlet Container)              Netty (Event Loop)
  │                                       │
  ├── Thread Pool (200개)                 ├── Boss Group (1개 스레드, 접속 수락)
  │     └── 요청 하나당 스레드 하나        ├── Worker Group (코어 수만큼, I/O 처리)
  │                                       │     └── 모든 요청을 소수 스레드로 처리
  ▼                                       ▼
Servlet API                             Reactive Streams
  │                                       │
  ├── HttpServletRequest                  ├── ServerHttpRequest
  ├── HttpServletResponse                 ├── ServerHttpResponse
  └── Filter/Interceptor                  └── WebFilter
```

### Netty 이벤트 루프

```
                    ┌─ Channel-1 (요청 A)
Boss Thread ──→ Worker Thread-1 ──┤
  (접속 수락)     (I/O 이벤트)      └─ Channel-2 (요청 B)

              ──→ Worker Thread-2 ──── Channel-3 (요청 C)

              ──→ Worker Thread-3 ──── Channel-4 (요청 D)
                    ...
                (CPU 코어 수만큼)

Worker Thread는 I/O 이벤트가 발생하면 처리하고, 없으면 다른 Channel을 처리.
절대 blocking 하지 않는다.
```

Worker Thread가 blocking되면 이벤트 루프가 멈추고 전체 처리량이 급락한다.
**WebFlux에서 blocking 호출은 치명적이다.**

### Spring MVC vs WebFlux

| 항목       | Spring MVC                          | Spring WebFlux                      |
|----------|-------------------------------------|-------------------------------------|
| 서버       | Tomcat (Servlet)                    | Netty (기본), Tomcat, Undertow        |
| 스레드 모델   | Thread-per-request                  | Event Loop                          |
| 기본 스레드 수 | 200개                                | CPU 코어 수                            |
| 프로그래밍 모델 | 동기, 명령형                             | 비동기, 선언형 (Reactor/Coroutine)        |
| 반환 타입    | `T`, `List<T>`, `ResponseEntity<T>` | `Mono<T>`, `Flux<T>`, `suspend fun` |
| DB 접근    | JDBC, JPA, MyBatis                  | R2DBC, jOOQ (R2DBC)                 |
| Security | `SecurityFilterChain`               | `SecurityWebFilterChain`            |
| 테스트      | `MockMvc`                           | `WebTestClient`                     |
| 장점       | 쉬움, 생태계 성숙, 디버깅 편리                  | 높은 동시성, 적은 리소스, 배압 제어               |
| 단점       | 동시접속 많으면 스레드 고갈                     | 러닝커브, 디버깅 어려움, blocking 금지          |

### Annotated Controller

Spring MVC와 거의 동일한 코드. 반환 타입만 `Mono`/`Flux`로 감싼다.

```java

@RestController
@RequestMapping("/api/faxes")
public class FaxController {

	@GetMapping("/{id}")
	public Mono<Fax> getFax(@PathVariable Long id) {
		return faxRepository.findById(id);
	}

	@GetMapping
	public Flux<Fax> getAllFaxes() {
		return faxRepository.findAll();
	}

	@PostMapping
	public Mono<Fax> createFax(@RequestBody Fax fax) {
		return faxRepository.save(fax);
	}
}
```

### Functional Endpoints

Router + Handler 방식으로 함수형 스타일로 라우팅을 정의한다.

```java

@Configuration
public class FaxRouter {

	@Bean
	public RouterFunction<ServerResponse> routes(FaxHandler handler) {
		return RouterFunctions.route()
			.GET("/api/faxes/{id}", handler::getFax)
			.GET("/api/faxes", handler::getAllFaxes)
			.POST("/api/faxes", handler::createFax)
			.build();
	}
}

@Component
public class FaxHandler {

	public Mono<ServerResponse> getFax(ServerRequest request) {
		Long id = Long.parseLong(request.pathVariable("id"));
		return faxRepository.findById(id)
			.flatMap(fax -> ServerResponse.ok().bodyValue(fax))
			.switchIfEmpty(ServerResponse.notFound().build());
	}
}
```

| 방식                                | 장점                       | 단점           |
|-----------------------------------|--------------------------|--------------|
| **Annotated** (`@RestController`) | 익숙함, 간결함, Spring MVC와 유사 | 리플렉션 기반      |
| **Functional** (`RouterFunction`) | 타입 안전, 테스트 용이, 경량        | 장황함, 익숙하지 않음 |

실무에서는 **Annotated Controller**를 주로 사용한다. Spring MVC 개발자가 바로 적응할 수 있기 때문이다.

### WebFlux를 선택해야 하는 경우

```
WebFlux가 유리한 경우:
├── I/O 대기가 많은 서비스 (외부 API 호출, DB 다수 호출)
├── 높은 동시접속 (수천 ~ 수만 동시 연결)
├── 스트리밍 (SSE, WebSocket)
└── MSA에서 API Gateway 역할

MVC가 유리한 경우:
├── CRUD 위주 서비스 (단순한 DB 읽기/쓰기)
├── CPU 집약 작업 (이미지 처리, 암호화)
├── blocking 라이브러리 의존 (JDBC, JPA)
└── 팀이 Reactive에 익숙하지 않은 경우
```

---

## 6. R2DBC - Non-blocking 데이터베이스

### JDBC는 왜 blocking인가

JDBC는 1997년에 만들어졌다. 당시에는 non-blocking I/O라는 개념 자체가 일반적이지 않았다.

```java
// JDBC - 모든 메서드가 blocking
Connection conn = dataSource.getConnection();    // blocking: 커넥션 획득 대기
PreparedStatement ps = conn.prepareStatement(sql);
ResultSet rs = ps.executeQuery();                // blocking: DB 응답 대기
while(rs.

next()){                              // blocking: 행 읽기 대기
	// ...
	}
```

모든 호출이 스레드를 blocking한다. WebFlux의 이벤트 루프에서 JDBC를 호출하면 이벤트 루프가 멈춘다.

### R2DBC란

**Reactive Relational Database Connectivity** — JDBC의 non-blocking 버전이다.

```
JDBC                                R2DBC
────                                ─────
Connection                          Connection (Reactive)
PreparedStatement                   Statement
ResultSet (blocking iteration)      Result → Flux<Row> (non-blocking stream)
DataSource                          ConnectionFactory
커넥션 풀: HikariCP                  커넥션 풀: r2dbc-pool
```

```java
// R2DBC - non-blocking
connectionFactory.create()                       // Mono<Connection>
    .

flatMapMany(conn ->
	conn.

createStatement("SELECT * FROM faxes WHERE status = $1")
            .

bind("$1","SENT")
            .

execute()                           // Flux<Result>
    )
		.

flatMap(result ->result.

map((row, meta) ->
	new

Fax(row.get("fax_seq", Long .class),
                row.

get("title",String .class))
	))
	.

subscribe(System.out::println);             // 이 시점에 실행
```

### Spring Data R2DBC

Spring Data의 Repository 패턴을 R2DBC에 적용한 것이다. JPA의 Repository와 거의 동일하게 사용한다.

```java
public interface FaxRepository extends ReactiveCrudRepository<Fax, Long> {

	Flux<Fax> findByStatus(String status);

	@Query("SELECT * FROM faxes WHERE send_dt >= :from AND send_dt < :to")
	Flux<Fax> findBySendDtBetween(LocalDateTime from, LocalDateTime to);

	Mono<Long> countByStatus(String status);
}
```

```java
// 사용
faxRepository.findById(1L)                    // Mono<Fax>
faxRepository.

findByStatus("SENT")            // Flux<Fax>
faxRepository.

save(fax)                       // Mono<Fax>
faxRepository.

deleteById(1L)                  // Mono<Void>
```

### 지원 데이터베이스

| DB         | R2DBC 드라이버                            |
|------------|---------------------------------------|
| PostgreSQL | `r2dbc-postgresql` (공식)               |
| MySQL      | `r2dbc-mysql` (jasync-sql 또는 mariadb) |
| MariaDB    | `r2dbc-mariadb` (공식)                  |
| H2         | `r2dbc-h2` (테스트용)                     |
| MS SQL     | `r2dbc-mssql` (공식)                    |
| Oracle     | `oracle-r2dbc` (공식)                   |

### R2DBC의 한계

- **JPA를 대체하지 않는다**: 엔티티 매핑, 지연 로딩, 변경 감지 같은 ORM 기능이 없다
- **Spring Data R2DBC는 간단한 쿼리만**: 복잡한 조인, 동적 SQL에는 **jOOQ**를 함께 사용한다
- **성숙도**: JDBC에 비해 드라이버와 도구 생태계가 아직 부족하다

---

## 7. Kotlin Coroutine과 WebFlux

### 왜 Coroutine인가

Reactor의 `Mono`/`Flux` 체인은 강력하지만 읽기 어렵다.

```java
// Reactor만 사용 (콜백 체인)
fun sendFax(dto:FaxSendDto):Mono

<FaxSeqVo> {
	return faxRepository.nextSeq()
		.flatMap {
		seq ->
			val fax = Fax.of(seq, dto)
		faxRepository.save(fax)
			.then(faxYearRepository.save(FaxYear.of(fax)))
			.then(queueRepository.save(AssignQueue.of(fax)))
			.thenReturn(FaxSeqVo(seq))
	}
        .onErrorMap {
		e -> FaxSendException("팩스 전송 실패", e)
	}
}

// Coroutine 사용 (순차적으로 읽힌다)
suspend fun

sendFax(dto:FaxSendDto):

FaxSeqVo {
	val seq = faxRepository.nextSeq().awaitSingle()
	val fax = Fax.of(seq, dto)
	faxRepository.save(fax).awaitSingle()
	faxYearRepository.save(FaxYear.of(fax)).awaitSingle()
	queueRepository.save(AssignQueue.of(fax)).awaitSingle()
	return FaxSeqVo(seq)
}
```

Coroutine은 **동기 코드처럼 읽히지만 내부적으로 non-blocking**이다. Reactor의 `Mono`/`Flux`를 직접 다루지 않아도 된다.

### suspend fun 기초

```kotlin
// suspend fun = 일시 중단 가능한 함수
// 컴파일러가 콜백으로 변환한다 (CPS: Continuation Passing Style)

suspend fun getFax(id: Long): Fax {
    val fax = faxRepository.findById(id)  // 여기서 일시 중단 (스레드 반환)
    // DB 응답이 오면 재개
    return fax
}

// 일반 함수에서 suspend fun 호출 불가
// fun main() { getFax(1L) }  // 컴파일 에러

// Coroutine 스코프 내에서 호출
runBlocking { getFax(1L) }  // 테스트용
launch { getFax(1L) }       // 비동기 실행
```

### Coroutine ↔ Reactor 변환

`kotlinx-coroutines-reactor` 라이브러리가 Reactor 타입과 Coroutine 사이의 브릿지를 제공한다.

```kotlin
// Mono → suspend fun (값 꺼내기)
val fax: Fax = mono.awaitSingle()         // Mono<Fax> → Fax (null 불가)
val fax: Fax? = mono.awaitSingleOrNull()  // Mono<Fax> → Fax? (null 허용)

// Flux → Flow (스트림 변환)
val flow: Flow<Fax> = flux.asFlow()       // Flux<Fax> → Flow<Fax>

// suspend fun → Mono
val mono: Mono<Fax> = mono { getFax(1L) } // suspend fun → Mono<Fax>

// Flow → Flux
val flux: Flux<Fax> = flow.asFlux()       // Flow<Fax> → Flux<Fax>

// jOOQ R2DBC 실행 결과 변환
val count = dsl.fetchCount(FAXES)
    .awaitSingle()                         // Publisher<Integer> → Int

val faxes = dsl.selectFrom(FAXES)
    .awaitList()                           // Publisher<Record> → List<Record>
```

### withContext - Blocking I/O 격리

WebFlux에서 Blocking 호출은 반드시 별도 디스패처로 격리해야 한다.

```kotlin
// ❌ 이벤트 루프에서 blocking I/O
suspend fun moveFile(fax: Fax) {
    Files.move(source, target)  // Netty 이벤트 루프 멈춤!
}

// ✅ IO 디스패처로 전환
suspend fun moveFile(fax: Fax) {
    withContext(Dispatchers.IO) {
        Files.move(source, target)  // IO 전용 스레드에서 실행
    }
}
```

| 디스패처                     | 용도                      | 스레드 수          |
|--------------------------|-------------------------|----------------|
| `Dispatchers.Default`    | CPU 집약 작업               | CPU 코어 수       |
| `Dispatchers.IO`         | Blocking I/O (파일, JDBC) | 최대 64개 (확장 가능) |
| `Dispatchers.Unconfined` | 호출 스레드에서 시작             | (사용 주의)        |

### Flow vs Flux

| 항목       | `Flow<T>` (Kotlin)       | `Flux<T>` (Reactor)      |
|----------|--------------------------|--------------------------|
| 소속       | kotlinx.coroutines       | Project Reactor          |
| 문법       | `collect { }`, `map { }` | `.subscribe()`, `.map()` |
| Cold/Hot | 항상 Cold                  | Cold (기본), Hot 가능        |
| 배압       | 자연스럽게 지원 (suspend)       | `request(n)` 명시          |
| 사용처      | Coroutine 코드 내부          | Reactor/WebFlux API 경계   |

```kotlin
// WebFlux Controller에서 Flow 반환 (자동으로 Flux 변환)
@GetMapping("/faxes", produces = [MediaType.APPLICATION_NDJSON_VALUE])
fun streamFaxes(): Flow<Fax> = faxRepository.findAll().asFlow()

// 내부 로직에서 Flow 사용
suspend fun processAll() {
    faxRepository.findAll().asFlow()
        .filter { it.status == "PENDING" }
        .collect { fax -> processFax(fax) }
}
```

### Coroutine 어댑터 — 전체 목록

`kotlinx-coroutines-reactor` + `kotlinx-coroutines-reactive`에서 제공.

#### Publisher → 값 (suspend 함수)

| 어댑터                            | 결과   | empty일 때     | 2건 이상일 때 | 용도                     |
|--------------------------------|------|--------------|----------|------------------------|
| `awaitFirstOrNull()`           | `T?` | `null`       | 첫 번째 반환  | 단건 조회 (없을 수 있음)        |
| `awaitFirst()`                 | `T`  | **예외**       | 첫 번째 반환  | 반드시 결과 있음              |
| `awaitFirstOrDefault(default)` | `T`  | `default` 반환 | 첫 번째 반환  | 기본값 필요할 때              |
| `awaitFirstOrElse { }`         | `T`  | 람다 실행        | 첫 번째 반환  | 기본값 계산 필요할 때           |
| `awaitSingle()`                | `T`  | **예외**       | **예외**   | 정확히 1건 (COUNT, INSERT) |
| `awaitSingleOrNull()`          | `T?` | `null`       | **예외**   | Mono 전용, 0 or 1건       |
| `awaitLast()`                  | `T`  | **예외**       | 마지막 반환   | 마지막 요소 필요할 때           |

참고: `collectList()`는 Coroutine 어댑터가 아니라 Reactor 연산자이다 (`Flux<T>` → `Mono<List<T>>`).

#### Flux → Flow 변환

| 어댑터        | 변환                    | 용도                   |
|------------|-----------------------|----------------------|
| `asFlow()` | `Flux<T>` → `Flow<T>` | Kotlin Flow로 스트리밍 처리 |

#### Coroutine → Reactor 변환 (역방향)

| 빌더         | 변환                     | 용도                      |
|------------|------------------------|-------------------------|
| `mono { }` | suspend 블록 → `Mono<T>` | Coroutine 코드를 Mono로 감싸기 |
| `flux { }` | suspend 블록 → `Flux<T>` | Coroutine 코드를 Flux로 감싸기 |

#### 현재 코드에서 안 쓰는 것들의 사용 예시

```kotlin
// awaitFirstOrDefault — 기본값
val status = Mono.from(
    dsl.select(FAXES.SEND_STATUS).from(FAXES).where(...
)
).map { it.value1() }
    .awaitFirstOrDefault("UNKNOWN")     // 없으면 "UNKNOWN"

// awaitSingleOrNull — Mono 전용 (awaitFirstOrNull과 비슷하지만 2건 이상이면 예외)
val fax = Mono.from(
    dsl.select().from(FAXES).where(FAXES.FAX_SEQ.eq(1L))
).map { toFax(it) }
    .awaitSingleOrNull()                // 0건 → null, 1건 → Fax, 2건+ → 예외

// asFlow — Flux를 Kotlin Flow로 변환
val faxFlow: Flow<Fax> = Flux.from(
    dsl.select().from(FAXES)
).map { toFax(it) }
    .asFlow()                            // Flow<Fax>로 변환

faxFlow.collect { fax ->                 // 1건씩 처리
    println(fax.faxSeq)
}

// mono { } — Coroutine 코드를 Mono로 감싸기
val result: Mono<Fax> = mono {
    val seq = nextFaxSeq()               // suspend 함수 호출 가능
    val fax = Fax(faxSeq = seq)
    insertFax(fax)
    fax
}
```

#### awaitFirstOrNull vs awaitSingleOrNull

```kotlin
// awaitFirstOrNull — 2건 이상이어도 첫 번째 반환 (관대)
Flux.just("A", "B", "C").awaitFirstOrNull()     // → "A"

// awaitSingleOrNull — 2건 이상이면 예외 (엄격)
Flux.just("A", "B", "C").awaitSingleOrNull()    // → IllegalArgumentException!
```

현재 코드에서 `Mono`에 `awaitFirstOrNull()`을 쓰고 있는데,
`Mono`는 항상 0~1건이므로 `awaitSingleOrNull()`이 더 의미가 정확하다. 동작은 동일.

---

## 8. 전체 기술 스택 조감도

지금까지 다룬 기술들이 어떻게 계층을 이루는지 정리한다.

```
Reactive Programming     "데이터를 비동기 스트림으로 처리하자" (패러다임)
       ↓
Reactive Streams         Publisher/Subscriber 인터페이스 4개 (표준)
       ↓
Project Reactor          Mono/Flux 구현 (라이브러리)
       ↓
Spring WebFlux           Reactor로 웹 서버 만든 것 (프레임워크)
       ↓
+ R2DBC                  Reactor로 DB 연결한 것 (드라이버)
       ↓
+ jOOQ                   타입 안전 SQL 생성 → R2DBC로 실행 (쿼리 빌더)
       ↓
+ Coroutine              Mono/Flux 대신 suspend fun으로 작성 (문법 단순화)
```

| 계층                       | 정체          | 역할                                                                         |
|--------------------------|-------------|----------------------------------------------------------------------------|
| **Reactive Programming** | 프로그래밍 패러다임  | "데이터를 비동기 스트림으로 처리하자"라는 철학                                                 |
| **Reactive Streams**     | 표준 인터페이스    | `Publisher`/`Subscriber` 4개 인터페이스 약속 (Java 9+ `java.util.concurrent.Flow`) |
| **Project Reactor**      | 라이브러리 (구현체) | `Mono`(0~1개), `Flux`(0~N개)를 제공                                             |
| **Spring WebFlux**       | 웹 프레임워크     | Reactor + Netty로 만든 Spring의 웹 계층                                           |
| **R2DBC**                | DB 드라이버     | Reactor로 DB에 연결 (JDBC의 non-blocking 버전)                                    |
| **jOOQ**                 | 쿼리 빌더       | 타입 안전 SQL 생성, R2DBC Publisher로 실행                                          |
| **Coroutine**            | 문법 단순화      | `Mono`/`Flux` 대신 `suspend fun`으로 작성                                        |

---

# Part 2: 마이그레이션 계획

## 9. 실전: Spring MVC → WebFlux 마이그레이션

여기서부터는 실제 운영 중인 fax-api 서비스를 전환하는 과정이다.
Spring MVC + MyBatis 기반을 WebFlux + Kotlin Coroutine + jOOQ + R2DBC로 전환한다.

### 현재 아키텍처 (fax-api)

```
Client
  │
  ▼
FaxApiController (Spring MVC, @RestController)
  │  @RequireSession (세션 검증 AOP)
  ▼
FaxApiServiceImpl (@Transactional)
  │  비즈니스 로직 + 파일 처리 (EFS/S3)
  ▼
FaxApiMapper (MyBatis, @Mapper)
  │  XML 기반 동적 SQL
  ▼
PostgreSQL (JDBC, blocking)
```

#### 현재 기술 스택

| 계층          | 기술                                           |
|-------------|----------------------------------------------|
| Web         | Spring MVC (Tomcat)                          |
| Security    | Spring Security OAuth2 Resource Server (JWT) |
| Service     | @Transactional, 동기 비즈니스 로직                   |
| Data Access | **MyBatis** (XML 매퍼, 동적 SQL)                 |
| DB Driver   | JDBC (blocking)                              |
| Language    | Kotlin 2.3                                   |
| 동시성         | Virtual Thread (Spring Boot 4.0 기본)          |

#### 현재 주요 의존성

```kotlin
dependencies {
    api(project(":new-fax"))
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-webflux") // WebClient용
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("com.knet.commons.util:rest-api-oauth2-util:1.8")
    implementation("com.knet.commons.util:pageable-util:1.4")
}
```

### 목표 아키텍처

```
Client
  │
  ▼
FaxApiController (WebFlux, suspend fun)
  │  Security Filter (Reactive OAuth2)
  ▼
FaxApiService (suspend fun, Coroutine)
  │  비즈니스 로직 + 파일 처리
  ▼
jOOQ DSLContext (타입 안전 SQL 생성)
  │  R2DBC Publisher
  ▼
PostgreSQL (R2DBC, non-blocking)
```

#### 목표 기술 스택

| 계층          | 현재                           | 목표                                  |
|-------------|------------------------------|-------------------------------------|
| Web         | Spring MVC (Tomcat)          | **Spring WebFlux (Netty)**          |
| Security    | Spring Security OAuth2 (서블릿) | **Spring Security Reactive OAuth2** |
| Service     | @Transactional (동기)          | **@Transactional + suspend fun**    |
| Data Access | MyBatis (XML)                | **jOOQ (타입 안전 SQL)**                |
| DB Driver   | JDBC (blocking)              | **R2DBC (non-blocking)**            |
| Language    | Kotlin                       | Kotlin + **Coroutine**              |
| 동시성         | Virtual Thread               | **Netty 이벤트 루프 + Coroutine**        |

### 전환 대상 파일

#### 소스 파일

| 파일                                     | 현재                        | 전환 후                          |
|----------------------------------------|---------------------------|-------------------------------|
| `FaxApiApplication.kt`                 | @SpringBootApplication    | 변경 없음                         |
| `FaxApiController.kt`                  | MockMvc 기반, 14개 엔드포인트     | suspend fun, WebFlux          |
| `FaxApiServiceImpl.kt`                 | @Transactional, 동기        | suspend fun, Coroutine        |
| `FaxApiMapper.kt` + `FaxApiMapper.xml` | MyBatis                   | **삭제** → jOOQ DSLContext      |
| `FaxApiSecurityConfig.kt`              | SecurityFilterChain (서블릿) | SecurityWebFilterChain (리액티브) |
| `FaxApiWebMvcConfig.kt`                | WebMvcConfigurer          | **삭제** → WebFlux 설정           |
| `FaxApiSqlSessionConfig.kt`            | MyBatis SqlSession 설정     | **삭제** → jOOQ + R2DBC 설정      |
| `FaxApiAspect.kt`                      | AOP (@Around)             | WebFilter 또는 Coroutine 미들웨어   |

#### 테스트 파일

| 파일                         | 현재                 | 전환 후                      |
|----------------------------|--------------------|---------------------------|
| `FaxApiControllerTests.kt` | MockMvc + RestDocs | WebTestClient + RestDocs  |
| `FaxApiServiceTests.kt`    | @SpringBootTest    | @SpringBootTest + runTest |
| `FaxValidatorTests.kt`     | 단위 테스트             | 변경 없음 (도메인 로직)            |

---

### Step 1. 의존성 변경

#### 제거

```kotlin
// Spring MVC → WebFlux로 대체
-implementation("org.springframework.boot:spring-boot-starter-web")

// MyBatis → jOOQ로 대체
-MyBatis 관련 의존성 전부

// MockMvc 테스트
        -testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
-testImplementation("org.springframework.restdocs:spring-restdocs-mockmvc")
```

#### 추가

```kotlin
dependencies {
    // WebFlux (Netty)
    implementation("org.springframework.boot:spring-boot-starter-webflux")

    // Kotlin Coroutine
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor")  // Mono/Flux ↔ Coroutine

    // R2DBC (non-blocking DB)
    implementation("org.springframework.boot:spring-boot-starter-data-r2dbc")
    runtimeOnly("org.postgresql:r2dbc-postgresql")

    // jOOQ (타입 안전 SQL)
    implementation("org.springframework.boot:spring-boot-starter-jooq")

    // Security (리액티브)
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    // 서블릿 → 리액티브 자동 전환 (spring-boot-starter-web 없으면 리액티브 모드)

    // 테스트
    testImplementation("org.springframework.boot:spring-boot-starter-webflux-test") // WebTestClient
    testImplementation("org.springframework.restdocs:spring-restdocs-webtestclient")
}
```

---

### Step 2. Controller 전환

#### 현재: Spring MVC

```kotlin
@RestController
@RequestMapping("/api/faxes")
class FaxApiController(
    private val faxApiService: FaxApiService
) {
    @PostMapping("/send")
    @RequireSession
    fun sendFax(@RequestBody faxSendDto: FaxSendDto): FaxSeqVo {
        return faxApiService.sendFax(faxSendDto)
    }

    @GetMapping
    @RequireSession
    fun searchFaxes(
        @ModelAttribute faxSearchDto: FaxSearchDto,
        pageable: Pageable
    ): SimplePage<Fax> {
        return faxApiService.searchFaxes(faxSearchDto, pageable)
    }

    @GetMapping("/seq/{faxSeq}")
    @RequireSession
    fun getFaxBySeq(@PathVariable faxSeq: Long): Fax {
        return faxApiService.getFaxBySeq(faxSeq)
    }
}
```

#### 전환 후: WebFlux + Coroutine

```kotlin
@RestController
@RequestMapping("/api/faxes")
class FaxApiController(
    private val faxApiService: FaxApiService
) {
    @PostMapping("/send")
    suspend fun sendFax(@RequestBody faxSendDto: FaxSendDto): FaxSeqVo {
        // suspend fun → non-blocking
        return faxApiService.sendFax(faxSendDto)
    }

    @GetMapping
    suspend fun searchFaxes(
        @ModelAttribute faxSearchDto: FaxSearchDto,
        pageable: Pageable
    ): SimplePage<Fax> {
        return faxApiService.searchFaxes(faxSearchDto, pageable)
    }

    @GetMapping("/seq/{faxSeq}")
    suspend fun getFaxBySeq(@PathVariable faxSeq: Long): Fax {
        return faxApiService.getFaxBySeq(faxSeq)
    }
}
```

**변경점:**

- `fun` → `suspend fun` (반환 타입은 동일)
- `@RequireSession` AOP → WebFilter로 대체 (Coroutine에서 AOP 제한)
- 나머지 코드는 거의 동일

---

### Step 3. Service 전환

#### 현재: 동기 서비스

```kotlin
@Service
@Transactional
class FaxApiServiceImpl(
    private val faxApiMapper: FaxApiMapper
) : FaxApiService {

    override fun sendFax(faxSendDto: FaxSendDto): FaxSeqVo {
        val faxSeq = faxApiMapper.nextFaxSeq()
        val fax = Fax.of(faxSeq, faxSendDto, session)

        // 파일 이동 (NAS → EFS/S3)
        moveFile(fax)

        // DB 저장
        faxApiMapper.insertFax(fax)
        faxApiMapper.insertFaxYear(fax)
        faxApiMapper.insertAssignQueue(fax)

        return FaxSeqVo(faxSeq)
    }

    @Transactional(readOnly = true)
    override fun searchFaxes(dto: FaxSearchDto, pageable: Pageable): SimplePage<Fax> {
        val total = faxApiMapper.countFaxes(dto)
        val faxes = faxApiMapper.searchFaxes(dto, pageable)
        return SimplePage(faxes, pageable, total)
    }
}
```

#### 전환 후: Coroutine 서비스

```kotlin
@Service
class FaxApiServiceImpl(
    private val dsl: DSLContext  // jOOQ
) : FaxApiService {

    @Transactional
    override suspend fun sendFax(faxSendDto: FaxSendDto): FaxSeqVo {
        // jOOQ로 시퀀스 조회 (R2DBC non-blocking)
        val faxSeq = dsl.select(DSL.field("NEXTVAL('faxes_fax_seq_seq')"))
            .awaitSingle()
            .into(Long::class.java)

        val fax = Fax.of(faxSeq, faxSendDto, session)

        // 파일 이동 (I/O 작업은 withContext로 디스패처 전환)
        withContext(Dispatchers.IO) {
            moveFile(fax)
        }

        // jOOQ로 INSERT (R2DBC non-blocking)
        dsl.insertInto(FAXES)
            .set(FAXES.FAX_SEQ, fax.faxSeq)
            .set(FAXES.TITLE, fax.title)
            .set(FAXES.STATUS, fax.status)
            .awaitExecute()

        return FaxSeqVo(faxSeq)
    }

    @Transactional(readOnly = true)
    override suspend fun searchFaxes(dto: FaxSearchDto, pageable: Pageable): SimplePage<Fax> {
        val condition = buildSearchCondition(dto)

        val total = dsl.fetchCount(dsl.selectFrom(FAXES).where(condition))
            .toLong()

        val faxes = dsl.select(FAXES.asterisk())
            .from(FAXES)
            .where(condition)
            .orderBy(FAXES.CREATED_AT.desc())
            .offset(pageable.offset.toInt())
            .limit(pageable.pageSize)
            .awaitList()
            .map { it.into(Fax::class.java) }

        return SimplePage(faxes, pageable, total)
    }

    // MyBatis XML의 <where><if> 동적 SQL → jOOQ Condition
    private fun buildSearchCondition(dto: FaxSearchDto): Condition {
        var condition = DSL.noCondition()

        dto.faxSeqs?.let {
            condition = condition.and(FAXES.FAX_SEQ.`in`(it))
        }
        dto.sendStatuses?.let {
            condition = condition.and(FAXES.SEND_STATUS.`in`(it))
        }
        dto.fromDt?.let {
            condition = condition.and(FAXES.SEND_DT.ge(it))
        }
        dto.toDt?.let {
            condition = condition.and(FAXES.SEND_DT.lt(it))
        }

        return condition
    }
}
```

**변경점:**

- `fun` → `suspend fun`
- MyBatis Mapper → jOOQ DSLContext
- XML 동적 SQL(`<where><if>`) → Kotlin의 `?.let` + jOOQ Condition
- 파일 I/O → `withContext(Dispatchers.IO)`로 블로킹 격리
- `@Transactional`은 Spring의 Coroutine 지원으로 그대로 사용 가능

---

### Step 4. MyBatis XML → jOOQ 전환

이 부분이 가장 큰 작업이다. MyBatis XML의 동적 SQL을 jOOQ로 옮긴다.

#### 전환 매핑

| MyBatis XML              | jOOQ                                                                                   |
|--------------------------|----------------------------------------------------------------------------------------|
| `<select>` + ResultMap   | `dsl.select().from().fetch()`                                                          |
| `<insert>`               | `dsl.insertInto().set().execute()`                                                     |
| `<update>`               | `dsl.update().set().where().execute()`                                                 |
| `<delete>`               | `dsl.deleteFrom().where().execute()`                                                   |
| `<where><if test="...">` | `var condition = DSL.noCondition(); dto.field?.let { condition = condition.and(...) }` |
| `<foreach>`              | `.in(list)`                                                                            |
| `<selectKey>` (시퀀스)      | `dsl.select(DSL.field("NEXTVAL(...)"))`                                                |
| `#{value}` 바인딩           | jOOQ가 자동 바인딩                                                                           |
| `${value}` 문자열 치환        | `DSL.field(DSL.name(...))` (동적 테이블명)                                                   |

#### 동적 테이블명 (아카이브)

fax-api는 연도별 아카이브 테이블(`archive.faxes_2024`, `archive.faxes_2025`)을 사용한다.
MyBatis에서는 `${year}`로 테이블명을 치환하는데, jOOQ에서는:

```kotlin
// MyBatis XML
// <select> SELECT * FROM archive.faxes_${year} WHERE ... </select>

// jOOQ - 동적 테이블명
fun getArchiveTable(year: Int): Table<*> =
    DSL.table(DSL.name("archive", "faxes_$year"))

suspend fun searchArchiveFaxes(year: Int, dto: FaxSearchDto): List<Fax> {
    val archiveTable = getArchiveTable(year)
    return dsl.select()
        .from(archiveTable)
        .where(buildSearchCondition(dto))
        .awaitList()
        .map { it.into(Fax::class.java) }
}
```

#### jOOQ Code Generation 설정

DB 스키마에서 타입 안전한 코드를 자동 생성한다:

```kotlin
// build.gradle.kts
plugins {
    id("org.jooq.jooq-codegen-gradle") version "3.19.+"
}

jooq {
    configuration {
        jdbc {
            driver = "org.postgresql.Driver"
            url = "jdbc:postgresql://localhost:5432/faxdb"
            user = "fax"
            password = "password"
        }
        generator {
            database {
                inputSchema = "public"
                includes = "faxes|fax_years|custom_keys|partner_keys|partner_group_keys|reserve_queues|assign_queues"
            }
            target {
                packageName = "com.knet.msa.fax.jooq"
                directory = "src/main/generated"
            }
        }
    }
}
```

생성 결과:

```
src/main/generated/
  com/knet/msa/fax/jooq/
    tables/
      Faxes.kt          → FAXES.FAX_SEQ, FAXES.TITLE, ...
      FaxYears.kt        → FAX_YEARS.FAX_SEQ, FAX_YEARS.YEAR, ...
      AssignQueues.kt    → ASSIGN_QUEUES.FAX_SEQ, ...
      ReserveQueues.kt   → RESERVE_QUEUES.FAX_SEQ, ...
      CustomKeys.kt      → CUSTOM_KEYS.CUSTOM_KEY, ...
      PartnerKeys.kt     → PARTNER_KEYS.PARTNER_KEY, ...
```

컬럼명 오타 → **컴파일 에러**. MyBatis XML에서는 런타임에야 발견되던 오류를 빌드 시점에 잡는다.

---

### Step 5. Security 전환 (서블릿 → 리액티브)

#### 현재: 서블릿 기반

```kotlin
@Configuration
@EnableWebSecurity
class FaxApiSecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .csrf { it.disable() }
            .cors { it.configurationSource(corsConfig()) }
            .headers { it.frameOptions { fo -> fo.sameOrigin() } }
            .authorizeHttpRequests { it.anyRequest().permitAll() }
            .oauth2ResourceServer { it.jwt { jwt -> jwt.decoder(jwtDecoder()) } }
            .build()
}
```

#### 전환 후: 리액티브 기반

```kotlin
@Configuration
@EnableWebFluxSecurity
class FaxApiSecurityConfig {

    @Bean
    fun securityWebFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain =
        http
            .csrf { it.disable() }
            .cors { it.configurationSource(corsConfig()) }
            .headers { it.frameOptions { fo -> fo.mode(SAMEORIGIN) } }
            .authorizeExchange { it.anyExchange().permitAll() }
            .oauth2ResourceServer { it.jwt { jwt -> jwt.jwtDecoder(jwtDecoder()) } }
            .build()
}
```

**변경점:**

| 서블릿 (현재)                   | 리액티브 (전환 후)                |
|----------------------------|----------------------------|
| `@EnableWebSecurity`       | `@EnableWebFluxSecurity`   |
| `HttpSecurity`             | `ServerHttpSecurity`       |
| `SecurityFilterChain`      | `SecurityWebFilterChain`   |
| `.authorizeHttpRequests()` | `.authorizeExchange()`     |
| `.anyRequest()`            | `.anyExchange()`           |
| `NimbusJwtDecoder`         | `NimbusReactiveJwtDecoder` |

---

### Step 6. AOP → WebFilter 전환

#### 현재: @Around AOP

```kotlin
@Aspect
@Component
class FaxApiAspect : ApiControllerAspect() {
    @Around("execution(* com.knet.msa.fax.api.controller.FaxApiController.*(..))")
    override fun around(joinPoint: ProceedingJoinPoint): Any? {
        // API 응답 래핑
        return super.around(joinPoint)
    }
}
```

WebFlux + Coroutine에서는 AOP가 `suspend fun`을 제대로 프록시하지 못할 수 있다.
WebFilter로 대체한다:

#### 전환 후: WebFilter

```kotlin
@Component
class ApiResponseFilter : WebFilter {

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        // 응답 래핑 로직
        val decoratedExchange = ServerWebExchangeDecorator(exchange, wrappedResponse)
        return chain.filter(decoratedExchange)
    }
}
```

또는 `@ControllerAdvice` + `ResponseBodyResultHandler`로 응답을 래핑하는 방식도 가능하다.

---

### Step 7. 테스트 전환

#### 현재: MockMvc

```kotlin
@SpringBootTest
@AutoConfigureMockMvc
@AutoConfigureRestDocs
class FaxApiControllerTests {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun searchFaxes() {
        mockMvc.perform(
            get("/api/faxes")
                .header(HttpHeaders.AUTHORIZATION, "Bearer $token")
                .params(searchParams)
        )
            .andDo(print())
            .andExpect(status().isOk)
            .andDo(getDocument("{class-name}/{method-name}", ...))
    }
}
```

#### 전환 후: WebTestClient

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@AutoConfigureRestDocs
class FaxApiControllerTests {

    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun searchFaxes() {
        webTestClient.get()
            .uri { it.path("/api/faxes").queryParams(searchParams).build() }
            .header(HttpHeaders.AUTHORIZATION, "Bearer $token")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .consumeWith(document("fax-api-controller-tests/search-faxes", ...))
    }
}
```

#### Coroutine 서비스 테스트

```kotlin
@SpringBootTest
class FaxApiServiceTests {

    @Autowired
    lateinit var faxApiService: FaxApiService

    @Test
    fun sendFax() = runTest {  // Coroutine 테스트
        val result = faxApiService.sendFax(testFaxSendDto)
        assertNotNull(result.faxSeq)
    }
}
```

---

### Step 8. application.yml 변경

```yaml
spring:
  # 기존 (제거)
  # datasource:
  #   url: jdbc:postgresql://...
  #   driver-class-name: org.postgresql.Driver

  # 추가 (R2DBC)
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/faxdb
    username: fax
    password: ${DB_PASSWORD}
    pool:
      initial-size: 10
      max-size: 20

  # WebFlux는 Netty 기반 (server.tomcat 설정 불필요)
  # server.tomcat.threads.max → 제거
  # spring.threads.virtual.enabled → 제거 (WebFlux는 이벤트 루프 사용)
```

---

### 확인해야 할 위험 요소

#### 1. AWS JDBC Wrapper

현재 프로젝트에서 AWS JDBC Wrapper를 사용한다면 **R2DBC를 지원하는지 확인 필수**.

```
AWS JDBC Wrapper → JDBC 전용
R2DBC → JDBC가 아닌 별도 프로토콜

→ AWS JDBC Wrapper의 failover, IAM 인증 등을
   R2DBC 환경에서 별도로 구현해야 할 수 있다.
```

#### 2. 파일 I/O (EFS/S3)

파일 이동/복사는 blocking I/O다. Coroutine에서는 반드시 디스패처를 분리한다:

```kotlin
// ❌ 잘못됨 - Netty 이벤트 루프에서 blocking I/O
suspend fun moveFile(fax: Fax) {
    Files.move(source, target)  // blocking! 이벤트 루프 멈춤
}

// ✅ 올바름 - IO 디스패처로 전환
suspend fun moveFile(fax: Fax) {
    withContext(Dispatchers.IO) {
        Files.move(source, target)  // 별도 스레드에서 실행
    }
}
```

S3 클라이언트도 동일하게 `withContext(Dispatchers.IO)`로 감싸거나,
AWS SDK의 비동기 클라이언트(`S3AsyncClient`)를 사용한다.

#### 3. Spring REST Docs

Spring REST Docs 4.0은 `WebTestClient`를 지원하지만,
`RestTestClient`는 아직 미지원 (GitHub issue #995).
`WebTestClient` 기반으로 테스트를 작성한다.

#### 4. @Transactional + Coroutine

Spring Framework 6.1+에서 `@Transactional` + `suspend fun` 조합을 공식 지원한다.
단, `TransactionalOperator`를 사용하는 프로그래밍 방식도 알아두면 좋다:

```kotlin
// 선언적 (어노테이션)
@Transactional
suspend fun sendFax(dto: FaxSendDto): FaxSeqVo {
    ...
}

// 프로그래밍 방식 (세밀한 제어)
suspend fun sendFax(dto: FaxSendDto): FaxSeqVo {
    return transactionalOperator.executeAndAwait {
        // 트랜잭션 범위
    }
}
```

#### 5. MyBatis XML의 복잡한 동적 SQL

fax-api의 MyBatis XML에는 5개 이상 테이블을 조인하는 복잡한 쿼리가 있다.
jOOQ로 전환 시 가장 공수가 많은 부분이다:

```xml
<!-- 현재 MyBatis XML -->
<select id="searchFaxes">
    SELECT A.*, B.year, C.name
    FROM faxes A
    JOIN fax_years B ON A.fax_seq = B.fax_seq
    LEFT JOIN users C ON A.user_seq = C.user_seq
    <where>
        <if test="faxSeqs != null">AND A.fax_seq IN
            <foreach
            ...>
        </if>
        <if test="sendStatuses != null">AND A.send_status IN
            <foreach
            ...>
        </if>
        <if test="fromDt != null">AND A.send_dt >= #{fromDt}</if>
        <if test="toDt != null">AND A.send_dt &lt; #{toDt}</if>
        <if test="toNumber != null">AND A.to_number LIKE #{toNumber}</if>
        <!-- 20개 이상 조건 -->
    </where>
    ORDER BY ${sortField} ${sortDirection}
    LIMIT #{pageSize} OFFSET #{offset}
</select>
```

```kotlin
// jOOQ 전환
suspend fun searchFaxes(dto: FaxSearchDto, pageable: Pageable): List<Fax> {
    var condition = DSL.noCondition()

    dto.faxSeqs?.let { condition = condition.and(FAXES.FAX_SEQ.`in`(it)) }
    dto.sendStatuses?.let { condition = condition.and(FAXES.SEND_STATUS.`in`(it)) }
    dto.fromDt?.let { condition = condition.and(FAXES.SEND_DT.ge(it)) }
    dto.toDt?.let { condition = condition.and(FAXES.SEND_DT.lt(it)) }
    dto.toNumber?.let { condition = condition.and(FAXES.TO_NUMBER.like("%$it%")) }
    // ...

    return dsl.select(FAXES.asterisk(), FAX_YEARS.YEAR, USERS.NAME)
        .from(FAXES)
        .join(FAX_YEARS).on(FAXES.FAX_SEQ.eq(FAX_YEARS.FAX_SEQ))
        .leftJoin(USERS).on(FAXES.USER_SEQ.eq(USERS.USER_SEQ))
        .where(condition)
        .orderBy(pageable.toJooqSortFields())
        .offset(pageable.offset.toInt())
        .limit(pageable.pageSize)
        .awaitList()
        .map { it.into(Fax::class.java) }
}
```

Kotlin의 `?.let`이 MyBatis의 `<if test="...">`를 대체한다.
코드로 작성되므로 **컴파일 타임 검증 + IDE 자동완성**이 가능하다.

---

### 마이그레이션 순서 (권장)

```
Phase 1: 환경 준비 (1주)
├── jOOQ Code Generation 설정
├── R2DBC 연결 설정
├── Coroutine 의존성 추가
└── 리액티브 Security 설정

Phase 2: Data Access 전환 (2주)
├── MyBatis XML → jOOQ DSLContext (가장 큰 작업)
├── 동적 SQL 전환 (20개+ 조건)
├── 아카이브 테이블 동적 쿼리
└── 트랜잭션 검증

Phase 3: Controller/Service 전환 (1주)
├── fun → suspend fun
├── AOP → WebFilter
├── 파일 I/O → withContext(Dispatchers.IO)
└── 응답 래핑 방식 변경

Phase 4: 테스트 전환 (1주)
├── MockMvc → WebTestClient
├── runTest 적용
├── RestDocs 재설정
└── 통합 테스트 검증

Phase 5: 검증 (1주)
├── 전체 API 동작 확인
├── 성능 비교 (MVC vs WebFlux)
├── 메모리 사용량 비교
└── Grafana 모니터링 세팅
```

---

## 10. 정리

| 항목     | 동기 (MVC + MyBatis)             | 리액티브 (WebFlux + jOOQ + R2DBC)         |
|--------|--------------------------------|---------------------------------------|
| 스레드 모델 | Thread-per-request (200개)      | Event Loop (코어 수)                     |
| I/O 처리 | Blocking (스레드가 대기)             | Non-blocking (이벤트 기반)                 |
| SQL 작성 | XML 파일                         | Kotlin 코드                             |
| 타입 안전  | 런타임 에러                         | **컴파일 에러**                            |
| 동적 SQL | `<if>`, `<where>`, `<foreach>` | `?.let`, `DSL.noCondition()`, `.in()` |
| DB I/O | JDBC (blocking)                | R2DBC (non-blocking)                  |
| 동시성    | Virtual Thread                 | Coroutine + Netty 이벤트 루프              |
| 배압 제어  | 없음 (스레드 풀 한계가 유일한 방어)          | `request(n)` 으로 소비 속도 제어              |
| IDE 지원 | XML은 자동완성 제한적                  | 코드이므로 **완전한 자동완성**                    |
| 러닝커브   | 낮음                             | 높음 (Reactor, Coroutine, R2DBC)        |
| 디버깅    | 직관적인 스택트레이스                    | 비동기 스택트레이스 (어려움)                      |

Reactive가 모든 상황에서 좋은 것은 아니다. I/O 대기가 많고 동시접속이 높은 서비스에서 효과가 크다.
단순 CRUD 서비스라면 Spring MVC + Virtual Thread가 더 실용적인 선택일 수 있다.

fax-api 파일럿이 성공하면 같은 패턴으로 mail-api, calendar-api, downtime-api에 순차 적용한다.

---

# Part 3: 실전 구현 — fax-reactive 모듈

## 11. 비동기 디버깅 + 리액티브의 미래

### 비동기 디버깅 — 스택트레이스가 잘리는 이유와 해결

#### 왜 잘리나?

동기에서는 스레드 하나가 요청을 처음부터 끝까지 처리하므로 콜스택이 연결된다.
비동기에서는 DB 대기 중 스레드를 반환하고, 응답이 오면 **다른 스레드**에서 재개된다.

```
요청 도착 → [스레드1] Controller.createFax() 시작
  → DB 호출 (nextFaxSeq) → 스레드1 반환
  → DB 응답 → [스레드3] awaitSingle() 재개     ← 다른 스레드
  → DB 호출 (insert) → 스레드3 반환
  → DB 응답 → [스레드2] awaitSingle() 재개     ← 또 다른 스레드
  → 여기서 에러!
```

에러가 난 스레드2는 `awaitSingle()` 이후만 알고, Controller에서 시작된 건 다른 스레드 일이라 스택에 안 남는다:

```
// 실제로 보이는 스택트레이스
Exception at R2dbcConnection.execute()
  at Mono.subscribe()
  at CoroutineScheduler.dispatch()     ← 여기서 끊김 (Controller, Service 정보 없음)
```

#### 해결 1: Kotlin Coroutines 디버그 모드 (개발용)

JVM 옵션 하나로 코루틴 스택트레이스를 복원해준다.

```
-Dkotlinx.coroutines.debug
```

코루틴 라이브러리가 suspend 지점마다 스택을 기록해서 이어붙여준다.
오버헤드가 있으므로 **개발/테스트 환경에서만** 사용.

```
// 끔 (기본)
Exception at R2dbcConnection.execute()
  at CoroutineScheduler.dispatch()

// 켬
Exception at R2dbcConnection.execute()
  at FaxRepository.insert()              ← 복원됨
  at FaxServiceImpl.createFax()          ← 복원됨
  at FaxController.createFax()           ← 복원됨
```

#### 해결 2: 요청 ID + 로그 (운영용, 핵심)

스택트레이스 대신 **로그로 흐름을 추적**한다.
핵심 지점마다 로그를 남기고, 요청별 고유 ID로 묶어서 검색한다.

```
[req-abc123] FaxController.createFax started
[req-abc123] nextFaxSeq=42
[req-abc123] inserted faxSeq=42
[req-abc123] ERROR R2dbcConnection.execute failed   ← 이 요청이 문제
```

WebFlux에서는 `MDC`(ThreadLocal 기반)가 안 되므로 Reactor Context + Micrometer Tracing으로 구현한다.
이 프로젝트에 이미 `micrometer-registry-prometheus`가 있으므로 tracing 추가가 자연스럽다.

#### 해결 3: Reactor Debug Agent (Reactor 체인용)

`Mono.from()`, `Flux.from()` 체인에서 어디서 조립했는지 보여준다.

```kotlin
// Application 시작 시
ReactorDebugAgent.init()
```

```
// 끔
Error at Mono.flatMap()

// 켬
Error at Mono.flatMap()
  Assembly trace:
    at FaxRepository.insert(FaxRepository.kt:60)   ← 어디서 조립했는지 표시
```

`Hooks.onOperatorDebug()`보다 오버헤드가 적어서 운영에서도 사용 가능하다.

#### 정리

| 방법                           | 용도          | 오버헤드     |
|------------------------------|-------------|----------|
| `-Dkotlinx.coroutines.debug` | 개발/테스트      | 있음 (개발용) |
| 요청 ID + 로그                   | **운영 (핵심)** | 없음       |
| `ReactorDebugAgent`          | 운영 가능       | 낮음       |

### 리액티브의 미래 — JPA는 논블로킹이 될까?

JPA 스펙 자체가 논블로킹으로 바뀔 가능성은 낮다.
`EntityManager`, `Query` 등 모든 인터페이스가 값을 직접 반환하는 블로킹 설계라 바꾸면 전체 API가 깨진다.

대신 두 가지 방향이 있다:

#### Hibernate Reactive (이미 존재)

Hibernate 팀이 별도 프로젝트로 만든 리액티브 버전.

```java
// 기존 JPA
Fax fax = entityManager.find(Fax.class, 1L);          // 블로킹

// Hibernate Reactive
Uni<Fax> fax = session.find(Fax.class, 1L);            // 논블로킹
```

다만 lazy loading, dirty checking 등 JPA 핵심 기능이 제한적이라 실무 채택이 적다.

#### Virtual Threads (Project Loom) — 진짜 답

**블로킹 코드를 그대로 쓰면서 논블로킹의 효과를 얻는 방식.**

```
기존 스레드:     요청 1개 = OS 스레드 1개 (무거움, ~1MB)
Virtual Thread:  요청 1개 = 가상 스레드 1개 (가벼움, ~수 KB)
```

```yaml
# Spring Boot 설정 한 줄이면 끝
spring:
  threads:
    virtual:
      enabled: true
```

JPA + JDBC 블로킹 코드를 **그대로** 쓰면서 동시 요청 수만 개를 처리할 수 있다.
이 프로젝트가 Java 25를 쓰고 있으므로 지금 바로 사용 가능.

#### R2DBC 환경에서 JPA를 못 쓰는 이유

JPA(Hibernate)는 내부적으로 JDBC를 사용하는데 JDBC가 블로킹이다.
R2DBC 이벤트 루프 스레드에서 JDBC가 실행되면 스레드가 멈추면서 다른 요청도 전부 멈춘다.
이벤트 루프 스레드는 몇 개뿐이라 하나만 막혀도 전체 서버에 영향.

그래서 R2DBC 환경에서는 JPA 대신:

- **Spring Data R2DBC** (`ReactiveCrudRepository`) — 단순 CRUD용
- **jOOQ + R2DBC** (현재 방식) — 복잡한 쿼리 + 타입 안전

#### 리액티브 vs Virtual Threads 비교

|          | 리액티브 (WebFlux + R2DBC) | Virtual Threads (MVC + JPA) |
|----------|------------------------|-----------------------------|
| 코드 변경    | 전면 재작성                 | 설정 한 줄                      |
| JPA 사용   | 불가                     | **그대로**                     |
| 기존 라이브러리 | 블로킹이면 못 씀              | **그대로**                     |
| 디버깅      | 스택트레이스 잘림              | **정상**                      |
| 동시 처리량   | 높음                     | **높음**                      |
| 러닝커브     | 높음                     | **없음**                      |

Virtual Threads가 리액티브의 장점(높은 동시 처리량)을 가져가면서 단점(코드 복잡성, 디버깅)을 없앴다.
업계 방향이 "JPA를 논블로킹으로 만들자"가 아니라 "블로킹 코드를 가상 스레드에서 돌리자"로 가고 있다.

---

## 12. 모듈 구조 & 기술 스택

### 모듈 구조

```
fax-reactive/
├── build.gradle.kts
├── settings.gradle.kts
└── src/
    ├── main/
    │   ├── kotlin/com/knet/msa/fax/reactive/
    │   │   ├── FaxReactiveApplication.kt    ← 진입점
    │   │   ├── config/
    │   │   │   ├── DatabaseInitConfig.kt    ← DB 초기화 (스키마/테이블)
    │   │   │   ├── JooqConfig.kt            ← jOOQ + R2DBC 설정
    │   │   │   └── SecurityConfig.kt        ← OAuth2 JWT 보안
    │   │   ├── domain/
    │   │   │   └── Fax.kt                   ← 데이터 클래스
    │   │   ├── repository/
    │   │   │   └── FaxRepository.kt         ← DB 접근 (jOOQ 쿼리 + 매핑)
    │   │   ├── service/
    │   │   │   ├── FaxService.kt            ← 인터페이스 (suspend)
    │   │   │   └── FaxServiceImpl.kt        ← 비즈니스 로직만
    │   │   └── controller/
    │   │       └── FaxController.kt         ← REST API
    │   └── resources/
    │       └── application.yml              ← R2DBC, jOOQ 설정
    └── test/
        └── kotlin/.../FaxControllerTests.kt ← WebTestClient 테스트
```

### 기술 스택

| 구분      | 기술                          | 기존 fax 모듈과 차이 |
|---------|-----------------------------|---------------|
| 웹 프레임워크 | WebFlux (Netty)             | MVC (Tomcat)  |
| DB 드라이버 | R2DBC (논블로킹)                | JDBC (블로킹)    |
| SQL 빌더  | jOOQ (타입 안전)                | MyBatis XML   |
| 비동기 모델  | Kotlin Coroutines (suspend) | 동기            |

---

## 13. application.yml — R2DBC 설정

```yaml
spring:
  application:
    name: fax-reactive
  sql:
    init:
      mode: never                                              # 기본: 꺼짐
      schema-locations: classpath:database-fax-reactive/schema.sql
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/fax-reactive   # jdbc: 가 아닌 r2dbc: 스킴
    username: postgres
    password: postgres
    pool:
      initial-size: 5   # 시작 시 미리 생성할 커넥션
      max-size: 20       # 최대 커넥션 수 (논블로킹이라 JDBC보다 적어도 됨)

server:
  port: 43010
  shutdown: graceful

logging:
  level:
    root: info
    com.knet: debug
    org.jooq: debug
    # Spring Data R2DBC — 실행 SQL 로그
    org.springframework.r2dbc.core: debug
    # R2DBC PostgreSQL 드라이버 — 바인딩 파라미터까지 출력
    io.r2dbc.postgresql.QUERY: debug
    io.r2dbc.postgresql.PARAM: debug

management:
  endpoints:
    web:
      exposure:
        include: 'health,prometheus'
  endpoint:
    health:
      show-details: never

---
spring:
  config:
    activate:
      on-profile: local
  sql:
    init:
      mode: always                                             # local에서만 DB 자동 생성 + 스키마 실행
```

### SQL 로그 설정 — 실행 쿼리 + 바인딩 파라미터 확인

R2DBC 환경에서는 JDBC처럼 `show-sql: true`가 없다. 대신 **R2DBC 드라이버 레벨 로거**를 사용한다.

| 로거                               | 출력 내용                      | 대상                          |
|----------------------------------|----------------------------|-----------------------------|
| `io.r2dbc.postgresql.QUERY`      | 실행된 SQL문                   | jOOQ + Spring Data R2DBC 모두 |
| `io.r2dbc.postgresql.PARAM`      | 바인딩 파라미터 (`$1 → 8`)        | jOOQ + Spring Data R2DBC 모두 |
| `org.springframework.r2dbc.core` | Spring Data R2DBC가 생성한 SQL | Spring Data R2DBC만          |
| `org.jooq`                       | jOOQ 내부 로그 (쿼리 빌드 등)       | jOOQ만                       |

핵심은 `io.r2dbc.postgresql.QUERY`와 `PARAM`이다.
이 두 로거는 **R2DBC 드라이버 레벨**이기 때문에, jOOQ든 Spring Data든 최종적으로 R2DBC를 통해 실행되는 **모든 SQL**을 잡아준다.

#### 로그 출력 예시 — Spring Data R2DBC

```
o.s.r2dbc.core.DefaultDatabaseClient : Executing SQL statement [SELECT "faxes".* FROM "faxes" WHERE "faxes"."fax_seq" = $1 LIMIT 2]
io.r2dbc.postgresql.PARAM            : Bind parameter [0] to: 8
io.r2dbc.postgresql.QUERY            : Executing query: SELECT "faxes".* FROM "faxes" WHERE "faxes"."fax_seq" = $1 LIMIT 2
```

#### 로그 출력 예시 — jOOQ

```
io.r2dbc.postgresql.PARAM  : Bind parameter [0] to: 8
io.r2dbc.postgresql.QUERY  : Executing query: select "faxes"."fax_seq", "faxes"."uuid", "faxes"."year", ... from "faxes" where "faxes"."fax_seq" = $1
```

#### SQL 차이 — Spring Data R2DBC vs jOOQ

| 구분       | Spring Data R2DBC                     | jOOQ                                 |
|----------|---------------------------------------|--------------------------------------|
| SELECT   | `SELECT *`                            | 컬럼 하나씩 명시 (`"fax_seq", "uuid", ...`) |
| findById | `LIMIT 2` 추가 (unique 검증)              | 조건만 (`WHERE fax_seq = $1`)           |
| 로그 레벨    | `DefaultDatabaseClient` + `QUERY` 두 줄 | `QUERY` 한 줄                          |

#### 서버 시작 시 자동 실행 쿼리 — R2DBC 커넥션 풀 초기화

`pool.initial-size: 5` 설정에 의해 시작 시 5개 커넥션을 생성하며, 각 커넥션마다 아래 쿼리가 자동 실행된다:

```
io.r2dbc.postgresql.QUERY : Executing query: SHOW TRANSACTION ISOLATION LEVEL        ← 격리 수준 확인
io.r2dbc.postgresql.QUERY : Executing query: SELECT oid, * FROM pg_catalog.pg_type ... ← 확장 타입 매핑 (hstore, geometry, vector)
io.r2dbc.postgresql.QUERY : Executing query: SELECT 1                                 ← 커넥션 유효성 검증 (첫 커넥션만)
```

| 쿼리                                 | 목적                                             | 횟수                          |
|------------------------------------|------------------------------------------------|-----------------------------|
| `SHOW TRANSACTION ISOLATION LEVEL` | PostgreSQL 기본 격리 수준 확인                         | 커넥션당 1회 (= `initial-size`회) |
| `SELECT ... pg_catalog.pg_type`    | 확장 타입(`hstore`, `geometry`, `vector`) 지원 여부 확인 | 커넥션당 1회                     |
| `SELECT 1`                         | 커넥션 풀 health check                             | 1회 (첫 커넥션만)                 |

이 쿼리들은 **R2DBC 드라이버가 자동 실행**하는 것이며, 비즈니스 쿼리가 아니다.
`pool.initial-size`를 줄이면 이 로그도 줄어든다.

#### 커넥션 풀 동작 — 유휴 제거와 재생성

R2DBC 커넥션 풀(`r2dbc-pool`)은 유휴 커넥션을 자동으로 제거한다.

```yaml
spring:
  r2dbc:
    pool:
      initial-size: 5        # 시작 시 생성
      max-size: 20            # 최대
      max-idle-time: 30m      # 기본값 30분 — 이 시간 동안 안 쓰면 커넥션 제거
```

**시나리오: 서버 시작 후 1시간 뒤 첫 API 호출**

```
11:44  서버 시작 → nio-1~5 커넥션 생성 (initial-size: 5)
12:14  30분 경과 → 유휴 커넥션 제거 (maxIdleTime 기본값 30분)
       풀이 비어있는 상태
13:05  첫 API 호출 → nio-6~10 새 커넥션 생성 + 초기화 쿼리 실행
```

로그에서 `nio-1~5` 대신 `nio-6~10`이 나오는 이유가 이것이다.
기존 커넥션이 유휴 제거되었기 때문에 새 커넥션이 생성되면서 초기화 쿼리가 다시 실행된다.

**nio 번호는 계속 올라간다 — Netty 스레드 이름**

`actor-tcp-nio-6`에서 숫자는 **Netty NIO 스레드의 내부 카운터**다.
커넥션이 제거되면 스레드도 사라지고, 새 커넥션은 **이전 번호를 재사용하지 않고 이어서 증가**한다.

```
시작:          nio-1~5   (5개)
30분 유휴:     제거       (0개)
API 호출:      nio-6~10  (5개)
30분 유휴:     제거       (0개)
API 호출:      nio-11~15 (5개)
```

번호는 올라가지만 **동시에 존재하는 커넥션 수는 `initial-size`~`max-size` 범위**(5~20개)로 동일하다.
카운터는 `int`(32비트) — 최대 약 21억이므로, 30분마다 5개씩 재생성해도 **약 2만 4천 년**이 걸린다.
이 번호는 디버깅용 식별자일 뿐이고, 운영에서 신경 쓸 필요 없다.

**서버 시작 직후 바로 호출하면?**

```
11:44  서버 시작 → nio-1~5 커넥션 생성
11:44  즉시 API 호출 → nio-1~5 재사용 → 초기화 쿼리 없이 비즈니스 쿼리만 실행
```

#### 첫 호출 vs 이후 호출 — 로그 비교

**첫 호출** (커넥션 생성 + jOOQ 초기화):

```
io.r2dbc.postgresql.QUERY  : SHOW TRANSACTION ISOLATION LEVEL    ← 새 커넥션 초기화
io.r2dbc.postgresql.QUERY  : SELECT oid, * FROM pg_catalog...    ← 새 커넥션 초기화
org.jooq.Constants         : @@@@ ... Thank you for using jOOQ   ← jOOQ 배너 (최초 1회)
io.r2dbc.postgresql.QUERY  : BEGIN READ ONLY                     ← 트랜잭션 시작
io.r2dbc.postgresql.QUERY  : select "faxes"."fax_seq", ...       ← 비즈니스 쿼리
io.r2dbc.postgresql.QUERY  : COMMIT                              ← 트랜잭션 종료
```

**두 번째 호출부터** (커넥션 재사용):

```
io.r2dbc.postgresql.QUERY  : BEGIN READ ONLY
io.r2dbc.postgresql.PARAM  : Bind parameter [0] to: 0
io.r2dbc.postgresql.PARAM  : Bind parameter [1] to: 50
io.r2dbc.postgresql.QUERY  : select "faxes"."fax_seq", ...
io.r2dbc.postgresql.QUERY  : COMMIT
io.r2dbc.postgresql.QUERY  : BEGIN READ ONLY
io.r2dbc.postgresql.QUERY  : select count(*) from "faxes"
io.r2dbc.postgresql.QUERY  : COMMIT
```

커넥션이 풀에 이미 있으므로 초기화 쿼리 없이 `BEGIN → SELECT → COMMIT`만 실행된다.

#### jOOQ 시작 배너

jOOQ는 최초 쿼리 실행 시 **1회만** 배너와 tip of the day를 출력한다 (lazy initialization).

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
        (jOOQ 로고 아스키아트)
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  Thank you for using jOOQ 3.19.29

jOOQ tip of the day: Whenever jOOQ doesn't support a native SQL feature, ...
```

- 무료 버전(Open Source Edition)에서는 끌 수 없음 (상용 라이선스 필요)
- 로그 레벨로 숨기려면: `org.jooq.Constants: warn`
- 동작에 영향 없으므로 보통 그냥 둔다

---

### JDBC vs R2DBC

| 구분     | JDBC                        | R2DBC                             |
|--------|-----------------------------|-----------------------------------|
| URL 스킴 | `jdbc:postgresql://...`     | `r2dbc:postgresql://...`          |
| 드라이버   | `org.postgresql:postgresql` | `org.postgresql:r2dbc-postgresql` |
| I/O 모델 | 블로킹 — 쿼리 중 스레드 대기           | 논블로킹 — 쿼리 중 스레드 반환                |
| 커넥션 풀  | HikariCP                    | Spring R2DBC Pool (`r2dbc-pool`)  |

---

## 14. Fax.kt — 도메인 모델

```kotlin
data class Fax(
    val faxSeq: Long? = null,
    val uuid: UUID? = null,
    val year: Int? = null,
    val sendStatus: String? = null,
    val sendDT: LocalDateTime? = null,
    val isReserved: Boolean? = null,
    val frNumber: String? = null,
    val toNumber: String? = null,
    val toCompany: String? = null,
    val toName: String? = null,
    val subject: String? = null,
    val filePath: String? = null,
    val fileNames: List<String>? = null
)
```

### JPA Entity vs data class

| 구분    | JPA Entity (기존)                       | data class (리액티브)                    |
|-------|---------------------------------------|--------------------------------------|
| 어노테이션 | `@Entity`, `@Table`, `@Id`, `@Column` | 없음 — 순수 data class                   |
| 매핑 방식 | Hibernate 자동 매핑                       | 수동 매핑 (Repository에서 Record → Fax 변환) |
| 변경 감지 | Dirty checking (자동 UPDATE)            | 없음 — 불변 객체                           |
| 연관관계  | `@OneToMany`, `@ManyToOne` 등          | 없음 — 필요 시 별도 쿼리                      |

R2DBC 환경에서는 JPA(Hibernate)를 사용할 수 없으므로 순수 data class를 사용한다.

---

## 15. JooqConfig.kt — R2DBC + jOOQ 연결

### 자동 구성 (현재 사용 중)

```kotlin
@Configuration
class JooqConfig {
    @Bean
    fun dslContext(connectionFactory: ConnectionFactory): DSLContext =
        DSL.using(
            TransactionAwareConnectionFactoryProxy(connectionFactory),
            SQLDialect.POSTGRES
        )
}
```

Spring Boot가 `application.yml`의 `spring.r2dbc.*` 설정으로 `ConnectionFactory` 빈을 자동 생성하므로,
직접 작성할 설정은 `DSLContext` 빈 1개뿐이다.

`TransactionAwareConnectionFactoryProxy`로 감싸는 이유: jOOQ는 내부적으로 `connectionFactory.create()`를
직접 호출하므로 Spring의 `@Transactional`이 관리하는 Reactor Context 트랜잭션에 참여하지 못한다.
이 Proxy가 Reactor Context에서 현재 트랜잭션의 커넥션을 꺼내서 jOOQ에 전달해준다.

### 수동 구성 (필요 시)

다중 데이터소스나 세밀한 커넥션 풀 제어가 필요할 때 사용:

```kotlin
@Configuration
class R2dbcManualConfig {

    @Bean
    fun connectionFactory(): ConnectionFactory =
        ConnectionFactories.get(
            ConnectionFactoryOptions.builder()
                .option(DRIVER, "postgresql")
                .option(HOST, "localhost")
                .option(PORT, 5432)
                .option(DATABASE, "fax")
                .option(USER, "postgres")
                .option(PASSWORD, "postgres")
                .build()
        )

    @Bean
    fun connectionPool(connectionFactory: ConnectionFactory): ConnectionPool =
        ConnectionPool(
            ConnectionPoolConfiguration.builder(connectionFactory)
                .initialSize(5)
                .maxSize(20)
                .build()
        )

    @Bean
    fun dslContext(connectionPool: ConnectionPool): DSLContext =
        DSL.using(connectionPool, SQLDialect.POSTGRES)
}
```

### 자동 구성 vs 수동 구성

| 구분    | 자동 구성                | 수동 구성                                       |
|-------|----------------------|---------------------------------------------|
| 설정 위치 | `application.yml`    | Kotlin `@Configuration` 클래스                 |
| 빈 등록  | Spring Boot가 자동      | 직접 `@Bean` 등록                               |
| 사용 시점 | 단일 DB, 기본 설정으로 충분할 때 | 다중 DB, 커넥션 풀 세밀 제어, 커스텀 옵션 필요 시             |
| 코드량   | 최소 (DSLContext 빈 1개) | ConnectionFactory + Pool + DSLContext 직접 구성 |

---

### 기존 JDBC 설정 vs 리액티브 설정 비교

### 기존: FaxSqlSessionConfig.kt (~230줄, 빈 8개)

```
rawDataSource            — HikariCP DataSource + DB 자동 생성
dataSource               — LazyConnectionDataSourceProxy 래핑
transactionManager       — DataSourceTransactionManager
jdbcTemplate             — JdbcTemplate
sqlSessionFactory        — MyBatis SqlSessionFactory
sqlSessionTemplate       — MyBatis SqlSessionTemplate
databasePopulator        — SQL 스크립트 테이블 초기화
dataSourceInitializer    — DataSourceInitializer
```

+ `DatabaseInitializerUtil.kt` (105줄) — DB 존재 확인, CREATE DATABASE, uuid-ossp 확장 설치

### 리액티브: JooqConfig.kt (빈 1개)

```kotlin
@Bean
fun dslContext(connectionFactory: ConnectionFactory): DSLContext =
    DSL.using(
        TransactionAwareConnectionFactoryProxy(connectionFactory),
        SQLDialect.POSTGRES
    )
```

| 구분         | 기존 JDBC                  | 리액티브 R2DBC + jOOQ                         |
|------------|--------------------------|-------------------------------------------|
| Config 코드량 | ~230줄 (Config + Util)    | JooqConfig 6줄 + DatabaseInitConfig 45줄    |
| 빈 개수       | 8개                       | 2개 (DSLContext + DatabaseInitializer)     |
| DataSource | HikariCP 수동 구성 + Lazy 래핑 | Spring Boot 자동 구성                         |
| 트랜잭션 매니저   | 수동 `@Bean`               | Spring Boot 자동 구성                         |
| DB 초기화     | 별도 유틸 제작 (105줄)          | ApplicationR2dbcScriptDatabaseInitializer |
| SQL 매퍼     | MyBatis XML + SqlSession | jOOQ DSL (코드로 SQL)                        |

---

## 16. DatabaseInitConfig.kt — DB 초기화 (스키마/테이블 생성)

### 기존 JDBC 방식의 초기화 흐름

```
DatabaseInitializerUtil.kt (105줄)
  ├─ root DB 접속 → CREATE DATABASE "fax" (없으면 생성)
  ├─ CREATE EXTENSION "uuid-ossp"
  └─ HikariDataSource 직접 생성/해제

DataSourceInitializerUtil.kt
  ├─ DatabasePopulator (SQL 스크립트 로드)
  └─ DataSourceInitializer (서버 시작 시 실행)

FaxSqlSessionConfig.kt
  ├─ databasePopulator @Bean   ← "database-fax/*.sql" 로드
  └─ dataSourceInitializer @Bean ← DataSource + Populator 연결
```

### R2DBC 방식: ApplicationR2dbcScriptDatabaseInitializer

```kotlin
@Configuration
class DatabaseInitConfig {

    @Bean
    fun r2dbcScriptDatabaseInitializer(
        connectionFactory: ConnectionFactory,
        sqlInitProperties: SqlInitializationProperties,
        r2dbcProperties: R2dbcProperties
    ): ApplicationR2dbcScriptDatabaseInitializer {
        createDatabaseIfNotExists(sqlInitProperties.mode, r2dbcProperties)
        return ApplicationR2dbcScriptDatabaseInitializer(connectionFactory, sqlInitProperties)
    }

    private fun createDatabaseIfNotExists(...) { /* DB 자동 생성 로직 — 아래 상세 설명 */
    }
}
```

### 1:1 대응 관계

| 기존 JDBC                                                              | R2DBC                                                     |
|----------------------------------------------------------------------|-----------------------------------------------------------|
| `javax.sql.DataSource`                                               | `io.r2dbc.spi.ConnectionFactory`                          |
| `DataSourceInitializer`                                              | `ApplicationR2dbcScriptDatabaseInitializer`               |
| `org.springframework.jdbc.datasource.init.ResourceDatabasePopulator` | yml의 `spring.sql.init.schema-locations`                   |
| 수동 빈 조립 (`DataSource` + `DatabasePopulator`)                         | auto-configured `SqlInitializationProperties`에서 yml 자동 읽기 |

기존 JDBC는 Java 코드에서 직접 조립했지만, R2DBC에서는 yml 설정을 auto-configured 프로퍼티 클래스가 읽어서 처리한다.

### ApplicationR2dbcScriptDatabaseInitializer란?

Spring Boot가 R2DBC 환경에서 **스키마 스크립트(schema.sql)를 자동 실행**해주는 클래스.

```
AbstractScriptDatabaseInitializer            ← 스크립트 실행 공통 로직
  └── R2dbcScriptDatabaseInitializer         ← R2DBC 커넥션으로 스크립트 실행
      └── ApplicationR2dbcScriptDatabaseInitializer  ← Spring Boot auto-config용
```

`SqlInitializationProperties`에서 yml 설정(`schema-locations`, `mode`, `encoding`, `separator` 등)을 읽어서 스크립트를 실행한다.

```kotlin
// Before — 직접 조립 (경로 하드코딩, @Value 4개)
ConnectionFactoryInitializer().apply {
    setConnectionFactory(connectionFactory)
    setDatabasePopulator(
        ResourceDatabasePopulator(ClassPathResource("database-fax-reactive/schema.sql"))
    )
}

// After — yml 설정만으로 자동 처리
ApplicationR2dbcScriptDatabaseInitializer(connectionFactory, sqlInitProperties)
```

Spring Boot는 이 bean을 자동 생성하지만, 우리가 같은 타입의 bean을 직접 정의하면 auto-config이 back-off(양보)한다.
DB 생성이라는 커스텀 로직을 끼워넣기 위해 직접 bean을 정의하고, 스크립트 실행은 이 클래스에 위임하는 구조이다.

### spring.sql.init.schema-locations — 스크립트 설정

단일 파일:

```yaml
spring:
  sql:
    init:
      schema-locations: classpath:database-fax-reactive/schema.sql
```

여러 파일 (순서대로 실행):

```yaml
spring:
  sql:
    init:
      schema-locations:
      - classpath:database-fax-reactive/schema.sql
      - classpath:database-fax-reactive/index.sql
      - classpath:database-fax-reactive/data.sql
```

와일드카드 (디렉토리 내 모든 SQL):

```yaml
spring:
  sql:
    init:
      schema-locations: classpath*:database-fax-reactive/*.sql
```

| 패턴                             | 의미                                  |
|--------------------------------|-------------------------------------|
| `classpath:경로/파일.sql`          | 정확한 파일 1개                           |
| `classpath:경로/*.sql`           | 해당 디렉토리의 모든 SQL                     |
| `classpath*:경로/*.sql`          | 모든 jar 포함 해당 경로의 모든 SQL             |
| `optional:classpath:경로/파일.sql` | 파일 없어도 에러 안 남 (Spring Boot 기본값에 사용) |

참고: `schema-locations`는 DDL(CREATE TABLE 등)용이고, INSERT 등 초기 데이터는 `data-locations`를 사용한다.

### DB 자동 생성 — JDBC를 이용한 bootstrap

`ApplicationR2dbcScriptDatabaseInitializer`는 이미 존재하는 DB에 스키마를 적용하는 역할만 한다.
DB 자체를 자동 생성하려면, 기존 JDBC 모듈의 `DatabaseInitializerUtil`과 동일한 방식으로
**JDBC로 postgres 시스템 DB에 접속 → CREATE DATABASE** 를 수행해야 한다.

```kotlin
@Configuration
class DatabaseInitConfig {

    companion object {
        private val log = LoggerFactory.getLogger(DatabaseInitConfig::class.java)
        private val R2DBC_URL_REGEX = "r2dbc:postgresql://([^/]+)/([^/?]+)".toRegex()
    }

    @Bean
    fun r2dbcScriptDatabaseInitializer(
        connectionFactory: ConnectionFactory,
        sqlInitProperties: SqlInitializationProperties,  // ← auto-configured (@Value 대신)
        r2dbcProperties: R2dbcProperties                 // ← auto-configured (@Value 대신)
    ): ApplicationR2dbcScriptDatabaseInitializer {
        createDatabaseIfNotExists(sqlInitProperties.mode, r2dbcProperties)  // 1단계: DB 생성
        return ApplicationR2dbcScriptDatabaseInitializer(connectionFactory, sqlInitProperties)  // 2단계: 스키마 적용
    }
    // ↑ 같은 타입의 bean을 정의하면 Spring Boot auto-config가 back-off 한다.
    //   SqlInitializationProperties가 spring.sql.init.schema-locations를 읽어서
    //   스크립트 실행을 자동 처리한다.

    private fun createDatabaseIfNotExists(
        initMode: DatabaseInitializationMode,
        r2dbcProperties: R2dbcProperties         // ← url, username, password를 한 객체에서 참조
    ) {
        if (initMode != DatabaseInitializationMode.ALWAYS) return
        val url = r2dbcProperties.url ?: return
        val match = R2DBC_URL_REGEX.find(url) ?: return
        val (host, dbName) = match.destructured

        // 1) postgres 시스템 DB에 JDBC로 접속 → CREATE DATABASE
        DriverManager.getConnection("jdbc:postgresql://$host/postgres", r2dbcProperties.username, r2dbcProperties.password).use { conn ->
            conn.createStatement().use { stmt ->
                stmt.executeQuery("SELECT 1 FROM pg_database WHERE datname = '$dbName'").use { rs ->
                    if (rs.next()) {
                        log.info("Database '{}' already exists.", dbName)
                        return
                    }
                }
                stmt.execute("""CREATE DATABASE "$dbName"""")
                log.info("Database '{}' created.", dbName)
            }
        }

        // 2) 새 DB에 uuid-ossp 확장 설치
        DriverManager.getConnection("jdbc:postgresql://$host/$dbName", r2dbcProperties.username, r2dbcProperties.password).use { conn ->
            conn.createStatement().use { stmt ->
                stmt.execute("""CREATE EXTENSION IF NOT EXISTS "uuid-ossp"""")
                log.info("Extension 'uuid-ossp' created in database '{}'.", dbName)
            }
        }
    }
}
```

### 이전 방식과 비교 (@Value → auto-configured properties)

|           | 이전 (수동 @Value)                                                     | 현재 (auto-configure 활용)                                                          |
|-----------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| DB 접속 정보  | `@Value("${spring.r2dbc.url}")` 등 4개                               | `R2dbcProperties` 1개                                                            |
| init mode | `@Value("${spring.sql.init.mode:never}")`                          | `SqlInitializationProperties.mode`                                              |
| 스키마 실행    | `ConnectionFactoryInitializer` + `ResourceDatabasePopulator` 수동 조립 | `ApplicationR2dbcScriptDatabaseInitializer`가 yml에서 `schema-locations` 읽어서 자동 처리 |
| 스키마 경로    | Java 코드에 하드코딩                                                      | `spring.sql.init.schema-locations` yml 설정                                       |

### 동작 흐름 (기존 JDBC vs R2DBC 비교)

```
기존 JDBC (DatabaseInitializerUtil)
  1. HikariDataSource로 postgres DB 접속
  2. CREATE DATABASE "fax" (없으면 생성)
  3. CREATE EXTENSION "uuid-ossp"
  4. DataSourceInitializer → schema.sql 실행

R2DBC (DatabaseInitConfig)
  1. DriverManager로 postgres DB 접속 (JDBC, 일회성)
  2. CREATE DATABASE "fax-reactive" (없으면 생성)
  3. CREATE EXTENSION "uuid-ossp"
  4. ApplicationR2dbcScriptDatabaseInitializer → schema.sql 실행 (R2DBC)
```

R2DBC 환경에서도 DB 생성은 일회성 부트스트랩이므로 JDBC `DriverManager`를 사용한다.
이를 위해 PostgreSQL JDBC 드라이버를 `runtimeOnly`로 추가:

```kotlin
// build.gradle.kts
runtimeOnly(libs.r2dbc.postgresql)  // R2DBC (앱 런타임)
runtimeOnly(libs.postgresql)         // JDBC (DB 자동 생성용)
```

### R2DBC URL → JDBC URL 변환

```
r2dbc:postgresql://localhost:5432/fax-reactive
  ↓ R2dbcProperties.url 에서 정규식 파싱
host = "localhost:5432", dbName = "fax-reactive"
  ↓ JDBC URL 변환
jdbc:postgresql://localhost:5432/postgres      ← 시스템 DB 접속용
jdbc:postgresql://localhost:5432/fax-reactive  ← 확장 설치용
```

### schema.sql 차이

기존 fax 모듈의 schema.sql은 `DROP TABLE IF EXISTS` + `CREATE TABLE`로 매번 재생성하지만,
fax-reactive에서는 `CREATE TABLE IF NOT EXISTS`로 이미 존재하면 스킵하도록 작성했다.

### 조건부 실행 — `spring.sql.init.mode` + 프로필

DB 자동 생성과 스키마 적용은 `spring.sql.init.mode`가 `always`일 때만 실행된다.
기본값은 `never`이고, local 프로필에서만 `always`로 오버라이드한다:

```yaml
# application.yml
spring:
  sql:
    init:
      mode: never                                              # 기본: 꺼짐
      schema-locations: classpath:database-fax-reactive/schema.sql

---
spring:
  config:
    activate:
      on-profile: local                                        # local 프로필에서만
  sql:
    init:
      mode: always                                             # DB 자동 생성 + 스키마 실행
```

| `spring.sql.init.mode` | DB 자동 생성 | schema.sql 실행 | 용도                |
|------------------------|----------|---------------|-------------------|
| `always` (local 프로필)   | O        | O             | 로컬 개발             |
| `never` (기본값)          | X        | X             | 운영 (DB는 인프라에서 관리) |

### DB 초기화 — 표준 방식 비교

Spring Boot에서 DB 초기화는 2가지 레벨로 나뉜다:

| 레벨            | 의미                     | 표준 방식                     |
|---------------|------------------------|---------------------------|
| **1. DB 생성**  | `CREATE DATABASE`      | 표준 없음 — Spring Boot 범위 밖  |
| **2. 스키마 관리** | `CREATE TABLE`, 마이그레이션 | Flyway, Liquibase (공식 지원) |

#### DB 생성 (`CREATE DATABASE`) — 표준이 없는 이유

Spring Boot는 **DB가 이미 존재한다고 가정**한다.
`CREATE DATABASE`는 Spring Boot의 관심사가 아니라 인프라 영역이므로 공식 기능이 없다.

| 방식                 | 설명                                                      | 용도       |
|--------------------|---------------------------------------------------------|----------|
| **Docker Compose** | `POSTGRES_DB: fax-reactive` 환경변수로 자동 생성                 | 로컬/CI    |
| **Testcontainers** | 테스트용 PostgreSQL 컨테이너를 띄움 (DB 포함)                        | 테스트 전용   |
| **인프라 스크립트**       | Ansible, Terraform 등에서 DB 생성                            | 운영       |
| **커스텀 코드**         | 현재 방식 (`DatabaseInitConfig`, `DatabaseInitializerUtil`) | 로컬 개발 편의 |

현재 방식은 "로컬 개발 편의용 커스텀"이며, 비표준이지만 실무에서 흔히 쓰는 패턴이다.

#### 스키마 관리 — 표준은 Flyway / Liquibase

현재는 `schema.sql` + `CREATE TABLE IF NOT EXISTS`로 하고 있지만,
Spring Boot 공식 권장은 **Flyway** (마이그레이션 기반 스키마 관리):

```
resources/db/migration/
├── V1__create_faxes.sql        ← 최초 테이블 생성
├── V2__add_file_path.sql       ← 컬럼 추가
└── V3__add_index.sql           ← 인덱스 추가
```

```yaml
# application.yml — Flyway R2DBC 설정
spring:
  flyway:
    url: jdbc:postgresql://localhost:5432/fax-reactive   # Flyway는 JDBC 사용
    user: postgres
    password: postgres
    locations: classpath:db/migration
```

| 구분    | 현재 방식 (schema.sql) | Flyway                      |
|-------|--------------------|-----------------------------|
| 버전 관리 | 없음 — 매번 전체 실행      | 버전별 마이그레이션                  |
| 롤백    | 불가                 | 가능 (유료)                     |
| 이력 추적 | 없음                 | `flyway_schema_history` 테이블 |
| 운영 배포 | 위험 (DROP 실수 가능)    | 안전 (실행된 건 스킵)               |
| 복잡도   | 낮음                 | 약간 높음                       |

참고: Flyway도 R2DBC 환경에서 JDBC를 사용한다 (`spring.flyway.url`에 jdbc: 스킴).
마이그레이션은 일회성 부트스트랩이므로 논블로킹이 아니어도 문제없다.

#### Flyway vs Liquibase — 상세 비교

| 구분                 | Flyway                                  | Liquibase                           |
|--------------------|-----------------------------------------|-------------------------------------|
| **마이그레이션 형식**      | SQL 파일 (`V1__xxx.sql`)                  | XML / YAML / JSON / SQL (다양한 형식 지원) |
| **학습 난이도**         | 낮음 — SQL만 알면 됨                          | 높음 — Changeset 문법 학습 필요             |
| **롤백**             | 유료 (Teams 이상) — `U1__xxx.sql` undo 스크립트 | **무료** — 자동 롤백 지원 (`rollback` 태그)   |
| **DB 독립성**         | SQL이므로 DB에 종속                           | XML/YAML은 DB 독립적 (multi-DB 가능)      |
| **이력 테이블**         | `flyway_schema_history`                 | `databasechangelog`                 |
| **Spring Boot 통합** | `spring.flyway.*` (공식 1급 지원)            | `spring.liquibase.*` (공식 1급 지원)     |
| **커뮤니티**           | 더 큰 사용자 베이스                             | 기업 환경에서 많이 사용                       |
| **Java API**       | 있음                                      | 있음                                  |
| **Dry Run (미리보기)** | 유료                                      | **무료**                              |
| **diff (스키마 비교)**  | 없음                                      | **무료** — 두 DB 비교해서 changelog 자동 생성  |

**핵심 차이**:

- **Flyway**: SQL 중심, 단순함이 강점. "SQL만 쓸 줄 알면 된다"
- **Liquibase**: 추상화 중심, 유연함이 강점. 롤백/diff/multi-DB가 무료

PostgreSQL만 쓰는 프로젝트에서는 Flyway가 더 단순하고 직관적.
여러 DB를 지원해야 하거나 무료 롤백이 필요하면 Liquibase.

#### Flyway 에디션별 기능과 가격

| 에디션            | 가격                     | 주요 기능                                                                        |
|----------------|------------------------|------------------------------------------------------------------------------|
| **Community**  | 무료                     | 기본 마이그레이션, `V`(versioned) + `R`(repeatable), Java/SQL 마이그레이션, Spring Boot 통합 |
| **Teams**      | $6,480/year (10 users) | Undo 마이그레이션 (롤백), Dry Run, Cherry Pick, Oracle/SQL Server Flashback          |
| **Enterprise** | 별도 문의                  | Check (drift detection), Snapshot, 고급 CI/CD 통합, 전용 지원                        |

무료 에디션에서 안 되는 것:

- ❌ `U1__xxx.sql` (Undo 마이그레이션, 롤백)
- ❌ Dry Run (마이그레이션 미리보기)
- ❌ Cherry Pick (특정 버전만 선택 실행)
- ❌ Check (스키마 drift 감지)

실무 판단: 대부분의 프로젝트는 Community로 충분하다.
롤백이 필요하면 Liquibase(무료)를 쓰거나, 수동으로 `V3__rollback_v2.sql` 작성으로 대체 가능.

#### Flyway + jOOQ — 빌드/CI 파이프라인

Flyway를 도입하면 빌드 시 jOOQ 코드 생성 방식이 달라진다.

##### 방식 1: DDL 기반 (현재) — Flyway와 별도 관리

```
빌드 시:
  schema.sql ──→ jooqCodegen (DDL 파싱) ──→ 코드 생성 ──→ 컴파일

앱 시작 시:
  V1__create.sql ──→ Flyway ──→ DB 마이그레이션
```

문제: `schema.sql`과 Flyway 마이그레이션 파일을 **따로 관리**해야 한다.
필드를 추가하면 두 곳 모두 수정 필요 → 실수하면 불일치.

##### 방식 2: DB 접속 기반 — Flyway + jOOQ 통합 (실무 표준)

```
빌드 시:
  1. Docker/Testcontainers로 임시 DB 기동
  2. Flyway 마이그레이션 적용 → 임시 DB 스키마 완성
  3. jooqCodegen (DB 접속) → 코드 생성
  4. 컴파일
  5. 임시 DB 폐기

앱 시작 시:
  V1__create.sql ──→ Flyway ──→ 실제 DB 마이그레이션
```

장점: 마이그레이션 파일 하나만 관리하면 jOOQ 코드가 자동으로 맞아진다.

##### 로컬 개발 파이프라인

```
개발자 PC:
  1. PostgreSQL (localhost:5432/fax-reactive) ← 항상 떠있음
  2. Flyway 마이그레이션 적용 (앱 시작 시 자동)
  3. jooqCodegen → localhost DB 접속 → 코드 생성

스키마 변경 시:
  1. V3__add_file_path.sql 작성
  2. 앱 재시작 또는 gradle flywayMigrate → DB 반영
  3. gradle jooqCodegen → 코드 재생성
  4. 새 컬럼 사용하는 코드 작성
```

##### Jenkins CI 파이프라인

```groovy
// Jenkinsfile
pipeline {
    stages {
        stage('Build') {
            steps {
                // 방법 A: Docker Compose로 DB 서비스 제공
                sh 'docker compose -f docker-compose-ci.yml up -d postgres'
                sh 'gradle flywayMigrate jooqCodegen build'
                sh 'docker compose -f docker-compose-ci.yml down'

                // 방법 B: Testcontainers (Gradle 플러그인에서 자동 관리)
                // build.gradle.kts에서 Testcontainers 설정 → DB 자동 기동/폐기
                sh 'gradle build'
            }
        }
    }
}
```

##### Testcontainers 방식 (권장)

```kotlin
// build.gradle.kts — Testcontainers로 jooqCodegen 자동화
import org.testcontainers.containers.PostgreSQLContainer

buildscript {
    dependencies {
        classpath("org.testcontainers:postgresql:1.21.0")
    }
}

val postgres = PostgreSQLContainer("postgres:17")
    .withDatabaseName("fax-reactive")

tasks.named("jooqCodegen") {
    doFirst {
        postgres.start()
        // Flyway로 마이그레이션 적용
        // jooqCodegen JDBC URL을 Testcontainers URL로 설정
    }
    doLast {
        postgres.stop()
    }
}
```

이 방식이면 **개발자 PC와 Jenkins 모두 동일한 빌드 파이프라인**이 된다.
DB가 없어도 Testcontainers가 Docker로 임시 PostgreSQL을 띄운다.

##### 파이프라인 비교

| 구분          | DDL 기반 (현재) | Docker DB + Flyway | Testcontainers + Flyway |
|-------------|-------------|--------------------|-------------------------|
| DB 필요       | X           | O (Docker)         | O (Docker 자동)           |
| 스키마 관리      | schema.sql  | Flyway 마이그레이션      | Flyway 마이그레이션           |
| jooqCodegen | DDL 파싱      | DB 접속              | DB 접속                   |
| 환경 통일       | O           | 부분적 (CI와 로컬 차이)    | **O — 어디서든 동일**         |
| 설정 복잡도      | 낮음          | 중간                 | 높음 (초기 설정)              |
| 스키마 정확도     | 제한적         | 완벽                 | 완벽                      |

#### 필드 추가 시 안전성 — DDL 기반 vs DB 기반

운영 중 컬럼을 추가하는 시나리오:

```sql
-- V3__add_file_path.sql
ALTER TABLE "faxes" ADD COLUMN "file_path" TEXT;
```

##### DDL 기반의 위험: 조용한 불일치

```
1. V3 마이그레이션으로 DB에 file_path 컬럼 추가
2. schema.sql 업데이트를 깜빡함
3. jooqCodegen 실행 → schema.sql 파싱 → file_path 없는 코드 생성
4. 컴파일 성공 (file_path를 안 쓰니까)
5. 런타임: SELECT * FROM faxes → file_path가 나오지만 매핑 코드 없음
   → 데이터는 무시됨 (에러는 아님)
6. INSERT → file_path 컬럼에 NULL 들어감
   → NOT NULL이면 런타임 에러!
```

핵심 문제: **빌드 시점에 에러가 안 나고, 런타임에 문제 발생**.

##### DB 접속 기반의 안전성

```
1. V3 마이그레이션으로 DB에 file_path 컬럼 추가
2. jooqCodegen → DB 접속 → file_path 포함된 코드 자동 생성
3. 컴파일 → FAXES.FILE_PATH 사용 가능
4. INSERT에 file_path 누락 → NOT NULL이면 컴파일 에러! (타입 안전)
```

핵심 장점: **DB 스키마와 코드가 항상 동기화**되어 빌드 시점에 문제를 잡는다.

##### NOT NULL 컬럼 추가 시 비교

| 단계          | DDL 기반             | DB 접속 기반                 |
|-------------|--------------------|--------------------------|
| DB에 컬럼 추가   | O                  | O                        |
| jooqCodegen | schema.sql 없으면 누락  | **자동 반영**                |
| 컴파일         | 성공 (누락 모름)         | **에러** (NOT NULL 필드 미설정) |
| 런타임         | **에러** (INSERT 실패) | — (컴파일에서 이미 잡힘)          |

**결론**: DDL 기반은 "schema.sql을 반드시 먼저 수정"하는 규칙을 지켜야 하고,
DB 접속 기반은 규칙 없이도 빌드가 안전망 역할을 한다.

#### 현재 선택: schema.sql (학습/프로토타입 단계)

- 학습/프로토타입은 `schema.sql`로 충분
- 운영 배포 시 Flyway 도입 고려
- DB 생성은 현재 커스텀 방식 유지 (또는 Docker Compose로 전환)

### 참고: spring.sql.init 설정으로 더 간단하게

`ConnectionFactoryInitializer` 빈 없이, application.yml만으로도 가능:

```yaml
spring:
  sql:
    init:
      mode: always              # always | embedded | never
      schema-locations: classpath:database-fax/schema.sql
```

이 경우 Spring Boot가 자동으로 `ConnectionFactoryInitializer`를 생성해서 실행한다.
단, 세밀한 제어(조건부 실행, 여러 SQL 파일 순서 지정 등)가 필요하면 직접 빈을 등록한다.

---

## 17. 레이어 구조 — Controller → Service → Repository

### 전체 흐름

```
Controller → Service → Repository → DB
                         ↑
              jOOQ DSL, Reactor, Record 매핑은 여기서만
```

Service는 순수 비즈니스 로직만, Repository가 jOOQ + R2DBC 쿼리를 전담한다.

### FaxService — 인터페이스 (모든 메서드가 suspend)

```kotlin
interface FaxService {
    suspend fun getFax(faxSeq: Long): Fax?
    suspend fun searchFaxes(sendStatus: String?, offset: Int, limit: Int): List<Fax>
    suspend fun countFaxes(sendStatus: String?): Long
    suspend fun createFax(fax: Fax): Fax
}
```

### FaxServiceImpl — 비즈니스 로직 (jOOQ 의존 없음)

```kotlin
@Service
@Transactional(readOnly = true)
class FaxServiceImpl(
    private val faxRepository: FaxRepository  // jOOQ import 없음
) : FaxService {

    override suspend fun getFax(faxSeq: Long): Fax? =
        faxRepository.findByFaxSeq(faxSeq)

    override suspend fun searchFaxes(sendStatus: String?, offset: Int, limit: Int): List<Fax> {
        val condition = faxRepository.buildCondition(sendStatus)
        return faxRepository.search(condition, offset, limit)
    }

    override suspend fun countFaxes(sendStatus: String?): Long {
        val condition = faxRepository.buildCondition(sendStatus)
        return faxRepository.count(condition)
    }

    @Transactional
    override suspend fun createFax(fax: Fax): Fax {
        val seq = faxRepository.nextFaxSeq()
        val uuid = UUID.randomUUID()
        val now = LocalDateTime.now()

        val newFax = fax.copy(
            faxSeq = seq,
            uuid = uuid,
            year = now.year,
            sendStatus = fax.sendStatus ?: "STANDBY",
            sendDT = fax.sendDT ?: now,
            isReserved = fax.isReserved ?: false
        )

        faxRepository.insert(newFax)
        return newFax
    }
}
```

**핵심**: Service에는 `org.jooq` import가 하나도 없다. `Condition` 타입만 사용하는데,
이것도 Repository가 빌드해서 넘겨주는 구조.

### FaxRepository — jOOQ + R2DBC 쿼리 전담

jOOQ 코드 생성으로 만들어진 `FAXES` 상수를 사용한다 (자동 생성 — 10장 참고).

```kotlin
import com.knet.msa.fax.reactive.jooq.tables.Faxes.FAXES  // 자동 생성된 테이블 클래스

@Repository
class FaxRepository(private val dsl: DSLContext) {
    // ...
}
```

### 핵심 패턴: jOOQ SQL → Reactor → Coroutine

모든 Repository 메서드가 같은 3단계 패턴을 따른다:

```
jOOQ DSL로 SQL 빌드 → Mono/Flux로 감싸기 → Coroutine 어댑터로 변환
```

#### 단건 조회 — `Mono` + `awaitFirstOrNull`

```kotlin
suspend fun findByFaxSeq(faxSeq: Long): Fax? {
    return Mono.from(
        dsl.select()
            .from(FAXES)
            .where(FAXES.FAX_SEQ.eq(faxSeq))   // 자동 생성 필드 — Long 타입 보장
    ).map { record -> toFax(record) }
        .awaitFirstOrNull()    // 없으면 null
}
```

#### 복수건 조회 — `Flux` + `collectList` + `awaitFirst`

```kotlin
suspend fun search(condition: Condition, offset: Int, limit: Int): List<Fax> {
    val source = dsl.select()
        .from(FAXES)
        .where(condition)
        .orderBy(FAXES.SEND_DT.desc())
        .offset(offset)
        .limit(limit)
    return Flux.from(source)
        .map { record -> toFax(record) }
        .collectList()     // Flux<Fax> → Mono<List<Fax>>
        .awaitFirst()
}
```

#### 집계 — `Mono` + `awaitSingle`

```kotlin
suspend fun count(condition: Condition): Long {
    return Mono.from(
        dsl.selectCount()
            .from(FAXES)
            .where(condition)
    ).map { record -> record.value1().toLong() }
        .awaitSingle()    // 반드시 1건
}
```

#### 시퀀스 발급

```kotlin
suspend fun nextFaxSeq(): Long {
    return Mono.from(
        dsl.select(DSL.field("NEXTVAL('faxes_fax_seq_seq')", Long::class.java))
    ).map { it.value1() }
        .awaitSingle()
}
```

#### INSERT

```kotlin
suspend fun insert(fax: Fax): Int {
    return Mono.from(
        dsl.insertInto(FAXES)
            .set(FAXES.FAX_SEQ, fax.faxSeq)
            .set(FAXES.UUID, fax.uuid)
            .set(FAXES.YEAR, fax.year)
            .set(FAXES.SEND_STATUS, fax.sendStatus)
            .set(FAXES.SEND_DT, fax.sendDT)
            .set(FAXES.IS_RESERVED, fax.isReserved)
            .set(FAXES.FR_NUMBER, fax.frNumber)
            .set(FAXES.TO_NUMBER, fax.toNumber)
            .set(FAXES.TO_COMPANY, fax.toCompany)
            .set(FAXES.TO_NAME, fax.toName)
            .set(FAXES.SUBJECT, fax.subject)
    ).awaitSingle()
}
```

#### 동적 조건 빌드 — MyBatis `<if>` 태그 대체

```kotlin
fun buildCondition(sendStatus: String?): Condition {
    var condition = DSL.noCondition()
    sendStatus?.let { condition = condition.and(FAXES.SEND_STATUS.eq(it)) }
    return condition
}
```

### Record → 도메인 매핑 (JPA 없으므로)

```kotlin
private fun toFax(record: Record): Fax = Fax(
    faxSeq = record.get(FAXES.FAX_SEQ),         // Long 타입 보장
    uuid = record.get(FAXES.UUID),               // UUID 타입 보장
    year = record.get(FAXES.YEAR),
    sendStatus = record.get(FAXES.SEND_STATUS),
    sendDT = record.get(FAXES.SEND_DT),          // LocalDateTime 타입 보장
    isReserved = record.get(FAXES.IS_RESERVED),
    frNumber = record.get(FAXES.FR_NUMBER),
    toNumber = record.get(FAXES.TO_NUMBER),
    toCompany = record.get(FAXES.TO_COMPANY),
    toName = record.get(FAXES.TO_NAME),
    subject = record.get(FAXES.SUBJECT)
)
```

jOOQ 코드 생성 덕분에 `record.get(FAXES.FAX_SEQ)`의 반환 타입이 `Long`으로 보장된다.
수동 DSL(`field("fax_seq", Long::class.java)`)에서는 개발자가 타입을 직접 지정해야 했다.

### 트랜잭션 관리

```kotlin
@Service
@Transactional(readOnly = true)      // 기본: 읽기 전용 트랜잭션
class FaxServiceImpl(...) {

    @Transactional                    // 쓰기: readOnly 해제
    override suspend fun createFax(fax: Fax): Fax {
        ...
    }
}
```

- `@Transactional(readOnly = true)`: 클래스 레벨에서 기본 읽기 전용
- `@Transactional`: 쓰기 메서드만 개별 지정 → 예외 발생 시 자동 롤백
- R2DBC에서는 `TransactionAwareConnectionFactoryProxy`가 Reactor Context를 통해 트랜잭션을 전파한다 (3장 JooqConfig 참고)

### data class `copy()` — 불변 객체 패턴

```kotlin
val newFax = fax.copy(
    faxSeq = seq,
    uuid = uuid,
    year = now.year,
    sendStatus = fax.sendStatus ?: "STANDBY"
)
```

R2DBC 환경에서는 JPA Entity가 아닌 순수 `data class`를 사용한다.
`copy()`는 원본을 변경하지 않고 새 객체를 생성하므로 동시성 안전.

### Coroutine 어댑터 정리

현재 코드에서 사용하는 어댑터 (전체 목록은 "Mono와 Flux" 장 참고):

| 어댑터                  | 결과   | empty일 때 | 사용 위치                                 |
|----------------------|------|----------|---------------------------------------|
| `awaitFirstOrNull()` | `T?` | `null`   | `findByFaxSeq()` — 단건 조회              |
| `awaitFirst()`       | `T`  | **예외**   | `search()` — collectList 후            |
| `awaitSingle()`      | `T`  | **예외**   | `count()`, `insert()`, `nextFaxSeq()` |

참고: `collectList()`는 Coroutine 어댑터가 아닌 Reactor 연산자 (`Flux<T>` → `Mono<List<T>>`).

모두 `kotlinx-coroutines-reactor` 라이브러리에서 제공.

### 레이어별 의존 관계

| 레이어            | jOOQ 의존 | Reactor 의존 | 역할                         |
|----------------|---------|------------|----------------------------|
| Controller     | X       | X          | HTTP 요청/응답                 |
| Service        | X       | X          | 비즈니스 로직, 트랜잭션              |
| **Repository** | **O**   | **O**      | 쿼리 실행 + Record → domain 매핑 |

---

## 18. FaxController.kt — REST 엔드포인트

```kotlin
@RestController
@RequestMapping(value = ["/api/faxes"], produces = [MediaType.APPLICATION_JSON_VALUE])
class FaxController(
    private val faxService: FaxService
) {

    @GetMapping("/{faxSeq}")
    suspend fun getFax(@PathVariable faxSeq: Long): Fax {
        return faxService.getFax(faxSeq)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Fax not found: $faxSeq")
    }

    @GetMapping
    suspend fun searchFaxes(
        @RequestParam(required = false) sendStatus: String?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int
    ): Map<String, Any> {
        val offset = page * size
        val faxes = faxService.searchFaxes(sendStatus, offset, size)
        val total = faxService.countFaxes(sendStatus)
        return mapOf(
            "content" to faxes,
            "page" to page,
            "size" to size,
            "total" to total
        )
    }

    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun createFax(@RequestBody fax: Fax): Fax {
        return faxService.createFax(fax)
    }
}
```

Controller → Service만 의존. jOOQ, Reactor, Record 등 인프라 의존 없음.

### MVC vs WebFlux 컨트롤러 비교

```kotlin
// MVC — 동기, 블로킹
fun getFax(@PathVariable faxSeq: Long): Fax {
    ...
}

// WebFlux 방식 1 — Reactor 반환
fun getFax(@PathVariable faxSeq: Long): Mono<Fax> {
    ...
}

// WebFlux 방식 2 — Coroutine suspend (현재 사용)
suspend fun getFax(@PathVariable faxSeq: Long): Fax {
    ...
}
```

| 방식            | 반환 타입           | 특징                             |
|---------------|-----------------|--------------------------------|
| MVC           | `Fax`           | 동기. 스레드 블로킹                    |
| Reactor       | `Mono<Fax>`     | 비동기. `.flatMap`, `.map` 체이닝 필요 |
| **Coroutine** | `suspend → Fax` | 비동기인데 동기처럼 작성. 가독성 최고          |

### 요청 → 응답 흐름

```
클라이언트 → Netty → FaxController.getFax() (suspend 진입)
  → FaxService.getFax() (suspend)
    → FaxRepository.findByFaxSeq() (suspend)
      → jOOQ SQL 빌드 → Mono.from() → R2DBC 논블로킹 실행 → 스레드 반환
      → DB 응답 → .awaitFirstOrNull() → Coroutine 재개
      → toFax(record) → Fax 반환
  → Fax 반환 (또는 null → ResponseStatusException)
→ JSON 직렬화 → 응답
```

---

## 19. SecurityConfig.kt — WebFlux 보안

### MVC vs WebFlux 1:1 대응

| MVC                          | WebFlux                    | 역할            |
|------------------------------|----------------------------|---------------|
| `@EnableWebSecurity`         | 자동 구성 (생략 가능)              | Security 활성화  |
| `HttpSecurity`               | `ServerHttpSecurity`       | 보안 설정 빌더      |
| `SecurityFilterChain`        | `SecurityWebFilterChain`   | 필터 체인         |
| `.authorizeHttpRequests { }` | `.authorizeExchange { }`   | 요청 인가 설정      |
| `NimbusJwtDecoder`           | `NimbusReactiveJwtDecoder` | JWT 검증        |
| `JwtDecoder`                 | `ReactiveJwtDecoder`       | JWT 디코더 인터페이스 |

### 현재 코드

```kotlin
@Configuration
class SecurityConfig {

    @Bean
    fun securityWebFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain =
        http
            .csrf { it.disable() }
            .headers { headers ->
                headers.frameOptions { it.disable() }
            }
            .authorizeExchange { exchange ->
                exchange.anyExchange().permitAll()
            }
            .oauth2ResourceServer { oauth2 ->
                oauth2.jwt { jwt ->
                    jwt.jwtDecoder(reactiveJwtDecoder())
                }
            }
            .build()

    @Bean
    fun reactiveJwtDecoder(): ReactiveJwtDecoder {
        val keyPair = OAuth2Util.getKeyPair()
        val publicKey = keyPair.public as RSAPublicKey
        return NimbusReactiveJwtDecoder.withPublicKey(publicKey).build()
    }
}
```

참고: `@EnableWebFluxSecurity`는 Spring Boot가 WebFlux를 감지하면 자동 적용하므로 생략한다.

### MVC (기존 fax-api)와 비교

```kotlin
// MVC (기존 fax-api)
fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
    return http
        .csrf { it.disable() }
        .authorizeHttpRequests { auth -> auth.anyRequest().permitAll() }
        .oauth2ResourceServer { it.jwt { jwt -> jwt.decoder(jwtDecoder()) } }
        .build()
}
fun jwtDecoder(): JwtDecoder =
    NimbusJwtDecoder.withPublicKey(publicKey).build()
```

클래스명만 바꾸면 되고, Lambda DSL 구조는 동일하다.

공통: `OAuth2Util.getKeyPair()` — RSA 키는 `commons-util/oauth2-util`에서 가져옴 (MVC/WebFlux 동일).

---

## 20. FaxControllerTests.kt — WebTestClient + REST Docs 테스트

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(RestDocumentationExtension::class)
class FaxControllerTests {

    @LocalServerPort
    private var port: Int = 0

    private lateinit var webTestClient: WebTestClient

    @MockitoBean
    private lateinit var faxService: FaxService

    private val testFax = Fax(
        faxSeq = 1L,
        uuid = UUID.fromString("550e8400-e29b-41d4-a716-446655440000"),
        year = 2026,
        sendStatus = "STANDBY",
        sendDT = LocalDateTime.of(2026, 2, 11, 10, 0),
        isReserved = false,
        frNumber = "02-1234-5678",
        toNumber = "031-9876-5432",
        toCompany = "테스트회사",
        toName = "홍길동",
        subject = "테스트 팩스"
    )

    @BeforeEach
    fun setUp(restDocumentation: RestDocumentationContextProvider) {
        webTestClient = WebTestClient.bindToServer()
            .baseUrl("http://localhost:$port")
            .filter(documentationConfiguration(restDocumentation))
            .build()
    }

    @Test
    fun `GET faxes_{faxSeq} - 단건 조회 성공`() = runTest {
        whenever(faxService.getFax(1L)).thenReturn(testFax)

        webTestClient.get()
            .uri("/api/faxes/1")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.faxSeq").isEqualTo(1)
            .jsonPath("$.sendStatus").isEqualTo("STANDBY")
            .consumeWith(
                document(
                    "{class-name}/{method-name}",
                    preprocessRequest(prettyPrint()),
                    preprocessResponse(prettyPrint()),
                    responseFields(
                        fieldWithPath("faxSeq").description("팩스 시퀀스"),
                        // ... 나머지 필드
                    )
                )
            )
    }

    @Test
    fun `GET faxes - 목록 조회`() = runTest {
        whenever(faxService.searchFaxes(null, 0, 10)).thenReturn(listOf(testFax))
        whenever(faxService.countFaxes(null)).thenReturn(1L)

        webTestClient.get()
            .uri("/api/faxes?page=0&size=10")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.content").isArray
            .jsonPath("$.total").isEqualTo(1)
            .consumeWith(document("{class-name}/{method-name}", ...))
    }

    @Test
    fun `POST faxes - 팩스 생성 201`() = runTest {
        whenever(faxService.createFax(any())).thenReturn(testFax)

        webTestClient.post()
            .uri("/api/faxes")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("""{ "frNumber": "02-1234-5678", ... }""")
            .exchange()
            .expectStatus().isCreated
            .consumeWith(document("{class-name}/{method-name}", ...))
    }
    // + 404 테스트, sendStatus 필터 테스트, 빈 결과 테스트 (총 6개)
}
```

### 테스트 구성 요소

| 요소                                               | 역할                                         |
|--------------------------------------------------|--------------------------------------------|
| `@SpringBootTest(RANDOM_PORT)`                   | 실제 Netty 서버 기동                             |
| `@ExtendWith(RestDocumentationExtension::class)` | Spring REST Docs 활성화                       |
| `@MockitoBean faxService`                        | Service를 Mock으로 대체 — DB 없이 Controller만 테스트 |
| `WebTestClient.bindToServer()`                   | 실제 HTTP 요청 전송 (localhost:port)             |
| `documentationConfiguration(restDocumentation)`  | REST Docs 필터 연결                            |
| `document("{class-name}/{method-name}", ...)`    | API 문서 스니펫 자동 생성                           |

### MVC 테스트 vs WebFlux 테스트

| MVC                         | WebFlux                        | 역할           |
|-----------------------------|--------------------------------|--------------|
| `MockMvc`                   | `WebTestClient`                | HTTP 테스트 도구  |
| `mockMvc.perform(get(...))` | `webTestClient.get().uri(...)` | 요청 빌드        |
| `.andExpect(status().isOk)` | `.expectStatus().isOk`         | 상태코드 검증      |
| `restdocs-mockmvc`          | `restdocs-webtestclient`       | REST Docs 연동 |

### RANDOM_PORT

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
```

| 옵션            | 서버          | 테스트 방식                     |
|---------------|-------------|----------------------------|
| `MOCK` (기본)   | 서버 안 띄움     | MockMvc — 서블릿 Mock         |
| `RANDOM_PORT` | 실제 Netty 기동 | WebTestClient — 실제 HTTP 요청 |

`RANDOM_PORT`로 실제 Netty 서버를 띄우므로, 전체 리액티브 파이프라인을 end-to-end로 검증한다.
`@MockitoBean`으로 Service를 Mock해서 DB 없이도 Controller 동작을 검증할 수 있다.

---

## 21. build.gradle.kts — 의존성 구성

### 의존성 카테고리별 정리 (Version Catalog 사용)

```kotlin
// Kotlin + Coroutine
implementation(libs.kotlin.stdlib)
implementation(libs.kotlin.reflect)
implementation(libs.kotlinx.coroutines.core)        // suspend, async 기본
implementation(libs.kotlinx.coroutines.reactor)     // Mono/Flux ↔ suspend 변환

// WebFlux (Netty)
implementation(libs.spring.boot.starter.webflux)

// R2DBC (non-blocking DB)
implementation(libs.spring.boot.starter.data.r2dbc)
runtimeOnly(libs.r2dbc.postgresql)

// JDBC (DB 자동 생성용 — DatabaseInitConfig에서 DriverManager 사용)
runtimeOnly(libs.postgresql)

// jOOQ (타입 안전 SQL)
implementation(libs.spring.boot.starter.jooq)
jooqCodegen(libs.jooq.meta.extensions)              // DDL 기반 코드 생성

// Security — MVC와 동일한 starter (WebFlux 감지 시 자동으로 리액티브 구성)
implementation(libs.spring.boot.starter.oauth2.resource.server)

// knet commons
implementation(libs.knet.oauth2.util)
implementation(libs.knet.session.util)

// Monitoring
implementation(libs.spring.boot.starter.actuator)
implementation(libs.micrometer.registry.prometheus)

// JSON
implementation(libs.spring.boot.starter.json)

// 테스트
testImplementation(libs.spring.boot.starter.test)
testImplementation(libs.spring.boot.resttestclient)
testImplementation(libs.spring.boot.restdocs)
testImplementation(libs.spring.restdocs.webtestclient)   // REST Docs + WebTestClient
testImplementation(libs.spring.security.test)
testImplementation(libs.kotlinx.coroutines.test)         // runTest 등
testImplementation(libs.mockito.kotlin)                  // whenever, any 등
```

### 기존 fax-api와 비교

```
기존 fax-api                          fax-reactive
─────────────────                     ─────────────────
starter-web (Tomcat)                  starter-webflux (Netty)
starter-data-jpa                      starter-data-r2dbc
postgresql (JDBC)                     r2dbc-postgresql + postgresql (DB 생성용)
mybatis                               starter-jooq + jooq-meta-extensions
                                      kotlinx-coroutines-core
                                      kotlinx-coroutines-reactor
starter-oauth2-resource-server        starter-oauth2-resource-server  ← 동일
starter-actuator                      starter-actuator                ← 동일
micrometer-prometheus                 micrometer-prometheus           ← 동일
knet oauth2-util                      knet oauth2-util                ← 동일
─── 테스트 ───                        ─── 테스트 ───
restdocs-mockmvc                      restdocs-webtestclient
starter-webmvc-test (MockMvc)         spring-boot-resttestclient
                                      kotlinx-coroutines-test
                                      mockito-kotlin
```

### 주의: starter-web과 starter-webflux 동시 사용

둘을 동시에 넣으면 MVC가 우선된다. 리액티브를 쓰려면 starter-web을 빼야 한다.

---

## 22. Gradle Version Catalog — `libs.versions.toml`

### 문제: 버전이 build.gradle.kts에 흩어짐

```kotlin
// 버전이 여기저기 하드코딩
plugins {
    id("org.springframework.boot") version "4.0.2"         // ← 여기
    id("org.jooq.jooq-codegen-gradle") version "3.19.29"   // ← 여기
}
dependencies {
    jooqCodegen("org.jooq:jooq-meta-extensions:3.19.29")   // ← 여기도
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")  // ← 여기도
}
```

멀티모듈에서 같은 버전을 여러 `build.gradle.kts`에 반복 선언하면 업그레이드 시 누락 위험이 있다.

### 해결: `gradle/libs.versions.toml` (Gradle 공식 기능)

```toml
# gradle/libs.versions.toml — 버전 한 곳에서 관리

[versions]
spring-boot = "4.0.2"
spring-cloud = "2025.1.1"
spring-dependency-management = "1.1.7"
kotlin = "2.3.10"
jooq = "3.19.29"
mockito-kotlin = "5.4.0"
oauth2-util = "1.5"
session-util = "1.20"

[plugins]
spring-boot = { id = "org.springframework.boot", version.ref = "spring-boot" }
spring-dependency-management = { id = "io.spring.dependency-management", version.ref = "spring-dependency-management" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-spring = { id = "org.jetbrains.kotlin.plugin.spring", version.ref = "kotlin" }
jooq-codegen = { id = "org.jooq.jooq-codegen-gradle", version.ref = "jooq" }

[libraries]
kotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }
spring-boot-starter-webflux = { module = "org.springframework.boot:spring-boot-starter-webflux" }
jooq-meta-extensions = { module = "org.jooq:jooq-meta-extensions", version.ref = "jooq" }
mockito-kotlin = { module = "org.mockito.kotlin:mockito-kotlin", version.ref = "mockito-kotlin" }
# ...
```

### build.gradle.kts — 버전 없이 alias로 참조

```kotlin
plugins {
    alias(libs.plugins.spring.boot)           // ← version 없음
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.jooq.codegen)
}

dependencies {
    implementation(libs.kotlin.stdlib)         // ← 문자열 대신 타입 안전 참조
    implementation(libs.spring.boot.starter.webflux)
    jooqCodegen(libs.jooq.meta.extensions)
    testImplementation(libs.mockito.kotlin)
}
```

### 비교

| 구분       | 직접 선언                    | Version Catalog          |
|----------|--------------------------|--------------------------|
| 버전 위치    | 각 `build.gradle.kts`에 분산 | `libs.versions.toml` 한 곳 |
| 멀티모듈     | 모듈마다 버전 중복 선언            | 전체 모듈이 같은 카탈로그 공유        |
| IDE 지원   | 문자열이라 자동완성 없음            | `libs.` 타이핑하면 자동완성       |
| 버전 업그레이드 | 파일마다 찾아서 변경              | `[versions]` 한 줄만 변경     |
| 오타 검출    | 런타임에 실패                  | 컴파일 타임에 검출               |

### 네이밍 규칙

toml의 `-`와 `.`은 Kotlin에서 `.`으로 변환된다:

```
toml: spring-boot-starter-webflux
 → Kotlin: libs.spring.boot.starter.webflux

toml: mockito-kotlin
 → Kotlin: libs.mockito.kotlin
```

### BOM 의존성 참조

Spring Cloud BOM처럼 `version.ref`가 필요한 경우 `.get().toString()` 으로 문자열 변환:

```kotlin
configure<DependencyManagementExtension> {
    imports {
        mavenBom(libs.spring.cloud.dependencies.get().toString())
    }
}
```

### Spring Boot BOM이 관리하는 라이브러리

Spring Boot BOM이 버전을 관리하는 라이브러리는 toml에서 `version`을 생략한다:

```toml
# Spring Boot BOM이 버전 관리 → version 불필요
spring-boot-starter-webflux = { module = "org.springframework.boot:spring-boot-starter-webflux" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core" }
r2dbc-postgresql = { module = "org.postgresql:r2dbc-postgresql" }

# Spring Boot BOM 외 → version 필요
mockito-kotlin = { module = "org.mockito.kotlin:mockito-kotlin", version.ref = "mockito-kotlin" }
jooq-meta-extensions = { module = "org.jooq:jooq-meta-extensions", version.ref = "jooq" }
```

### Composite Build 전체 적용 — 공유 Version Catalog

#### 문제: 모듈마다 별도의 버전 관리

`new-msa` 프로젝트는 Composite Build 구조로, 6개의 독립 빌드가 포함된다:

```
new-msa/                          ← root (Composite Build)
├── settings.gradle.kts           ← includeBuild("commons-util"), includeBuild("fax"), ...
├── commons-util/                 ← 독립 빌드 (settings.gradle.kts 보유)
├── fax/                          ← 독립 빌드
├── downtime/                     ← 독립 빌드
├── calendar/                     ← 독립 빌드
├── mail/                         ← 독립 빌드
└── fax-reactive/                 ← 독립 빌드
```

각 빌드가 독립적이므로, Version Catalog를 모듈별로 따로 만들면 같은 버전을 6곳에 중복 선언해야 한다.

#### 해결: root에 1개의 toml, 모든 빌드에서 공유

```
new-msa/
├── gradle/
│   └── libs.versions.toml        ← 공유 Version Catalog (1개)
├── commons-util/
│   └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
├── fax/
│   └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
├── downtime/
│   └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
├── calendar/
│   └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
├── mail/
│   └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
└── fax-reactive/
    └── settings.gradle.kts       ← from(files("../gradle/libs.versions.toml"))
```

#### settings.gradle.kts — 공유 toml 참조

Composite Build에서는 각 included build가 독립 빌드이므로 `gradle/libs.versions.toml` 자동 인식이 안 된다.
`dependencyResolutionManagement`로 명시적으로 경로를 지정해야 한다:

```kotlin
// fax/settings.gradle.kts (각 included build 동일)
rootProject.name = "fax"

dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))   // ← root의 공유 toml 참조
        }
    }
}

include("fax")
include("fax-api")
include("fax-batch")
include("fax-scheduler")
```

#### parent build.gradle.kts — Version Catalog 적용

```kotlin
// fax/build.gradle.kts (parent)
plugins {
    alias(libs.plugins.spring.boot)                          // ← version 없이
    alias(libs.plugins.spring.dependency.management)
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.spring) apply false
}

val kotlinVersion by extra(libs.versions.kotlin.get())       // ← 카탈로그에서 추출
val springCloudVersion = libs.versions.spring.cloud.get()

subprojects {
    configure<DependencyManagementExtension> {
        imports {
            mavenBom("org.springframework.cloud:spring-cloud-dependencies:$springCloudVersion")
        }
    }
}
```

#### submodule build.gradle.kts — 의존성 alias

```kotlin
// fax/fax-api/build.gradle.kts (submodule)
dependencies {
    api(project(":fax"))                                     // ← 프로젝트 참조는 그대로

    implementation(libs.knet.rest.api.oauth2.util)           // ← 문자열 → alias
    implementation(libs.knet.pageable.util)
    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.oauth2.resource.server)
    implementation(libs.spring.boot.starter.actuator)
    implementation(libs.micrometer.registry.prometheus)
    implementation(libs.logstash.logback.encoder)

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.spring.security.test)
    testImplementation(libs.spring.boot.restdocs)
    testImplementation(libs.spring.restdocs.mockmvc)
    testImplementation(libs.knet.restdocs.util)
    testImplementation(libs.jjwt.api)
    testRuntimeOnly(libs.jjwt.impl)
    testRuntimeOnly(libs.jjwt.jackson)
}
```

#### Composite Build에서 Version Catalog가 적용되지 않는 것

| 항목               | Version Catalog 적용                | 이유                                                                         |
|------------------|-----------------------------------|----------------------------------------------------------------------------|
| 플러그인             | O (`alias(libs.plugins.xxx)`)     | parent에서 선언                                                                |
| 의존성              | O (`libs.xxx`)                    | 모든 submodule에서 사용                                                          |
| cross-module 의존성 | **X** (문자열 유지)                    | `"com.knet.msa.fax:fax:latest.integration"` — dynamic version은 catalog 부적합 |
| `extra` 변수       | 부분 (`libs.versions.kotlin.get()`) | 문자열이 필요한 곳에 사용                                                             |

---

## 23. Repository 레이어 분리 — 왜 jOOQ를 Service에서 분리했는가

### R2DBC에서 Repository 접근 방식 3가지

| 방식                     | 설명                                | 적합한 경우                           |
|------------------------|-----------------------------------|----------------------------------|
| Spring Data R2DBC      | `ReactiveCrudRepository` 인터페이스 상속 | 단순 CRUD, JPA처럼 편하게 쓰고 싶을 때       |
| **jOOQ + @Repository** | 직접 `@Repository` 클래스에 jOOQ 쿼리 작성  | 복잡한 쿼리, 타입 안전 SQL이 필요할 때 (현재 채택) |
| jOOQ를 Service에 직접      | Service에서 DSLContext 직접 사용        | 예제/프로토타입, 쿼리가 몇 개 안 될 때          |

### jOOQ와 R2DBC는 다른 역할

```
R2DBC  — DB와 논블로킹으로 통신하는 드라이버 (데이터를 어떻게 주고받을까)
jOOQ   — SQL을 타입 안전하게 작성하는 빌더 (쿼리를 어떻게 만들까)
```

조합이 자유롭다:

```
JDBC  + MyBatis     ← 기존 fax 모듈
JDBC  + JPA         ← 가장 흔한 조합
JDBC  + jOOQ        ← 가능
R2DBC + jOOQ        ← 현재 fax-reactive (채택)
R2DBC + Spring Data R2DBC  ← 가능
```

### 분리 효과

실제 코드는 4장 참고. 분리 전후 비교:

| 구분              | Before (Service에 전부)    | After (Repository 분리) |
|-----------------|-------------------------|-----------------------|
| Service의 import | jOOQ, Reactor, Record 등 | **없음** — 순수 도메인만      |
| Service의 역할     | 쿼리 + 비즈니스 로직 혼재         | 비즈니스 로직만              |
| 쿼리 변경 시         | Service 수정              | Repository만 수정        |
| 테스트             | DSLContext 모킹 필요        | Repository 모킹으로 간단    |

```kotlin
// Before — Service에 jOOQ 직접 사용 (쿼리 + 비즈니스 혼재)
@Service
class FaxServiceImpl(private val dsl: DSLContext) {
    override suspend fun getFax(faxSeq: Long): Fax? {
        return Mono.from(
            dsl.select().from(FAXES).where(FAXES.FAX_SEQ.eq(faxSeq))
        ).map { toFax(it) }.awaitFirstOrNull()
    }
}

// After — Service는 Repository에 위임 (비즈니스만)
@Service
class FaxServiceImpl(private val faxRepository: FaxRepository) {
    override suspend fun getFax(faxSeq: Long): Fax? =
        faxRepository.findByFaxSeq(faxSeq)
}
```

### Spring Data R2DBC vs jOOQ — 상세 비교

현재 프로젝트에 두 방식 모두 구현되어 있다:

- `FaxRepository` — jOOQ (복잡한 쿼리, 동적 조건)
- `FaxCrudRepository` — Spring Data R2DBC (단순 CRUD)

#### Spring Data R2DBC — 인터페이스만 선언

```kotlin
interface FaxCrudRepository : ReactiveCrudRepository<Fax, Long> {

    /** 메서드 이름 기반 쿼리 — Spring이 SQL 자동 생성 */
    fun findBySendStatus(sendStatus: String): Flux<Fax>

    /** @Query 기반 — 직접 SQL 작성 */
    @Query("SELECT * FROM faxes WHERE send_status = :status ORDER BY send_dt DESC LIMIT :limit OFFSET :offset")
    fun searchByStatus(status: String, offset: Int, limit: Int): Flux<Fax>
}
```

인터페이스만 선언하면 Spring이 구현체를 자동 생성한다.
`findById()`, `save()`, `delete()`, `count()` 등 기본 CRUD는 `ReactiveCrudRepository`에 이미 있다.

#### 도메인 클래스 — Spring Data R2DBC 어노테이션 추가

```kotlin
@Table("faxes")                            // ← Spring Data R2DBC가 테이블 인식
data class Fax(
    @Id                                    // ← PK 필드
    val faxSeq: Long? = null,
    val uuid: UUID? = null,
    val year: Int? = null,
    val sendStatus: String? = null,
    @Column("send_dt")                     // ← camelCase → snake_case 자동 변환이 안 맞는 경우
    val sendDT: LocalDateTime? = null,
    val isReserved: Boolean? = null,
    val frNumber: String? = null,
    // ...
)
```

`@Table`, `@Id`, `@Column`은 Spring Data 어노테이션이다 (JPA 어노테이션 아님).
jOOQ는 이 어노테이션을 완전히 무시하므로 양쪽 모두 같은 클래스를 공유할 수 있다.

참고: `sendDT` → 자동 변환하면 `send_d_t`가 되므로 `@Column("send_dt")` 명시가 필요하다.
나머지 필드(`sendStatus` → `send_status`, `frNumber` → `fr_number`)는 자동 변환이 정확하다.

#### 동적 쿼리에서의 차이

```kotlin
// jOOQ — 동적 조건을 코드로 조립 (타입 안전)
var condition = DSL.noCondition()
sendStatus?.let { condition = condition.and(FAXES.SEND_STATUS.eq(it)) }
frNumber?.let { condition = condition.and(FAXES.FR_NUMBER.eq(it)) }

dsl.select().from(FAXES)
    .where(condition)                    // 조건이 없으면 WHERE 절 생략
    .orderBy(FAXES.SEND_DT.desc())
    .offset(offset).limit(limit)
// FAXES.SEND_STATUS.eq(123) → 컴파일 에러! (String 필드에 Int)

// Spring Data R2DBC — 문자열 SQL로 작성
@Query("SELECT * FROM faxes WHERE (:status IS NULL OR send_status = :status) ORDER BY send_dt DESC")
fun search(status: String?): Flux<Fax>   // 오타 → 런타임 에러
```

jOOQ는 조건을 **코드로 동적 조립**하지만, Spring Data R2DBC는 SQL 문자열에 조건을 모두 넣어야 한다.
조건이 3~4개 이상이면 SQL이 복잡해지고, 오타를 컴파일 시점에 잡을 수 없다.

#### 비교표

|               | Spring Data R2DBC                  | jOOQ                                  |
|---------------|------------------------------------|---------------------------------------|
| 코드량           | **적음** — 인터페이스만 선언                 | 많음 — 쿼리 + 매핑 직접 작성                    |
| 단순 CRUD       | **편함** — `save()`, `findById()` 내장 | 직접 INSERT/SELECT 작성                   |
| 동적 조건 (WHERE) | 어려움 — SQL 문자열에 하드코딩                | **자연스러움** — `noCondition()` + `and()` |
| 타입 안전         | X — 컬럼명/타입이 문자열                    | **O** — 코드 생성으로 컴파일 타임 검증             |
| 복잡한 쿼리 (JOIN) | 거의 불가 — 네이티브 SQL 필요                | **강력** — SQL DSL로 표현                  |
| 학습 난이도        | 낮음 (JPA 경험 있으면)                    | 중간 (SQL 알면 쉬움)                        |
| MyBatis 전환    | 패러다임 다름 (SQL → 메서드명)               | **자연스러움** (SQL → SQL DSL)             |
| Record 매핑     | **자동** (`@Table`, `@Column`)       | 수동 (`toFax(record)`)                  |

#### 현재 구조 — 양쪽 병행

```
FaxCrudRepository (Spring Data R2DBC)
  └─ 단순 CRUD: findById, save, delete, findBySendStatus

FaxRepository (jOOQ)
  └─ 복잡한 쿼리: 동적 검색, 페이징, 카운트, 시퀀스 발급
```

양쪽 모두 같은 `Fax` data class를 공유한다.
jOOQ는 `@Table`, `@Id` 어노테이션을 무시하고, Spring Data R2DBC는 jOOQ 생성 코드를 모른다.

#### `@Id`와 save() 동작

```kotlin
// @Id가 null → INSERT
faxCrudRepository.save(Fax(uuid = UUID.randomUUID(), ...))
// → INSERT INTO faxes (uuid, ...) VALUES (...)
// → fax_seq는 DB 시퀀스가 자동 채번

// @Id가 값이 있음 → UPDATE
faxCrudRepository.save(Fax(faxSeq = 42, uuid = ..., ...))
// → UPDATE faxes SET uuid = ..., ... WHERE fax_seq = 42
```

Spring Data R2DBC는 `@Id` 값의 null 여부로 INSERT/UPDATE를 자동 판단한다.
jOOQ에서는 `insert()`, `update()`를 명시적으로 호출해야 한다.

---

## 24. jOOQ 코드 생성 — schema.sql → 타입 안전 클래스 자동 생성

### jOOQ는 스키마를 어떻게 아는가?

jOOQ는 2가지 방식으로 테이블/컬럼 정보를 인식한다:

| 방식                | 설명                                                                   | 스키마 인식                  |
|-------------------|----------------------------------------------------------------------|-------------------------|
| **코드 생성 (표준/권장)** | DB 또는 SQL 파일을 읽고 Java/Kotlin 클래스 자동 생성                               | 자동 — DB 스키마와 100% 일치 보장 |
| 수동 DSL            | `DSL.table("faxes")`, `DSL.field("fax_seq", Long::class.java)` 직접 작성 | 수동 — 오타/타입 불일치 가능       |

### 코드 생성 소스 3가지

| 소스              | 설명                               | DB 접속 필요          |
|-----------------|----------------------------------|-------------------|
| **DDL 기반 (채택)** | `schema.sql` 파싱 → 클래스 생성         | X — SQL 파일만 있으면 됨 |
| DB 기반           | 실제 DB에 JDBC 접속 → 스키마 읽기 → 클래스 생성 | O — 빌드 시 DB 필요    |
| JPA 기반          | Hibernate Entity 읽기 → 클래스 생성     | X                 |

DDL 기반을 선택한 이유: CI/CD에서 DB 접속 없이 빌드 가능, 기존 `schema.sql` 재활용.

### DDL 기반 vs DB 접속 기반 — 상세 비교

#### 빌드 환경 의존성

|            | DDL 기반              | DB 접속 기반                       |
|------------|---------------------|--------------------------------|
| 로컬 빌드      | DB 없이 가능            | DB가 떠있어야 함                     |
| CI/CD      | 그대로 빌드              | DB 컨테이너 추가 필요                  |
| 신규 개발자 온보딩 | clone → build 바로 가능 | clone → DB 설치 → 스키마 적용 → build |

DDL 기반의 가장 큰 장점은 **빌드에 외부 의존이 없다**는 것.

#### 스키마 정확도

|                      | DDL 기반                          | DB 접속 기반                |
|----------------------|---------------------------------|-------------------------|
| 테이블/컬럼               | O                               | O                       |
| 시퀀스, PK/인덱스          | O                               | O                       |
| **뷰 (VIEW)**         | 제한적 — 단순 뷰만 파싱                  | **O — 모든 뷰 지원**         |
| **함수/프로시저**          | **X — 파싱 불가**                   | **O — DB에서 직접 읽음**      |
| **트리거**              | **X**                           | **O**                   |
| **커스텀 타입 (ENUM 등)**  | 제한적                             | **O — DB 타입 시스템 직접 반영** |
| **확장 (uuid-ossp 등)** | X — `gen_random_uuid()` 등 인식 불가 | O                       |

DB 접속 기반의 가장 큰 장점은 **DB의 실제 상태를 100% 반영**한다는 것.

#### 스키마 불일치 위험

```
DDL 기반:
  schema.sql 수정 → jooqCodegen → 코드 생성 OK
  하지만 실제 DB에 ALTER TABLE을 직접 쳤다면? → schema.sql과 불일치 → 런타임 에러

DB 접속:
  DB에 ALTER TABLE → jooqCodegen → 코드에 바로 반영
  하지만 schema.sql 업데이트를 깜빡하면? → 다른 환경에서 스키마 불일치
```

|                          | DDL 기반            | DB 접속 기반                              |
|--------------------------|-------------------|---------------------------------------|
| 진실의 원천 (Source of Truth) | **schema.sql** 파일 | **실제 DB**                             |
| 불일치 위험                   | DB를 직접 수정하면 놓침    | schema.sql 업데이트를 깜빡하면 놓침              |
| Flyway와 궁합               | 별도 관리 필요          | **좋음** — Flyway가 DB를 관리, jOOQ가 DB를 읽음 |

#### Flyway와의 조합

```
schema.sql 방식 (현재):
  schema.sql ──→ jooqCodegen (DDL 파싱)
  schema.sql ──→ ApplicationR2dbcScriptDatabaseInitializer (테이블 생성)
  └─ 하나의 파일이 두 역할 → 단순

Flyway + DB 접속 방식 (실무 표준):
  V1__create.sql ──→ Flyway ──→ DB에 마이그레이션 적용
                                  ↓
                        jooqCodegen (DB 접속) ──→ 코드 생성
  └─ Flyway가 DB를 관리, jOOQ가 DB를 읽음 → 역할 분리 명확
```

#### DB 접속 방식 설정 예시

```kotlin
// build.gradle.kts — DB 접속 기반으로 변경 시

dependencies {
    // DDL 기반: jooqCodegen("org.jooq:jooq-meta-extensions")
    // DB 접속: JDBC 드라이버 필요
    jooqCodegen(libs.postgresql)
}

jooq {
    configuration {
        jdbc {                                                  // ← JDBC 접속 정보 추가
            driver = "org.postgresql.Driver"
            url = "jdbc:postgresql://localhost:5432/fax-reactive"
            user = "postgres"
            password = "postgres"
        }
        generator {
            database {
                name = "org.jooq.meta.postgres.PostgresDatabase" // ← DDLDatabase → PostgresDatabase
                inputSchema = "public"
            }
            // generate, target 은 동일
        }
    }
}
```

#### 실무 선택 기준

| 상황                 | 권장 방식      | 이유                       |
|--------------------|------------|--------------------------|
| 학습/프로토타입           | **DDL 기반** | DB 없이 빌드, 설정 단순          |
| 단순 CRUD 앱          | **DDL 기반** | 테이블/컬럼만 있으면 충분           |
| 뷰/함수/트리거 사용        | **DB 접속**  | DDL 파서가 인식 못 함           |
| Flyway 도입 후        | **DB 접속**  | Flyway → DB → jOOQ 파이프라인 |
| CI/CD에서 DB 컨테이너 힘듦 | **DDL 기반** | 외부 의존 없음                 |
| 대규모 팀/운영           | **DB 접속**  | 실제 DB 상태 = 생성 코드 보장      |

현재 fax-reactive는 테이블만 사용하고 Flyway도 없으므로 DDL 기반이 적합.
나중에 뷰/함수를 쓰거나 Flyway를 도입하면 DB 접속 방식으로 전환.

### 설정 — build.gradle.kts

```kotlin
plugins {
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.jooq.codegen)              // jOOQ 코드 생성 플러그인
    idea
}

dependencies {
    // ... (생략)

    // jOOQ Code Generation (DDL 기반 — DB 접속 불필요)
    jooqCodegen(libs.jooq.meta.extensions)
}

// schema.sql 파싱 → Java 클래스 자동 생성
jooq {
    configuration {
        generator {
            database {
                name = "org.jooq.meta.extensions.ddl.DDLDatabase"
                properties {
                    property {
                        key = "scripts"
                        value = "src/main/resources/database-fax-reactive/schema.sql"
                    }
                    property {
                        key = "sort"
                        value = "semantic"
                    }
                    property {
                        key = "defaultNameCase"
                        value = "lower"
                    }
                }
            }
            generate {
                isDeprecated = false
                isRecords = true
                isPojos = false
                isFluentSetters = true
            }
            target {
                packageName = "com.knet.msa.fax.reactive.jooq"
                directory = "build/generated-sources/jooq"
            }
        }
    }
}

// 생성된 코드를 소스에 포함
sourceSets {
    main {
        kotlin {
            srcDir("build/generated-sources/jooq")
        }
    }
}

// 컴파일 전에 코드 생성 실행
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    dependsOn("jooqCodegen")
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_25)
    }
}

// IntelliJ에서 generated-sources 인식
idea {
    module {
        generatedSourceDirs.add(file("build/generated-sources/jooq"))
    }
}
```

### 빌드 흐름

```
schema.sql → jooqCodegen → compileKotlin → compileJava → test → build
               ↓
  build/generated-sources/jooq/
  └── com/knet/msa/fax/reactive/jooq/
      ├── Tables.java           ← FAXES 상수
      ├── Sequences.java        ← FAXES_FAX_SEQ_SEQ 시퀀스
      ├── Keys.java             ← PK, 인덱스 정보
      └── tables/
          ├── Faxes.java        ← 테이블 클래스 (컬럼 필드 포함)
          └── records/
              └── FaxesRecord.java  ← 레코드 클래스
```

### 자동 생성된 Faxes 클래스 (핵심 부분)

```java
public class Faxes extends TableImpl<FaxesRecord> {
	public static final Faxes FAXES = new Faxes();

	// 컬럼 — 타입이 schema.sql에서 자동 추론됨
	public final TableField<FaxesRecord, Long> FAX_SEQ = ...;  // BIGINT → Long
	public final TableField<FaxesRecord, java.util.UUID> UUID = ...;  // UUID → UUID
	public final TableField<FaxesRecord, Integer> YEAR = ...;  // INT → Integer
	public final TableField<FaxesRecord, String> SEND_STATUS = ...;  // TEXT → String
	public final TableField<FaxesRecord, LocalDateTime> SEND_DT = ...;  // TIMESTAMP → LocalDateTime
	public final TableField<FaxesRecord, Boolean> IS_RESERVED = ...;  // BOOLEAN → Boolean
	public final TableField<FaxesRecord, String> FR_NUMBER = ...;  // TEXT → String
	// ...
}
```

### 수동 DSL vs 자동 생성 비교

```kotlin
// Before: 수동 DSL — 타입을 개발자가 지정 (오타/불일치 위험)
val FAXES = table("faxes")
val FAX_SEQ = field("fax_seq", Long::class.java)
val SEND_DT = field("send_dt", Timestamp::class.java)  // ← 타입을 직접 맞춰야 함

dsl.select().from(FAXES).where(FAX_SEQ.eq(faxSeq))

// After: 자동 생성 — schema.sql에서 타입 자동 추론
import com . knet . msa . fax . reactive . jooq . tables . Faxes . FAXES

        dsl.select().from(FAXES).where(FAXES.FAX_SEQ.eq(faxSeq))
//                              ↑ TableField<FaxesRecord, Long> — 타입 보장
//                                          FAXES.FAX_SEQ.eq("문자열") → 컴파일 에러!
```

| 구분          | 수동 DSL                | 자동 코드 생성                            |
|-------------|-----------------------|-------------------------------------|
| 타입 안전       | 부분 — 개발자가 타입 지정       | 완전 — DB 스키마와 100% 일치                |
| 컬럼 추가 시     | 수동으로 `FaxTable.kt` 수정 | `schema.sql` 수정 → `jooqCodegen` 재실행 |
| nullable 체크 | 없음                    | `NOT NULL` 제약조건 반영                  |
| PK/인덱스 정보   | 없음                    | `Keys.java`, `Indexes.java`에 포함     |
| 빌드 의존       | 없음                    | Gradle 플러그인 필요                      |

### Repository에서 사용

자동 생성된 `FAXES` 상수를 import해서 타입 안전 쿼리를 작성한다 (전체 코드는 4장 참고):

```kotlin
import com.knet.msa.fax.reactive.jooq.tables.Faxes.FAXES  // 자동 생성된 클래스

@Repository
class FaxRepository(private val dsl: DSLContext) {

    suspend fun findByFaxSeq(faxSeq: Long): Fax? {
        return Mono.from(
            dsl.select()
                .from(FAXES)
                .where(FAXES.FAX_SEQ.eq(faxSeq))    // Long 타입 보장
        ).map { record -> toFax(record) }
            .awaitFirstOrNull()
    }

    private fun toFax(record: Record): Fax = Fax(
        faxSeq = record.get(FAXES.FAX_SEQ),         // ← Long
        uuid = record.get(FAXES.UUID),               // ← UUID
        year = record.get(FAXES.YEAR),               // ← Integer
        sendStatus = record.get(FAXES.SEND_STATUS),  // ← String
        sendDT = record.get(FAXES.SEND_DT),          // ← LocalDateTime (변환 불필요)
        isReserved = record.get(FAXES.IS_RESERVED),   // ← Boolean
        frNumber = record.get(FAXES.FR_NUMBER),
        toNumber = record.get(FAXES.TO_NUMBER),
        toCompany = record.get(FAXES.TO_COMPANY),
        toName = record.get(FAXES.TO_NAME),
        subject = record.get(FAXES.SUBJECT)
    )
}
```

수동 DSL에서 있었던 `Timestamp ↔ LocalDateTime` 변환 문제가 자동 생성에서는 발생하지 않는다.

### 도메인이 많아졌을 때의 구조

```
build/generated-sources/jooq/    ← 자동 생성 (schema.sql → jooqCodegen)
└── .../jooq/
    ├── Tables.java
    └── tables/
        ├── Faxes.java
        ├── FaxYears.java
        ├── CustomKeys.java
        └── ...

src/main/kotlin/
├── domain/                      ← data class (직접 작성)
│   ├── Fax.kt
│   └── FaxYear.kt
├── repository/                  ← jOOQ 쿼리 (직접 작성)
│   ├── FaxRepository.kt         ← FAXES, FAX_YEARS 테이블 사용
│   └── QueueRepository.kt
├── service/                     ← 비즈니스 로직 (jOOQ 의존 없음)
└── controller/                  ← REST 엔드포인트
```

`table/` 패키지가 사라지고 `build/generated-sources/jooq/`로 대체된다.
schema.sql에 테이블을 추가하면 `jooqCodegen` 재실행만으로 새 클래스가 자동 생성된다.

### 레이어별 jOOQ 의존 여부

| 레이어                             | jOOQ 의존 | 역할                         |
|---------------------------------|---------|----------------------------|
| `build/generated-sources/jooq/` | —       | 자동 생성 (테이블, 컬럼, PK, 시퀀스)   |
| `repository/`                   | O       | 쿼리 실행 + Record → domain 매핑 |
| `service/`                      | **X**   | 비즈니스 로직                    |
| `controller/`                   | **X**   | REST 엔드포인트                 |

---

## 25. AOP 응답 래핑 — ReactiveApiResponse

기존 MVC 모듈(`fax-api`)의 `FaxApiAspect`와 동일한 역할:
컨트롤러 반환값을 `ReactiveApiResponse`로 감싸고, 실행 시간(duration)을 측정한다.

### MVC AOP vs WebFlux AOP — 핵심 차이

| 항목                   | MVC (`FaxApiAspect`)     | WebFlux (`ReactiveApiAspect`)          |
|----------------------|--------------------------|----------------------------------------|
| `proceed()` 반환       | **실제 값** (Object)        | **Mono** (Spring이 suspend → Mono 변환)   |
| 래핑 방식                | 바로 `ApiResponse(result)` | `mono.map { ReactiveApiResponse(it) }` |
| SSE 처리               | 해당 없음                    | Flux/Flow는 래핑하지 않음                     |
| RequestContextHolder | ThreadLocal로 접근 가능       | **사용 불가** (Netty 스레드 풀)                |
| 반환 타입 제약             | 없음 (런타임 타입으로 직렬화)        | **컨트롤러 반환 타입을 `Any`로 선언 필요**           |

### Spring Framework 7의 suspend 함수 처리

Spring Framework 7 + Spring AOP 조합에서 suspend 함수의 `proceed()` 동작:

```
Controller: suspend fun searchFaxes(): Any
                      ↓
Spring: CoroutinesUtils.invokeSuspendingFunction()
                      ↓
        Mono로 변환 → AOP proxy 호출
                      ↓
AOP:    proceed() → MonoOnErrorResume 반환 (Mono!)
                      ↓
        result is Mono → .map { ReactiveApiResponse.ok(it) }
```

**핵심**: Spring AOP 인프라가 suspend 함수를 이미 Mono로 변환하여 `proceed()`에서 반환한다.
따라서 suspend/non-suspend 구분 없이, `proceed()` 결과의 타입(Mono/Flux/Flow/기타)만 확인하면 된다.

처음 시도한 `mono(continuation.context) { pjp.proceed() }` 방식은
`IllegalArgumentException: Mono context cannot contain job in it` 에러가 발생한다.
Spring의 코루틴 컨텍스트에 `Job`이 포함되어 있어서 새로운 `mono {}` 블록을 만들 수 없기 때문.

### Jackson 3 타입 호환 문제와 해결

**문제**: WebFlux는 컨트롤러 메서드의 **선언된 반환 타입**으로 Jackson 직렬화를 수행한다.

```kotlin
// 이렇게 선언하면:
suspend fun searchFaxes(): Map<String, Any>

// Spring이 Mono<Map<String, Any>>로 변환하고,
// AOP가 .map()으로 ReactiveApiResponse를 넣어도
// Jackson은 여전히 Map<String, Any>로 직렬화하려고 시도 → 에러!
```

```
InvalidDefinitionException: Incompatible types:
  declared root type (Map<String, Object>) vs ReactiveApiResponse
```

**MVC와의 차이**: MVC는 실행 시점 객체의 런타임 타입으로 직렬화하지만,
WebFlux는 메서드 시그니처의 `ResolvableType`을 기준으로 인코딩 타입을 결정한다.

**해결**: 컨트롤러 반환 타입을 `Any`로 선언.

```kotlin
// 변경 전 (에러)
suspend fun searchFaxes(): Map<String, Any>
suspend fun getFax(): Fax

// 변경 후 (정상)
suspend fun searchFaxes(): Any
suspend fun getFax(): Any
```

`Any`로 선언하면 Jackson이 런타임 타입(`ReactiveApiResponse`)을 그대로 사용한다.

### AOP vs WebFilter — 장단점 비교

| 항목             | AOP (@Around)             | WebFilter                        |
|----------------|---------------------------|----------------------------------|
| **적용 범위**      | 특정 패키지/메서드 지정 가능          | 전체 요청 (URL 패턴 필터링 필요)            |
| **MVC와 유사성**   | 기존 MVC Aspect와 거의 동일 구조   | 완전히 다른 패턴                        |
| **suspend 함수** | Spring 7이 Mono 변환 → 정상 동작 | 관여하지 않음 (응답 바이트 래핑)              |
| **반환 타입 제약**   | `Any`로 선언 필요              | 없음 (바이트 레벨 래핑)                   |
| **SSE 제외**     | `is Flux/Flow` 분기로 간단     | Content-Type 체크 필요               |
| **구현 복잡도**     | 낮음                        | 중간 (ServerHttpResponseDecorator) |
| **에러 응답 래핑**   | `@ExceptionHandler`와 조합   | 자체 에러 처리 필요                      |

### ReactiveApiAspect 코드

```kotlin
@Aspect
@Component
class ReactiveApiAspect {

    @Around("execution(* com.knet.msa.fax.reactive.controller..*Controller.*(..))")
    fun wrapResponse(pjp: ProceedingJoinPoint): Any? {
        val startTime = System.currentTimeMillis()
        val result = pjp.proceed()

        return when (result) {
            // SSE 스트리밍은 감싸지 않음
            is Flux<*>, is Flow<*> -> result
            // Mono (suspend 함수도 Spring이 Mono로 변환)
            is Mono<*> -> result.map { data ->
                ReactiveApiResponse.ok(data, System.currentTimeMillis() - startTime)
            }
            // 일반 반환값
            else -> ReactiveApiResponse.ok(result, System.currentTimeMillis() - startTime)
        }
    }
}
```

의존성 (`build.gradle.kts`):

```kotlin
implementation(libs.spring.aop)       // org.springframework:spring-aop
implementation(libs.aspectjweaver)    // org.aspectj:aspectjweaver
```

### ReactiveApiResponse 코드

```kotlin
@JsonPropertyOrder("status", "code", "message", "duration", "data")
data class ReactiveApiResponse<T>(
    val status: Int = 200,
    val code: String = "OK",
    val message: String = "성공",
    val data: T? = null,
    val duration: Long? = null
) {
    companion object {
        fun <T> ok(data: T?, duration: Long) = ReactiveApiResponse(data = data, duration = duration)
        fun <T> error(status: Int, code: String, message: String) = ReactiveApiResponse<T>(
            status = status, code = code, message = message
        )
    }
}
```

기존 MVC의 `ApiResponse`와 동일한 구조이며, Servlet 의존성(`Session`, `BindingResult`)을 제거한 버전.
`@JsonPropertyOrder`는 Jackson 3에서도 `com.fasterxml.jackson.annotation` 패키지 사용
(Jackson 3의 `jackson-annotations:2.20`이 하위 호환을 유지).

응답 예시:

```json
{
  "status": 200,
  "code": "OK",
  "message": "성공",
  "duration": 483,
  "data": {
    "content": [
      ...
    ],
    "page": 0,
    "size": 1,
    "total": 6
  }
}
```

---

## 26. Reactor Context + MDC 로그 전파

### 문제: WebFlux에서 MDC가 안 되는 이유

MDC = Mapped Diagnostic Context — 로그에 요청별 추적 정보를 자동으로 넣어주는 SLF4J/Logback 기능입니다.

MVC에서는 요청 하나가 스레드 하나에 묶이므로 `MDC.put("requestId", id)` 하면 해당 요청의 모든 로그에 requestId가 자동 출력된다.

```
MVC (Thread-per-request):
  Thread-1: [요청 수신] → MDC.put("requestId", "abc") → [Service] → [Repository] → [응답]
                          ↑ Thread-1의 ThreadLocal에 저장
                          모든 로그에 requestId=abc 자동 출력
```

WebFlux에서는 하나의 요청이 여러 스레드를 거친다:

```
WebFlux (Event Loop):
  Thread-1: [요청 수신] → MDC.put("requestId", "abc") → [DB 호출] → 스레드 반환
  Thread-3:                                               [DB 응답] → 로그 출력
                                                          ↑ Thread-3의 ThreadLocal은 비어있음!
                                                          requestId = null
```

ThreadLocal은 스레드에 묶이므로, 스레드가 바뀌면 MDC 데이터가 사라진다.

### 해결: Reactor Context + Micrometer Context Propagation

Reactor Context는 구독 체인을 따라 전파되는 **불변 맵**이다.
스레드가 아니라 **구독(subscription)에 묶이므로** 스레드가 바뀌어도 유지된다.

```
Reactor Context:
  subscribe() → Context{requestId=abc} → [Thread-1] → [Thread-3] → [Thread-2]
                                          모든 스레드에서 Context 접근 가능
```

Spring Boot 4.0.2에는 `micrometer-context-propagation`이 포함되어 있어,
Reactor Context ↔ ThreadLocal(MDC)을 **자동으로** 브릿지한다.

### 구현 1: 자동 컨텍스트 전파 활성화

```kotlin
@SpringBootApplication
class FaxReactiveApplication

fun main(args: Array<String>) {
    // Reactor Context → ThreadLocal 자동 전파 활성화
    Hooks.enableAutomaticContextPropagation()
    runApplication<FaxReactiveApplication>(*args)
}
```

이 한 줄로 Reactor Context에 저장된 값이 ThreadLocal(MDC)로 자동 복사된다.

### 구현 2: WebFilter — 요청별 requestId 생성

```kotlin
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestIdFilter : WebFilter {

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        val requestId = exchange.request.headers.getFirst("X-Request-Id")
            ?: UUID.randomUUID().toString().substring(0, 8)

        return chain.filter(exchange)
            .contextWrite { ctx ->
                ctx.put("requestId", requestId)
            }
    }
}
```

`contextWrite`로 Reactor Context에 requestId를 저장한다.
`Hooks.enableAutomaticContextPropagation()` 덕분에 이 값이 MDC에 자동 전파된다.

### 구현 3: MDC ThreadLocalAccessor 등록

Micrometer Context Propagation이 MDC와 브릿지하려면 `ThreadLocalAccessor`를 등록해야 한다:

```kotlin
@Configuration
class ContextPropagationConfig {

    @PostConstruct
    fun init() {
        ContextRegistry.getInstance().registerThreadLocalAccessor(
            "requestId",
            { MDC.get("requestId") },                      // ThreadLocal에서 읽기
            { value -> MDC.put("requestId", value) },      // ThreadLocal에 쓰기
            { MDC.remove("requestId") }                    // ThreadLocal에서 제거
        )
    }
}
```

### 구현 4: logback 패턴에 requestId 추가

```xml
<!-- logback-spring.xml -->
<configuration>
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] [%X{requestId:-}] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
    </root>
</configuration>
```

`%X{requestId:-}`가 MDC에서 requestId를 읽어서 출력한다. 없으면 빈 문자열.

### 로그 출력 예시

```
10:30:01.123 [reactor-http-nio-2] [a1b2c3d4] DEBUG FaxController - searchFaxes started
10:30:01.125 [reactor-http-nio-2] [a1b2c3d4] DEBUG FaxRepository - search condition: sendStatus=STANDBY
10:30:01.340 [reactor-http-nio-5] [a1b2c3d4] DEBUG FaxRepository - search result: 3 rows
10:30:01.341 [reactor-http-nio-5] [a1b2c3d4] DEBUG FaxController - searchFaxes completed
```

스레드가 `nio-2` → `nio-5`로 바뀌었지만 requestId `a1b2c3d4`는 유지된다.

### 전체 흐름

```
클라이언트 → WebFilter: requestId 생성 → Reactor Context에 저장
  ↓
Controller (suspend) → 로그 출력 → MDC에 requestId 있음 ✓
  ↓
Service (suspend) → 로그 출력 → MDC에 requestId 있음 ✓
  ↓
Repository → Mono.from(dsl...) → 스레드 반환
  ↓ (다른 스레드에서 재개)
.awaitFirstOrNull() → 로그 출력 → MDC에 requestId 있음 ✓
  ↓
응답 전송
```

### Coroutine Context 자동 브릿지

`Hooks.enableAutomaticContextPropagation()` 활성화 시,
`kotlinx-coroutines-reactor`가 Reactor Context를 Coroutine Context로 자동 전파한다. 별도 설정 불필요.

```kotlin
// suspend 함수 안에서 Reactor Context 접근 (필요한 경우)
suspend fun example() {
    val ctx = currentCoroutineContext()[ReactorContext]?.context
    val requestId = ctx?.get<String>("requestId")
}
```

보통은 MDC 자동 전파로 충분하므로 직접 접근할 일은 드물다.

### 의존성

```kotlin
// build.gradle.kts — 이미 포함된 것들
implementation(libs.spring.boot.starter.webflux)          // Reactor
implementation(libs.kotlinx.coroutines.reactor)           // Coroutine ↔ Reactor
implementation(libs.micrometer.registry.prometheus)       // Micrometer (context-propagation 포함)
```

Spring Boot 4.0.2의 Micrometer BOM이 `context-propagation` 모듈을 자동 포함한다.
별도 의존성 추가 불필요.

### MVC vs WebFlux MDC 비교

|              | MVC                      | WebFlux                                                             |
|--------------|--------------------------|---------------------------------------------------------------------|
| MDC 동작       | ThreadLocal — 자동 (설정 없이) | Reactor Context → MDC 브릿지 필요                                        |
| 설정           | 없음                       | `Hooks.enableAutomaticContextPropagation()` + `ThreadLocalAccessor` |
| requestId 주입 | `Filter` (서블릿)           | `WebFilter` (리액티브)                                                  |
| 스레드 전환 시     | 문제없음 (스레드 고정)            | **자동 전파** (Context Propagation)                                     |
| 로그 패턴        | 동일 (`%X{requestId}`)     | 동일                                                                  |

### 왜 중요한가 — 운영에서 로그 추적

requestId 없이 동시에 100명이 요청하면:

```
10:30:01.123 [nio-2] ERROR FaxService - 팩스 발송 실패
10:30:01.124 [nio-3] ERROR FaxService - 팩스 발송 실패
10:30:01.125 [nio-2] ERROR FaxRepository - DB 커넥션 타임아웃
10:30:01.126 [nio-5] INFO  FaxController - 팩스 조회 완료
10:30:01.127 [nio-3] ERROR FaxRepository - DB 커넥션 타임아웃
```

→ **어떤 에러가 어떤 요청인지 구분 불가**

requestId가 있으면:

```
10:30:01.123 [nio-2] [a1b2c3d4] ERROR FaxService - 팩스 발송 실패
10:30:01.124 [nio-3] [f7e8d9c0] ERROR FaxService - 팩스 발송 실패
10:30:01.125 [nio-2] [a1b2c3d4] ERROR FaxRepository - DB 커넥션 타임아웃
10:30:01.126 [nio-5] [x9y8z7w6] INFO  FaxController - 팩스 조회 완료
10:30:01.127 [nio-3] [f7e8d9c0] ERROR FaxRepository - DB 커넥션 타임아웃
```

→ `grep a1b2c3d4`로 **한 요청의 전체 흐름만 뽑아볼 수 있음**

### MVC에서는 스레드 이름으로 추적이 됐다

MVC는 요청 끝날 때까지 스레드가 고정:

```
[Thread-1] Controller 시작
[Thread-1] Service 호출
[Thread-1] Repository DB 조회 (블로킹 — 스레드가 기다림)
[Thread-1] Controller 응답
```

→ `Thread-1`로 grep하면 한 요청 추적 가능. **추적이 공짜.**

### WebFlux에서는 스레드가 바뀌니까 안 된다

WebFlux는 중간에 스레드를 반환하고 다른 스레드에서 재개:

```
[nio-2] Controller 시작
[nio-2] WebClient 호출 → 스레드 반환 (논블로킹이니까 안 기다림)
         ↓ (nio-2는 다른 요청 처리하러 감)
[nio-5] WebClient 응답 도착 → 여기서 재개
[nio-5] Controller 응답
```

→ `nio-2`로 grep하면 **다른 요청 로그도 섞여서 나옴**. 추적 불가.

그래서 스레드가 아니라 **requestId라는 고유 태그**를 붙여서 추적해야 한다.
**MVC는 스레드 = 요청이라 추적이 공짜, WebFlux는 스레드 ≠ 요청이라 직접 만들어야 한다.**

### NIO 스레드 이름의 의미

로그에 나오는 `reactor-http-nio-2`의 의미:

| 부분        | 의미                                         |
|-----------|--------------------------------------------|
| `reactor` | Project Reactor                            |
| `http`    | HTTP 요청 처리                                 |
| `nio`     | **Non-blocking I/O** (Java `java.nio` 패키지) |
| `2`       | 스레드 번호                                     |

MVC의 서블릿 스레드는 `http-nio-8080-exec-1`, WebFlux의 Netty 스레드는 `reactor-http-nio-2`.
둘 다 NIO지만 사용 방식이 다르다:

|         | MVC             | WebFlux                         |
|---------|-----------------|---------------------------------|
| 스레드 수   | 스레드 풀 200개 (기본) | 이벤트 루프 **CPU 코어 수만큼** (보통 4~8개) |
| 요청 처리   | 요청당 1개 스레드 점유   | 전체 요청을 소수 스레드가 돌려가며 처리          |
| DB 조회 중 | 스레드가 블로킹 상태로 대기 | 스레드 반환 → 다른 요청 처리               |

---

## 27. Global Error Handling — @ControllerAdvice

### 현재 문제

FaxController에서 예외가 발생하면 Spring 기본 에러 응답이 나간다:

```json
{
  "timestamp": "2026-02-12T10:30:00",
  "path": "/api/faxes/999",
  "status": 404,
  "error": "Not Found",
  "message": "Fax not found: 999"
}
```

이건 ReactiveApiResponse 형식이 아니다. 정상 응답은 AOP(25장)가 감싸주지만, 에러 응답은 감싸지 않는다.

### 목표: 에러도 ReactiveApiResponse로 통일

```json
{
  "status": 404,
  "code": "FAX_NOT_FOUND",
  "message": "팩스를 찾을 수 없습니다: 999",
  "duration": null,
  "data": null
}
```

### 비즈니스 예외 클래스

```kotlin
open class BusinessException(
    val code: String,
    override val message: String,
    cause: Throwable? = null
) : RuntimeException(message, cause)

class FaxNotFoundException(faxSeq: Long) :
    BusinessException("FAX_NOT_FOUND", "팩스를 찾을 수 없습니다: $faxSeq")

class FaxSendException(message: String, cause: Throwable? = null) :
    BusinessException("FAX_SEND_FAILED", message, cause)
```

### 구현: @ControllerAdvice + @ExceptionHandler

```kotlin
@ControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    // 비즈니스 예외 (400)
    @ExceptionHandler(BusinessException::class)
    suspend fun handleBusiness(ex: BusinessException): ResponseEntity<ReactiveApiResponse<Nothing>> {
        log.warn("BusinessException: [{}] {}", ex.code, ex.message)
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(
                ReactiveApiResponse.error(
                    status = 400,
                    code = ex.code,
                    message = ex.message
                )
            )
    }

    // FaxNotFoundException → 404
    @ExceptionHandler(FaxNotFoundException::class)
    suspend fun handleNotFound(ex: FaxNotFoundException): ResponseEntity<ReactiveApiResponse<Nothing>> {
        log.warn("FaxNotFoundException: {}", ex.message)
        return ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(
                ReactiveApiResponse.error(
                    status = 404,
                    code = ex.code,
                    message = ex.message
                )
            )
    }

    // ResponseStatusException (Spring 기본)
    @ExceptionHandler(ResponseStatusException::class)
    suspend fun handleResponseStatus(ex: ResponseStatusException): ResponseEntity<ReactiveApiResponse<Nothing>> {
        log.warn("ResponseStatusException: {} {}", ex.statusCode, ex.reason)
        return ResponseEntity
            .status(ex.statusCode)
            .body(
                ReactiveApiResponse.error(
                    status = ex.statusCode.value(),
                    code = ex.statusCode.toString(),
                    message = ex.reason ?: "요청 처리 실패"
                )
            )
    }

    // Validation 에러 (요청 바인딩 실패)
    @ExceptionHandler(WebExchangeBindException::class)
    suspend fun handleValidation(ex: WebExchangeBindException): ResponseEntity<ReactiveApiResponse<Nothing>> {
        val errors = ex.fieldErrors.joinToString(", ") { "${it.field}: ${it.defaultMessage}" }
        log.warn("Validation failed: {}", errors)
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(
                ReactiveApiResponse.error(
                    status = 400,
                    code = "VALIDATION_ERROR",
                    message = errors
                )
            )
    }

    // 알 수 없는 예외 (500)
    @ExceptionHandler(Exception::class)
    suspend fun handleGeneral(ex: Exception): ResponseEntity<ReactiveApiResponse<Nothing>> {
        log.error("Unhandled exception", ex)
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(
                ReactiveApiResponse.error(
                    status = 500,
                    code = "INTERNAL_ERROR",
                    message = "서버 내부 오류"
                )
            )
    }
}
```

### Controller 수정

```kotlin
// Before — ResponseStatusException 직접 사용
@GetMapping("/{faxSeq}")
suspend fun getFax(@PathVariable faxSeq: Long): Any {
    return faxService.getFax(faxSeq)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Fax not found: $faxSeq")
}

// After — 비즈니스 예외 사용
@GetMapping("/{faxSeq}")
suspend fun getFax(@PathVariable faxSeq: Long): Any {
    return faxService.getFax(faxSeq)
        ?: throw FaxNotFoundException(faxSeq)
}
```

### AOP(25장)와 @ExceptionHandler의 실행 순서

```
요청 → AOP (@Around) → Controller (suspend) → Service → Repository
                                                  ↓
                                            예외 발생!
                                                  ↓
                     AOP proceed()가 반환한 Mono에서 에러 시그널 발생
                                                  ↓
                     @ExceptionHandler가 에러를 잡아서 ReactiveApiResponse 반환
```

핵심: `@ExceptionHandler`가 에러를 잡으므로 AOP의 `.map()`은 실행되지 않는다.

- **정상 응답**: AOP가 `ReactiveApiResponse.ok(data, duration)`으로 래핑
- **에러 응답**: `@ExceptionHandler`가 `ReactiveApiResponse.error(status, code, message)`로 래핑

둘 다 같은 `ReactiveApiResponse` 형식이므로 클라이언트가 일관된 응답을 받는다.

### Spring Framework 7 + suspend fun

Spring Framework 7에서 `@ExceptionHandler`에 `suspend fun`을 사용할 수 있다.
Spring이 내부적으로 `suspend fun`을 `Mono`로 변환하여 처리한다.

### 응답 형식 비교 — 정상 vs 에러

```json
// 정상 (AOP가 래핑)
{
  "status": 200,
  "code": "OK",
  "message": "성공",
  "duration": 42,
  "data": {
    "faxSeq": 1,
    "sendStatus": "STANDBY"
  }
}

// 비즈니스 에러 (@ExceptionHandler가 래핑)
{
  "status": 404,
  "code": "FAX_NOT_FOUND",
  "message": "팩스를 찾을 수 없습니다: 999",
  "duration": null,
  "data": null
}

// 서버 에러
{
  "status": 500,
  "code": "INTERNAL_ERROR",
  "message": "서버 내부 오류",
  "duration": null,
  "data": null
}
```

### MVC vs WebFlux 에러 처리 비교

|                   | MVC                               | WebFlux                           |
|-------------------|-----------------------------------|-----------------------------------|
| @ControllerAdvice | 동일                                | 동일                                |
| @ExceptionHandler | `fun`                             | `suspend fun` 가능                  |
| 기본 에러 페이지         | `BasicErrorController`            | `DefaultErrorWebExceptionHandler` |
| 필터 레벨 에러          | `ErrorController`로 포워드            | WebFilter 체인에서 직접 처리              |
| Validation 에러     | `MethodArgumentNotValidException` | `WebExchangeBindException`        |

---

## 28. WebClient — 외부 API 호출

### RestTemplate vs WebClient

|            | RestTemplate              | WebClient            |
|------------|---------------------------|----------------------|
| I/O 모델     | 블로킹                       | **논블로킹**             |
| 스레드        | 호출 중 스레드 점유               | 호출 중 스레드 반환          |
| 반환 타입      | `T`                       | `Mono<T>`, `Flux<T>` |
| Coroutine  | 불가 (`withContext(IO)` 필요) | `awaitBody<T>()`     |
| WebFlux 호환 | 이벤트 루프 블로킹 — 위험           | **권장**               |

WebFlux 환경에서 RestTemplate을 쓰면 이벤트 루프가 블로킹된다.
외부 API 호출은 반드시 WebClient를 사용해야 한다.

### Bean 설정 (Timeout 포함)

데모용으로 [JSONPlaceholder](https://jsonplaceholder.typicode.com) (공개 REST 테스트 API) 사용.
실제 운영에서는 팩스 벤더 API URL로 교체.

```kotlin
// config/WebClientConfig.kt
@Configuration
class WebClientConfig {

    @Bean
    fun externalApiWebClient(): WebClient {
        val httpClient = HttpClient.create()
            .responseTimeout(Duration.ofSeconds(10))                // 응답 대기 최대 10초
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)    // 연결 최대 5초

        return WebClient.builder()
            .baseUrl("https://jsonplaceholder.typicode.com")
            .clientConnector(ReactorClientHttpConnector(httpClient))
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build()
    }
}
```

| Timeout                  | 설명           | 기본값 |
|--------------------------|--------------|-----|
| `CONNECT_TIMEOUT_MILLIS` | TCP 연결 수립 대기 | 30초 |
| `responseTimeout`        | 응답 첫 바이트 대기  | 무제한 |
| `readTimeout` (Netty)    | 데이터 수신 간격    | 무제한 |

운영에서는 반드시 timeout을 설정해야 한다. 기본값(무제한)이면 외부 서버 장애 시 커넥션이 무한 대기.

### DTO — JSONPlaceholder 응답 매핑

```kotlin
// client/JsonPlaceholderPost.kt
data class JsonPlaceholderPost(
    val userId: Int? = null,
    val id: Int? = null,
    val title: String? = null,
    val body: String? = null
)

// client/JsonPlaceholderComment.kt
data class JsonPlaceholderComment(
    val postId: Int? = null,
    val id: Int? = null,
    val name: String? = null,
    val email: String? = null,
    val body: String? = null
)
```

JSONPlaceholder API 응답 예시:

```json
// GET /posts/1
{
  "userId": 1,
  "id": 1,
  "title": "sunt aut facere...",
  "body": "quia et suscipit..."
}

// GET /posts/1/comments
[
  {
    "postId": 1,
    "id": 1,
    "name": "id labore...",
    "email": "Eliseo@...",
    "body": "laudantium..."
  },
  ...
]
```

### 기본 사용법 — Coroutine

```kotlin
// client/JsonPlaceholderClient.kt
@Service
class JsonPlaceholderClient(
    private val externalApiWebClient: WebClient
) {

    // GET — 단건 조회 (awaitBody — suspend 함수로 변환)
    suspend fun getPost(postId: Int): JsonPlaceholderPost {
        return externalApiWebClient.get()
            .uri("/posts/{id}", postId)
            .retrieve()
            .awaitBody<JsonPlaceholderPost>()
    }

    // GET — 목록 조회 (Flux → Flow 스트리밍 — 한 건씩 처리)
    fun getComments(postId: Int): Flow<JsonPlaceholderComment> {
        return externalApiWebClient.get()
            .uri("/posts/{postId}/comments", postId)
            .retrieve()
            .bodyToFlux<JsonPlaceholderComment>()
            .asFlow()
    }
}
```

`awaitBody<T>()`는 `kotlinx-coroutines-reactor`가 제공하는 확장 함수로,
`ResponseSpec`의 `Mono<T>`를 suspend 함수로 변환한다.

`bodyToFlux<T>().asFlow()`는 `Flux`를 Kotlin `Flow`로 변환하여 대량 데이터를 한 건씩 스트리밍한다.

### 에러 처리 — onStatus

```kotlin
suspend fun getPost(postId: Int): JsonPlaceholderPost {
    return externalApiWebClient.get()
        .uri("/posts/{id}", postId)
        .retrieve()
        .onStatus(HttpStatusCode::is4xxClientError) { response ->
            response.bodyToMono<String>().map { body ->
                FaxVendorException("Client error: ${response.statusCode()} - $body")
            }
        }
        .onStatus(HttpStatusCode::is5xxServerError) { response ->
            response.bodyToMono<String>().map { body ->
                FaxVendorException("Server error: ${response.statusCode()} - $body")
            }
        }
        .awaitBody<JsonPlaceholderPost>()
}
```

`onStatus`로 HTTP 상태 코드별 에러를 커스텀 예외로 변환한다.
에러 핸들러가 없으면 4xx/5xx에서 `WebClientResponseException`이 발생한다.

### Retry — 지수 백오프

```kotlin
suspend fun createPost(post: JsonPlaceholderPost): JsonPlaceholderPost {
    val requestId = MDC.get("requestId") ?: "unknown"

    return externalApiWebClient.post()
        .uri("/posts")
        .header("X-Request-Id", requestId)      // 외부 서비스에도 requestId 전달
        .bodyValue(post)
        .retrieve()
        .bodyToMono<JsonPlaceholderPost>()
        .retryWhen(
            Retry.backoff(3, Duration.ofSeconds(1))     // 최대 3회, 1초→2초→4초 간격
                .filter { ex ->
                    ex is WebClientResponseException &&
                            ex.statusCode.is5xxServerError       // 5xx만 재시도 (4xx는 안 함)
                }
                .onRetryExhaustedThrow { _, signal ->
                    FaxVendorException(
                        "외부 API 호출 실패: ${signal.totalRetries()}회 재시도 후 포기",
                        signal.failure()
                    )
                }
        )
        .awaitSingle()
}
```

`retryWhen`은 `Mono` 레벨에서 동작하므로, `retrieve()` → `bodyToMono<T>()` → `retryWhen()` → `awaitSingle()` 순서로 체이닝한다. `awaitBody()`는 `ResponseSpec`의 확장 함수라 `retryWhen` 이후에 사용 불가 — 대신 `awaitSingle()` 사용.

| 옵션                     | 설명                          |
|------------------------|-----------------------------|
| `Retry.backoff(3, 1s)` | 최대 3회, 1초→2초→4초 간격 (지수 백오프) |
| `.filter()`            | 재시도 조건 (5xx만, 4xx는 재시도 안 함) |
| `.maxBackoff(10s)`     | 백오프 최대 간격                   |
| `.jitter(0.5)`         | 50% 랜덤 지터 (동시 재시도 방지)       |

### 데모 컨트롤러 — 직접 호출 테스트

```kotlin
// controller/ExternalApiController.kt
@RestController
@RequestMapping(value = ["/api/external"], produces = [MediaType.APPLICATION_JSON_VALUE])
class ExternalApiController(
    private val jsonPlaceholderClient: JsonPlaceholderClient
) {

    /** 단건 조회 — WebClient GET + awaitBody */
    @GetMapping("/posts/{postId}")
    suspend fun getPost(@PathVariable postId: Int): Any {
        return jsonPlaceholderClient.getPost(postId)
    }

    /** 댓글 목록 스트리밍 — WebClient GET + bodyToFlux → Flow (SSE) */
    @GetMapping("/posts/{postId}/comments", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun getComments(@PathVariable postId: Int): Flow<JsonPlaceholderComment> {
        return jsonPlaceholderClient.getComments(postId)
    }

    /** 생성 — WebClient POST + retryWhen 지수 백오프 */
    @PostMapping("/posts", consumes = [MediaType.APPLICATION_JSON_VALUE])
    suspend fun createPost(@RequestBody post: JsonPlaceholderPost): Any {
        return jsonPlaceholderClient.createPost(post)
    }
}
```

curl로 직접 테스트:

```bash
# 단건 조회
curl http://localhost:43010/api/external/posts/1

# 댓글 스트리밍 (SSE)
curl http://localhost:43010/api/external/posts/1/comments

# 생성 (POST + retry)
curl -X POST http://localhost:43010/api/external/posts \
     -H "Content-Type: application/json" \
     -d '{"userId":1,"title":"test","body":"hello"}'
```

응답 예시 (AOP가 ReactiveApiResponse로 래핑):

```json
// GET /api/external/posts/1
{
  "status": 200,
  "code": "OK",
  "message": "성공",
  "duration": 142,
  "data": {
    "userId": 1,
    "id": 1,
    "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
    "body": "quia et suscipit\nsuscipit recusandae consequuntur..."
  }
}
```

### 로그와 requestId 전파

WebClient는 Reactor Context를 자동 전파한다.
26장에서 설정한 requestId가 외부 API 호출 중에도 MDC에 유지된다.

`createPost()`에서 MDC의 requestId를 읽어 `X-Request-Id` 헤더로 외부 서비스에도 전달한다:

```
클라이언트 → fax-reactive [requestId=a1b2c3d4]
               → WebClient → JSONPlaceholder [X-Request-Id: a1b2c3d4]
                              → 외부 서비스 로그에서도 같은 ID로 추적 가능
```

### RestTemplate에서 마이그레이션

```kotlin
// Before (RestTemplate — 블로킹)
val response = restTemplate.getForObject(
    "/posts/{id}", JsonPlaceholderPost::class.java, id
)

// After (WebClient + Coroutine — 논블로킹)
val response = webClient.get()
    .uri("/posts/{id}", id)
    .retrieve()
    .awaitBody<JsonPlaceholderPost>()
```

코드 구조는 비슷하지만, WebClient는 논블로킹이므로 이벤트 루프를 차단하지 않는다.

### 테스트 — MockWebServer

운영 코드에서 실제 외부 API를 호출하면 테스트가 불안정해진다.
MockWebServer로 외부 API를 가짜로 띄워서 테스트한다.

```kotlin
class JsonPlaceholderClientTests {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var client: JsonPlaceholderClient

    @BeforeEach
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        val webClient = WebClient.builder()
            .baseUrl(mockWebServer.url("/").toString())
            .build()
        client = JsonPlaceholderClient(webClient)
    }

    @AfterEach
    fun tearDown() {
        mockWebServer.shutdown()
    }

    @Test
    fun `게시글 조회 성공`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setBody("""{"userId":1,"id":1,"title":"test","body":"hello"}""")
                .setHeader("Content-Type", "application/json")
        )

        val result = client.getPost(1)
        assertEquals("test", result.title)
    }

    @Test
    fun `5xx 에러 시 예외 발생`() = runTest {
        mockWebServer.enqueue(
            MockResponse().setResponseCode(500).setBody("Internal Error")
        )

        assertThrows<FaxVendorException> {
            client.getPost(1)
        }
    }

    @Test
    fun `timeout 시 예외 발생`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setBody("""{"id":1,"title":"test"}""")
                .setHeadersDelay(15, TimeUnit.SECONDS)     // 15초 지연 (timeout 10초 초과)
        )

        assertThrows<WebClientRequestException> {
            client.getPost(1)
        }
    }
}
```

의존성:

```kotlin
// build.gradle.kts
testImplementation("com.squareup.okhttp3:mockwebserver")
```

### 비교표 — 외부 API 호출 방식

| 방식                     | I/O     | WebFlux 호환    | Coroutine            | 용도                       |
|------------------------|---------|---------------|----------------------|--------------------------|
| **WebClient**          | 논블로킹    | O             | `awaitBody()`        | **WebFlux 표준**           |
| RestTemplate           | 블로킹     | X (이벤트 루프 차단) | `withContext(IO)` 필요 | MVC 전용                   |
| RestClient (Boot 3.2+) | 블로킹     | X             | `withContext(IO)` 필요 | MVC 권장 (RestTemplate 대체) |
| HttpClient (Java 11+)  | 블로킹/비동기 | 부분적           | `withContext(IO)` 필요 | 저수준 제어                   |

WebFlux에서는 **WebClient가 유일한 정답**이다.

---

## FIXME: commons-util로 공통 모듈 추출

리액티브 모듈이 2개 이상 생기면, 아래 config들을 `commons-util/r2dbc-util`로 추출할 것.

### 추출 대상

| 현재 위치 (fax-reactive)    | 추출 후 (commons-util/r2dbc-util) | 역할                                                      |
|-------------------------|--------------------------------|---------------------------------------------------------|
| `DatabaseInitConfig.kt` | `R2dbcInitializerUtil.kt`      | DB 자동 생성 + ApplicationR2dbcScriptDatabaseInitializer 유틸 |
| `JooqConfig.kt`         | `JooqUtil.kt`                  | DSLContext 생성 유틸                                        |
| `SecurityConfig.kt`     | `ReactiveSecurityUtil.kt`      | WebFlux SecurityFilterChain 생성 유틸                       |

### 추출 후 각 모듈에서의 사용 예시

```kotlin
// fax-reactive/config/FaxReactiveConfig.kt
@Configuration
class FaxReactiveConfig {
    @Bean
    fun dslContext(cf: ConnectionFactory) = JooqUtil.createDslContext(cf)

    @Bean
    fun dbInitializer(cf: ConnectionFactory) = R2dbcInitializerUtil.createInitializer(cf, "fax")
}

// downtime-reactive/config/DowntimeReactiveConfig.kt
@Configuration
class DowntimeReactiveConfig {
    @Bean
    fun dslContext(cf: ConnectionFactory) = JooqUtil.createDslContext(cf)

    @Bean
    fun dbInitializer(cf: ConnectionFactory) = R2dbcInitializerUtil.createInitializer(cf, "downtime")
}
```

### 참고: 기존 JDBC 패턴과 동일한 구조

```
commons-util/
├── datasource-util/  ← DatabaseInitializerUtil, DataSourceInitializerUtil (JDBC용, 기존)
├── mybatis-util/     ← MybatisSessionUtil (JDBC용, 기존)
├── r2dbc-util/       ← R2dbcInitializerUtil, JooqUtil, ReactiveSecurityUtil (R2DBC용, 신규)
└── oauth2-util/      ← OAuth2Util (공통, JWT 키 등)
```

---
