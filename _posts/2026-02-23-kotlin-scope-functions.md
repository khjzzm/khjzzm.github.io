---
layout: post
title: Kotlin 스코프 함수 완전 정리 - let, run, apply, also, with
tags: [ kotlin ]
---

Java 개발자가 Kotlin을 처음 접하면 `let`, `apply`, `run` 같은 코드를 보고 당황한다.
이 글에서는 이런 함수들이 왜 나왔는지, 어떤 원리로 동작하는지 기초부터 정리한다.

## 왜 이런 함수가 나왔는가?

### Java 시절의 불편함

```java
// 객체 생성 후 설정할 때 반복이 많다
User user = new User();
user.

setName("Kim");
user.

setAge(30);
user.

setEmail("kim@test.com");
user.

setPhone("010-1234-5678");
// user. user. user. user. 계속 반복...
```

```java
// null 체크도 지저분하다
String name = getName();
if(name !=null){
String upper = name.toUpperCase();
    System.out.

println(upper);
}
```

코틀린 설계자들이 이런 **반복과 장황함**을 줄이고 싶었다.

---

## 이해를 위한 기초 개념

### 함수는 값이다

```kotlin
val greet: (String) -> String = { name -> "안녕 $name" }
greet("Kim")  // "안녕 Kim"
```

### 람다(Lambda) = 이름 없는 함수

```kotlin
// 일반 함수
fun double(x: Int): Int {
    return x * 2
}

// 같은 걸 람다로
val double = { x: Int -> x * 2 }
```

### 마지막 파라미터가 람다면 괄호 밖으로 뺄 수 있다

```kotlin
// 원래 문법
listOf(1, 2, 3).filter({ it > 1 })

// 코틀린 관례: 람다를 밖으로
listOf(1, 2, 3).filter { it > 1 }
```

### 확장 함수 (Extension Function)

기존 클래스에 함수를 **추가**할 수 있다.

```kotlin
fun String.shout(): String {
    return this.uppercase() + "!!!"
    // 여기서 this = 이 함수를 호출한 String 객체
}

"hello".shout()  // "HELLO!!!"
```

### 수신 객체가 있는 람다 (Lambda with Receiver)

확장 함수를 **람다 버전**으로 만든 것이다. 이것이 스코프 함수의 핵심 원리다.

```kotlin
// 일반 람다: 파라미터로 받음
val greet1: (String) -> String = { name -> "안녕 $name" }

// 수신 객체 람다: this로 접근
val greet2: String.() -> String = { "안녕 $this" }

// 호출
greet1("Kim")     // "안녕 Kim"
"Kim".greet2()    // "안녕 Kim"
```

---

## 직접 만들어보며 이해하기

### apply를 직접 구현

```kotlin
fun <T> T.myApply(block: T.() -> Unit): T {
    this.block()   // 자기 자신(this)에서 람다 실행
    return this    // 자기 자신 반환
}
```

분해하면:

- `T.myApply` → 아무 타입에나 붙일 수 있는 확장 함수
- `block: T.() -> Unit` → 수신 객체 람다 (안에서 this = T)
- `return this` → 자기 자신 반환

```kotlin
val user = User().myApply {
    // 여기서 this = User 객체
    name = "Kim"       // this.name = "Kim"
    age = 30           // this.age = 30
}
// user = 설정된 User 객체
```

### let을 직접 구현

```kotlin
fun <T, R> T.myLet(block: (T) -> R): R {
    return block(this)   // 자기 자신을 파라미터로 넘김
}
```

apply와 차이:

- `block: (T) -> R` → 일반 람다 (파라미터 `it`으로 받음)
- `return block(this)` → 람다 결과 반환 (자기 자신이 아님)

```kotlin
val length = "Hello".myLet {
    // 여기서 it = "Hello"
    println(it)
    it.length      // 이것이 반환됨
}
// length = 5
```

---

## 두 가지 축으로 정리

스코프 함수는 딱 **두 가지 선택**의 조합이다.

### 축 1: 객체를 어떻게 참조하나?

| this (수신 객체)     | it (파라미터)         |
|------------------|-------------------|
| 멤버에 바로 접근        | 명시적으로 접근          |
| `name = "Kim"`   | `it.name = "Kim"` |
| apply, run, with | let, also         |

### 축 2: 무엇을 반환하나?

| 객체 자신 반환    | 람다 결과 반환       |
|-------------|----------------|
| 체이닝에 유리     | 변환에 유리         |
| apply, also | let, run, with |

### 조합표

|              | 객체 자신 반환 | 람다 결과 반환  |
|--------------|----------|-----------|
| **this로 참조** | apply    | run, with |
| **it로 참조**   | also     | let       |

이 표에서 5개 함수가 전부 나온다.

---

## 전체 비교

| 함수      | 객체 참조  | 반환값   | 주 용도            |
|---------|--------|-------|-----------------|
| `let`   | `it`   | 람다 결과 | null 체크, 변환     |
| `run`   | `this` | 람다 결과 | 객체 설정 + 결과 계산   |
| `apply` | `this` | 객체 자신 | 객체 초기화/설정       |
| `also`  | `it`   | 객체 자신 | 부수 효과 (로깅 등)    |
| `with`  | `this` | 람다 결과 | 이미 있는 객체에 여러 작업 |

---

## 하나씩 실전 예제

### apply — "이 객체를 설정하고, 그 객체를 돌려줘"

```kotlin
// Before (Java 스타일)
val paint = Paint()
paint.color = Color.RED
paint.style = Paint.Style.FILL
paint.textSize = 16f

// After (apply)
val paint = Paint().apply {
    color = Color.RED
    style = Paint.Style.FILL
    textSize = 16f
}
```

### let — "null 아니면 이걸로 뭔가 해줘"

```kotlin
// Before
val order = getOrder()
if (order != null) {
    processOrder(order)
}

// After
getOrder()?.let { order ->
    processOrder(order)
}

// 변환에도 유용
val display = user.name?.let { "이름: $it" } ?: "이름 없음"
```

### run — "설정도 하고, 결과도 계산해줘"

```kotlin
val isAdult = user.run {
    println("검사 대상: $name")
    age >= 18    // 이것이 반환됨
}
```

### also — "원래 하던 거 하고, 추가로 이것도 해줘"

```kotlin
val sorted = numbers
    .also { println("정렬 전: $it") }
    .sorted()
    .also { println("정렬 후: $it") }
```

### with — "이 객체 가지고 여러 작업 할게"

```kotlin
// 유일하게 확장 함수가 아님: with(객체) { ... }
with(textView) {
    text = "Hello"
    textSize = 16f
    visibility = View.VISIBLE
}
```

---

## 체이닝 예제

```kotlin
fun createUser(email: String?): User? {
    return email?.let { validEmail ->          // null 체크
        User().apply {                         // 객체 초기화
            this.email = validEmail
            this.name = validEmail.split("@")[0]
        }.also {                               // 로깅
            println("유저 생성: ${it.name}")
        }
    }
}
```

---

## 흔한 실수와 주의점

### it 중첩 시 헷갈림

```kotlin
// 나쁜 예: 중첩되면 it이 뭔지 헷갈림
user?.let {
    it.orders?.let {
        it.first()  // 이 it은 orders임, user가 아님!
    }
}

// 좋은 예: 이름을 붙여주자
user?.let { currentUser ->
    currentUser.orders?.let { orderList ->
        orderList.first()
    }
}
```

### 과용하지 말 것

```kotlin
// 굳이 스코프 함수를 쓸 필요 없는 경우
name?.let { println(it) }

// 그냥 이게 더 낫다
if (name != null) println(name)
```

코드가 더 읽기 쉬워질 때만 사용하자.

### 선택 기준 요약

```
객체를 설정하고 그 객체가 필요? → apply
객체를 설정하고 다른 결과가 필요? → run
null 체크 후 변환? → let
로깅/디버깅 등 부수 효과? → also
이미 있는 객체에 여러 멤버 접근? → with
```
