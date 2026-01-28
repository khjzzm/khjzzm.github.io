---
layout: post
title: Lambda - 이름의 어원부터 Kotlin에서의 활용까지
tags: [ Lambda, java, kotlin ]
---

## Lambda란?

Lambda(람다)는 익명 함수(Anonymous Function)를 표현하는 방식이다. 함수를 변수처럼 다루고, 다른 함수의 인자로 전달하거나 반환값으로 사용할 수 있게 해준다.

## 이름의 어원

### 그리스 문자 λ (Lambda)

람다(λ)는 그리스 알파벳의 11번째 문자다. 프로그래밍에서 람다라는 이름이 사용된 것은 수학자 **알론조 처치(Alonzo Church)** 가 1930년대에 개발한 **람다 대수(Lambda Calculus)** 에서 유래한다.

### 람다 대수 (Lambda Calculus)

람다 대수는 함수의 정의와 적용을 형식화한 수학적 체계다. 처치가 함수를 표기할 때 그리스 문자 λ를 사용했는데, 그 이유에 대해서는 여러 설이 있다:

1. **타이핑 제약설**: 당시 타자기로 기존 수학 표기법의 기호를 입력하기 어려워 λ를 선택했다는 설
2. **수학적 전통설**: 기존 수학에서 사용하지 않는 기호를 선택하여 혼동을 피하려 했다는 설

람다 대수에서 함수는 다음과 같이 표현된다:

```
λx.x + 1
```

이는 "x를 받아서 x + 1을 반환하는 함수"를 의미한다.

### 프로그래밍 언어로의 전파

1958년, **LISP** 언어가 람다 대수의 개념을 프로그래밍에 도입했다. 이후 Scheme, ML, Haskell 등 함수형 언어들이 이 개념을 계승했고, 현대의 Java, Kotlin, Python, JavaScript 등 대부분의 언어가 람다 표현식을 지원하게 되었다.

## Kotlin에서의 Lambda

Kotlin은 함수형 프로그래밍을 강력하게 지원하며, 람다 표현식이 언어의 핵심 기능 중 하나다.

### 기본 문법

```kotlin
// 람다 표현식의 기본 형태
{ 매개변수 -> 본문 }

// 예시: 두 수를 더하는 람다
val sum = { a: Int, b: Int -> a + b }
println(sum(3, 5)) // 8
```

### 타입 추론과 람다

람다는 타입 추론과 함께 사용될 때 진가를 발휘한다.

타입 추론이 없다면 모든 타입을 명시해야 한다:

```kotlin
// 타입 추론 없이 - 장황함
val doubled: List<Int> = numbers.map({ x: Int -> x * 2 })
```

타입 추론 덕분에 간결하게 작성할 수 있다:

```kotlin
// 타입 추론 덕분에 - 간결함
val doubled = numbers.map { it * 2 }
```

컴파일러가 `numbers`가 `List<Int>`인 걸 알기 때문에, 람다의 매개변수 `it`이 `Int`라는 것을 자동으로 추론한다. 타입 추론은 람다의 필수 개념은 아니지만, **람다를 실용적으로 사용할 수 있게 해주는 핵심 편의 기능**이다.

### it 키워드

`it`은 Kotlin이 제공하는 암시적 매개변수 이름이다. 람다의 매개변수가 **딱 하나**일 때, 매개변수 선언을 생략하고 `it`으로 참조할 수 있다.

#### 기본 사용법

```kotlin
val names = listOf("Alice", "Bob", "Charlie")

// 명시적 매개변수
names.filter { name -> name.length > 3 }

// it 사용 - 같은 동작
names.filter { it.length > 3 } // ["Alice", "Charlie"]
```

#### 다양한 예제

```kotlin
val numbers = listOf(1, 2, 3, 4, 5)

// 변환
numbers.map { it * 2 }              // [2, 4, 6, 8, 10]
numbers.map { it.toString() }       // ["1", "2", "3", "4", "5"]

// 필터링
numbers.filter { it > 3 }           // [4, 5]
numbers.filter { it % 2 == 0 }      // [2, 4]

// 조건 검사
numbers.any { it > 4 }              // true
numbers.all { it < 10 }             // true

// null 처리
val name: String? = "Kotlin"
name?.let { println(it.uppercase()) } // "KOTLIN"
```

#### 언제 it을 사용하면 안 되는가?

**1. 매개변수가 2개 이상일 때** - it 사용 불가

```kotlin
val map = mapOf("a" to 1, "b" to 2)

// 매개변수가 2개이므로 명시해야 함
map.forEach { key, value -> println("$key = $value") }
```

**2. 중첩 람다에서** - 어떤 it인지 헷갈림

```kotlin
listOf("Hello", "World").forEach {
    it.toList().forEach {
        // 여기서 it은 Char인데, 바깥 it(String)과 혼동됨
        println(it)
    }
}

// 명시적 이름 사용이 좋음
listOf("Hello", "World").forEach { word ->
    word.toList().forEach { char ->
        println(char)
    }
}
```

**3. 람다가 길어질 때** - 가독성 저하

```kotlin
// it이 무엇인지 추적하기 어려움
users.filter {
    it.age >= 18 && it.status == "active" && it.country == "KR"
}.map {
    "${it.name} (${it.email})"
}

// 명시적 이름이 더 읽기 좋음
users.filter { user ->
    user.age >= 18 && user.status == "active" && user.country == "KR"
}.map { user ->
    "${user.name} (${user.email})"
}
```

### 고차 함수와 람다

고차 함수(Higher-Order Function)는 함수를 매개변수로 받거나 반환하는 함수다.

#### 일반 함수 vs 고차 함수

**일반 함수**는 데이터(숫자, 문자열 등)를 받는다:

```kotlin
fun add(a: Int, b: Int): Int {
    return a + b
}

add(3, 5) // 숫자를 전달
```

**고차 함수**는 "함수 자체"를 데이터처럼 전달받는다:

```kotlin
fun calculate(a: Int, b: Int, operation: (Int, Int) -> Int): Int {
    return operation(a, b)
}
```

여기서 `operation`은 숫자가 아니라 **Int 두 개를 받아서 Int를 반환** 하는 함수다.

#### 비유로 이해하기

계산기를 생각해 보자. `calculate` 함수는 "무슨 연산을 할지" 모른다. 호출하는 쪽에서 연산 방법(함수)을 넘겨준다:

```kotlin
// "어떤 연산을 할지"를 밖에서 주입
calculate(10, 5, { a, b -> a + b })  // 더하기 전달 → 15
calculate(10, 5, { a, b -> a - b })  // 빼기 전달 → 5
calculate(10, 5, { a, b -> a * b })  // 곱하기 전달 → 50
```

#### 왜 유용한가?

```kotlin
val numbers = listOf(1, 2, 3, 4, 5)

// filter는 "어떤 조건으로 필터링할지"를 람다로 받음
numbers.filter { it > 3 }      // [4, 5]
numbers.filter { it % 2 == 0 } // [2, 4]

// map은 "어떻게 변환할지"를 람다로 받음
numbers.map { it * 2 }         // [2, 4, 6, 8, 10]
numbers.map { "숫자: $it" }    // ["숫자: 1", "숫자: 2", ...]
```

`filter`와 `map`은 "반복하면서 처리한다"는 로직만 갖고 있고, **구체적인 조건/변환 방법은 우리가 람다로 전달**한다. 이게 고차 함수의 핵심이다. 공통 로직은 함수가 담당하고, 세부 동작은 호출할 때 주입하는 방식이다.

### Trailing Lambda

Trailing Lambda는 함수 호출 시 **마지막 매개변수가 람다인 경우, 괄호 밖으로 빼낼 수 있는** Kotlin 문법이다.

#### 왜 필요한가?

람다를 괄호 안에 넣으면 코드가 복잡해 보인다:

```kotlin
// 괄호 안에 람다 - 읽기 불편
button.setOnClickListener({ view -> handleClick(view) })
```

Trailing Lambda를 사용하면 마치 언어의 문법처럼 자연스럽게 보인다:

```kotlin
// Trailing Lambda - 훨씬 깔끔
button.setOnClickListener { view -> handleClick(view) }
```

#### 문법 변환 단계

```kotlin
val numbers = listOf(1, 2, 3, 4, 5)

// 1단계: 기본 형태 - 람다가 괄호 안에 있음
numbers.fold(0, { acc, n -> acc + n })

// 2단계: Trailing Lambda - 마지막 람다를 괄호 밖으로
numbers.fold(0) { acc, n -> acc + n }

// 3단계: 람다가 유일한 인자라면 괄호 생략
numbers.forEach { println(it) }
```

#### 다양한 예제

```kotlin
// 컬렉션 연산
listOf(1, 2, 3).map { it * 2 }
listOf(1, 2, 3).filter { it > 1 }
listOf(1, 2, 3).reduce { acc, n -> acc + n }

// 스코프 함수
val result = StringBuilder().apply {
    append("Hello")
    append(" ")
    append("World")
}.toString()

// 조건부 실행
val name: String? = "Kotlin"
name?.let {
    println("Name is $it")
}

// 리소스 관리
File("test.txt").bufferedReader().use { reader ->
    println(reader.readText())
}
```

#### DSL 구축

Trailing Lambda 덕분에 Kotlin에서는 자연스러운 DSL(Domain Specific Language)을 만들 수 있다:

```kotlin
// HTML DSL 예시
html {
    head {
        title("My Page")
    }
    body {
        div {
            p("Hello, World!")
        }
    }
}

// Gradle Kotlin DSL
dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib")
    testImplementation("junit:junit:4.13")
}
```

이게 가능한 이유는 `html`, `head`, `body` 등이 전부 **람다를 받는 고차 함수**이기 때문이다.

#### 함수 타입 표기법

먼저 함수 타입 표기법을 알아보자:

```kotlin
() -> Unit
```

- `()` : 매개변수 없음
- `->` : 반환
- `Unit` : 반환값 없음 (Java의 `void`와 유사)

다른 함수 타입 예시:

- `(Int) -> Int` : Int를 받아서 Int 반환
- `(String, Int) -> Boolean` : String과 Int를 받아서 Boolean 반환
- `() -> String` : 매개변수 없이 String 반환

#### 수신 객체 지정 람다 (Lambda with Receiver)

그런데 여기서 의문이 생긴다. `html { }` 블록 안에서 `head { }`를 어떻게 호출할 수 있을까?

```kotlin
html {
    head { ... }  // head는 어디서 온 함수?
}
```

이건 **수신 객체 지정 람다**로 가능하다. 먼저 타입 표기법부터 이해해보자.

#### 람다 타입 표기법 이해하기

**일반 함수 타입**

```kotlin
(Int) -> String
```

- `(Int)` : Int를 받아서
- `-> String` : String을 반환

```kotlin
val func: (Int) -> String = { num -> "숫자: $num" }
func(5)  // "숫자: 5"
```

**매개변수 없는 함수 타입**

```kotlin
() -> String
```

- `()` : 아무것도 안 받고
- `-> String` : String을 반환

```kotlin
val func: () -> String = { "Hello" }
func()  // "Hello"
```

**수신 객체 지정 람다 타입**

```kotlin
String.() -> Unit
```

- `String.` : String이 this가 되고
- `()` : 추가 매개변수 없음
- `-> Unit` : 반환값 없음

```kotlin
val func: String.() -> Unit = { println(this.uppercase()) }

// 호출 방법 1: 확장 함수처럼
"hello".func()  // "HELLO"

// 호출 방법 2: 첫 번째 인자로 전달
func("hello")   // "HELLO"
```

**일반 람다 vs 수신 객체 지정 람다**

```kotlin
// 일반 람다: String을 "받는다"
val normal: (String) -> Unit = { str -> println(str) }
normal("hello")  // str로 접근

// 수신 객체 지정 람다: String이 "내가 된다"
val receiver: String.() -> Unit = { println(this) }
"hello".receiver()  // this로 접근
```

**T.()의 의미**

```kotlin
fun <T> T.apply(block: T.() -> Unit): T
```

`T.()`는 "T 타입이 this가 되는 람다"라는 의미다. T는 제네릭이라 어떤 타입이든 될 수 있다:

```kotlin
// T = StringBuilder일 때
StringBuilder.() -> Unit

// T = Person일 때
Person.() -> Unit
```

**block은 뭐야?**

`block`은 그냥 **매개변수 이름**이다. 다른 이름으로 바꿔도 된다.

```kotlin
// 일반 함수와 비교
fun add(a: Int, b: Int): Int
//      ↑이름  ↑타입

// 고차 함수
fun <T> T.apply(block: T.() -> Unit): T
//              ↑이름  ↑타입
```

- `block` : 매개변수 이름 (관례적으로 람다는 block, action 등으로 부름)
- `T.() -> Unit` : 매개변수 타입 (수신 객체 지정 람다)

```kotlin
// 전부 같은 의미 - 이름만 다름
fun <T> T.apply(block: T.() -> Unit): T
fun <T> T.apply(action: T.() -> Unit): T
fun <T> T.apply(lambda: T.() -> Unit): T
fun <T> T.apply(f: T.() -> Unit): T
```

`block`이라는 이름은 "코드 블록을 받는다"는 의미로 관례적으로 많이 쓴다.

#### 수신 객체 지정 람다 동작 원리

이제 수신 객체 지정 람다가 어떻게 동작하는지 단계별로 이해해보자.

**1단계: 클래스의 this**

```kotlin
class StringBuilder {
    fun append(text: String) {
        ...
    }

    fun example() {
        this.append("Hello")  // this = 자기 자신
        append("Hello")       // this 생략 가능
    }
}
```

클래스 안에서는 `this`가 자기 자신이라 `this.append()` 대신 `append()`로 쓸 수 있다.

**2단계: 일반 람다**

```kotlin
val action: () -> Unit = {
    // 여기서 this는 바깥 클래스 (또는 없음)
    // StringBuilder의 append()를 쓰려면?
    val sb = StringBuilder()
    sb.append("Hello")  // sb를 통해서만 접근 가능
}
```

**3단계: 수신 객체 지정 람다**

```kotlin
val action: StringBuilder.() -> Unit = {
    // 여기서 this = StringBuilder
    // 마치 StringBuilder 클래스 안에 있는 것처럼!
    this.append("Hello")
    append("World")  // this 생략 가능
}

// 사용
val sb = StringBuilder()
sb.action()  // sb가 this로 들어감
```

`StringBuilder.()`는 **"이 람다를 실행할 때 StringBuilder 인스턴스를 this로 제공하겠다"** 는 의미다.

**비유로 이해하기**

```kotlin
// 일반 람다 = 손님
// "저기요, StringBuilder씨, append 좀 해주세요"
val guest: () -> Unit = {
    stringBuilder.append("Hello")
}

// 수신 객체 지정 람다 = StringBuilder가 된 나
// "내가 StringBuilder니까 그냥 append 하면 됨"
val me: StringBuilder.() -> Unit = {
    append("Hello")
}
```

#### 코틀린 표준 함수에서의 활용

이제 실제 코틀린 표준 라이브러리에서 수신 객체 지정 람다가 어떻게 사용되는지 보자.

**apply의 실제 정의**

```kotlin
// 코틀린 표준 라이브러리의 apply 정의
public inline fun <T> T.apply(block: T.() -> Unit): T {
    block()
    return this
}
```

- `T.apply` : T 타입의 확장 함수
- `block: T.() -> Unit` : **수신 객체 지정 람다**를 매개변수로 받음
- `block()` : 람다 실행 (this = T)
- `return this` : 자기 자신 반환

아까 배운 `StringBuilder.() -> Unit`과 같은 형태다! 그래서 apply 블록 안에서 `this`가 해당 객체가 되는 것이다.

**apply 사용 예시** - 객체 초기화

```kotlin
val person = Person().apply {
    // this = Person (apply의 T가 Person이므로)
    name = "Kim"        // this.name = "Kim"
    age = 25            // this.age = 25
}
```

`Person().apply { }`에서 `apply`가 `Person.() -> Unit` 람다를 받으므로, 블록 안에서 `this`가 `Person`이 된다.

**with의 실제 정의**

```kotlin
public inline fun <T, R> with(receiver: T, block: T.() -> R): R {
    return receiver.block()
}
```

- `receiver: T` : 수신 객체를 첫 번째 매개변수로 받음
- `block: T.() -> R` : 수신 객체 지정 람다
- `receiver.block()` : receiver가 this로 바인딩되어 람다 실행
- 반환값: 람다의 마지막 표현식 (R)

**with 사용 예시** - 객체의 여러 메서드 호출

```kotlin
val result = with(StringBuilder()) {
    // this = StringBuilder
    append("Hello")
    append(" ")
    append("World")
    toString()  // 마지막 줄이 반환값
}
// result = "Hello World"
```

**run의 실제 정의**

```kotlin
public inline fun <T, R> T.run(block: T.() -> R): R {
    return block()
}
```

- `T.run` : T의 확장 함수
- `block: T.() -> R` : 수신 객체 지정 람다
- apply와 비슷하지만, 람다 결과를 반환

**run 사용 예시** - 객체 컨텍스트에서 연산 수행

```kotlin
val length = "Hello".run {
    // this = "Hello" (String)
    println(this)
    length  // this.length 반환
}
// length = 5
```

**let의 실제 정의** - 일반 람다 사용

```kotlin
public inline fun <T, R> T.let(block: (T) -> R): R {
    return block(this)
}
```

- `block: (T) -> R` : **일반 람다** (수신 객체 지정 람다 아님!)
- `block(this)` : this를 매개변수로 전달
- 그래서 람다 안에서 `it`으로 접근

**also의 실제 정의** - 일반 람다 사용

```kotlin
public inline fun <T> T.also(block: (T) -> Unit): T {
    block(this)
    return this
}
```

- `block: (T) -> Unit` : **일반 람다**
- `return this` : 자기 자신 반환 (apply와 동일)
- 차이점: apply는 `this`, also는 `it`

**let, also 사용 예시**

```kotlin
// let - it으로 접근
"Hello".let {
    println(it)      // this가 아니라 it!
    it.length        // 반환값
}

// also - it으로 접근, 자기 자신 반환
val str = "Hello".also {
    println(it)      // this가 아니라 it!
}
// str = "Hello"
```

**왜 let, also는 일반 람다를 사용할까?**

수신 객체 지정 람다(`T.() -> R`)는 `this`가 바뀌기 때문에, 바깥 클래스의 `this`에 접근하기 어렵다. 일반 람다(`(T) -> R`)는 `it`을 사용하므로 바깥 `this`와 충돌하지 않는다.

```kotlin
class MyClass {
    val name = "MyClass"

    fun example() {
        "Hello".apply {
            // this = "Hello"
            // name은? this.name? MyClass.name?
            println(this@MyClass.name)  // 명시적으로 지정해야 함
        }

        "Hello".let {
            // this = MyClass (바뀌지 않음)
            println(name)  // MyClass.name에 자연스럽게 접근
            println(it)    // "Hello"는 it으로 접근
        }
    }
}

**스코프 함수 비교**

| 함수  | 람다 타입         | 참조 방식 | 반환값      |
|-------|------------------ - |---------- - |------------ - |
| apply | `T.() -> Unit`    | this      | 객체 자신   |
| with  | `T.() -> R`       | this      | 람다 결과   |
| run   | `T.() -> R`       | this      | 람다 결과   |
| let   | `(T) -> R`        | it        | 람다 결과   |
| also  | `(T) -> Unit`     | it        | 객체 자신   |

#### DSL의 실제 구조

```kotlin
class HtmlBuilder {
    fun head(block: HeadBuilder.() -> Unit) {
        ...
    }
    fun body(block: BodyBuilder.() -> Unit) {
        ...
    }
}

fun html(block: HtmlBuilder.() -> Unit): Html {
    val builder = HtmlBuilder()
    builder.block()  // builder가 this로 바인딩됨
    return builder.build()
}
```

이제 DSL 코드가 어떻게 동작하는지 보자:

```kotlin
html {
    // 여기서 this = HtmlBuilder
    // HtmlBuilder의 메서드를 직접 호출 가능
    head { ... }  // this.head { ... } 와 같음
    body { ... }  // this.body { ... } 와 같음
}
```

즉, `html { }` 블록 안에서 `this`가 `HtmlBuilder`이기 때문에, `HtmlBuilder`의 메서드인 `head()`와 `body()`를 마치 내 것처럼 호출할 수 있는 것이다.

만약 Trailing Lambda가 없었다면? 괄호 지옥이 펼쳐진다:

```kotlin
// Trailing Lambda 없이 - 괄호 지옥
html({
    head({
        title("My Page")
    })
    body({
        div({
            p("Hello, World!")
        })
    })
})

dependencies({
    implementation("org.jetbrains.kotlin:kotlin-stdlib")
    testImplementation("junit:junit:4.13")
})
```

이처럼 Trailing Lambda는 단순한 문법 편의가 아니라, **코드를 마치 새로운 언어처럼** 읽히게 만드는 Kotlin의 핵심 기능이다.

## 수신 객체 지정 람다 깊이 이해하기

수신 객체 지정 람다는 Kotlin의 강력한 기능 중 하나다. 다양한 예제를 통해 깊이 이해해보자.

### 가장 쉬운 예제부터

확장 함수와 비교하면 이해가 쉽다:

```kotlin
// 일반 함수
fun normalGreet(name: String) {
    println("Hello, $name!")
}

// 확장 함수 - this가 String
fun String.extensionGreet() {
    println("Hello, $this!")
}

// 호출
normalGreet("Kim")      // Hello, Kim!
"Kim".extensionGreet()  // Hello, Kim!
```

수신 객체 지정 람다도 같은 원리다. 람다 안에서 `this`가 특정 객체가 된다.

### 직접 만들어보기

나만의 스코프 함수를 만들어보자:

```kotlin
fun <T> T.myApply(block: T.() -> Unit): T {
    block()  // this.block() - 수신 객체에서 람다 실행
    return this
}

// 사용
val list = mutableListOf<Int>().myApply {
    add(1)      // this.add(1)
    add(2)      // this.add(2)
    add(3)      // this.add(3)
}
// list = [1, 2, 3]
```

`T.() -> Unit`에서 `T.`가 수신 객체를 지정한다. 람다 안에서 `this`가 `T` 타입이 된다.

### 설정 빌더 패턴

실무에서 자주 사용하는 패턴이다:

```kotlin
class ServerConfig {
    var host: String = "localhost"
    var port: Int = 8080
    var timeout: Int = 30
}

fun server(block: ServerConfig.() -> Unit): ServerConfig {
    val config = ServerConfig()
    config.block()  // config가 this로 바인딩
    return config
}

// 사용 - 마치 설정 파일처럼!
val config = server {
    host = "api.example.com"
    port = 443
    timeout = 60
}
```

`server { }` 블록 안에서 `this`가 `ServerConfig`이므로, `host`, `port`, `timeout`에 직접 접근할 수 있다.

### 테스트 코드 스타일

테스트 프레임워크에서도 많이 활용된다:

```kotlin
class Person(var name: String, var age: Int)

fun Person.shouldBe(block: Person.() -> Unit) {
    block()
}

// 테스트에서 사용
val person = Person("Kim", 25)
person.shouldBe {
    assert(name == "Kim")   // this.name
    assert(age == 25)       // this.age
}
```

### 중첩 수신 객체

계층 구조를 자연스럽게 표현할 수 있다:

```kotlin
class Menu {
    val items = mutableListOf<String>()
    fun item(name: String) {
        items.add(name)
    }
}

class Restaurant {
    var name: String = ""
    var menu: Menu? = null

    fun menu(block: Menu.() -> Unit) {
        menu = Menu().apply(block)
    }
}

fun restaurant(block: Restaurant.() -> Unit): Restaurant {
    return Restaurant().apply(block)
}

// 사용 - 자연스러운 계층 구조
val myRestaurant = restaurant {
    name = "맛있는 식당"        // this = Restaurant
    menu {                      // this = Menu
        item("김치찌개")
        item("된장찌개")
        item("비빔밥")
    }
}
```

### 왜 중요한가?

| 일반 람다               | 수신 객체 지정 람다    |
|---------------------|----------------|
| 객체를 매번 명시해야 함       | `this`로 직접 접근  |
| `it.name`, `it.age` | `name`, `age`  |
| 코드가 장황함             | 간결하고 읽기 좋음     |
| 단순 데이터 처리           | DSL, 빌더 패턴에 적합 |

수신 객체 지정 람다를 이해하면 Kotlin의 표준 라이브러리(apply, with, run)와 각종 DSL(Gradle, Ktor, Compose 등)이 어떻게 동작하는지 알 수 있다.

### 실무 예제: DSL 스타일 빌더 패턴 만들기

지금까지 배운 내용을 모두 활용해서, 실무에서 사용하는 DSL 스타일 빌더 패턴을 단계별로 만들어보자.

#### 1단계: 일반적인 빌더 패턴

Java 스타일의 전통적인 빌더 패턴이다:

```kotlin
class SessionSearchDto private constructor(
    val brand: String?,
    val memberSeq: Int?,
    val doIp: String?
) {
    class Builder {
        private var brand: String? = null
        private var memberSeq: Int? = null
        private var doIp: String? = null

        fun brand(brand: String) = apply { this.brand = brand }
        fun memberSeq(memberSeq: Int) = apply { this.memberSeq = memberSeq }
        fun doIp(doIp: String) = apply { this.doIp = doIp }

        fun build() = SessionSearchDto(brand, memberSeq, doIp)
    }
}

// 사용
val dto = SessionSearchDto.Builder()
    .brand("NIKE")
    .memberSeq(123)
    .doIp("192.168.0.1")
    .build()
```

동작은 하지만, `Builder()`와 `.build()`를 매번 써야 해서 장황하다.

#### 2단계: companion object 추가

`Builder()`를 직접 호출하지 않도록 `companion object`에 팩토리 함수를 만든다:

```kotlin
class SessionSearchDto private constructor(...) {
    class Builder { ... }

    companion object {
        fun builder(): Builder = Builder()
    }
}

// 사용
val dto = SessionSearchDto.builder()
    .brand("NIKE")
    .memberSeq(123)
    .build()
```

조금 나아졌지만, 여전히 체이닝이 길다.

#### 3단계: 수신 객체 지정 람다 적용

`Builder.() -> Unit`을 받아서 DSL처럼 사용할 수 있게 만든다:

```kotlin
class SessionSearchDto private constructor(...) {
    class Builder { ... }

    companion object {
        fun create(block: Builder.() -> Unit): SessionSearchDto {
            val builder = Builder()
            builder.block()  // builder가 this로 바인딩
            return builder.build()
        }
    }
}

// 사용
val dto = SessionSearchDto.create {
    // this = Builder
    brand("NIKE")
    memberSeq(123)
    doIp("192.168.0.1")
}
```

훨씬 깔끔해졌다! 하지만 `create`라는 함수명이 거슬린다.

#### 4단계: operator invoke로 함수명 제거

`operator fun invoke`를 사용하면 객체를 함수처럼 호출할 수 있다:

```kotlin
class SessionSearchDto private constructor(...) {
    class Builder { ... }

    companion object {
        operator fun invoke(block: Builder.() -> Unit): SessionSearchDto {
            return Builder().apply(block).build()
        }
    }
}

// 사용 - 마치 생성자처럼!
val dto = SessionSearchDto {
    brand("NIKE")
    memberSeq(123)
    doIp("192.168.0.1")
}
```

`SessionSearchDto { }`로 호출할 수 있게 되었다!

#### block은 실제로 뭘까?

```kotlin
val dto = SessionSearchDto {
    brand("NIKE")
    memberSeq(123)
    doIp("192.168.0.1")
}
```

여기서 `{ ... }` 전체가 `block`이다.

```kotlin
operator fun invoke(block: Builder.() -> Unit): SessionSearchDto
//                  ↑이름  ↑타입
```

| 코드                   | 설명                                                       |
|----------------------|----------------------------------------------------------|
| `block`              | `{ brand("NIKE"); memberSeq(123); doIp("192.168.0.1") }` |
| `Builder.() -> Unit` | 이 람다 안에서 this = Builder                                  |

즉, 우리가 작성한 람다 블록이 `block` 매개변수로 전달되고, `Builder.() -> Unit` 타입이므로 람다 안에서 `this`가 `Builder`가 된다. 그래서 `brand()`, `memberSeq()`, `doIp()`가 `Builder`의 메서드로 호출되는 것이다.

#### 잠깐, Unit인데 SessionSearchDto를 반환한다고?

```kotlin
operator fun invoke(block: Builder.() -> Unit): SessionSearchDto
```

여기서 반환 타입이 두 개 보인다. 헷갈릴 수 있는데, 이건 **서로 다른 것**이다:

```kotlin
operator fun invoke(block: Builder.() -> Unit): SessionSearchDto
//                         ↑ 람다의 반환 타입    ↑ 함수의 반환 타입
```

| 구분                   | 타입        | 설명                             |
|----------------------|-----------|--------------------------------|
| `Builder.() -> Unit` | 람다의 반환 타입 | 람다 블록은 반환값 없음                  |
| `: SessionSearchDto` | 함수의 반환 타입 | invoke 함수는 SessionSearchDto 반환 |

**코드로 보면**

```kotlin
operator fun invoke(block: Builder.() -> Unit): SessionSearchDto {
    return Builder().apply(block).build()
    //                            ↑ 이게 SessionSearchDto 반환
}

// 사용
val dto = SessionSearchDto {
    brand("NIKE")       // ┐
    memberSeq(123)      // ├─ 이 블록(block)은 Unit 반환 (반환값 없음)
    doIp("192.168.0.1") // ┘
}
// dto는 SessionSearchDto (invoke 함수의 반환값)
```

**흐름 정리**

```
SessionSearchDto {        // invoke 함수 호출
    brand("NIKE")         // block 실행 (Unit 반환 - 값 없음)
    memberSeq(123)
}
        ↓
Builder().apply(block).build() 실행
        ↓
SessionSearchDto 반환
```

람다 안에서는 값을 반환할 필요 없고(`Unit`), invoke 함수는 최종적으로 `SessionSearchDto`를 만들어서 반환하는 것이다.

#### Unit은 왜 Unit일까?

Unit의 이름은 수학/타입 이론에서 왔다.

**Unit = 단위 집합 (Unit Set)**

수학에서 "단위 집합"은 **원소가 딱 하나만 있는 집합**을 의미한다.

```kotlin
// Unit 타입의 값은 딱 하나: Unit 자체
val a: Unit = Unit
val b: Unit = Unit
// a와 b는 같은 값 (선택지가 하나뿐이므로)
```

**Java의 void vs Kotlin의 Unit**

```java
// Java - void는 "값이 없음"
void doSomething() {
}
```

```kotlin
// Kotlin - Unit은 "값이 하나뿐인 타입"
fun doSomething(): Unit {}
```

| 구분     | void (Java) | Unit (Kotlin)      |
|--------|-------------|--------------------|
| 의미     | 값이 없음       | 값이 하나뿐             |
| 타입인가?  | 아니오 (키워드)   | 예 (실제 타입)          |
| 반환 가능? | 불가능         | 가능 (`return Unit`) |
| 제네릭 사용 | 불가능         | 가능 (`List<Unit>`)  |

**왜 이게 중요한가?**

```kotlin
// Java에서는 불가능
// List<void> - 컴파일 에러!

// Kotlin에서는 가능
val list: List<Unit> = listOf(Unit, Unit, Unit)
```

```kotlin
// 고차 함수에서 일관성 유지
fun <T> doAndReturn(action: () -> T): T = action()

// void였다면 별도 처리 필요
// Unit이므로 그냥 동작
doAndReturn { println("Hello") }  // Unit 반환
doAndReturn { 42 }                 // Int 반환
```

Unit은 "반환값이 없다"가 아니라 **"반환값이 하나뿐이라 의미가 없다"** 는 뜻이다. 값이 하나뿐이면 그 값을 알려줘도 새로운 정보가 없기 때문이다.

#### Unit 대신 반환값이 필요하다면?

만약 람다에서 값을 반환받고 싶다면?

```kotlin
// 반환값 없음
Builder.() -> Unit

// 반환값 있음
Builder.() -> String
Builder.() -> Int
Builder.() -> R  // 제네릭
```

**예시: 람다에서 값 반환**

```kotlin
// 반환값이 있는 버전
operator fun invoke(block: Builder.() -> String): String {
    return Builder().block()  // 람다의 반환값을 그대로 반환
}

// 사용
val result = SessionSearchDto {
    brand("NIKE")
    memberSeq(123)
    "설정 완료: ${getBrand()}"  // 마지막 표현식이 반환값
}
// result = "설정 완료: NIKE"
```

**apply vs run 비교**

표준 라이브러리에서 이 차이를 볼 수 있다:

```kotlin
// apply: Unit → 자기 자신 반환
public inline fun <T> T.apply(block: T.() -> Unit): T

// run: R → 람다 결과 반환
public inline fun <T, R> T.run(block: T.() -> R): R
```

```kotlin
// apply - 마지막 표현식 무시, 객체 자신 반환
val sb1 = StringBuilder().apply {
    append("Hello")
    "이건 무시됨"
}
// sb1 = StringBuilder (객체 자신)

// run - 마지막 표현식이 반환값
val sb2 = StringBuilder().run {
    append("Hello")
    "이게 반환됨"
}
// sb2 = "이게 반환됨" (String)
```

| 타입             | 마지막 표현식 | 반환값              |
|----------------|---------|------------------|
| `T.() -> Unit` | 무시됨     | 없음 (보통 자기 자신 반환) |
| `T.() -> R`    | 반환됨     | 람다의 마지막 표현식      |

#### 최종 코드 분석

```kotlin
companion object {
    operator fun invoke(block: Builder.() -> Unit): SessionSearchDto =
        Builder().apply(block).build()
}
```

한 줄에 담긴 기술들:

| 요소                    | 설명                               |
|-----------------------|----------------------------------|
| `companion object`    | 클래스 레벨에서 호출 가능                   |
| `operator fun invoke` | `SessionSearchDto { }` 형태로 호출 가능 |
| `Builder.() -> Unit`  | 람다 안에서 `this = Builder`          |
| `Builder()`           | 새 빌더 인스턴스 생성                     |
| `.apply(block)`       | 빌더에서 람다 실행                       |
| `.build()`            | 최종 객체 생성                         |

#### 실행 흐름

```kotlin
val dto = SessionSearchDto {
    brand("NIKE")
    memberSeq(123)
}
```

1. `SessionSearchDto { ... }` → `companion object`의 `invoke` 호출
2. `Builder()` → 새 빌더 생성
3. `.apply { ... }` → 빌더가 `this`로 바인딩되어 람다 실행
4. `brand("NIKE")` → `this.brand("NIKE")` 실행
5. `memberSeq(123)` → `this.memberSeq(123)` 실행
6. `.build()` → 최종 `SessionSearchDto` 객체 반환

이것이 Kotlin에서 DSL 스타일 빌더를 만드는 정석적인 방법이다. 수신 객체 지정 람다, apply, operator invoke가 조합되어 자연스럽고 읽기 쉬운 API를 만들어낸다.

### 람다에서의 return

람다 내부에서 `return`을 사용할 때는 주의가 필요하다. 일반 함수와 다르게 동작하기 때문이다.

#### 문제 상황

```kotlin
fun processNumbers(numbers: List<Int>) {
    numbers.forEach {
        if (it < 0) return  // 이 return은 어디로?
        println(it)
    }
    println("완료")  // 실행될까?
}

processNumbers(listOf(1, 2, -3, 4, 5))
// 출력: 1, 2
// "완료"는 출력되지 않음!
```

`return`이 람다만 종료한 게 아니라, `processNumbers` 함수 전체를 종료해버렸다.

#### Non-local Return (비지역 반환)

람다 안의 `return`은 **람다를 포함한 바깥 함수**를 종료한다. 이를 "non-local return"이라고 한다.

```kotlin
fun findFirstNegative(numbers: List<Int>): Int? {
    numbers.forEach {
        if (it < 0) return it  // findFirstNegative 함수에서 반환
    }
    return null
}

val result = findFirstNegative(listOf(1, 2, -3, 4))
// result = -3
```

이게 가능한 이유는 `forEach`가 **inline 함수**이기 때문이다.

#### inline 함수와 return

```kotlin
// forEach는 inline 함수
public inline fun <T> Iterable<T>.forEach(action: (T) -> Unit) {
    for (element in this) action(element)
}
```

`inline` 함수는 컴파일 시 호출 지점에 코드가 복사된다. 그래서 람다 안의 `return`이 바깥 함수를 종료할 수 있다.

```kotlin
// 컴파일 후 실제 동작 (개념적)
fun findFirstNegative(numbers: List<Int>): Int? {
    for (element in numbers) {
        if (element < 0) return element  // 그냥 return처럼 동작
    }
    return null
}
```

#### Local Return (지역 반환) - 레이블 사용

람다만 종료하고 싶다면 **레이블**을 사용한다.

```kotlin
fun processNumbers(numbers: List<Int>) {
    numbers.forEach {
        if (it < 0) return@forEach  // 람다만 종료 (continue처럼)
        println(it)
    }
    println("완료")
}

processNumbers(listOf(1, 2, -3, 4, 5))
// 출력: 1, 2, 4, 5, 완료
```

`return@forEach`는 "forEach 람다에서 반환"이라는 의미다. 마치 반복문의 `continue`처럼 동작한다.

#### 커스텀 레이블

직접 레이블 이름을 지정할 수도 있다.

```kotlin
fun processNumbers(numbers: List<Int>) {
    numbers.forEach myLoop@{
        if (it < 0) return@myLoop
        println(it)
    }
    println("완료")
}
```

#### 익명 함수는 다르다

익명 함수에서 `return`은 **익명 함수 자체**에서만 반환한다.

```kotlin
fun processNumbers(numbers: List<Int>) {
    numbers.forEach(fun(num) {
        if (num < 0) return  // 익명 함수에서만 반환 (레이블 필요 없음)
        println(num)
    })
    println("완료")
}

processNumbers(listOf(1, 2, -3, 4, 5))
// 출력: 1, 2, 4, 5, 완료
```

#### non-inline 함수에서는 return 불가

`inline`이 아닌 함수에 전달된 람다에서는 non-local return을 사용할 수 없다.

```kotlin
// inline이 아닌 고차 함수
fun myForEach(list: List<Int>, action: (Int) -> Unit) {
    for (item in list) action(item)
}

fun test() {
    myForEach(listOf(1, 2, 3)) {
        if (it == 2) return  // 컴파일 에러!
    }
}
```

왜냐하면 non-inline 람다는 별도의 객체로 저장되어 나중에 실행될 수 있기 때문에, 바깥 함수가 이미 종료된 후일 수 있다.

#### 정리

| 상황                | return 동작            | 예시                           |
|-------------------|----------------------|------------------------------|
| inline 함수의 람다     | 바깥 함수 종료 (non-local) | `forEach { return }`         |
| 레이블 return        | 람다만 종료 (local)       | `forEach { return@forEach }` |
| 익명 함수             | 익명 함수만 종료            | `forEach(fun(x) { return })` |
| non-inline 함수의 람다 | return 사용 불가         | 컴파일 에러                       |

### 클로저 (Closure)

람다는 자신이 정의된 스코프의 변수를 캡처할 수 있다:

```kotlin
fun makeCounter(): () -> Int {
    var count = 0
    return { ++count }
}

val counter = makeCounter()
println(counter()) // 1
println(counter()) // 2
println(counter()) // 3
```

### 실용적인 예제

#### 컬렉션 처리

```kotlin
data class Person(val name: String, val age: Int)

val people = listOf(
    Person("Alice", 29),
    Person("Bob", 31),
    Person("Charlie", 25)
)

// 30세 이상인 사람의 이름을 대문자로
val result = people
    .filter { it.age >= 30 }
    .map { it.name.uppercase() }
    .sorted()
// ["BOB"]
```

#### 스코프 함수와 람다

```kotlin
data class User(var name: String, var email: String)

// apply: 객체 초기화
val user = User("", "").apply {
    name = "John"
    email = "john@example.com"
}

// let: null 안전 호출
val length = user.name?.let { it.length }

// run: 객체 컨텍스트에서 연산 수행
val info = user.run { "$name ($email)" }
```

## 람다 vs 익명 함수

Kotlin은 익명 함수도 지원한다. 람다와의 차이점:

```kotlin
// 람다
val lambda = { x: Int -> x * 2 }

// 익명 함수
val anonymousFun = fun(x: Int): Int { return x * 2 }
```

| 구분     | 람다         | 익명 함수       |
|--------|------------|-------------|
| return | 바깥 함수에서 반환 | 익명 함수에서만 반환 |
| 반환 타입  | 추론만 가능     | 명시 가능       |
| 문법     | 간결함        | 명확함         |

## 정리

### 람다는 표현식이다

람다는 특별한 키워드가 아니다. **함수를 값으로 직접 표현한 것**이다.

```kotlin
// 문자열 리터럴 - 문자열 값을 직접 표현
"Hello"

// 숫자 리터럴 - 숫자 값을 직접 표현
42

// 람다 (함수 리터럴) - 함수 값을 직접 표현
{ x: Int -> x * 2 }
```

람다는 **함수 리터럴(Function Literal)**이라고도 부른다. `lambda`라는 키워드가 있는 게 아니라, 그냥 `{ }`가 람다다.

### 람다는 값이다

```kotlin
// 변수에 저장
val double = { x: Int -> x * 2 }

// 다른 변수에 할당
val anotherDouble = double

// 함수에 전달
listOf(1, 2, 3).map(double)

// 함수에서 반환
fun getOperation(): (Int) -> Int {
    return { x -> x * 2 }
}
```

### 마무리

람다는 1930년대 수학에서 시작하여 현대 프로그래밍의 핵심 개념이 되었다. Kotlin에서 람다는 컬렉션 처리, 비동기 프로그래밍, DSL 구현 등 다양한 곳에서 코드를 간결하고 표현력 있게 만들어준다.

이 글에서 다룬 핵심 개념들:

| 개념              | 설명                             |
|-----------------|--------------------------------|
| 람다              | 함수를 값으로 표현한 것 `{ x -> x * 2 }` |
| 고차 함수           | 함수를 받거나 반환하는 함수                |
| it 키워드          | 매개변수가 하나일 때 암시적 이름             |
| Trailing Lambda | 마지막 람다를 괄호 밖으로 빼는 문법           |
| 수신 객체 지정 람다     | `T.() -> R` - 람다 안에서 this가 T   |
| 스코프 함수          | apply, with, run, let, also    |

수신 객체 지정 람다를 이해하면 Kotlin의 표준 라이브러리와 각종 DSL(Gradle, Ktor, Compose 등)이 어떻게 동작하는지 알 수 있다. `{ }` 한 쌍의 중괄호가 이 모든 것의 시작이다.
