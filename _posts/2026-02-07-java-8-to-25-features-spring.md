---
layout: post
title: Java 8 ~ 25 + Kotlin 핵심 기능 총정리 - Spring 연관, JVM 이점, EKS 비용 절감
tags: [ java, kotlin, spring, jvm, kubernetes ]
---

Java LTS 버전별(8, 11, 17, 21, 25) 핵심 기능과 Spring/Spring Boot에서 어떻게 활용되는지 정리한다.

| 버전 |  출시  | Spring Boot 지원 | 핵심 키워드                     |
|:--:|:----:|:--------------:|----------------------------|
| 8  | 2014 |   1.x ~ 2.x    | 함수형 프로그래밍                  |
| 11 | 2018 |      2.x       | var, HttpClient            |
| 17 | 2021 |      3.0+      | Record, Sealed, Text Block |
| 21 | 2023 |      3.2+      | Virtual Thread             |
| 25 | 2025 |      4.0+      | Structured Concurrency     |

---

## Java 8 (2014, LTS) - 함수형 프로그래밍 도입

Java 역사상 가장 큰 변화. 함수형 프로그래밍 패러다임이 도입되었다.

### Lambda Expression

익명 클래스를 간결하게 대체한다.

```java
// Java 7 - 익명 클래스
Runnable runnable = new Runnable() {
		@Override
		public void run() {
			System.out.println("Hello");
		}
	};

// Java 8 - Lambda
Runnable runnable = () -> System.out.println("Hello");
```

**Spring에서의 활용:**

```java
// Spring Security - Lambda DSL (Spring Security 5.2+에서 권장)
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
	return http
		.authorizeHttpRequests(auth -> auth          // Lambda
			.requestMatchers("/api/**").authenticated()
		)
		.oauth2ResourceServer(oauth2 -> oauth2       // Lambda
			.jwt(jwt -> jwt.decoder(jwtDecoder()))
		)
		.build();
}
```

Spring Security의 설정 방식이 메서드 체이닝에서 Lambda DSL로 전환된 배경이 바로 Java 8의 Lambda다.

### Stream API

컬렉션 데이터를 선언형으로 처리한다. `for` 루프 대신 **무엇을 할 것인가**에 집중한다.

```java
// Java 7 - for 루프
List<String> activeNames = new ArrayList<>();
for(
User user :users){
	if(user.

isActive()){
	activeNames.

add(user.getName());
	}
	}

// Java 8 - Stream
List<String> activeNames = users.stream()
	.filter(User::isActive)
	.map(User::getName)
	.toList();
```

**Spring에서의 활용:**

```java
// Spring Data JPA - Stream 반환
@Query("SELECT u FROM User u WHERE u.active = true")
Stream<User> findAllActiveUsers();

// 사용
try(
Stream<User> stream = userRepository.findAllActiveUsers()){
List<String> names = stream
	.map(User::getName)
	.toList();
}
```

### Optional

`null` 대신 값의 존재/부재를 명시적으로 표현한다. `NullPointerException` 방지.

```java
// Java 7
User user = userRepository.findById(1L);
if(user !=null){
	return user.

getName();
}
	return"Unknown";

// Java 8
	return userRepository.

findById(1L)
    .

map(User::getName)
    .

orElse("Unknown");
```

**Spring에서의 활용:**

Spring Data JPA는 `findById()`의 반환 타입이 `Optional`이다.

```java
// Spring Data JPA
public interface UserRepository extends JpaRepository<User, Long> {
	Optional<User> findByEmail(String email);  // Optional 반환
}
```

### java.time API

기존 `Date`, `Calendar`의 문제(가변 객체, 스레드 안전하지 않음)를 해결한 새로운 날짜/시간 API.

```java
// Java 7 - 문제 많은 API
Date date = new Date();                         // 가변, 스레드 안전 X
Calendar cal = Calendar.getInstance();
cal.

set(Calendar.MONTH, 0);                     // 0 = 1월 (혼란)

// Java 8 - 불변, 직관적
LocalDate date = LocalDate.of(2025, 1, 1);      // 1 = 1월
LocalDateTime now = LocalDateTime.now();
Duration duration = Duration.between(start, end);
```

**Spring에서의 활용:**

```java
// Spring Boot의 Jackson 직렬화
@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
private LocalDateTime createdAt;

// Spring Data JPA - 자동 매핑
@Entity
public class Order {
	private LocalDate orderDate;       // DATE 컬럼
	private LocalDateTime createdAt;   // TIMESTAMP 컬럼
}
```

### Default Method (인터페이스)

인터페이스에 구현 메서드를 추가할 수 있게 되었다. 기존 구현체를 깨지 않고 인터페이스를 확장 가능.

```java
public interface Auditable {
	default String getAuditInfo() {
		return "Created at: " + getCreatedAt();
	}

	LocalDateTime getCreatedAt();
}
```

**Spring에서의 활용:**

Spring의 `WebMvcConfigurer`가 Java 8부터 `default` 메서드를 사용하면서 `WebMvcConfigurerAdapter`(추상 클래스 상속)가 deprecated 되었다.

```java
// Java 7 - 추상 클래스 상속 (deprecated)
public class WebConfig extends WebMvcConfigurerAdapter {
	@Override
	public void addCorsMappings(CorsRegistry registry) { ...}
}

// Java 8+ - 인터페이스 직접 구현
public class WebConfig implements WebMvcConfigurer {
	@Override
	public void addCorsMappings(CorsRegistry registry) { ...}
}
```

---

## Java 11 (2018, LTS) - 편의성 개선

Java 8 이후 첫 번째 LTS. 소소하지만 실용적인 개선이 많다.

### var (지역 변수 타입 추론)

Java 10에서 도입, 11에서 Lambda에도 확장. 컴파일러가 타입을 추론한다.

```java
// 명시적 타입
Map<String, List<UserDto>> userMap = new HashMap<>();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

// var - 타입 추론
var userMap = new HashMap<String, List<UserDto>>();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
```

**주의:** 필드, 메서드 파라미터, 반환 타입에는 사용 불가. 지역 변수에서만 사용.

### HttpClient (표준 HTTP 클라이언트)

`HttpURLConnection`을 대체하는 현대적 HTTP 클라이언트. 비동기, HTTP/2 지원.

```java
// Java 11 - 표준 HttpClient
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
	.uri(URI.create("https://api.example.com/users"))
	.header("Content-Type", "application/json")
	.GET()
	.build();

var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.

println(response.body());
```

**Spring과의 관계:**

Spring에서는 `RestTemplate` → `WebClient` → `RestClient`(Spring 6.1)로 발전해왔다. Java 11 `HttpClient`를 직접 쓸 일은 적지만, Spring의 `RestClient` 내부에서 사용 가능한 HTTP 엔진 중 하나다.

```java
// Spring 6.1+ RestClient (Java 11 HttpClient보다 Spring에서 권장)
RestClient restClient = RestClient.create();
String result = restClient.get()
	.uri("https://api.example.com/users")
	.retrieve()
	.body(String.class);
```

### String 메서드 추가

```java
" ".isBlank();          // true (공백만 있으면 true)
"  hello  ".

strip();    // "hello" (유니코드 공백도 제거, trim()보다 정확)
"hello\nworld".

lines(); // Stream<String> ["hello", "world"]
"ha".

repeat(3);         // "hahaha"
```

### 단일 파일 직접 실행

```bash
# Java 11 이전 - 컴파일 후 실행
javac Hello.java
java Hello

# Java 11 - 바로 실행
java Hello.java
```

---

## Java 17 (2021, LTS) - 타입 시스템 강화

Spring Boot 3.0의 최소 요구 버전. Java 17부터 Spring 생태계가 크게 변했다.

> **Spring Boot 3.0 (2022.11)**: Java 17 최소, Jakarta EE 9+ (`javax.*` → `jakarta.*`)

### Record

불변 데이터 객체를 위한 클래스. `equals()`, `hashCode()`, `toString()`, getter를 자동 생성한다.

```java
// Java 16 이전 - 보일러플레이트
public class UserDto {
	private final String name;
	private final String email;

	public UserDto(String name, String email) {
		this.name = name;
		this.email = email;
	}

	public String getName() {
		return name;
	}

	public String getEmail() {
		return email;
	}

	@Override
	public boolean equals(Object o) { ...}

	@Override
	public int hashCode() { ...}

	@Override
	public String toString() { ...}
}

// Java 17 - Record (한 줄)
public record UserDto(String name, String email) {
}
```

**Spring에서의 활용:**

```java
// Spring MVC - 요청/응답 DTO로 사용
public record CreateUserRequest(String name, String email) {
}

public record UserResponse(Long id, String name, String email) {
}

@RestController
public class UserController {
	@PostMapping("/users")
	public UserResponse create(@RequestBody CreateUserRequest request) {
		// ...
	}
}

// Spring Data - Projection
public record UserSummary(String name, String email) {
}

@Query("SELECT new com.example.UserSummary(u.name, u.email) FROM User u")
List<UserSummary> findAllSummary();
```

**주의:** Record는 불변이므로 MyBatis의 Setter 기반 매핑과는 호환이 안 된다. JPA Entity로도 사용 불가 (기본 생성자 필요, 불변이라 프록시 생성 불가).

### Sealed Classes

상속할 수 있는 클래스를 `permits`로 제한한다. 도메인 모델링에서 "이 타입은 이것들만 될 수 있다"를 표현.

```java
// 결제 수단은 3가지만 존재
public sealed interface Payment permits CreditCard, BankTransfer, Cash {
}

public record CreditCard(String cardNumber) implements Payment {
}

public record BankTransfer(String accountNumber) implements Payment {
}

public record Cash(int amount) implements Payment {
}
```

### Pattern Matching for instanceof

```java
// Java 16 이전 - 캐스팅 필요
if(obj instanceof String){
String s = (String) obj;     // 캐스팅
    System.out.

println(s.length());
	}

// Java 17 - 캐스팅 자동
	if(obj instanceof
String s){   // 선언과 캐스팅 동시에
	System.out.

println(s.length());
	}
```

**Spring에서의 활용:**

```java
// Exception Handler에서 유용
@ExceptionHandler(Exception.class)
public ResponseEntity<?> handleException(Exception ex) {
	if (ex instanceof AccessDeniedException ade) {
		return ResponseEntity.status(403).body(ade.getMessage());
	}
	if (ex instanceof ResourceNotFoundException rnf) {
		return ResponseEntity.status(404).body(rnf.getMessage());
	}
	return ResponseEntity.status(500).body("Internal Server Error");
}
```

### Text Block

여러 줄 문자열을 `"""`로 표현. JSON, SQL, HTML 작성이 간편해진다.

```java
// Java 16 이전
String json = "{\n" +
		"  \"name\": \"John\",\n" +
		"  \"age\": 30\n" +
		"}";

// Java 17 - Text Block
String json = """
	{
	  "name": "John",
	  "age": 30
	}
	""";
```

**Spring에서의 활용:**

```java
// 테스트에서 JSON 작성
@Test
void createUser() throws Exception {
	String requestBody = """
		{
		    "name": "John",
		    "email": "john@example.com"
		}
		""";

	mockMvc.perform(post("/users")
			.contentType(MediaType.APPLICATION_JSON)
			.content(requestBody))
		.andExpect(status().isCreated());
}

// JPQL 쿼리
@Query("""
	SELECT u FROM User u
	WHERE u.active = true
	  AND u.createdAt > :date
	ORDER BY u.name
	""")
List<User> findActiveUsersAfter(@Param("date") LocalDateTime date);
```

### Switch Expression

`switch`가 값을 반환할 수 있게 되었다 (Java 14에서 정식).

```java
// Java 14 이전
String result;
switch(status){
	case ACTIVE:
result ="활성";
	break;
	case INACTIVE:
result ="비활성";
	break;
default:
result ="알 수 없음";
	}

// Java 17 - Switch Expression
String result = switch (status) {
	case ACTIVE -> "활성";
	case INACTIVE -> "비활성";
	default -> "알 수 없음";
};
```

---

## Java 21 (2023, LTS) - 동시성 혁신

Spring Boot 3.2의 권장 버전. **Virtual Thread**가 게임 체인저다.

> **Spring Boot 3.2 (2023.11)**: Virtual Thread 공식 지원
> **Spring Boot 4.0 (2025.11)**: Java 25 최소, Virtual Thread 기본

### Virtual Thread (가상 스레드)

기존 플랫폼 스레드는 OS 스레드와 1:1 매핑되어 무겁다 (스레드당 ~1MB 스택). 가상 스레드는 JVM이 관리하는 경량 스레드로, 수백만 개를 생성할 수 있다.

```
플랫폼 스레드 (기존)             가상 스레드 (Java 21)
───────────────────            ─────────────────────
Thread ←→ OS Thread (1:1)     Virtual Thread ←→ Carrier Thread (N:M)
~1MB 스택 메모리                수 KB 메모리
수천 개 한계                    수백만 개 가능
컨텍스트 스위칭 비쌈             JVM 스케줄링 (저렴)
```

```java
// 기존 - 플랫폼 스레드
ExecutorService executor = Executors.newFixedThreadPool(200);  // 최대 200개

// Java 21 - 가상 스레드 (요청마다 생성, 비용 거의 없음)
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
```

**Spring Boot에서의 적용:**

```yaml
# Spring Boot 3.2 ~ 3.x: 기본값 false → 명시 필요
spring:
  threads:
    virtual:
      enabled: true

# Spring Boot 4.0+: 기본값 true → 설정 없어도 가상 스레드 동작
```

이 설정이 `true`이면 코드 변경 없이 Spring Boot 내부 스레드풀이 전부 가상 스레드로 교체된다:

| 적용 대상            | 설명                       |
|------------------|--------------------------|
| **Tomcat 요청 처리** | 모든 HTTP 요청이 가상 스레드에서 처리  |
| **`@Async`**     | 비동기 메서드가 가상 스레드에서 실행     |
| **`@Scheduled`** | 스케줄러 태스크가 가상 스레드에서 실행    |
| **Spring Batch** | 배치 Job/Step이 가상 스레드에서 실행 |

코드에서 명시적으로 `VirtualThread`를 호출하지 않아도, 설정 하나로 애플리케이션 전체가 가상 스레드 기반으로 동작한다.

**왜 중요한가:**

```
기존 (플랫폼 스레드):
  Tomcat 스레드 풀: 200개 (기본값)
  201번째 요청 → 대기 (스레드 부족)
  DB 쿼리 1초 대기 중 → 스레드 1개 점유 (아무것도 안 하면서 잡고 있음)

가상 스레드:
  요청마다 가상 스레드 생성 (비용 거의 0, 수 KB)
  DB 쿼리 1초 대기 중 → 캐리어 스레드 반환 → 다른 요청 처리
  동시 10,000 요청도 캐리어 스레드 수십 개로 처리 가능
```

**효과:**

| 항목            |           플랫폼 스레드 (기존)           |      가상 스레드      |
|---------------|:--------------------------------:|:----------------:|
| 동시 처리 가능 수    |          스레드 풀 크기(200)           |     사실상 무제한      |
| 요청당 메모리       |            ~1MB (스택)             |       수 KB       |
| I/O 블로킹 시     |           스레드 점유 (낭비)            | 캐리어 스레드 반환 (재활용) |
| 스레드 풀 튜닝      | 필요 (`server.tomcat.threads.max`) |       불필요        |
| 처리량 (I/O 바운드) |            스레드 수에 비례             |  **하드웨어 한계까지**   |

I/O 바운드 워크로드(DB 쿼리, 외부 API 호출이 많은 애플리케이션)에서 가장 큰 효과가 있다. CPU 바운드 작업은 캐리어 스레드를 놓지 않으므로 효과가 적다.

**주의사항:**

```java
// synchronized 블록은 캐리어 스레드를 고정(pin)시킨다
synchronized (lock){
	// 여기서 블로킹 I/O 발생 시 → 캐리어 스레드 반환 불가 → 성능 저하
	jdbcTemplate.

query(...);  // BAD
}

// ReentrantLock을 사용하면 고정되지 않는다
	lock.

lock();
try{
	jdbcTemplate.

query(...);  // OK - 캐리어 스레드 반환 가능
}finally{
	lock.

unlock();
}
```

- `synchronized` + 블로킹 I/O 조합은 캐리어 스레드를 **pin**(고정)시켜 성능이 오히려 떨어질 수 있다
- JDBC 드라이버, 커넥션 풀(HikariCP) 등 라이브러리가 내부적으로 `synchronized`를 사용하는 경우 주의
- HikariCP 6.x, PostgreSQL JDBC 42.7+, MySQL Connector/J 9.0+ 등 최신 드라이버는 Virtual Thread 호환 작업이 진행됨

WebFlux(리액티브)의 핵심 장점인 "블로킹 없는 고처리량"을 **기존 동기 코드(Spring MVC) 그대로** 얻을 수 있다. WebFlux를 도입할 이유가 크게 줄었다.

### Record Pattern (Java 21 정식)

Record의 구성 요소를 패턴으로 분해한다.

```java
record Point(int x, int y) {
}

// Java 17 - instanceof Pattern Matching
if(obj instanceof
Point p){
	System.out.

println(p.x() +", "+p.

y());
	}

// Java 21 - Record Pattern (구조 분해)
	if(obj instanceof

Point(int x, int y)){
	System.out.

println(x +", "+y);  // 직접 접근
}
```

### Sequenced Collections

`List`, `Set` 등에 `getFirst()`, `getLast()`, `reversed()` 메서드 추가.

```java
// Java 20 이전 - 불편
list.get(0);                  // 첫 번째
list.

get(list.size() -1);    // 마지막

// Java 21 - 직관적
	list.

getFirst();
list.

getLast();
list.

reversed();              // 역순 뷰
```

### Switch Pattern Matching (Java 21 정식)

`switch`에서 타입 패턴, `null`, guard(`when`) 사용 가능.

```java
// Java 21
String describe(Object obj) {
	return switch (obj) {
		case Integer i when i > 0 -> "양수: " + i;
		case Integer i -> "음수 또는 0: " + i;
		case String s -> "문자열: " + s;
		case null -> "null";
		default -> "기타: " + obj;
	};
}
```

---

## Java 25 (2025, LTS) - 동시성 완성 + 성능 최적화

Spring Boot 4.0의 최소 요구 버전 (Spring Framework 7.0).

> **Spring Boot 4.0 (2025.11)**: Java 25 최소, Kotlin 2.2 베이스라인, Jakarta EE 11

### Structured Concurrency (정식)

여러 비동기 작업을 **구조적으로** 관리한다. 부모 태스크가 취소되면 자식도 자동 취소. try-with-resources 패턴으로 스코프 관리.

```java
// Java 21 이전 - 개별 Future 관리 (실수 가능)
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
Future<User> userFuture = executor.submit(() -> findUser(id));
Future<List<Order>> ordersFuture = executor.submit(() -> findOrders(id));
// userFuture 실패해도 ordersFuture는 계속 실행... 자원 낭비

// Java 25 - Structured Concurrency
try(
var scope = StructuredTaskScope.open()){
Subtask<User> user = scope.fork(() -> findUser(id));        // 병렬 실행
Subtask<List<Order>> orders = scope.fork(() -> findOrders(id));  // 병렬 실행

    scope.

join();  // 모든 태스크 완료 대기 (하나 실패 시 나머지 자동 취소)

    return new

UserProfile(user.get(),orders.

get());
	}
```

**Spring에서의 활용:**

```java

@Service
public class DashboardService {

	// 대시보드 데이터를 병렬로 조회
	public Dashboard getDashboard(Long userId) throws Exception {
		try (var scope = StructuredTaskScope.open()) {
			var user = scope.fork(() -> userService.findById(userId));
			var orders = scope.fork(() -> orderService.findByUserId(userId));
			var notifications = scope.fork(() -> notificationService.findUnread(userId));

			scope.join();

			return new Dashboard(user.get(), orders.get(), notifications.get());
		}
	}
}
```

### Scoped Values (정식)

`ThreadLocal`의 대체. 불변이고, Virtual Thread에 최적화되어 있다.

```java
// 기존 - ThreadLocal (가변, 메모리 누수 위험)
private static final ThreadLocal<Session> currentSession = new ThreadLocal<>();

public void process() {
	currentSession.set(session);
	try {
		doWork();  // currentSession.get()으로 접근
	} finally {
		currentSession.remove();  // 반드시 제거해야 함 (누수 위험)
	}
}

// Java 25 - ScopedValue (불변, 스코프 자동 관리)
private static final ScopedValue<Session> CURRENT_SESSION = ScopedValue.newInstance();

public void process() {
	ScopedValue.runWhere(CURRENT_SESSION, session, () -> {
		doWork();  // CURRENT_SESSION.get()으로 접근
	});
	// 스코프 벗어나면 자동 해제, 누수 불가
}
```

**Spring과의 관계:**

Spring Security의 `SecurityContextHolder`가 내부적으로 `ThreadLocal`을 사용한다. 향후 `ScopedValue`로 전환될 가능성이 있다.

```java
// 현재 Spring Security (ThreadLocal 기반)
SecurityContext context = SecurityContextHolder.getContext();
Authentication auth = context.getAuthentication();

// Virtual Thread 환경에서는 ThreadLocal이 캐리어 스레드와 공유될 수 있어 주의 필요
// ScopedValue는 이 문제를 근본적으로 해결
```

### Compact Object Headers

객체 헤더 크기를 기존 96~128bit에서 **64bit**로 축소. 코드 변경 없이 메모리 사용량 감소.

```
기존 객체 헤더: [Mark Word (64bit)] + [Class Pointer (32/64bit)] = 96~128bit
Compact:       [Mark Word + Class Pointer (64bit)]              = 64bit
```

JVM 옵션으로 활성화:

```bash
java -XX:+UseCompactObjectHeaders -jar app.jar
```

작은 객체가 많은 애플리케이션(Spring Bean, DTO 등)에서 힙 메모리 10~20% 절감 효과.

### Primitive Types in Patterns

패턴 매칭에서 원시 타입 사용 가능.

```java
// Java 25 - 원시 타입 패턴
String classify(double value) {
	return switch (value) {
		case 0.0 -> "zero";
		case double d when d > 0 -> "positive";
		case double d when d < 0 -> "negative";
		default -> "NaN";
	};
}
```

### Foreign Function & Memory API (정식)

JNI를 대체하는 네이티브 코드 호출 API. C/C++ 라이브러리를 안전하게 호출할 수 있다.

```java
// C의 strlen 함수 호출
try(Arena arena = Arena.ofConfined()){
SymbolLookup stdlib = Linker.nativeLinker().defaultLookup();
MethodHandle strlen = Linker.nativeLinker().downcallHandle(
	stdlib.find("strlen").orElseThrow(),
	FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS)
);

MemorySegment str = arena.allocateFrom("Hello");
long len = (long) strlen.invoke(str);  // 5
}
```

---

## 버전별 Spring Boot 매핑

| Java | Spring Boot | Spring Framework | 주요 영향                                    |
|:----:|:-----------:|:----------------:|------------------------------------------|
|  8   |  1.x ~ 2.7  |    4.x ~ 5.3     | Lambda DSL, Stream, Optional             |
|  11  |     2.x     |       5.x        | HttpClient, var                          |
|  17  |  **3.0+**   |     **6.0+**     | Jakarta EE 전환, Record, Text Block        |
|  21  |    3.2+     |       6.1+       | Virtual Thread 지원                        |
|  25  |  **4.0+**   |     **7.0+**     | Structured Concurrency, Kotlin 2.2 베이스라인 |

### Spring Boot 3.0의 파괴적 변경 (Java 17 필수)

```java
// Java 17 필수로 올리면서 함께 변경된 것들
javax.servlet .*   →jakarta.servlet .*     // Jakarta EE 9
javax.persistence .* →jakarta.persistence .*
javax.validation .*  →jakarta.validation .*
```

이 변경 때문에 Spring Boot 2.x → 3.0 마이그레이션이 가장 힘들었다.

### Spring Boot 4.0의 변경 (Java 25 필수)

```java
// Jackson 2.x → Jackson 3.x
com.fasterxml.jackson.databind.ObjectMapper →tools.jackson.databind.ObjectMapper

// Virtual Thread 기본 활성화
// Kotlin 2.2 베이스라인 (Kotlin 필수는 아님)
```

---

## 실무 마이그레이션 경로

```
Java 8 + Spring Boot 2.x (대부분의 레거시)
    ↓ javax → jakarta, JUnit 4 → 5
Java 17 + Spring Boot 3.0
    ↓ Virtual Thread 적용
Java 21 + Spring Boot 3.2
    ↓ Jackson 3.x, Kotlin 전환 (선택)
Java 25 + Spring Boot 4.0
```

각 단계에서 가장 주의할 점:

| 전환      | 핵심 주의사항                                                |
|---------|--------------------------------------------------------|
| 8 → 17  | `javax.*` → `jakarta.*` 패키지 변경 (가장 큰 작업)               |
| 17 → 21 | 상대적으로 쉬움. `ThreadLocal` 사용 시 Virtual Thread 호환성 확인     |
| 21 → 25 | Jackson 3.x 패키지 변경 (`com.fasterxml` → `tools.jackson`) |

---

## JDK 25로 올리면 좋은 점 (문법 외 - JVM/런타임)

문법적 개선과 별개로, JDK 버전을 올리는 것 자체가 성능과 안정성에 큰 영향을 준다.
Kotlin이든 Java든 JVM 위에서 동작하므로, **코드 수정 없이 JDK만 업그레이드해도** 아래 효과를 얻는다.

### GC (가비지 컬렉터) 성능

애플리케이션이 멈추는 시간(Stop-the-World)이 JDK 버전마다 줄어들었다.

| JDK | 기본 GC       | STW (Stop-the-World)                |
|:---:|-------------|-------------------------------------|
|  8  | Parallel GC | 수백ms (힙 크기에 비례)                     |
| 11  | G1GC        | 수십~수백ms (Region 기반으로 개선)            |
| 17  | G1GC (개선)   | 수십ms, ZGC 실험적 도입                    |
| 21  | G1GC (개선)   | **Generational ZGC** 도입 (STW < 1ms) |
| 25  | G1GC (개선)   | ZGC 안정화, G1GC도 꾸준히 개선               |

ZGC를 사용하면 힙이 수십GB여도 일시정지가 1ms 미만이다.

```bash
# ZGC 활성화 (JDK 21+)
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar
```

Spring Boot처럼 많은 객체를 생성/소멸하는 프레임워크에서 GC 성능 차이는 응답 시간에 직접 영향을 준다.

### 메모리 효율

코드 수정 없이 JVM만 올리면 메모리 사용량이 줄어든다.

**Compact Strings (JDK 9+)**

```
JDK 8:  String 내부 = char[] (문자당 2바이트)
        "hello" = 10바이트

JDK 9+: String 내부 = byte[] (Latin-1이면 문자당 1바이트)
        "hello" = 5바이트
```

영문/숫자 위주 문자열의 메모리 사용량이 ~50% 감소한다.
JSON 응답, 로그 메시지, URL, SQL 쿼리 등 대부분의 서버 문자열이 Latin-1이므로 효과가 크다.

**Compact Object Headers (JDK 25)**

```
JDK 8~24: 객체 헤더 = [Mark Word 64bit] + [Class Pointer 32~64bit] = 96~128bit
JDK 25:   객체 헤더 = [Mark + Class 통합 64bit]                     = 64bit
```

```bash
# Compact Object Headers 활성화 (JDK 25)
java -XX:+UseCompactObjectHeaders -jar app.jar
```

Spring Bean, DTO, Entity 등 작은 객체가 많은 애플리케이션에서 힙 메모리 **10~20% 절감**.

### 컨테이너(Docker/K8s) 지원

|  JDK   | 컨테이너 인식                               |
|:------:|---------------------------------------|
| 8 (초기) | **컨테이너 메모리/CPU 제한 무시** → OOMKilled 빈번 |
| 8u191+ | `-XX:+UseContainerSupport` 추가 (수동)    |
|  11+   | 기본 활성화, cgroup v1 지원                  |
|  17+   | cgroup v2 지원                          |
|   25   | cgroup v2 완전 지원, 컨테이너 리소스 자동 감지 안정화   |

JDK 8 초기 버전은 Docker 컨테이너의 메모리 제한(예: `--memory=512m`)을 인식하지 못했다.
JVM이 호스트 전체 메모리(예: 32GB)를 기준으로 힙을 잡아서, 컨테이너 메모리 제한을 초과하고 OOMKilled 되는 문제가 빈번했다.

```yaml
# Kubernetes Pod 예시
resources:
  limits:
    memory: "512Mi"  # JDK 8 초기: 이 제한을 무시하고 힙을 크게 잡음
    # JDK 25: 자동으로 512Mi 기준으로 힙 크기 결정
```

EKS/K8s 환경이면 JDK 25가 확실히 안정적이다.

### 보안

| 항목        | JDK 8        | JDK 25                    |
|-----------|--------------|---------------------------|
| TLS 기본 버전 | 1.0~1.2      | **1.3 기본** (1.0/1.1 제거)   |
| 인증서 알고리즘  | SHA-1 허용     | SHA-1 비활성화                |
| 암호화 알고리즘  | 3DES, RC4 허용 | 취약 알고리즘 제거, ChaCha20 등 추가 |
| CA 인증서    | 수동 관리        | 최신 CA 인증서 번들 자동 포함        |

TLS 1.0/1.1은 이미 대부분의 클라우드 서비스에서 거부한다. JDK 8에서는 별도 설정이 필요하지만 JDK 25는 기본적으로 안전한 설정이 적용된다.

### 시작 속도 (CDS - Class Data Sharing)

```
JDK 8:  클래스 로딩 → 바이트코드 검증 → 링킹 → 초기화 (매 실행마다 반복)

JDK 25: CDS 아카이브에서 사전 처리된 클래스 로드 → 시작 시간 20~30% 단축
```

```bash
# CDS 아카이브 생성 (한 번만)
java -XX:ArchiveClassesAtExit=app-cds.jsa -jar app.jar

# 이후 실행 시 CDS 활용
java -XX:SharedArchiveFile=app-cds.jsa -jar app.jar
```

Spring Boot 4.0의 **AOT (Ahead-of-Time) 컴파일**과 조합하면 시작 시간이 더 줄어든다.
컨테이너 환경에서 빠른 스케일아웃이 필요한 경우 효과적이다.

### JIT 컴파일러 최적화

JDK 버전마다 C2 JIT 컴파일러가 꾸준히 개선된다. 같은 코드도 JDK 25에서 더 빠르게 실행된다.

주요 개선 사항:

- **Escape Analysis 개선**: 힙 할당을 스택 할당으로 최적화하는 범위 확대
- **인라이닝 최적화**: 메서드 호출 오버헤드 감소
- **루프 최적화**: 벡터 연산(SIMD) 자동 적용 범위 확대
- **분기 예측**: 핫 패스 최적화 개선

벤치마크상 JDK 8 → 25로 올리면 **동일 코드에서 처리량 20~40% 향상**이 일반적이다.

### 정리

| 항목      | JDK 8 → JDK 25 효과                               |
|---------|-------------------------------------------------|
| GC 일시정지 | 수백ms → **< 1ms** (ZGC)                          |
| 메모리 사용  | Compact Strings + Object Headers로 **10~30% 절감** |
| 컨테이너    | OOMKilled 위험 → **자동 리소스 감지**                    |
| 보안      | TLS 1.0 허용 → **TLS 1.3 기본, 취약 알고리즘 제거**         |
| 시작 속도   | 매번 클래스 로딩 → **CDS + AOT로 20~30% 단축**            |
| 처리량     | JIT 최적화로 **20~40% 향상**                          |

이 모든 효과는 **코드 한 줄 수정 없이 JDK만 업그레이드**하면 얻을 수 있다.

---

## Kotlin과 Java 기능 비교

Java가 버전을 올리며 추가한 기능들 중 상당수는 Kotlin이 이미 제공하고 있었다.

| Java 기능                     | 도입 버전 | Kotlin 대응                                    | Kotlin 버전  |
|-----------------------------|:-----:|----------------------------------------------|:----------:|
| Lambda                      |   8   | Lambda (동일)                                  | 1.0 (2016) |
| Stream API                  |   8   | Collection 확장함수 (`filter`, `map`, `flatMap`) |    1.0     |
| Optional                    |   8   | **Null Safety** (`?`, `?.`, `?:`, `!!`)      |    1.0     |
| var (타입 추론)                 |  10   | `val` / `var` (처음부터 타입 추론)                   |    1.0     |
| Text Block (`"""`)          |  15   | Raw String (`"""`)                           |    1.0     |
| Record                      |  16   | `data class`                                 |    1.0     |
| Sealed Classes              |  17   | `sealed class` / `sealed interface`          | 1.0 / 1.5  |
| Pattern Matching instanceof |  17   | Smart Cast (`is` 검사 후 자동 캐스팅)                |    1.0     |
| Switch Expression           |  14   | `when` 표현식                                   |    1.0     |
| Switch Pattern Matching     |  21   | `when` + Smart Cast                          |    1.0     |

Kotlin은 2016년 1.0 출시 때부터 이 기능들을 대부분 갖추고 있었다. Java가 8→25로 올리면서 얻는 문법적 이점의 상당 부분을 Kotlin은 처음부터 제공한다.

---

## Kotlin이 Java보다 간결한 예시

### Lambda + Collection 처리

```java
// Java 8 - Stream API
List<String> names = users.stream()
		.filter(u -> u.isActive())
		.map(u -> u.getName())
		.sorted()
		.collect(Collectors.toList());
```

```kotlin
// Kotlin - 확장함수 (Stream 불필요)
val names = users
    .filter { it.isActive }
    .map { it.name }
    .sorted()
```

Kotlin은 `stream()`, `collect()` 없이 컬렉션에 직접 `filter`, `map`을 호출한다. `Collectors.toList()` 같은 보일러플레이트도 없다.

### Null 처리

```java
// Java 8 - Optional
Optional<User> userOpt = userRepository.findById(1L);
String name = userOpt
	.map(User::getName)
	.orElse("Unknown");

// Java - Optional 없이 (NullPointerException 위험)
User user = userRepository.findById(1L);
String name = user != null ? user.getName() : "Unknown";
```

```kotlin
// Kotlin - Null Safety 내장
val name = userRepository.findById(1L)?.name ?: "Unknown"
```

`?.` (Safe Call)과 `?:` (Elvis Operator)로 `Optional` 없이도 안전하게 null을 처리한다. Kotlin에서는 `Optional`을 쓸 필요가 없다.

### Data Class vs Record

```java
// Java 17 - Record
public record UserDto(String name, String email) {
}
// 불변, equals/hashCode/toString 자동 생성
// 단, copy 불가, 기본값 불가
```

```kotlin
// Kotlin - data class
data class UserDto(
    val name: String,
    val email: String = "unknown"  // 기본값 가능
)

val user = UserDto("John", "john@example.com")
val copied = user.copy(email = "new@example.com")  // copy 가능
```

Kotlin `data class`는 Record의 상위호환이다. `copy()`, 기본값, 구조 분해 선언까지 지원.

### Sealed Class + when

```java
// Java 21 - Sealed + Switch Pattern Matching
sealed interface Payment permits CreditCard, BankTransfer, Cash {
}

record CreditCard(String number) implements Payment {
}

record BankTransfer(String account) implements Payment {
}

record Cash(int amount) implements Payment {
}

String describe(Payment payment) {
	return switch (payment) {
		case CreditCard c -> "카드: " + c.number();
		case BankTransfer b -> "계좌: " + b.account();
		case Cash c -> "현금: " + c.amount() + "원";
	};
}
```

```kotlin
// Kotlin - sealed class + when (Java 21과 동일한 효과)
sealed interface Payment
data class CreditCard(val number: String) : Payment
data class BankTransfer(val account: String) : Payment
data class Cash(val amount: Int) : Payment

fun describe(payment: Payment): String = when (payment) {
    is CreditCard -> "카드: ${payment.number}"
    is BankTransfer -> "계좌: ${payment.account}"
    is Cash -> "현금: ${payment.amount}원"
    // else 불필요 - sealed이므로 컴파일러가 모든 케이스 검증
}
```

`sealed` + `when`을 조합하면 `else` 없이도 컴파일러가 모든 분기를 검증한다. 새 하위 타입을 추가하면 `when`에서 처리하지 않은 곳에서 컴파일 에러 발생 → 누락 방지.

### Smart Cast vs Pattern Matching instanceof

```java
// Java 17 - Pattern Matching
if(obj instanceof
String s){
	System.out.

println(s.length());
	}
```

```kotlin
// Kotlin - Smart Cast
if (obj is String) {
    println(obj.length)  // 자동 캐스팅, 별도 변수 선언 불필요
}
```

---

## Kotlin + Spring Boot

### Spring Boot 4.0에서의 Kotlin 지위

Spring Boot 4.0은 **Kotlin 2.2를 베이스라인**으로 설정했다. Kotlin은 선택이 아닌 공식 지원 언어다.

```kotlin
// Spring Boot 4.0 + Kotlin - 실제 컨트롤러
@RestController
class UserController(
    private val userService: UserService  // 생성자 주입 (Lombok 불필요)
) {
    @GetMapping("/users/{id}")
    fun getUser(@PathVariable id: Long): UserDto =
        userService.findById(id)

    @PostMapping("/users")
    fun createUser(@RequestBody request: CreateUserRequest): UserDto =
        userService.create(request)
}
```

Java로 같은 코드를 작성하면:

```java
// Java - 같은 기능
@RestController
public class UserController {

	private final UserService userService;

	public UserController(UserService userService) {  // 생성자
		this.userService = userService;
	}

	@GetMapping("/users/{id}")
	public UserDto getUser(@PathVariable Long id) {
		return userService.findById(id);
	}

	@PostMapping("/users")
	public UserDto createUser(@RequestBody CreateUserRequest request) {
		return userService.create(request);
	}
}
```

### Kotlin이 Lombok을 대체하는 방법

Java 프로젝트에서 Lombok은 사실상 필수였다. Kotlin으로 전환하면 Lombok이 완전히 불필요하다.

| Lombok                     | Kotlin                                        |
|----------------------------|-----------------------------------------------|
| `@Getter` / `@Setter`      | 프로퍼티 기본 제공 (`val` / `var`)                    |
| `@Data`                    | `data class`                                  |
| `@Builder`                 | Named Arguments + Default Values              |
| `@RequiredArgsConstructor` | Primary Constructor                           |
| `@Slf4j`                   | `companion object` + `LoggerFactory` 또는 확장함수  |
| `@ToString`                | `data class`의 `toString()` 자동 생성              |
| `@EqualsAndHashCode`       | `data class`의 `equals()` / `hashCode()` 자동 생성 |

```java
// Java + Lombok
@Data
@Builder
@RequiredArgsConstructor
public class FaxSendDto {
	private final Long faxSeq;
	private final String uuid;
	private String frNumber;
	private String toNumber;
}
```

```kotlin
// Kotlin - 위의 모든 어노테이션이 불필요
data class FaxSendDto(
    val faxSeq: Long,
    val uuid: String,
    var frNumber: String? = null,
    var toNumber: String? = null
)

// Named Arguments = Builder 패턴 대체
val dto = FaxSendDto(
    faxSeq = 1L,
    uuid = "abc-123",
    frNumber = "02-1234-5678"
)
```

### 확장함수 - 기존 클래스에 메서드 추가

Java에서는 유틸리티 클래스(`StringUtils`, `DateUtils`)를 만들어야 했다. Kotlin은 기존 클래스에 직접 함수를 추가할 수 있다.

```java
// Java - 유틸리티 클래스
public class StringUtils {
	public static String toSlug(String input) {
		return input.lowercase().replace(" ", "-");
	}
}
// 사용: StringUtils.toSlug("Hello World")
```

```kotlin
// Kotlin - 확장함수
fun String.toSlug(): String = this.lowercase().replace(" ", "-")
// 사용: "Hello World".toSlug()
```

**Spring에서의 활용:**

```kotlin
// Spring의 BeanDefinitionDsl - Kotlin DSL로 Bean 등록
beans {
    bean<UserService>()
    bean<UserController>()
    bean {
        RouterFunctionDsl {
            GET("/api/users") { request -> ok().body(ref<UserService>().findAll()) }
        }
    }
}
```

### Coroutine vs Virtual Thread

Kotlin은 자체 비동기 솔루션인 **Coroutine**을 갖고 있다. Java 21의 Virtual Thread와 비교:

|           | Coroutine                                   | Virtual Thread                                |
|-----------|---------------------------------------------|-----------------------------------------------|
| 소속        | Kotlin 언어                                   | JVM (Java 21+)                                |
| 사용법       | `suspend fun`, `launch`, `async`            | `Executors.newVirtualThreadPerTaskExecutor()` |
| 비동기 스타일   | suspend 함수 (컴파일러 변환)                        | 동기 코드 그대로                                     |
| Spring 연동 | Spring WebFlux (`spring-webflux`)           | Spring MVC (기존 코드 그대로)                        |
| 학습 비용     | 높음 (`CoroutineScope`, `Dispatcher`, `Flow`) | **낮음** (기존 코드 변경 없음)                          |

```kotlin
// Coroutine - suspend 함수
@GetMapping("/users/{id}")
suspend fun getUser(@PathVariable id: Long): UserDto =  // suspend 키워드
    userService.findById(id)  // non-blocking

// Virtual Thread - 동기 코드 그대로 (Spring Boot 4.0 기본)
@GetMapping("/users/{id}")
fun getUser(@PathVariable id: Long): UserDto =
    userService.findById(id)  // 블로킹이지만 가상 스레드가 처리
```

Spring MVC + Virtual Thread 조합이면 Coroutine 없이도 높은 동시성을 얻을 수 있다. Coroutine은 WebFlux(리액티브) 기반에서 주로 사용되며, Spring MVC 기반 프로젝트에서는 Virtual Thread가 더 실용적이다.

---

## JDK 25 업그레이드와 EKS 비용 절감

JDK 25로 업그레이드하면 코드 변경 없이 JVM 수준에서 메모리 효율이 개선된다.
이를 기반으로 Kubernetes 리소스를 줄여 인프라 비용을 절감할 수 있다.

### Kubernetes 리소스 설정 이해

```yaml
resources:
  requests:
    cpu: 500m       # 스케줄링 기준 - "이 Pod은 최소 0.5 CPU가 필요"
    memory: 1Gi     # 스케줄링 기준 - "이 Pod은 최소 1Gi 메모리가 필요"
  limits:
    cpu: 1000m      # 상한선 - CPU는 throttle (죽지 않음)
    memory: 2Gi     # 상한선 - 초과 시 OOM Kill (Pod 즉시 종료)
```

| 항목              | 역할                              | 초과 시                   |
|-----------------|---------------------------------|------------------------|
| requests.memory | 노드 스케줄링 기준. 이 값의 합산으로 노드 수가 결정됨 | -                      |
| limits.memory   | Pod이 사용할 수 있는 최대 메모리            | **OOM Kill (Pod 재시작)** |
| requests.cpu    | 노드 스케줄링 기준                      | -                      |
| limits.cpu      | Pod이 사용할 수 있는 최대 CPU            | throttle (느려짐, 안 죽음)   |

**핵심:** `requests`를 줄이면 노드에 더 많은 Pod을 배치할 수 있고, 노드 수를 줄일 수 있다.
`limits`를 줄이면 Pod이 죽을 수 있으므로 신중해야 한다.

### 메모리 줄이기 전 확인해야 할 3가지 메트릭

#### 1. Heap 사용량

JVM이 객체를 저장하는 공간. `-Xmx`로 최대치를 설정한다.

```
Xmx 1600m (최대 한도)
┌──────────────────────────────────────────┐
│██████████████████░░░░░░░░░░░░░░░░░░░░░░░│
│    실제 사용 700m        여유 900m        │
└──────────────────────────────────────────┘
```

- **확인**: 피크 시간(업무 시간, 배치 실행)에 힙 사용량이 Xmx의 몇 %인지
- **판단**: 피크가 Xmx의 **60% 이하**면 Xmx를 줄일 여지 있음
- 예: 피크 700m / Xmx 1600m = 43% → Xmx 1200m으로 줄여도 여유

#### 2. RSS (Resident Set Size)

OS 관점에서 JVM 프로세스가 **실제로 점유한 물리 메모리 전체**.

```
RSS = Heap + Metaspace + Thread Stacks + Code Cache + Direct Buffer + Native
```

```
K8s limits 2Gi (이거 넘으면 OOM Kill)
┌────────────────────────────────────────────────┐
│ Heap 700m │ Metaspace 150m │ 기타 200m │ 여유  │
│           │                │           │ ~1Gi  │
└────────────────────────────────────────────────┘
  ←──────── RSS 약 1050m ──────────→
```

| 영역            | 대략적 크기   | 비고                                 |
|---------------|----------|------------------------------------|
| Heap          | Xmx 설정값  | 줄이려는 대상                            |
| Metaspace     | 100~200m | 클래스 수에 비례, Spring Boot는 많음         |
| Thread Stacks | 가변       | Virtual Thread는 스택이 작지만 수가 많을 수 있음 |
| Code Cache    | 50~240m  | JIT 컴파일된 코드                        |
| Direct Buffer | 가변       | NIO 사용 시                           |

- **확인**: RSS가 K8s limits의 몇 %인지
- **판단**: RSS 피크가 limits의 **70% 이하**면 limits 축소 가능
- **중요**: 힙만 보고 줄이면 안 됨. RSS가 limits 넘으면 Pod가 죽음

#### 3. GC (Garbage Collection) 메트릭

JVM이 안 쓰는 객체를 정리하는 작업. 힙을 줄이면 GC가 더 자주 돌 수 있다.

| 지표         | 의미             | 위험 신호              |
|------------|----------------|--------------------|
| GC 횟수      | 분당 GC 실행 횟수    | 급격히 증가하면 힙 부족      |
| GC 시간      | 1회 GC에 걸리는 시간  | 수백ms 이상이면 응답 지연    |
| GC 후 힙 사용량 | GC 해도 남아있는 메모리 | 계속 올라가면 **메모리 누수** |

```
힙 사용량 그래프 (정상 - 톱니 패턴)

1600m ┤
      │
1000m ┤    ╱╲      ╱╲      ╱╲
      │   ╱  ╲    ╱  ╲    ╱  ╲       ← GC 때마다 내려감
 500m ┤  ╱    ╲  ╱    ╲  ╱    ╲
      │ ╱      ╲╱      ╲╱      ╲
   0m ┤─────────────────────────────
      시간 →

힙 사용량 그래프 (위험 - 메모리 누수)

1600m ┤                        ╱╲    ← GC 해도 바닥이 안 내려감
      │                  ╱╲  ╱
1000m ┤            ╱╲   ╱  ╲╱
      │       ╱╲  ╱  ╲╱
 500m ┤  ╱╲  ╱  ╲╱
      │ ╱  ╲╱
   0m ┤─────────────────────────────
      시간 →
```

### 비용 절감 단계

JDK만 교체해도 GC 개선, Compact Object Headers, String 최적화 등이 자동 적용된다.
모니터링으로 효과를 확인한 뒤 단계적으로 리소스를 줄인다.

```
[1단계] JDK 25 이미지 배포 (JVM·K8s 설정은 기존 유지)
   │
   ▼  1~2주 모니터링 (Heap, RSS, GC)
   │
[2단계] JVM 힙 축소 (-Xmx 1600m → 1400m)
   │
   ▼  1~2주 모니터링 (배치 실행 시간대 포함)
   │
[3단계] K8s requests 축소 (1Gi → 896Mi)
   │
   ▼  1~2주 모니터링
   │
[4단계] K8s limits 축소 (2Gi → 1.75Gi)
   │
   ▼  안정 확인
   │
[5단계] EKS 노드 축소 (requests 총합 감소 → 노드 수 줄이기)
```

**주의사항:**

- `limits`는 **가장 마지막에** 줄인다. 초과 시 OOM Kill이므로 충분한 여유 필요
- **Batch 모듈**은 대량 데이터 처리로 순간 힙 사용량이 높으므로 보수적으로 접근
- 트래픽 스파이크(월말, 대량 발송 등)를 반드시 포함한 기간 동안 모니터링

### 예상 효과

24개 Java 서비스 기준으로 requests.memory를 `1Gi → 896Mi`(128Mi 절감)로 줄이면:

```
24 서비스 × 128Mi = 약 3Gi requests 감소
→ EKS m5.xlarge(16Gi) 기준 노드 스케줄링 여유 확보
→ 노드 1대 축소 시 연간 약 $2,000 절감
```

Spring Boot Actuator + Prometheus + Grafana 조합이면 위 메트릭을 자동으로 수집·시각화할 수 있다.
