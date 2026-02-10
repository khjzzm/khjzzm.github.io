---
layout: post
title: Spring 데이터 접근 계층 비교 - JPA, jOOQ, R2DBC, WebFlux, Coroutine 조합 가이드
tags: [ spring, jpa, jooq, r2dbc, webflux, kotlin, coroutine ]
---

Spring 애플리케이션에서 DB에 접근하는 방식은 여러 가지다.
JPA, jOOQ, R2DBC는 각각 다른 문제를 풀고 있으며, WebFlux와의 조합에 따라 아키텍처가 완전히 달라진다.

---

## 전체 아키텍처

```
클라이언트 요청
    │
    ▼
┌──────────────────────┐
│  Web Layer           │  Spring MVC (blocking) 또는 WebFlux (non-blocking)
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Service Layer       │  비즈니스 로직
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Data Access Layer   │  JPA / jOOQ / R2DBC / MyBatis
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  DB Driver           │  JDBC (blocking) 또는 R2DBC (non-blocking)
└────────┬─────────────┘
         │
         ▼
      Database
```

Web Layer와 Data Access Layer의 조합이 핵심이다. blocking끼리, non-blocking끼리 맞춰야 효과가 극대화된다.

---

## 각 기술의 역할

### JPA / Hibernate

**ORM(Object-Relational Mapping)**. 객체와 테이블을 매핑한다.

```java

@Entity
@Table(name = "fax")
public class Fax {
	@Id
	@GeneratedValue
	private Long id;
	private String title;
	private String status;

	@ManyToOne(fetch = FetchType.LAZY)
	private User sender;
}
```

```java
// Spring Data JPA - 메서드 이름으로 쿼리 생성
public interface FaxRepository extends JpaRepository<Fax, Long> {
	List<Fax> findByStatus(String status);

	List<Fax> findBySenderIdAndStatusOrderByCreatedAtDesc(Long senderId, String status);
}
```

| 장점                       | 단점                             |
|--------------------------|--------------------------------|
| 객체 중심 개발, SQL 작성 최소화     | 복잡한 쿼리에 한계 (JPQL, QueryDSL 필요) |
| 1차 캐시, 변경 감지, 지연 로딩      | N+1 문제, 예상치 못한 쿼리 발생           |
| Spring Data JPA로 생산성 극대화 | 실제 실행 SQL을 예측하기 어려움            |
| 테이블 자동 생성 (DDL auto)     | 성능 튜닝 시 SQL을 직접 다뤄야 결국 함       |

**적합한 경우:** CRUD 중심, 도메인 모델이 중요한 서비스

### jOOQ

**타입 안전 SQL 빌더**. SQL을 Java/Kotlin 코드로 작성한다.

```java
// jOOQ - SQL과 1:1 대응되는 코드
Result<Record> result = dsl
		.select(FAX.ID, FAX.TITLE, USER.NAME)
		.from(FAX)
		.join(USER).on(FAX.SENDER_ID.eq(USER.ID))
		.where(FAX.STATUS.eq("SENT"))
		.and(FAX.CREATED_AT.gt(LocalDateTime.now().minusDays(7)))
		.orderBy(FAX.CREATED_AT.desc())
		.limit(20)
		.fetch();
```

DB 스키마를 코드로 생성(Code Generation)하여 컴파일 타임에 검증한다:

```
DB 스키마 (fax 테이블)
    │
    ▼  jOOQ Code Generator
    │
FAX.java (자동 생성)
    - FAX.ID      : TableField<FaxRecord, Long>
    - FAX.TITLE   : TableField<FaxRecord, String>
    - FAX.STATUS  : TableField<FaxRecord, String>
```

| 장점                                  | 단점                        |
|-------------------------------------|---------------------------|
| **컴파일 타임 SQL 검증** (컬럼명 오타 → 컴파일 에러) | Code Generation 설정 필요     |
| SQL과 1:1 대응, 실행 쿼리 예측 가능            | ORM이 아니므로 변경 감지, 지연 로딩 없음 |
| 복잡한 쿼리 (서브쿼리, 윈도우 함수) 자유자재          | 초기 학습 비용                  |
| DB 벤더별 SQL 방언 자동 처리                 | 상용 DB(Oracle 등)는 유료 라이선스  |

**적합한 경우:** 복잡한 쿼리가 많은 서비스, SQL 통제가 중요한 경우

**jOOQ는 실행 계층이 아니다:**

```
jOOQ = SQL "생성"만 담당

생성된 SQL을 누가 실행하느냐에 따라:
  → JDBC로 실행 → blocking
  → R2DBC로 실행 → non-blocking
```

### R2DBC (Reactive Relational Database Connectivity)

**Non-blocking DB 드라이버**. JDBC의 리액티브 버전이다.

```
JDBC:  Connection → Statement → ResultSet (전부 blocking)
R2DBC: ConnectionFactory → Statement → Publisher<Result> (전부 non-blocking)
```

```java
// Spring Data R2DBC
public interface FaxRepository extends ReactiveCrudRepository<Fax, Long> {
	Flux<Fax> findByStatus(String status);       // Flux = 0~N개 비동기 스트림

	Mono<Fax> findById(Long id);                 // Mono = 0~1개 비동기 값
}
```

| 장점                              | 단점                                    |
|---------------------------------|---------------------------------------|
| DB I/O가 non-blocking            | JPA처럼 풍부한 ORM 기능 없음 (연관 매핑, 지연 로딩 없음) |
| WebFlux와 조합하면 전 구간 non-blocking | 복잡한 쿼리 작성이 불편                         |
| 적은 스레드로 높은 동시 처리                | 디버깅 어려움 (스택 트레이스가 리액티브 체인)            |
| 배압(backpressure) 지원             | JDBC 기반 라이브러리 사용 불가                   |

**적합한 경우:** 초고성능 non-blocking 서비스, WebFlux 기반 프로젝트

### Spring WebFlux

**Non-blocking Web 프레임워크**. Spring MVC의 리액티브 대안.

```java
// Spring MVC (blocking)
@GetMapping("/faxes")
public List<Fax> getFaxes() {
	return faxRepository.findAll();  // 스레드 블로킹
}

// Spring WebFlux (non-blocking)
@GetMapping("/faxes")
public Flux<Fax> getFaxes() {
	return faxRepository.findAll();  // non-blocking, 스레드 반환
}
```

| Spring MVC     | Spring WebFlux       |
|----------------|----------------------|
| Tomcat (스레드 풀) | Netty (이벤트 루프)       |
| 1요청 = 1스레드     | 소수 스레드가 다수 요청 처리     |
| `List<T>`, `T` | `Flux<T>`, `Mono<T>` |
| blocking I/O   | non-blocking I/O     |
| 직관적 코드         | 리액티브 체인 학습 필요        |

---

## 조합 패턴

### 패턴 1: Spring MVC + JPA + JDBC (가장 보편적)

```
Spring MVC → JPA/Hibernate → JDBC → DB
(blocking)    (blocking)      (blocking)
```

```java

@RestController
@RequiredArgsConstructor
public class FaxController {

	private final FaxRepository faxRepository;

	@GetMapping("/faxes")
	public List<Fax> getFaxes() {
		return faxRepository.findByStatus("SENT");
	}
}
```

- 전 구간 blocking이지만 **JDK 21+ Virtual Thread**로 커버
- 코드가 단순하고 디버깅 쉬움
- Spring Boot 생태계의 대부분 라이브러리와 호환
- **B2B 서비스, 관리자 시스템에 적합**

### 패턴 2: Spring MVC + jOOQ + JDBC (복잡한 쿼리)

```
Spring MVC → jOOQ (SQL 생성) → JDBC (실행) → DB
(blocking)   (빌더)            (blocking)
```

```java

@RestController
@RequiredArgsConstructor
public class FaxController {

	private final DSLContext dsl;

	@GetMapping("/faxes")
	public List<FaxDto> searchFaxes(
		@RequestParam String status,
		@RequestParam(required = false) LocalDate from,
		@RequestParam(required = false) LocalDate to) {

		var query = dsl.select(FAX.ID, FAX.TITLE, FAX.STATUS, USER.NAME.as("senderName"))
			.from(FAX)
			.join(USER).on(FAX.SENDER_ID.eq(USER.ID))
			.where(FAX.STATUS.eq(status));

		// 동적 조건 - 타입 안전하게 추가
		if (from != null) {
			query = query.and(FAX.CREATED_AT.ge(from.atStartOfDay()));
		}
		if (to != null) {
			query = query.and(FAX.CREATED_AT.lt(to.plusDays(1).atStartOfDay()));
		}

		return query.orderBy(FAX.CREATED_AT.desc())
			.limit(100)
			.fetchInto(FaxDto.class);
	}
}
```

- SQL을 완전히 통제, 복잡한 쿼리도 타입 안전
- JPA와 혼용 가능 (단순 CRUD는 JPA, 복잡한 조회는 jOOQ)
- Virtual Thread와 조합하면 성능 충분

### 패턴 3: WebFlux + R2DBC (Full Reactive)

```
WebFlux → R2DBC → DB
(non-blocking) (non-blocking)
```

```java

@RestController
@RequiredArgsConstructor
public class FaxController {

	private final FaxRepository faxRepository;

	@GetMapping("/faxes")
	public Flux<Fax> getFaxes(@RequestParam String status) {
		return faxRepository.findByStatus(status);
	}

	@GetMapping("/fax/{id}")
	public Mono<FaxDto> getFax(@PathVariable Long id) {
		return faxRepository.findById(id)
			.map(fax -> new FaxDto(fax.getId(), fax.getTitle()))
			.switchIfEmpty(Mono.error(new NotFoundException("Fax not found")));
	}

	@PostMapping("/fax")
	public Mono<Fax> createFax(@RequestBody Mono<FaxCreateRequest> request) {
		return request
			.map(req -> new Fax(req.getTitle(), req.getContent()))
			.flatMap(faxRepository::save);
	}
}
```

- 전 구간 non-blocking, 최소 스레드로 최대 처리량
- **코드 복잡도가 높음**: `Mono`, `Flux`, `flatMap`, `switchIfEmpty` 체인
- 디버깅 어려움, 스택 트레이스가 리액티브 스케줄러 내부
- JDBC 기반 라이브러리(JPA, MyBatis) 사용 불가

### 패턴 4: WebFlux + jOOQ + R2DBC (최대 유연성)

```
WebFlux → jOOQ (SQL 생성) → R2DBC (실행) → DB
(non-blocking)  (빌더)       (non-blocking)
```

```java

@RestController
@RequiredArgsConstructor
public class FaxController {

	private final DSLContext dsl;

	@GetMapping("/faxes")
	public Flux<FaxDto> searchFaxes(@RequestParam String status) {
		// jOOQ 3.17+에서 R2DBC Publisher 직접 지원
		return Flux.from(
			dsl.select(FAX.ID, FAX.TITLE, USER.NAME)
				.from(FAX)
				.join(USER).on(FAX.SENDER_ID.eq(USER.ID))
				.where(FAX.STATUS.eq(status))
				.orderBy(FAX.CREATED_AT.desc())
		).map(record -> new FaxDto(
			record.get(FAX.ID),
			record.get(FAX.TITLE),
			record.get(USER.NAME)
		));
	}
}
```

- jOOQ가 복잡한 SQL을 타입 안전하게 생성
- R2DBC가 non-blocking으로 실행
- jOOQ 3.17+에서 `Publisher` 반환을 직접 지원하여 `Flux.from()`으로 연결
- **복잡한 쿼리 + non-blocking이 모두 필요한 경우**

### 패턴 5: WebFlux + Kotlin Coroutine + R2DBC

```
WebFlux → Coroutine (suspend) → R2DBC → DB
(non-blocking)  (sequential style)  (non-blocking)
```

```kotlin
@RestController
class FaxController(private val faxRepository: FaxRepository) {

    @GetMapping("/faxes")
    suspend fun getFaxes(@RequestParam status: String): List<Fax> =
        faxRepository.findByStatus(status)  // suspend 함수, non-blocking

    @GetMapping("/fax/{id}")
    suspend fun getFax(@PathVariable id: Long): FaxDto {
        val fax = faxRepository.findById(id)
            ?: throw NotFoundException("Fax not found")
        return FaxDto(fax.id, fax.title)
    }
}
```

- `Mono`/`Flux` 없이 **동기 코드처럼** 작성
- 내부적으로는 non-blocking (Coroutine이 컴파일러 수준에서 변환)
- Kotlin 프로젝트에서 WebFlux를 쓴다면 가장 깔끔한 방식

---

## Blocking vs Non-Blocking 조합 주의

```
❌ 잘못된 조합: WebFlux + JPA(JDBC)

WebFlux (non-blocking, 이벤트 루프 스레드 소수)
    → JPA → JDBC (blocking)
        → 이벤트 루프 스레드가 DB 응답 기다리며 멈춤
            → 전체 서비스 멈춤
```

| Web Layer       | Data Access             | 결과                                             |
|-----------------|-------------------------|------------------------------------------------|
| MVC + JDBC      | JPA, MyBatis, jOOQ+JDBC | **OK** - 전부 blocking, Virtual Thread로 커버       |
| WebFlux + R2DBC | R2DBC, jOOQ+R2DBC       | **OK** - 전부 non-blocking                       |
| WebFlux + JDBC  | JPA, MyBatis            | **위험** - non-blocking 루프에서 blocking 발생         |
| MVC + R2DBC     | R2DBC                   | 가능하지만 **의미 없음** - MVC가 blocking이므로 R2DBC 이점 상실 |

**원칙:** blocking끼리, non-blocking끼리 맞춘다.

---

## 선택 가이드

```
복잡한 쿼리가 많은가?
├── 아니오 → CRUD 중심
│   ├── 높은 동시성 필요?
│   │   ├── 아니오 → Spring MVC + JPA + Virtual Thread ✅ (가장 보편적)
│   │   └── 예 → WebFlux + R2DBC (또는 + Coroutine)
│   └──
└── 예 → SQL 통제 필요
    ├── 높은 동시성 필요?
    │   ├── 아니오 → Spring MVC + jOOQ + JDBC + Virtual Thread ✅
    │   └── 예 → WebFlux + jOOQ + R2DBC
    └──
```

### 현실적 판단 기준

| 기준       |  Spring MVC + JPA  | Spring MVC + jOOQ  | WebFlux + R2DBC |
|----------|:------------------:|:------------------:|:---------------:|
| 학습 비용    |         낮음         |         중간         |       높음        |
| 코드 복잡도   |         낮음         |         중간         |       높음        |
| 디버깅      |         쉬움         |         쉬움         |       어려움       |
| CRUD 생산성 |         최고         |         보통         |       보통        |
| 복잡한 쿼리   |         약함         |         최고         |       보통        |
| 동시 처리량   | Virtual Thread로 충분 | Virtual Thread로 충분 |       최고        |
| 생태계 호환성  |         최고         |         좋음         |       제한적       |
| 팀 도입 난이도 |         낮음         |         중간         |       높음        |

### B2B 서비스 (팩스, 메일, 캘린더 등)

```
Spring MVC + JPA + Virtual Thread (현재)
```

이미 충분하다. 동시 사용자 수백~수천명 규모에서 WebFlux가 필요한 상황은 거의 없다.
JPA로 부족한 복잡한 쿼리가 생기면 jOOQ를 부분 도입하는 것이 현실적이다.

### 고성능 B2C 서비스 (수만 TPS)

```
WebFlux + R2DBC (Java) 또는 WebFlux + Coroutine + R2DBC (Kotlin)
```

코드 복잡도를 감수할 만한 트래픽이 있을 때만 고려한다.

---

## JPA vs jOOQ 동일 쿼리 비교

복잡한 검색 쿼리를 각 방식으로 구현한 비교:

### 요구사항

> 팩스 목록 조회: 상태별 필터, 발신자 이름 포함, 최근 7일, 페이징

### JPA + QueryDSL

```java
public Page<FaxDto> searchFaxes(String status, Pageable pageable) {
	QFax fax = QFax.fax;
	QUser user = QUser.user;

	BooleanBuilder builder = new BooleanBuilder();
	builder.and(fax.status.eq(status));
	builder.and(fax.createdAt.after(LocalDateTime.now().minusDays(7)));

	List<FaxDto> content = queryFactory
		.select(Projections.constructor(FaxDto.class,
			fax.id, fax.title, fax.status, user.name))
		.from(fax)
		.join(user).on(fax.senderId.eq(user.id))
		.where(builder)
		.orderBy(fax.createdAt.desc())
		.offset(pageable.getOffset())
		.limit(pageable.getPageSize())
		.fetch();

	long total = queryFactory
		.select(fax.count())
		.from(fax)
		.where(builder)
		.fetchOne();

	return new PageImpl<>(content, pageable, total);
}
```

### jOOQ

```java
public Page<FaxDto> searchFaxes(String status, Pageable pageable) {
	var condition = FAX.STATUS.eq(status)
		.and(FAX.CREATED_AT.gt(LocalDateTime.now().minusDays(7)));

	List<FaxDto> content = dsl
		.select(FAX.ID, FAX.TITLE, FAX.STATUS, USER.NAME)
		.from(FAX)
		.join(USER).on(FAX.SENDER_ID.eq(USER.ID))
		.where(condition)
		.orderBy(FAX.CREATED_AT.desc())
		.offset(pageable.getOffset())
		.limit(pageable.getPageSize())
		.fetchInto(FaxDto.class);

	int total = dsl.fetchCount(dsl.selectFrom(FAX).where(condition));

	return new PageImpl<>(content, pageable, total);
}
```

두 코드의 차이:

- JPA: `QFax`, `Projections.constructor`, `BooleanBuilder` 등 JPA 전용 API
- jOOQ: SQL 구조와 거의 동일, `FAX.STATUS.eq()` 등 DB 스키마에서 생성된 타입 사용
- jOOQ 코드를 읽으면 실행될 SQL이 그대로 보인다

---

## Spring Boot 의존성 설정

### JPA (기본)

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("org.postgresql:postgresql")
}
```

### jOOQ

```kotlin
plugins {
    id("org.jooq.jooq-codegen-gradle") version "3.19.+"
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-jooq")
    runtimeOnly("org.postgresql:postgresql")
    jooqCodegen("org.postgresql:postgresql")
}

// DB 스키마에서 코드 자동 생성
jooq {
    configuration {
        jdbc {
            driver = "org.postgresql.Driver"
            url = "jdbc:postgresql://localhost:5432/mydb"
        }
        generator {
            database { inputSchema = "public" }
            target { packageName = "com.example.jooq" }
        }
    }
}
```

### R2DBC

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-r2dbc")
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    runtimeOnly("org.postgresql:r2dbc-postgresql")
}
```

### jOOQ + R2DBC

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-jooq") {
        exclude(group = "org.springframework", module = "spring-jdbc") // JDBC 제외
    }
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("io.r2dbc:r2dbc-postgresql")
}
```

---

## Kotlin Coroutine으로 WebFlux 코드 단순화

WebFlux의 `Mono`/`Flux` 체이닝은 강력하지만, 비즈니스 로직이 복잡해지면 가독성이 급격히 떨어진다.
Kotlin Coroutine을 사용하면 **동기 코드처럼 작성하면서 non-blocking 실행**을 얻을 수 있다.

### 문제: Mono/Flux 체이닝의 복잡도

팩스 조회 → 발신자 조회 → 권한 확인 → DTO 변환을 Mono로 구현하면:

```java
// Java + Mono/Flux - flatMap 중첩
public Mono<FaxDetailDto> getFaxDetail(Long faxId, Long userId) {
	return faxRepository.findById(faxId)
		.switchIfEmpty(Mono.error(new NotFoundException("Fax not found")))
		.flatMap(fax -> userRepository.findById(fax.getSenderId())
			.flatMap(sender -> permissionRepository.check(userId, faxId)
				.flatMap(hasPermission -> {
					if (!hasPermission) {
						return Mono.error(new ForbiddenException());
					}
					return Mono.just(new FaxDetailDto(fax, sender));
				})
			)
		);
}
```

`flatMap` 안에 `flatMap` 안에 `flatMap`... 콜백 지옥과 비슷한 구조가 된다.

### 해결: Coroutine의 suspend 함수

같은 로직을 Coroutine으로 작성하면:

```kotlin
// Kotlin + Coroutine - 동기 코드처럼 읽힌다
suspend fun getFaxDetail(faxId: Long, userId: Long): FaxDetailDto {
    val fax = faxRepository.findById(faxId)
        ?: throw NotFoundException("Fax not found")

    val sender = userRepository.findById(fax.senderId)

    val hasPermission = permissionRepository.check(userId, faxId)
    if (!hasPermission) {
        throw ForbiddenException()
    }

    return FaxDetailDto(fax, sender)
}
```

**둘 다 non-blocking이다.** 실행 결과는 동일하지만, Coroutine 버전은 위에서 아래로 읽힌다.

### 병렬 처리 비교

여러 건을 동시에 처리하는 경우 차이가 더 크다:

```java
// Mono/Flux - 팩스 3건 병렬 발송
public Flux<SendResult> sendFaxes(List<Long> faxIds) {
	return Flux.fromIterable(faxIds)
		.flatMap(id -> faxRepository.findById(id)
			.flatMap(fax -> externalApi.send(fax)
				.map(result -> new SendResult(id, true))
				.onErrorResume(e -> Mono.just(new SendResult(id, false)))
			), 3  // 동시 3건
		);
}
```

```kotlin
// Coroutine - 같은 로직
suspend fun sendFaxes(faxIds: List<Long>): List<SendResult> = coroutineScope {
    faxIds.map { id ->
        async {  // 병렬 실행
            try {
                val fax = faxRepository.findById(id)
                externalApi.send(fax)
                SendResult(id, true)
            } catch (e: Exception) {
                SendResult(id, false)
            }
        }
    }.awaitAll()
}
```

`async`/`awaitAll`로 병렬 처리, `try-catch`로 에러 처리. 기존에 알던 코드 패턴 그대로다.

### Mono/Flux vs Coroutine 패턴 비교

| 패턴    | Mono/Flux (Java)                       | Coroutine (Kotlin)         |
|-------|----------------------------------------|----------------------------|
| 순차 실행 | `.flatMap(a -> ...)`                   | 그냥 다음 줄                    |
| 에러 처리 | `.onErrorResume()`, `.switchIfEmpty()` | `try-catch`, `?: throw`    |
| 조건 분기 | `flatMap` 안에서 분기                       | `if-else`                  |
| 반복문   | `Flux.fromIterable().flatMap()`        | `for` 루프                   |
| 병렬 실행 | `Flux.merge()`, `Mono.zip()`           | `async { }` + `awaitAll()` |
| 타임아웃  | `.timeout(Duration.ofSeconds(5))`      | `withTimeout(5000)`        |
| 디버깅   | 리액티브 스케줄러 스택 트레이스                      | 일반 스택 트레이스                 |
| 학습 비용 | 높음 (리액티브 연산자 수십 개)                     | 낮음 (동기 코드와 동일)             |

### 원리

```
개발자가 작성       컴파일러가 변환           실행
─────────────     ──────────────────     ──────────
suspend fun  ──→  ContinuationPassing ──→ non-blocking
(동기 스타일)       (상태 머신으로 변환)       (Mono/Flux와 동일)
```

Kotlin 컴파일러가 `suspend` 함수를 **상태 머신(State Machine)**으로 변환한다.
개발자는 동기 코드를 작성하고, 컴파일러가 리액티브 체인과 동등한 non-blocking 코드로 만들어준다.

### Spring WebFlux + Coroutine 설정

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor")  // Mono/Flux ↔ Coroutine 변환
}
```

```kotlin
@RestController
class FaxController(private val faxRepository: FaxRepository) {

    // Mono 대신 suspend, Flux 대신 Flow
    @GetMapping("/fax/{id}")
    suspend fun getFax(@PathVariable id: Long): FaxDto {
        val fax = faxRepository.findById(id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return FaxDto(fax.id, fax.title)
    }

    @GetMapping("/faxes")
    fun getFaxes(@RequestParam status: String): Flow<FaxDto> =  // Flow = Flux의 Coroutine 대응
        faxRepository.findByStatus(status)
            .map { FaxDto(it.id, it.title) }
}
```

| Reactive 타입  | Coroutine 대응          |
|--------------|-----------------------|
| `Mono<T>`    | `suspend fun`: `T`    |
| `Mono<Void>` | `suspend fun`: `Unit` |
| `Flux<T>`    | `Flow<T>`             |

---

## 정리

|            | JPA              | jOOQ               | R2DBC                |
|------------|------------------|--------------------|----------------------|
| 패러다임       | ORM (객체 ↔ 테이블)   | SQL 빌더 (타입 안전 SQL) | Reactive DB 드라이버     |
| 실행 방식      | JDBC (blocking)  | JDBC 또는 R2DBC      | R2DBC (non-blocking) |
| 강점         | CRUD 생산성         | 복잡한 쿼리, SQL 통제     | non-blocking I/O     |
| 약점         | 복잡한 쿼리           | ORM 기능 없음          | 생태계 제한적              |
| 같이 쓸 수 있는가 | JPA + jOOQ 혼용 가능 | JPA 또는 R2DBC와 조합   | WebFlux와 세트          |

**실무 결론:** 대부분의 서비스에서 Spring MVC + JPA + Virtual Thread로 충분하다.
jOOQ는 복잡한 쿼리가 필요할 때 부분 도입하고, WebFlux + R2DBC는 수만 TPS가 필요한 서비스에서만 검토한다.
