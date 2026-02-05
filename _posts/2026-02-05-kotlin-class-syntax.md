---
layout: post
title: Kotlin 클래스 문법 정리 - private constructor, by 위임, 다중 인터페이스
tags: [ kotlin ]
---

Kotlin의 클래스 관련 문법 중 자주 사용되지만 처음 보면 헷갈리는 3가지를 정리한다.

```kotlin
class RdsIamDataSource private constructor(
    private val hikariDataSource: HikariDataSource,
    // ...
) : DataSource by hikariDataSource, AutoCloseable {
    override fun close() {}
}
```

이 코드에서 사용된 문법:

1. `private constructor` - 생성자 접근 제한
2. `by hikariDataSource` - 인터페이스 위임
3. `, AutoCloseable` - 다중 인터페이스 구현

---

## 1. private constructor

### 기본 문법

```kotlin
class User private constructor(val name: String)
```

Primary Constructor를 `private`으로 선언하면 외부에서 직접 객체 생성이 불가능하다.

```kotlin
val user = User("Kim")  // 컴파일 에러!
```

### 왜 사용하나?

객체 생성을 통제하고 싶을 때 사용한다.

**패턴 1: 팩토리 메서드**

```kotlin
class User private constructor(val name: String, val age: Int) {
    companion object {
        fun create(name: String): User {
            require(name.isNotBlank()) { "이름은 필수입니다" }
            return User(name, 0)
        }

        fun createAdult(name: String): User {
            return User(name, 20)
        }
    }
}

// 사용
val user = User.create("Kim")
val adult = User.createAdult("Park")
```

**패턴 2: 싱글톤**

```kotlin
class DatabaseConnection private constructor() {
    companion object {
        private var instance: DatabaseConnection? = null

        fun getInstance(): DatabaseConnection {
            if (instance == null) {
                instance = DatabaseConnection()
            }
            return instance!!
        }
    }
}
```

> 참고: Kotlin에서 싱글톤은 `object`를 사용하는 게 더 간단하다.

**패턴 3: Builder 패턴**

```kotlin
class HttpRequest private constructor(
    val url: String,
    val method: String,
    val headers: Map<String, String>
) {
    class Builder {
        private var url: String = ""
        private var method: String = "GET"
        private var headers: MutableMap<String, String> = mutableMapOf()

        fun url(url: String) = apply { this.url = url }
        fun method(method: String) = apply { this.method = method }
        fun header(key: String, value: String) = apply { headers[key] = value }

        fun build(): HttpRequest {
            require(url.isNotBlank()) { "URL is required" }
            return HttpRequest(url, method, headers)
        }
    }

    companion object {
        fun builder() = Builder()
    }
}

// 사용
val request = HttpRequest.builder()
    .url("https://api.example.com")
    .method("POST")
    .header("Content-Type", "application/json")
    .build()
```

### 실무 예시

```kotlin
class ApiResponse<T> private constructor(
    val success: Boolean,
    val data: T?,
    val message: String?
) {
    companion object {
        fun <T> success(data: T) = ApiResponse(true, data, null)
        fun <T> error(message: String) = ApiResponse<T>(false, null, message)
    }
}

// 사용
fun getUser(): ApiResponse<User> {
    return try {
        val user = userRepository.findById(1)
        ApiResponse.success(user)
    } catch (e: Exception) {
        ApiResponse.error(e.message ?: "Unknown error")
    }
}
```

---

## 2. by 위임 (Delegation)

### 기본 문법

```kotlin
class MyList(private val list: List<String>) : List<String> by list
```

`by` 키워드는 인터페이스 구현을 다른 객체에 위임한다.

### 위임 없이 구현하면?

```kotlin
// 직접 구현 - 모든 메서드를 일일이 구현해야 함
class MyList(private val list: List<String>) : List<String> {
    override val size: Int get() = list.size
    override fun get(index: Int): String = list.get(index)
    override fun isEmpty(): Boolean = list.isEmpty()
    override fun iterator(): Iterator<String> = list.iterator()
    override fun listIterator(): ListIterator<String> = list.listIterator()
    override fun listIterator(index: Int): ListIterator<String> = list.listIterator(index)
    override fun subList(fromIndex: Int, toIndex: Int): List<String> = list.subList(fromIndex, toIndex)
    override fun lastIndexOf(element: String): Int = list.lastIndexOf(element)
    override fun indexOf(element: String): Int = list.indexOf(element)
    override fun containsAll(elements: Collection<String>): Boolean = list.containsAll(elements)
    override fun contains(element: String): Boolean = list.contains(element)
}
```

`List` 인터페이스의 모든 메서드를 구현해야 한다. 번거롭다.

### 위임으로 구현하면?

```kotlin
// by 위임 - 한 줄로 끝
class MyList(private val list: List<String>) : List<String> by list
```

`list` 객체가 `List` 인터페이스의 모든 메서드를 대신 처리한다.

### 일부 메서드만 오버라이드

```kotlin
class CountingList<T>(private val innerList: MutableList<T>) : MutableList<T> by innerList {
    var addCount = 0
        private set

    // add만 오버라이드, 나머지는 innerList가 처리
    override fun add(element: T): Boolean {
        addCount++
        return innerList.add(element)
    }

    override fun addAll(elements: Collection<T>): Boolean {
        addCount += elements.size
        return innerList.addAll(elements)
    }
}

// 사용
val list = CountingList(mutableListOf<String>())
list.add("A")
list.add("B")
list.addAll(listOf("C", "D"))
println(list.addCount)  // 4
println(list.size)      // 4 (innerList.size가 호출됨)
```

### DataSource 위임 예시

```kotlin
class LoggingDataSource(
    private val delegate: DataSource
) : DataSource by delegate {

    private val log = LoggerFactory.getLogger(javaClass)

    // getConnection만 오버라이드
    override fun getConnection(): Connection {
        log.debug("Getting connection...")
        val conn = delegate.connection
        log.debug("Connection acquired: {}", conn)
        return conn
    }

    override fun getConnection(username: String, password: String): Connection {
        log.debug("Getting connection with credentials...")
        return delegate.getConnection(username, password)
    }
}
```

`DataSource` 인터페이스의 다른 메서드들(`getLogWriter`, `setLogWriter`, `getLoginTimeout` 등)은 `delegate`가 처리한다.

### 위임 vs 상속

|       | 상속           | 위임                |
|-------|--------------|-------------------|
| 관계    | is-a         | has-a             |
| 결합도   | 강함           | 약함                |
| 유연성   | 낮음 (단일 상속)   | 높음 (여러 객체에 위임 가능) |
| 오버라이드 | 부모 메서드 직접 수정 | 위임 객체 교체 가능       |

```kotlin
// 상속 - Cat is an Animal
open class Animal {
    open fun sound() = "..."
}
class Cat : Animal() {
    override fun sound() = "Meow"
}

// 위임 - Robot has a SoundMaker
interface SoundMaker {
    fun sound(): String
}
class CatSound : SoundMaker {
    override fun sound() = "Meow"
}
class Robot(soundMaker: SoundMaker) : SoundMaker by soundMaker

// 런타임에 교체 가능
val catRobot = Robot(CatSound())
```

---

## 3. 다중 인터페이스 구현

### 기본 문법

```kotlin
class MyClass : InterfaceA, InterfaceB, InterfaceC {
    // 구현
}
```

Kotlin은 다중 상속은 불가능하지만, 여러 인터페이스를 구현할 수 있다.

### 예시: DataSource + AutoCloseable

```kotlin
class RdsIamDataSource(
    private val hikariDataSource: HikariDataSource
) : DataSource by hikariDataSource, AutoCloseable {

    // DataSource 메서드는 hikariDataSource가 처리
    // AutoCloseable의 close()만 직접 구현
    override fun close() {
        hikariDataSource.close()
        println("DataSource closed")
    }
}
```

분석:

- `DataSource by hikariDataSource` → DataSource 메서드 위임
- `, AutoCloseable` → AutoCloseable 인터페이스 추가 구현
- `override fun close()` → AutoCloseable.close() 직접 구현

### 예시: 여러 인터페이스 구현

```kotlin
interface Flyable {
    fun fly()
}

interface Swimmable {
    fun swim()
}

interface Walkable {
    fun walk()
}

// 오리는 날고, 수영하고, 걸을 수 있다
class Duck : Flyable, Swimmable, Walkable {
    override fun fly() = println("Flying")
    override fun swim() = println("Swimming")
    override fun walk() = println("Walking")
}

// 펭귄은 수영하고 걸을 수 있다
class Penguin : Swimmable, Walkable {
    override fun swim() = println("Swimming fast!")
    override fun walk() = println("Waddling")
}
```

### 같은 메서드 시그니처 충돌

두 인터페이스에 같은 메서드가 있으면?

```kotlin
interface A {
    fun greet() = println("Hello from A")
}

interface B {
    fun greet() = println("Hello from B")
}

class C : A, B {
    // 반드시 오버라이드해야 함
    override fun greet() {
        super<A>.greet()  // A의 greet 호출
        super<B>.greet()  // B의 greet 호출
        println("Hello from C")
    }
}

// 실행
C().greet()
// 출력:
// Hello from A
// Hello from B
// Hello from C
```

### 위임과 다중 인터페이스 조합

```kotlin
interface Logger {
    fun log(message: String)
}

interface Metrics {
    fun record(name: String, value: Double)
}

class ConsoleLogger : Logger {
    override fun log(message: String) = println("[LOG] $message")
}

class SimpleMetrics : Metrics {
    override fun record(name: String, value: Double) = println("[METRIC] $name = $value")
}

// 두 인터페이스를 모두 위임
class MonitoredService(
    logger: Logger,
    metrics: Metrics
) : Logger by logger, Metrics by metrics {

    fun doWork() {
        log("Starting work...")
        // 작업 수행
        record("work.duration", 100.0)
        log("Work completed")
    }
}

// 사용
val service = MonitoredService(ConsoleLogger(), SimpleMetrics())
service.doWork()
// [LOG] Starting work...
// [METRIC] work.duration = 100.0
// [LOG] Work completed
```

---

## 전체 예시

세 가지 문법을 모두 사용한 실무 예시:

```kotlin
class CachedRepository private constructor(
    private val delegate: Repository,
    private val cache: Cache
) : Repository by delegate, AutoCloseable {

    private val log = LoggerFactory.getLogger(javaClass)

    // Repository.findById만 오버라이드 (캐시 적용)
    override fun findById(id: Long): Entity? {
        // 캐시에서 먼저 조회
        cache.get(id)?.let { return it }

        // 없으면 delegate에서 조회
        val entity = delegate.findById(id)
        entity?.let { cache.put(id, it) }
        return entity
    }

    // AutoCloseable.close 구현
    override fun close() {
        log.info("Closing cached repository")
        cache.clear()
        if (delegate is AutoCloseable) {
            delegate.close()
        }
    }

    companion object {
        fun create(delegate: Repository): CachedRepository {
            return CachedRepository(delegate, InMemoryCache())
        }
    }
}
```

| 문법                    | 사용 위치            | 목적           |
|-----------------------|------------------|--------------|
| `private constructor` | 클래스 선언           | 팩토리 메서드로만 생성 |
| `by delegate`         | Repository 인터페이스 | 대부분의 메서드 위임  |
| `, AutoCloseable`     | 인터페이스 목록         | 리소스 정리 기능 추가 |

---

## 정리

| 문법                    | 용도       | 키워드                          |
|-----------------------|----------|------------------------------|
| `private constructor` | 객체 생성 제어 | 팩토리 패턴, Builder              |
| `by`                  | 인터페이스 위임 | Composition over Inheritance |
| `,` 다중 인터페이스          | 여러 역할 부여 | 관심사 분리                       |

Kotlin은 이런 문법들로 Java보다 간결하면서도 유연한 클래스 설계가 가능하다.
