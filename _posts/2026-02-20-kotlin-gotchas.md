---
layout: post
title: Kotlin 헷갈리기 쉬운 문법 정리
tags: [ kotlin ]
---

Java 개발자가 Kotlin을 쓸 때 "알고 있다고 생각하지만 실수하기 쉬운" 문법들을 정리했다.
기초 문법이나 클래스 구조가 아니라, 실전에서 버그로 이어지는 함정 위주로 다룬다.

## `==` vs `===` (동등성 vs 동일성)

Java에서 `==`는 참조 비교다. Kotlin에서는 **정반대**다.

| 연산자   | Kotlin        | Java  |
|-------|---------------|-------|
| `==`  | `equals()` 호출 | 참조 비교 |
| `===` | 참조 비교         | (없음)  |

```kotlin
val a = "hello"
val b = String("hello".toCharArray())

println(a == b)   // true  (equals)
println(a === b)  // false (참조 다름)
```

Java 습관대로 `==`를 참조 비교로 착각하면 로직이 반대로 동작한다.

### 배열 비교 주의

배열은 `==`로 내용 비교가 안 된다. `Array`의 `equals()`가 참조 비교이기 때문이다.

```kotlin
val arr1 = arrayOf(1, 2, 3)
val arr2 = arrayOf(1, 2, 3)

println(arr1 == arr2)              // false
println(arr1.contentEquals(arr2))  // true
```

## `val`은 불변이 아니다

`val`은 **재할당 불가(read-only)**이지 **불변(immutable)**이 아니다.

```kotlin
val list = mutableListOf(1, 2, 3)
// list = mutableListOf(4, 5, 6)  // 컴파일 에러 (재할당 불가)
list.add(4)                        // OK (내용 변경 가능)
println(list) // [1, 2, 3, 4]
```

진짜 불변을 원하면 타입 자체를 불변으로 잡아야 한다.

```kotlin
val list: List<Int> = mutableListOf(1, 2, 3)
// list.add(4)  // 컴파일 에러 — List에는 add가 없다
```

`List`와 `MutableList`를 구분해서 써야 한다. `val` + `MutableList`는 "변수는 못 바꾸지만 내용은 바뀌는" 애매한 상태가 된다.

## data class 함정

### 주 생성자 밖의 프로퍼티는 무시된다

`equals()`, `hashCode()`, `toString()`, `copy()` 모두 **주 생성자 파라미터만** 사용한다.

```kotlin
data class User(val name: String, val email: String) {
    var loginCount: Int = 0  // equals/hashCode에 포함 안 됨
}

val a = User("Kim", "kim@test.com").apply { loginCount = 5 }
val b = User("Kim", "kim@test.com").apply { loginCount = 0 }

println(a == b)  // true — loginCount는 비교 대상이 아님
```

`HashMap` 키로 쓸 때 의도치 않은 충돌이 발생할 수 있다.

### `copy()`는 얕은 복사

```kotlin
data class Team(val name: String, val members: MutableList<String>)

val team1 = Team("A", mutableListOf("Kim", "Lee"))
val team2 = team1.copy()

team2.members.add("Park")
println(team1.members) // [Kim, Lee, Park] — team1도 변경됨
```

`copy()`는 프로퍼티의 참조만 복사한다. 내부 컬렉션까지 복사하려면 직접 깊은 복사를 해야 한다.

### 상속 시 `equals()` 깨짐

```kotlin
open class Base(val x: Int) {
    override fun equals(other: Any?) = other is Base && other.x == x
    override fun hashCode() = x
}

data class Derived(val y: Int) : Base(y)

val base = Base(1)
val derived = Derived(1)

println(base == derived)   // true
println(derived == base)   // false — 대칭성 위반
```

`data class`는 상속과 잘 어울리지 않는다. 상속이 필요하면 일반 클래스를 쓰는 편이 안전하다.

## 람다의 return

### non-local return

`return`은 가장 가까운 `fun`을 빠져나간다. 람다 안의 `return`이 **함수 전체를 종료**시킨다.

```kotlin
fun findFirst(list: List<Int>): Int? {
    list.forEach {
        if (it > 3) return it  // findFirst 함수 자체를 빠져나감
    }
    return null
}
```

이건 `forEach`가 `inline` 함수라서 가능하다. non-inline 람다에서는 `return`을 쓸 수 없다.

### `return@label`로 람다만 빠져나가기

```kotlin
fun printFiltered(list: List<Int>) {
    list.forEach {
        if (it < 0) return@forEach  // 이 원소만 건너뜀 (continue와 유사)
        println(it)
    }
    println("완료")  // 항상 실행됨
}

printFiltered(listOf(1, -2, 3))
// 1
// 3
// 완료
```

| 코드                   | 동작                      |
|----------------------|-------------------------|
| `return`             | 바깥 함수를 빠져나감 (non-local) |
| `return@forEach`     | 현재 람다만 빠져나감 (continue)  |
| `return@label value` | 람다에서 값을 반환              |

### `forEach` vs `for`

```kotlin
// for문 — return이 함수를 종료 (당연)
fun withFor(list: List<Int>) {
    for (item in list) {
        if (item > 3) return
    }
}

// forEach — return이 함수를 종료 (혼란 포인트)
fun withForEach(list: List<Int>) {
    list.forEach {
        if (it > 3) return  // 이것도 함수 종료
    }
}
```

둘 다 같은 동작이지만, `forEach`에서의 `return`은 "람다 안인데 왜 함수가 끝나지?"라는 혼란을 준다.

## `it` 섀도잉

중첩 람다에서 바깥 `it`이 안쪽 `it`에 가려진다.

```kotlin
listOf(1, 2, 3).forEach {
    // 여기서 it = 1, 2, 3
    listOf("a", "b").forEach {
        // 여기서 it = "a", "b" — 바깥 it에 접근 불가
        println(it)
    }
}
```

명시적 파라미터명을 쓰면 해결된다.

```kotlin
listOf(1, 2, 3).forEach { number ->
    listOf("a", "b").forEach { letter ->
        println("$number$letter")
    }
}
```

IDE가 경고를 주지만 무시하기 쉽다. 중첩 람다에서는 항상 이름을 붙이는 습관을 들이자.

## `lateinit` vs `by lazy`

둘 다 "나중에 초기화"지만 용도가 완전히 다르다.

|         | `lateinit`                             | `by lazy`                                   |
|---------|----------------------------------------|---------------------------------------------|
| 변수 종류   | `var` 전용                               | `val` 전용                                    |
| 초기화 시점  | 직접 할당                                  | 최초 접근 시 자동                                  |
| 미초기화 접근 | `UninitializedPropertyAccessException` | 발생 안 함 (항상 초기화됨)                            |
| 타입 제한   | primitive 불가 (Int, Boolean 등)          | 제한 없음                                       |
| 스레드 안전  | 보장 안 됨                                 | 기본 보장 (`LazyThreadSafetyMode.SYNCHRONIZED`) |

```kotlin
// lateinit — DI나 setUp에서 나중에 주입
class UserService {
    lateinit var repository: UserRepository

    fun init(repo: UserRepository) {
        repository = repo
    }
}

// by lazy — 비용이 큰 초기화를 미루기
class Config {
    val dbConnection: Connection by lazy {
        println("연결 생성")
        DriverManager.getConnection("jdbc:...")
    }
}
```

### 선택 기준

- 값이 변할 수 있고, 외부에서 주입받는다 → `lateinit`
- 값이 고정이고, 최초 사용 시 한 번만 계산한다 → `by lazy`
- `lateinit` 초기화 여부 확인: `::property.isInitialized`

## Nothing 타입

`Nothing`은 "절대 값을 반환하지 않는다"는 뜻이다. 모든 타입의 하위 타입이다.

```kotlin
fun fail(message: String): Nothing {
    throw IllegalStateException(message)
}
```

### `throw`의 타입이 `Nothing`

```kotlin
val value: String = data ?: throw IllegalArgumentException("null")
// throw는 Nothing 타입이라 String과 호환됨
```

### `TODO()`

`TODO()`의 시그니처는 `fun TODO(reason: String): Nothing`이다.
컴파일은 통과하지만 실행 시 `NotImplementedError`를 던진다.

```kotlin
fun calculateTax(): Double = TODO("세금 계산 로직 미구현")
// 반환 타입이 Double이지만 Nothing이 하위 타입이라 컴파일 OK
```

### Elvis + Nothing 조합

```kotlin
val name: String = user.name ?: return       // return도 Nothing
val email: String = user.email ?: throw Exception("no email")
```

`return`, `throw` 모두 `Nothing` 타입이라 Elvis 연산자 우측에 자연스럽게 들어간다.

## 확장 함수의 함정

### 멤버 함수가 항상 이긴다

멤버 함수와 동일한 시그니처의 확장 함수를 만들면, **멤버가 항상 호출**된다.

```kotlin
class Greeter {
    fun greet() = "멤버"
}

fun Greeter.greet() = "확장"

println(Greeter().greet()) // "멤버"
```

컴파일러 경고가 뜨지만 에러는 아니다. 라이브러리 업데이트로 멤버 함수가 추가되면 기존 확장 함수가 무시될 수 있다.

### 정적 디스패치 — 런타임 다형성 없음

확장 함수는 **컴파일 타임의 선언 타입**으로 결정된다.

```kotlin
open class Animal
class Dog : Animal()

fun Animal.sound() = "..."
fun Dog.sound() = "멍멍"

fun printSound(animal: Animal) {
    println(animal.sound())
}

printSound(Dog()) // "..." — Dog가 아니라 Animal의 확장 함수가 호출됨
```

확장 함수는 내부적으로 `static` 메서드로 컴파일되기 때문에 런타임 타입을 모른다. 다형성이 필요하면 멤버 함수나 인터페이스를 써야 한다.

## Sequence vs List

### List 체이닝 — 즉시 평가

```kotlin
val result = listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    .filter { it % 2 == 0 }   // 중간 리스트 생성: [2, 4, 6, 8, 10]
    .map { it * it }           // 중간 리스트 생성: [4, 16, 36, 64, 100]
    .take(3)                   // 최종 리스트: [4, 16, 36]
```

3개만 필요한데 10개 전부를 filter하고 map한다.

### Sequence — 지연 평가

```kotlin
val result = listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    .asSequence()
    .filter { it % 2 == 0 }
    .map { it * it }
    .take(3)
    .toList()  // 터미널 연산에서 실행
```

원소 단위로 파이프라인을 실행한다. 3개를 찾으면 나머지는 처리하지 않는다.

### 처리 순서 차이

```kotlin
// List: 연산 단위 (수평)
// filter 전체 → map 전체 → take
// 1→2→3→4→5→6→7→8→9→10 (filter)
// 2→4→6→8→10 (map)
// 4→16→36 (take)

// Sequence: 원소 단위 (수직)
// 1: filter(skip) →
// 2: filter(pass) → map → take(1)
// 3: filter(skip) →
// 4: filter(pass) → map → take(2)
// 5: filter(skip) →
// 6: filter(pass) → map → take(3) → 종료
```

### 언제 Sequence를 쓸까

| 상황                             | 선택         |
|--------------------------------|------------|
| 컬렉션 크기가 작다 (수십 개)              | `List`     |
| 체이닝 연산이 1~2개                   | `List`     |
| 대량 데이터 + 여러 단계 체이닝             | `Sequence` |
| `first()`, `take()` 등 조기 종료 가능 | `Sequence` |

소규모 컬렉션에서는 Sequence의 오버헤드가 더 클 수 있다.

## 타입 소거와 reified

### 제네릭 타입은 런타임에 사라진다

JVM의 타입 소거(type erasure) 때문에 런타임에 제네릭 타입 정보가 없다.

```kotlin
fun <T> checkType(list: List<Any>) {
    // if (list is List<String>) { }  // 컴파일 에러: Cannot check for erased type
    if (list is List<*>) {
    }          // OK — 와일드카드만 가능
}
```

### `inline` + `reified`로 해결

`inline` 함수에서 `reified` 키워드를 쓰면 런타임에 타입 정보를 유지할 수 있다.

```kotlin
inline fun <reified T> isType(value: Any): Boolean {
    return value is T  // reified라서 런타임 타입 체크 가능
}

println(isType<String>("hello"))  // true
println(isType<Int>("hello"))     // false
```

### 실전 활용

```kotlin
// Jackson ObjectMapper 래핑
inline fun <reified T> ObjectMapper.readValue(json: String): T {
    return readValue(json, T::class.java)
}

// 사용
val user: User = mapper.readValue(jsonString)  // 타입 추론으로 깔끔
```

```kotlin
// 리스트에서 특정 타입만 필터링
inline fun <reified T> List<Any>.filterByType(): List<T> {
    return filterIsInstance<T>()
}

val mixed = listOf(1, "a", 2, "b", 3)
val strings: List<String> = mixed.filterByType()  // ["a", "b"]
```

Java에서는 `Class<T>`를 파라미터로 넘겨야 했던 패턴이 `reified`로 깔끔해진다.
