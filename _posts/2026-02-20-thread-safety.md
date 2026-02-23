---
layout: post
title: 스레드 안전(Thread Safety) 정리 — Spring 싱글톤 빈은 왜 안전한가
tags: [ java, spring ]
---

Spring 빈은 싱글톤인데 200명이 동시에 요청하면 어떻게 되는 걸까?
스레드 안전이 뭔지, 언제 위험한지, 실무에서 어떻게 대응하는지 정리한다.

## 스레드 안전이란

여러 스레드가 **동시에 같은 데이터에 접근**할 때, 결과가 항상 올바르면 스레드 안전하다.

```java
// 스레드 불안전 예시
int count = 0;

// 스레드 2개가 동시에 count++를 1000번씩 실행
// 기대값: 2000
// 실제값: 1837, 1923... 매번 다르다
```

`count++`는 내부적으로 3단계다.

```
1. count 값 읽기 (5)
2. 1 더하기    (6)
3. count에 쓰기 (6)
```

두 스레드가 동시에 1번을 실행하면 둘 다 5를 읽고, 둘 다 6을 쓴다. **증가가 1번 씹힌다.**

## String / StringBuffer / StringBuilder로 이해하기

| 클래스             | 스레드 안전 | 변경 가능  | 성능 |
|-----------------|--------|--------|----|
| `String`        | O      | X (불변) | -  |
| `StringBuffer`  | O      | O      | 느림 |
| `StringBuilder` | X      | O      | 빠름 |

### String — 불변이라서 스레드 안전

```java
String s = "hello";
s =s +" world";  // 새 객체를 만든다. 원본 "hello"는 그대로.
```

값이 바뀌지 않으니 여러 스레드가 동시에 읽어도 문제가 없다.

### StringBuffer — synchronized로 스레드 안전

```java
// StringBuffer 내부 (JDK 소스 단순화)
public synchronized StringBuffer append(String str) {
	super.append(str);
	return this;
}
```

모든 메서드에 `synchronized`가 붙어 있다. 한 스레드가 `append` 중이면 다른 스레드는 대기한다.

```
스레드 A: append("hello") ━━━━━
스레드 B:                       append(" world") ━━━━━
결과: "hello world" ← 항상 정확
```

### StringBuilder — 동기화 없이 빠르게

```java
// StringBuilder 내부 (JDK 소스 단순화)
public StringBuilder append(String str) {
	super.append(str);  // synchronized 없음
	return this;
}
```

`StringBuffer`에서 `synchronized`만 뺀 것이다.

```
스레드 A: append("hello")  ━━━━━
스레드 B: append(" world") ━━━━━  ← 동시 실행
결과: "h worldello" / "hellowor" / ArrayIndexOutOfBoundsException
```

### 실제로 깨지는 코드

```java
StringBuilder sb = new StringBuilder();

List<Thread> threads = new ArrayList<>();
for(
int i = 0;
i< 100;i++){
	threads.

add(new Thread(() ->{
	for(
int j = 0;
j< 100;j++){
	sb.

append("a");
        }
			}));
			}
			threads.

forEach(Thread::start);
for(
Thread t :threads)t.

join();

System.out.

println(sb.length());
// 기대값: 10000
// 실제: 9923, 9871, 또는 ArrayIndexOutOfBoundsException
```

`StringBuffer`로 바꾸면 항상 10000이 나온다.

### 그런데 성능 차이가 거의 없다

단일 스레드에서 append 1,000만 회를 돌려보면:

| 클래스             | 시간    |
|-----------------|-------|
| `StringBuilder` | ~8 ms |
| `StringBuffer`  | ~7 ms |

JVM이 똑똑하기 때문이다. 단일 스레드에서 `synchronized`를 감지하면 잠금을 사실상 제거한다.

- **Lock Elision**: JIT 컴파일러가 "이 객체는 한 스레드만 쓰네?"를 판단하면 `synchronized`를 아예 없앤다
- **Lock Coarsening**: 루프 안에서 반복 잠금/해제를 루프 바깥 한 번으로 합친다

그래도 `StringBuilder`를 쓰는 이유는 **"이 코드는 스레드 공유 안 한다"는 의도 표현**이다.

## 스레드 안전 vs 불안전 — 트레이드오프

| 항목      | 스레드 안전           | 스레드 불안전           |
|---------|------------------|-------------------|
| **정확성** | 항상 올바른 결과 보장     | 동시 접근 시 결과 보장 안 됨 |
| **성능**  | 잠금/대기 오버헤드 있음    | 오버헤드 없음           |
| **병렬성** | 잠금 구간에서 병렬 실행 불가 | 제약 없음             |
| **복잡도** | 데드락 등 추가 문제 가능성  | 구현이 단순            |

과도한 동기화도 문제다. 잠금을 너무 많이 걸면 멀티스레드인데 사실상 싱글스레드처럼 동작한다.

```
// 동기화 없이 — 4개 스레드가 동시에 읽기
스레드 A: 읽기 ━━
스레드 B: 읽기 ━━
스레드 C: 읽기 ━━
스레드 D: 읽기 ━━
총 시간: ━━

// 동기화 있으면 — 순차 실행
스레드 A: 읽기 ━━
스레드 B:        읽기 ━━
스레드 C:              읽기 ━━
스레드 D:                    읽기 ━━
총 시간: ━━━━━━━━━━━━━━━━━━━━
```

## Spring 싱글톤 빈과 스레드

### 객체는 1개, 스레드는 200개

```
                         ┌─────────────────────┐
요청 A → 스레드 1 ──────→│                     │
요청 B → 스레드 2 ──────→│  UserController (1개)│→ UserService (1개) → UserRepository (1개)
요청 C → 스레드 3 ──────→│                     │
                         └─────────────────────┘
```

톰캣 기본 스레드 풀이 200개다. 동시 요청 200개가 **같은 Controller, Service 객체**를 공유한다. 그런데 왜 안 터지는가?

### 지역 변수는 스레드마다 별도다

```java

@RestController
public class UserController {

	private final UserService userService;  // 공유 (하지만 상태 없음)

	@GetMapping("/users/{id}")
	public User getUser(@PathVariable Long id) {
		User user = userService.findById(id);  // user는 지역 변수
		return user;
	}
}
```

```
힙 (Heap) — 모든 스레드가 공유
┌──────────────────────────────┐
│  UserController 인스턴스 (1개) │
│  UserService 인스턴스 (1개)    │
└──────────────────────────────┘

스택 (Stack) — 스레드마다 별도
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 스레드 1 스택  │  │ 스레드 2 스택  │  │ 스레드 3 스택  │
│ id = 1       │  │ id = 42      │  │ id = 7       │
│ user = Kim   │  │ user = Lee   │  │ user = Park  │
└──────────────┘  └──────────────┘  └──────────────┘
```

- **힙(Heap)**: 객체가 살아있는 곳. 싱글톤 빈은 여기 1개만 있다. 모든 스레드가 공유한다.
- **스택(Stack)**: 메서드 호출마다 생기는 공간. 스레드마다 자기만의 스택이 있다. `id`, `user` 같은 지역 변수는 여기 저장된다.

스레드 1의 `id = 1`과 스레드 2의 `id = 42`는 절대 섞이지 않는다.

### 빈에 상태가 없으면 안전하다

일반적인 Spring 빈을 보면:

```java

@Service
public class UserService {

	private final UserRepository userRepository;  // 다른 빈 참조 (상태 없음)

	public User findById(Long id) {
		return userRepository.findById(id).orElseThrow();
	}
}
```

필드가 `userRepository` 하나인데, 이것도 다른 싱글톤 빈의 참조일 뿐이다. 요청마다 바뀌는 값(`id`, `user`)은 전부 지역 변수나 메서드 파라미터다.

```
빈 필드: 다른 빈 참조 → 안 바뀜 → 안전
지역 변수: 요청 데이터 → 스레드마다 별도 → 안전
```

### 위험해지는 순간 — 빈에 바뀌는 값을 두는 것

```java

@Service
public class UserService {

	private final UserRepository userRepository;
	private User lastAccessedUser;  // 이게 문제

	public User findById(Long id) {
		User user = userRepository.findById(id).orElseThrow();
		lastAccessedUser = user;   // 스레드 200개가 동시에 덮어쓴다
		return user;
	}

	public User getLastAccessed() {
		return lastAccessedUser;   // 누구 값이 나올지 모른다
	}
}
```

```
스레드 1: lastAccessedUser = Kim ──┐
스레드 2: lastAccessedUser = Lee ──┼── 동시에 같은 필드에 쓴다
스레드 3: lastAccessedUser = Park ─┘

getLastAccessed() → Kim? Lee? Park? 모른다
```

## REST API에서 실제로 만나는 케이스

### 1. 인메모리 캐시 — HashMap은 스레드 불안전

```java

@Service
public class ExchangeRateService {

	// 위험: HashMap은 동시 쓰기 시 무한루프에 빠질 수 있다
	private Map<String, BigDecimal> cache = new HashMap<>();

	public BigDecimal getRate(String currency) {
		if (cache.containsKey(currency)) {
			return cache.get(currency);
		}
		BigDecimal rate = fetchFromApi(currency);
		cache.put(currency, rate);
		return rate;
	}
}
```

```java
// 해결: ConcurrentHashMap
private Map<String, BigDecimal> cache = new ConcurrentHashMap<>();
```

| 선택지                 | 스레드 안전 | 성능    | 비고                  |
|---------------------|--------|-------|---------------------|
| `HashMap`           | X      | 가장 빠름 | 동시 쓰기 시 무한루프 위험     |
| `ConcurrentHashMap` | O      | 빠름    | 세그먼트별 잠금, 읽기는 잠금 없음 |
| `synchronizedMap`   | O      | 느림    | 전체 잠금, 읽기도 대기       |

### 2. 공유 리스트 — ArrayList는 스레드 불안전

```java

@Component
public class EventCollector {

	// 위험: ArrayList 동시 add → ArrayIndexOutOfBoundsException
	private List<Event> events = new ArrayList<>();

	public void add(Event e) {
		events.add(e);
	}
}
```

```java
// 해결
private final Queue<Event> events = new ConcurrentLinkedQueue<>();
```

### 3. 날짜 포맷 — SimpleDateFormat은 스레드 불안전

```java

@Service
public class ReportService {

	// 위험: 동시 호출 시 날짜가 뒤섞임
	private final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");

	public String formatDate(Date date) {
		return sdf.format(date);
	}
}
```

```java
// 해결: DateTimeFormatter는 불변 객체라 스레드 안전
private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
```

### 4. 지연 초기화

```java

@Service
public class ConfigService {

	private Map<String, String> config = null;

	public String getValue(String key) {
		if (config == null) {            // 스레드 A: null 확인
			config = loadFromDb();       // 스레드 B: 동시에 null 확인 → 2번 로드
		}
		return config.get(key);
	}
}
```

```java
// 해결: @PostConstruct로 빈 생성 시 1번만 실행
@PostConstruct
public void init() {
	this.config = loadFromDb();
}
```

## 스레드 불안전 코드의 증상

| 증상                                | 원인                         |
|-----------------------------------|----------------------------|
| 간헐적 데이터 오류                        | 동시 읽기/쓰기 경합                |
| `ConcurrentModificationException` | 순회 중 다른 스레드가 컬렉션 수정        |
| `ArrayIndexOutOfBoundsException`  | ArrayList 동시 add로 내부 배열 깨짐 |
| CPU 100%, 서버 멈춤                   | HashMap 동시 put으로 무한루프      |
| 재현 불가능한 버그                        | 타이밍에 따라 발생/미발생             |

가장 무서운 건 **재현이 안 된다는 것**이다. 개발 환경에서는 요청이 적어서 안 터지고, 운영에서 트래픽이 몰릴 때만 터진다.

## 원칙

```
1순위: 상태를 없앤다 (stateless)
  → 빈에 가변 필드를 두지 않으면 스레드 안전 고민 자체가 없다

2순위: 불변 객체를 쓴다
  → DateTimeFormatter, List.of(), unmodifiableMap

3순위: 스레드 안전한 자료구조를 쓴다
  → ConcurrentHashMap, AtomicInteger, ConcurrentLinkedQueue

4순위: 직접 동기화한다
  → synchronized, ReentrantLock (최후의 수단)
```

Spring REST API에서 1~2순위만 지켜도 대부분의 문제가 사라진다. 싱글톤이라서 위험한 게 아니라, **싱글톤 빈에 요청별 상태를 필드로 저장하면 위험한 것**이다.
