---
layout: post
title: Java 21 Virtual Threads - Spring Boot에서 가상 스레드 적용 가이드
tags: [ java, spring, virtual-threads ]
---

## Virtual Threads란?

Java 21에서 정식 도입된 Virtual Threads(가상 스레드)는 경량 스레드로, 기존 플랫폼 스레드의 한계를 극복하기 위해 설계되었습니다.

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

이 한 줄 설정만으로 Spring Boot 애플리케이션에 가상 스레드를 적용할 수 있습니다.

---

## 기존 플랫폼 스레드 vs 가상 스레드

```
┌─────────────────────────────────────────────────────────────┐
│                    기존 플랫폼 스레드                          │
├─────────────────────────────────────────────────────────────┤
│  요청 1 ──▶ [스레드 1] ──▶ DB 대기 (블로킹) ──▶ 응답          │
│  요청 2 ──▶ [스레드 2] ──▶ API 대기 (블로킹) ──▶ 응답         │
│  요청 3 ──▶ [스레드 3] ──▶ 파일 대기 (블로킹) ──▶ 응답        │
│  요청 4 ──▶ 스레드 없음 ❌ (스레드풀 고갈)                     │
│                                                             │
│  스레드 1개 = 약 1MB 메모리                                   │
│  200개 스레드 = 200MB 메모리                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      가상 스레드                              │
├─────────────────────────────────────────────────────────────┤
│  요청 1 ──▶ [가상스레드] ──▶ DB 대기 (자동 양보) ──▶ 응답     │
│  요청 2 ──▶ [가상스레드] ──▶ API 대기 (자동 양보) ──▶ 응답    │
│  요청 3 ──▶ [가상스레드] ──▶ 파일 대기 (자동 양보) ──▶ 응답   │
│  요청 4 ──▶ [가상스레드] ──▶ 바로 처리 ✅                     │
│                                                             │
│  가상 스레드 1개 = 약 1KB 메모리                              │
│  100,000개 가상 스레드 = 100MB 메모리                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 메모리 효율성 비교

| 항목           | 플랫폼 스레드    | 가상 스레드      |
|--------------|------------|-------------|
| 스레드당 메모리     | ~1MB       | ~1KB        |
| 10,000 동시 요청 | 10GB 필요    | 10MB 필요     |
| 생성 비용        | 높음 (OS 호출) | 낮음 (JVM 내부) |

---

## 가상 스레드가 효과적인 상황

### 1. 블로킹 I/O가 많은 경우

```kotlin
// DB 쿼리
fun getUser(id: Long): User {
    return userRepository.findById(id)  // DB 응답 대기 시간 활용
}

// 외부 API 호출
fun callExternalApi(): Response {
    return webClient.get().retrieve()   // API 응답 대기 시간 활용
}

// 파일 I/O
fun readFile(path: String): ByteArray {
    return Files.readAllBytes(path)     // 파일 읽기 대기 시간 활용
}
```

### 2. 다중 데이터소스 접근

```
┌─────────────────────────────────────────────────────────────┐
│  다중 DB 접근 시나리오                                        │
├─────────────────────────────────────────────────────────────┤
│  • Primary DB (PostgreSQL)                                  │
│  • Secondary DB (MySQL)                                     │
│  • External DB (SQL Server)                                 │
├─────────────────────────────────────────────────────────────┤
│  가상 스레드 효과: 각 DB 응답 대기 시간 활용                   │
└─────────────────────────────────────────────────────────────┘
```

### 3. 웹 API 서버

```
┌─────────────────────────────────────────────────────────────┐
│  API 요청 처리                                               │
├─────────────────────────────────────────────────────────────┤
│  기존: 동시 200명 → 201번째 대기                              │
│  가상: 동시 10,000명 이상 처리 가능                           │
├─────────────────────────────────────────────────────────────┤
│  DB 쿼리 중:                                                 │
│  기존: 스레드 점유 (낭비)                                     │
│  가상: 자동 양보 → 다른 요청 처리                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 주의사항 및 잠재적 문제

### 1. Pinning 문제 (synchronized 블록)

```java
// 이런 코드가 있으면 가상 스레드 장점 사라짐
synchronized(lock){
	// I/O 작업 (DB, 파일)
	jdbcTemplate.

query(...)  // ❌ 캐리어 스레드 블로킹!
}
```

가상 스레드가 `synchronized` 안에서 블로킹되면 **캐리어 스레드까지 블로킹**됩니다. 이를 Pinning이라고 합니다.

**해결 방법**: `synchronized` 대신 `ReentrantLock` 사용

```java
private final ReentrantLock lock = new ReentrantLock();

lock.

lock();
try{
	jdbcTemplate.

query(...)  // ✅ 가상 스레드 양보 가능
}finally{
	lock.

unlock();
}
```

### 2. Connection Pool 고갈

```
┌─────────────────────────────────────────────────────────────┐
│  문제 시나리오                                               │
├─────────────────────────────────────────────────────────────┤
│  가상 스레드: 10,000개 동시 생성 가능                         │
│  HikariCP: maximum-pool-size = 10                           │
│                                                             │
│  → 9,990개 가상 스레드가 커넥션 대기                          │
│  → 오히려 성능 저하 또는 타임아웃                             │
└─────────────────────────────────────────────────────────────┘
```

**해결 방법**: Semaphore로 동시 접근 제한

```java
private final Semaphore semaphore = new Semaphore(50);

public void process() {
	semaphore.acquire();
	try {
		// DB 작업
	} finally {
		semaphore.release();
	}
}
```

### 3. ThreadLocal 주의

가상 스레드는 수가 많아질 수 있어 ThreadLocal 메모리 사용량이 증가할 수 있습니다.

```java
// 주의: 가상 스레드마다 ThreadLocal 인스턴스 생성
private static final ThreadLocal<ExpensiveObject> cache =
	ThreadLocal.withInitial(ExpensiveObject::new);
```

---

## 데이터 정합성 문제?

**가상 스레드 자체는 데이터 정합성을 깨뜨리지 않습니다.**

```kotlin
// 트랜잭션은 동일하게 동작
@Transactional
fun process() {
    // 플랫폼 스레드든 가상 스레드든 동일하게 트랜잭션 관리됨
    repository.save(entity)
}
```

하지만 **간접적인 문제**가 발생할 수 있습니다:

| 상황       | 문제                   |
|----------|----------------------|
| 커넥션 풀 고갈 | 트랜잭션 타임아웃 → 롤백       |
| 타임아웃 증가  | 락 대기 시간 증가 → 데드락 가능성 |
| 동시성 증가   | 기존에 없던 경쟁 상태 노출      |

---

## Spring Batch에서의 효과

### 단일 스레드 배치 (기본)

```
┌─────────────────────────────────────────────────────────────┐
│  Spring Batch 기본 동작                                      │
├─────────────────────────────────────────────────────────────┤
│  Step은 기본적으로 "단일 스레드"로 실행                        │
│                                                             │
│  [Reader] → [Processor] → [Writer]                          │
│     ↓           ↓            ↓                              │
│   순차 실행   순차 실행    순차 실행                           │
│                                                             │
│  가상 스레드 효과: I/O 대기 시간만 활용 가능                   │
│  (병렬 처리 효과 X)                                          │
└─────────────────────────────────────────────────────────────┘
```

**단일 스레드 배치에서는 효과가 제한적입니다.**

### 멀티스레드 배치로 효과 극대화

```java

@Bean
public Step step() {
	return stepBuilder.get("step")
		.<Item, Item>chunk(100)
		.reader(reader)
		.processor(processor)
		.writer(writer)
		.taskExecutor(taskExecutor())  // 멀티스레드 실행
		.build();
}

@Bean
public TaskExecutor taskExecutor() {
	SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor();
	executor.setVirtualThreads(true);   // 가상 스레드 사용
	executor.setConcurrencyLimit(10);   // 동시 실행 제한
	return executor;
}
```

---

## 적용 시나리오별 효과

| 시나리오            | 가상 스레드 효과 | 비고                |
|-----------------|-----------|-------------------|
| **웹 API 서버**    | ⭐⭐⭐ 매우 높음 | 동시 요청 처리 능력 향상    |
| **스케줄러**        | ⭐⭐ 높음     | Job 간 동시 실행 시 효과  |
| **배치 (단일 스레드)** | ⭐ 낮음      | 순차 실행이라 효과 제한적    |
| **배치 (멀티 스레드)** | ⭐⭐⭐ 매우 높음 | 병렬 처리 + I/O 대기 활용 |

---

## 적용 전 체크리스트

가상 스레드를 적용하기 전에 확인해야 할 항목:

| 항목              | 확인 방법                  | 위험도 |
|-----------------|------------------------|-----|
| synchronized 블록 | 코드에서 `synchronized` 검색 | 높음  |
| ThreadLocal 사용  | `ThreadLocal` 검색       | 중간  |
| 커넥션 풀 크기        | HikariCP 설정 확인         | 중간  |
| 레거시 라이브러리       | 라이브러리 호환성 확인           | 낮음  |

```bash
# synchronized 사용 여부 확인
grep -r "synchronized" src/

# ThreadLocal 사용 여부 확인
grep -r "ThreadLocal" src/
```

---

## Spring Boot 설정

### 기본 설정

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

### Graceful Shutdown과 함께 사용 (권장)

```yaml
spring:
  threads:
    virtual:
      enabled: true
  lifecycle:
    timeout-per-shutdown-phase: 30s

server:
  shutdown: graceful
```

---

## FAQ

### Q: 가상 스레드는 무조건 켜는 게 좋나요?

**A: 아니요.** 상황에 따라 다릅니다.

| 상황                   | 권장                  |
|----------------------|---------------------|
| I/O 중심 (DB, API, 파일) | ✅ 켜기                |
| CPU 중심 (계산, 이미지 처리)  | ❌ 효과 없음             |
| synchronized 많이 사용   | ⚠️ Pinning 문제 확인 필요 |
| 레거시 라이브러리 사용         | ⚠️ 호환성 확인 필요        |

### Q: WebFlux와 가상 스레드 중 뭘 써야 하나요?

| 항목           | Virtual Threads | WebFlux         |
|--------------|-----------------|-----------------|
| 코드 스타일       | 동기 (기존 코드 유지)   | 비동기 (Mono/Flux) |
| 학습 곡선        | 낮음              | 높음              |
| 기존 코드 마이그레이션 | 쉬움              | 어려움             |
| 성능           | 높음              | 매우 높음           |

**결론**: 기존 동기 코드가 많다면 Virtual Threads, 새 프로젝트라면 WebFlux도 고려

### Q: 배치에서 효과가 있나요?

**A: 단일 스레드 배치에서는 효과가 제한적입니다.**

- 멀티스레드 배치로 변경하면 효과 증가
- TaskExecutor에 가상 스레드 적용 가능

---

## 참고

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [Spring Boot Virtual Threads Support](https://spring.io/blog/2023/09/09/all-together-now-spring-boot-3-2-graalvm-native-images-java-21-and-virtual)
- [Virtual Threads: New Foundations for High-Scale Java Applications](https://www.youtube.com/watch?v=5E0LU85EnTI)
