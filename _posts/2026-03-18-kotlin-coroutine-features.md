---
layout: post
title: Kotlin Coroutine 7가지 핵심 기능 정리
tags: [ kotlin ]
---

Kotlin Coroutine은 단순히 `suspend` 하나가 아니다.
비동기 프로그래밍을 위한 **7가지 핵심 기능**을 제공하며, 각각의 역할과 사용 시점이 다르다.
이 글에서는 각 기능을 실제 코드와 함께 정리한다.

> 기본적인 Reactive/Coroutine 개념은 [Spring Reactive Programming - 기초부터 실전 마이그레이션까지](/2026/02/spring-webflux-coroutine-jooq-migration) 참고

---

## 1. suspend — 중단 가능한 함수

코루틴의 가장 기본 단위. 함수 실행 중 **일시 중단(suspend)**했다가 결과가 준비되면 **재개(resume)**할 수 있다.

```kotlin
// suspend 함수 — DB 응답 대기 중 스레드를 반납
suspend fun findBySeq(downtimeSeq: Int): Downtime? {
    return Mono.from(
        dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.DOWNTIME_SEQ.eq(downtimeSeq))
    ).awaitSingleOrNull()?.let { mapToDowntime(it) }
}
```

### 핵심 원리

```
일반 함수:  [시작] ──────────────────────────────── [끝]
            스레드가 끝까지 점유

suspend 함수: [시작] ── [중단 → 스레드 반납] ── [재개] ── [끝]
              DB 대기 중 다른 요청 처리 가능
```

### 규칙

- `suspend` 함수는 **코루틴 안** 또는 **다른 suspend 함수**에서만 호출 가능
- 일반 함수에서 직접 호출하면 컴파일 에러

```kotlin
// ❌ 컴파일 에러
fun main() {
    findBySeq(1)  // suspend 함수를 일반 함수에서 호출 불가
}

// ✅ 코루틴 스코프 안에서 호출
runBlocking {
    findBySeq(1)
}
```

### 내부 동작 — CPS (Continuation Passing Style)

컴파일러가 suspend 함수를 콜백 기반 코드로 변환한다. 개발자는 동기 코드처럼 작성하지만, 실제로는 상태 머신으로 동작한다.

```kotlin
// 개발자가 작성한 코드
suspend fun process() {
    val a = stepA()  // 중단점 1
    val b = stepB(a) // 중단점 2
    return a + b
}

// 컴파일러가 변환한 코드 (개념적)
fun process(continuation: Continuation<Int>) {
    when (continuation.label) {
        0 -> { continuation.label = 1; stepA(continuation) }
        1 -> { continuation.label = 2; val a = continuation.result; stepB(a, continuation) }
        2 -> { val b = continuation.result; continuation.resume(a + b) }
    }
}
```

---

## 2. Flow — 비동기 스트림

`Flux`의 코루틴 버전. **여러 값을 비동기로 순차 발행**한다.

```kotlin
// Flux → Flow 변환 (현재 프로젝트)
fun findActive(serviceType: String, baseDt: LocalDateTime): Flow<Downtime> {
    return Flux.from(
        dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.SERVICE_TYPE.eq(serviceType))
            .and(DOWNTIMES.START_DT.le(baseDt))
            .and(DOWNTIMES.END_DT.ge(baseDt))
            .and(DOWNTIMES.IS_DELETED.eq(false))
    ).asFlow().map { mapToDowntime(it) }
}
```

### Flow 직접 만들기

```kotlin
// flow 빌더로 생성
fun countDown(): Flow<Int> = flow {
    for (i in 3 downTo 1) {
        delay(1000)
        emit(i)  // 값 발행
    }
}

// 소비
countDown().collect { value ->
    println(value)  // 1초 간격으로 3, 2, 1 출력
}
```

### Flow 연산자

```kotlin
flowOf(1, 2, 3, 4, 5)
    .filter { it % 2 == 0 }     // 짝수만
    .map { it * 10 }             // 10 곱하기
    .take(2)                     // 2개만
    .collect { println(it) }     // 20, 40
```

### Flow vs Flux

| | Flow (Kotlin) | Flux (Reactor) |
|--|---|---|
| 소속 | kotlinx.coroutines | Project Reactor |
| 타입 | Cold (항상) | Cold (기본), Hot 가능 |
| 소비 | `collect { }` | `.subscribe()` |
| 배압 | suspend로 자연 지원 | `request(n)` 명시 |
| 에러 처리 | `catch { }` | `onErrorResume()` |

### 왜 Flow를 쓰는가

```kotlin
// Flux 체이닝 — 복잡해지면 읽기 어려움
fun processAll(): Flux<Result> {
    return faxRepository.findAll()
        .filter { it.status == "PENDING" }
        .flatMap { fax ->
            processOne(fax)
                .onErrorResume { Mono.empty() }
        }
}

// Flow — 동기 코드처럼 읽힘
suspend fun processAll(): List<Result> {
    return faxRepository.findAll().asFlow()
        .filter { it.status == "PENDING" }
        .map { fax ->
            try { processOne(fax) }
            catch (e: Exception) { null }
        }
        .filterNotNull()
        .toList()
}
```

---

## 3. runBlocking — 코루틴을 블로킹으로 실행

**현재 스레드를 블로킹하면서** 코루틴을 실행한다. 일반 함수와 코루틴 세계를 연결하는 브릿지.

```kotlin
// 테스트에서 사용 (현재 프로젝트)
@Test
fun `insert - 정상 생성`(): Unit = runBlocking {
    val session = createSession()
    val dto = DowntimeInsertDto(
        serviceType = DowntimeServiceType.FAX,
        targetType = DowntimeTargetType.FAX_HANAFAX,
        startDt = LocalDateTime.now().plusHours(1),
        endDt = LocalDateTime.now().plusHours(2)
    )

    val result = downtimeService.insert(dto, session)

    assertThat(result.downtimeSeq).isNotNull()
}
```

### 동작 원리

```
runBlocking {
    val a = suspendFuncA()  // 중단 → 현재 스레드가 기다림
    val b = suspendFuncB()  // 중단 → 현재 스레드가 기다림
}
// 여기서 스레드 재개
```

### 사용처

| 용도 | 설명 |
|------|------|
| `main()` 함수 | 최상위 진입점에서 코루틴 시작 |
| 테스트 | suspend 함수를 JUnit에서 호출 |
| 레거시 연동 | 코루틴 미지원 프레임워크와 연결 |

### 주의

```kotlin
// ❌ 절대 금지 — WebFlux 이벤트 루프에서 runBlocking 사용
@GetMapping("/faxes")
fun getFaxes(): List<Fax> = runBlocking {
    faxService.findAll()  // 이벤트 루프 스레드를 블로킹 → 성능 붕괴
}

// ✅ WebFlux에서는 suspend fun 사용
@GetMapping("/faxes")
suspend fun getFaxes(): List<Fax> {
    return faxService.findAll()
}
```

**프로덕션 코드에서는 거의 사용하지 않는다.** 주로 테스트와 main 함수에서만 사용한다.

---

## 4. async / await — 동시 실행

여러 비동기 작업을 **동시에 실행**하고 결과를 합칠 때 사용한다.

### 순차 실행 vs 동시 실행

```kotlin
// 순차 실행 — 총 2초
suspend fun loadPage(): PageData {
    val user = getUser()         // 1초
    val orders = getOrders()     // 1초
    return PageData(user, orders)
}

// 동시 실행 — 총 1초
suspend fun loadPage(): PageData = coroutineScope {
    val user = async { getUser() }       // 동시 시작
    val orders = async { getOrders() }   // 동시 시작
    PageData(user.await(), orders.await()) // 둘 다 끝나면 합치기
}
```

### 시간 비교

```
순차 실행:
getUser()   ████████ 1초
                     getOrders() ████████ 1초
총 시간: ─────────────────────────────── 2초

동시 실행 (async):
getUser()   ████████ 1초
getOrders() ████████ 1초
총 시간: ──────────── 1초
```

### async의 반환 타입 — Deferred

```kotlin
coroutineScope {
    val deferred: Deferred<User> = async { getUser() }  // 바로 반환 (실행 시작)

    // 다른 작업 가능
    println("다른 작업 중...")

    val user: User = deferred.await()  // 결과가 필요한 시점에 대기
}
```

### 실전 예제 — 대시보드 API

```kotlin
@GetMapping("/dashboard")
suspend fun dashboard(): DashboardResponse = coroutineScope {
    // 3개 API를 동시에 호출
    val downtimes = async { downtimeService.findActive() }
    val stats = async { statsService.getToday() }
    val alerts = async { alertService.getUnread() }

    DashboardResponse(
        downtimes = downtimes.await(),
        stats = stats.await(),
        alerts = alerts.await()
    )
    // 가장 느린 API 시간 = 총 응답 시간
}
```

### async vs launch 차이

```kotlin
coroutineScope {
    // async — 결과를 반환
    val result: Deferred<Int> = async { calculate() }
    println(result.await())  // 42

    // launch — 결과 없이 실행만 (fire-and-forget)
    launch { sendNotification() }  // Job 반환
}
```

---

## 5. launch — 백그라운드 작업 실행

결과를 기다리지 않고 **백그라운드에서 실행**한다. "보내고 잊기(fire-and-forget)" 패턴.

```kotlin
// 알림 전송 — 결과를 기다릴 필요 없음
suspend fun insert(dto: DowntimeInsertDto, session: Session): Downtime = coroutineScope {
    val downtime = Downtime.from(dto, session)
    downtimeRepository.insert(downtime)

    // 백그라운드로 알림 전송 (메인 응답에 영향 없음)
    launch {
        notificationService.notify("다운타임 등록: ${downtime.serviceType}")
    }

    downtime  // 알림 완료를 기다리지 않고 바로 반환
}
```

### launch의 반환 타입 — Job

```kotlin
val job: Job = launch {
    repeat(100) { i ->
        println("작업 중... $i")
        delay(100)
    }
}

// Job 제어
job.isActive    // 실행 중인지 확인
job.cancel()    // 취소
job.join()      // 완료될 때까지 대기 (필요한 경우)
```

### 실전 예제 — 여러 백그라운드 작업

```kotlin
suspend fun afterInsert(downtime: Downtime) = coroutineScope {
    // 3개 작업을 동시에 백그라운드 실행
    launch { logService.save(Log.from(downtime)) }        // 로그 저장
    launch { cacheService.invalidate(downtime.serviceType) } // 캐시 무효화
    launch { notificationService.notify(downtime) }        // 알림 전송
    // coroutineScope 블록이 끝나면 3개 모두 완료 보장
}
```

### async vs launch 정리

| | async | launch |
|--|---|---|
| 반환 | `Deferred<T>` (결과 있음) | `Job` (결과 없음) |
| 결과 수신 | `.await()` | 없음 |
| 용도 | 결과가 필요한 동시 작업 | fire-and-forget |
| 예시 | 여러 API 호출 후 합치기 | 알림, 로그, 캐시 갱신 |

---

## 6. Channel — 코루틴 간 데이터 통신

코루틴끼리 **데이터를 주고받는 파이프**. `BlockingQueue`의 코루틴 버전이다.

```kotlin
val channel = Channel<Int>()

// 생산자 코루틴
launch {
    for (i in 1..5) {
        channel.send(i)      // 보내기 (수신자가 받을 때까지 중단)
        println("전송: $i")
    }
    channel.close()           // 더 이상 보낼 데이터 없음
}

// 소비자 코루틴
launch {
    for (value in channel) {  // close될 때까지 반복 수신
        println("수신: $value")
    }
}
```

### 채널 용량 (버퍼)

```kotlin
// 버퍼 없음 — send와 receive가 만날 때까지 대기 (기본)
val rendezvous = Channel<Int>()

// 버퍼 있음 — 버퍼가 가득 찰 때까지 send 가능
val buffered = Channel<Int>(capacity = 10)

// 무제한 — send가 절대 중단되지 않음 (메모리 주의)
val unlimited = Channel<Int>(capacity = Channel.UNLIMITED)
```

### 실전 예제 — 생산자/소비자 패턴

```kotlin
suspend fun processInBatches(items: List<Item>) = coroutineScope {
    val channel = Channel<Item>(capacity = 100)

    // 생산자 1개
    launch {
        items.forEach { channel.send(it) }
        channel.close()
    }

    // 소비자 3개 (동시 처리)
    repeat(3) { workerId ->
        launch {
            for (item in channel) {
                println("Worker $workerId 처리: ${item.id}")
                processItem(item)
            }
        }
    }
}
```

```
Channel (용량 100)
                  ┌─→ Worker 0: [Item1] [Item4] [Item7] ...
생산자 ──→ [||||] ├─→ Worker 1: [Item2] [Item5] [Item8] ...
                  └─→ Worker 2: [Item3] [Item6] [Item9] ...
```

### Channel vs Flow

| | Channel | Flow |
|--|---|---|
| 성격 | Hot (보내면 바로 흐름) | Cold (collect 해야 시작) |
| 소비자 | 여러 코루틴이 나눠 받음 | 각 collector가 독립 수신 |
| 용도 | 코루틴 간 통신, 작업 분배 | 데이터 스트림 변환/처리 |

---

## 7. CoroutineScope — 코루틴 생명주기 관리

코루틴의 **범위(scope)**를 정의한다. 스코프가 취소되면 그 안의 모든 코루틴이 취소된다.

### 구조화된 동시성 (Structured Concurrency)

```kotlin
suspend fun loadPage() = coroutineScope {
    val user = async { getUser() }       // 자식 코루틴 1
    val orders = async { getOrders() }   // 자식 코루틴 2

    // getOrders()에서 예외 발생 시 → getUser()도 자동 취소
    PageData(user.await(), orders.await())
}
```

```
coroutineScope
├── async { getUser() }     ← 부모가 취소되면 같이 취소
└── async { getOrders() }   ← 여기서 예외 → 부모와 형제 모두 취소
```

### coroutineScope vs supervisorScope

```kotlin
// coroutineScope — 자식 하나 실패 → 전체 취소
suspend fun allOrNothing() = coroutineScope {
    launch { taskA() }  // taskB 실패 시 → taskA도 취소
    launch { taskB() }  // 예외 발생!
}

// supervisorScope — 자식 하나 실패해도 나머지 계속 실행
suspend fun bestEffort() = supervisorScope {
    launch { taskA() }  // taskB 실패해도 계속 실행
    launch { taskB() }  // 예외 발생! (taskA에 영향 없음)
}
```

| | coroutineScope | supervisorScope |
|--|---|---|
| 자식 실패 시 | 형제 코루틴 전체 취소 | 실패한 것만 취소 |
| 용도 | 모두 성공해야 의미 있는 작업 | 독립적인 작업들 |
| 예시 | 결제 = 재고 차감 + 카드 승인 | 알림 전송 = 이메일 + SMS + 푸시 |

### Spring에서의 CoroutineScope

Spring WebFlux에서는 각 요청마다 코루틴 스코프가 자동 생성된다.

```kotlin
// Spring이 요청마다 자동으로 코루틴 스코프를 만들어준다
@GetMapping("/downtimes")
suspend fun findAll(): List<Downtime> {  // ← 이 suspend가 스코프의 시작점
    return downtimeService.findAll()
}
```

### 커스텀 CoroutineScope — 애플리케이션 레벨 백그라운드 작업

```kotlin
@Component
class BackgroundProcessor : CoroutineScope {

    // 이 스코프의 생명주기 = 애플리케이션 생명주기
    override val coroutineContext = SupervisorJob() + Dispatchers.Default

    fun startPeriodicCleanup() {
        launch {
            while (isActive) {
                cleanup()
                delay(60_000)  // 1분마다 실행
            }
        }
    }

    @PreDestroy
    fun shutdown() {
        cancel()  // 애플리케이션 종료 시 모든 코루틴 취소
    }
}
```

---

## 전체 비교표

| 기능 | 한줄 요약 | 반환 타입 | 핵심 키워드 |
|------|----------|----------|-----------|
| `suspend` | 중단 가능한 함수 | `T` | 중단/재개 |
| `Flow` | 비동기 스트림 | `Flow<T>` | 여러 값 순차 발행 |
| `runBlocking` | 코루틴을 블로킹 실행 | `T` | 테스트, main |
| `async/await` | 동시 실행 후 결과 합침 | `Deferred<T>` | 병렬 처리 |
| `launch` | 백그라운드 실행 | `Job` | fire-and-forget |
| `Channel` | 코루틴 간 통신 | `Channel<T>` | 생산자/소비자 |
| `CoroutineScope` | 생명주기 관리 | - | 구조화된 동시성 |

## 이 프로젝트(downtime)에서 사용 중인 기능

| 기능 | 사용 위치 | 이유 |
|------|----------|------|
| `suspend` | Controller, Service, Repository | jOOQ R2DBC 결과를 동기처럼 처리 |
| `Flow` | findActive(), search() | 다건 조회 스트림 반환 |
| `runBlocking` | 테스트 코드 | JUnit에서 suspend 함수 호출 |

나머지 `async`, `launch`, `Channel`, `CoroutineScope`는 현재 프로젝트 규모에서 필요하지 않아 사용하지 않는다.
로직이 복잡해지고 동시 처리나 백그라운드 작업이 필요해지면 도입하게 된다.
