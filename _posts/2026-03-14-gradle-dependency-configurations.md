---
layout: post
title: Gradle 의존성 설정 - api, implementation, compileOnly 차이
tags: [ gradle, kotlin ]
---

## 왜 알아야 하는가

Gradle에서 의존성을 추가할 때 `api`, `implementation`, `compileOnly` 중 어떤 걸 써야 하는지 헷갈린다.
단독 애플리케이션이면 사실 큰 차이가 없는데, **라이브러리를 만들어서 다른 프로젝트에 제공하는 순간** 이 차이가 중요해진다.

## 핵심 개념: 의존성 전이 (Transitive Dependency)

A 모듈이 B 라이브러리를 의존하고, 내 프로젝트가 A 모듈을 의존한다고 하자.

```
내 프로젝트 → A 모듈 → B 라이브러리
```

이때 **B 라이브러리가 내 프로젝트에서도 보이는가?** 이것이 `api`와 `implementation`의 차이다.

## api

```kotlin
dependencies {
    api("com.example:B:1.0")
}
```

A 모듈이 B를 `api`로 선언하면, A를 사용하는 내 프로젝트에서도 B의 클래스를 직접 사용할 수 있다.

```
내 프로젝트 → A 모듈 --api--> B 라이브러리
          ↑                         ↑
          └── B의 클래스를 직접 사용 가능 ──┘
```

**언제 쓰는가:** A 모듈의 public API(메서드 파라미터, 리턴 타입 등)에 B의 타입이 노출될 때.

실제 예시를 보면:

```kotlin
// commons/build.gradle.kts
dependencies {
    api(libs.kotlin.reflect)
    api(libs.jackson.module.kotlin)
}
```

commons 라이브러리가 `kotlin-reflect`와 `jackson-module-kotlin`을 `api`로 선언했다.
commons를 의존하는 downtime, card 등 모든 프로젝트에서 이 두 라이브러리를 별도 선언 없이 바로 쓸 수 있다.

```kotlin
// commons-web-client/build.gradle.kts
dependencies {
    api(project(":kotlin:commons"))
}
```

commons-web-client가 commons를 `api`로 선언했다.
downtime 프로젝트가 commons-web-client만 의존하면 commons의 클래스도 자동으로 사용 가능하다.

```
downtime → commons-web-client --api--> commons --api--> kotlin-reflect
                                                   └--> jackson-module-kotlin
```

전부 전이되어 downtime에서 다 쓸 수 있다.

## implementation

```kotlin
dependencies {
    implementation("com.example:B:1.0")
}
```

A 모듈이 B를 `implementation`으로 선언하면, B는 A 내부에서만 사용된다. 내 프로젝트에서는 B를 직접 import할 수 없다.

```
내 프로젝트 → A 모듈 --impl--> B 라이브러리
          ↑                         ↑
          └── B의 클래스를 사용 불가 ────┘
```

**언제 쓰는가:** A 모듈이 내부적으로만 B를 사용하고, public API에 B의 타입이 노출되지 않을 때.

```kotlin
// commons-web-client/build.gradle.kts
dependencies {
    implementation(libs.spring.boot.starter)
    implementation(libs.spring.web)
    implementation(libs.spring.security.oauth2.jose)
}
```

Spring 관련 의존성을 `implementation`으로 선언했다. 이유는:
- commons-web-client 내부에서 WebClient를 만들 때 Spring을 쓰지만
- 최종 사용처(downtime 등)는 어차피 자체적으로 Spring 의존성을 갖고 있으므로
- 굳이 전이시킬 필요가 없다

**`implementation`의 장점:**

1. **빌드 속도** - B가 변경되어도 A만 다시 컴파일하면 된다. `api`면 내 프로젝트까지 다시 컴파일해야 한다.
2. **의존성 충돌 방지** - 내 프로젝트에 불필요한 라이브러리가 classpath에 올라오지 않는다.
3. **캡슐화** - 내부 구현을 숨길 수 있다.

## compileOnly

```kotlin
dependencies {
    compileOnly("com.example:B:1.0")
}
```

**컴파일할 때만 classpath에 포함**되고, 런타임(실행 시)에는 포함되지 않는다.

```
컴파일 시: A 모듈 → B 라이브러리 (있음)
런타임 시: A 모듈 → B 라이브러리 (없음!)
```

**언제 쓰는가:**
1. 선택적 기능 - "사용처가 B를 가져오면 동작하고, 안 가져오면 해당 기능은 비활성"
2. 컴파일에만 필요한 경우 - 어노테이션 프로세서(Lombok 등)

```kotlin
// commons-web-server/build.gradle.kts
dependencies {
    // Spring Servlet (compileOnly - 사용처에서 Servlet/Reactive 선택)
    compileOnly(libs.spring.boot.starter.webmvc)

    // Spring Reactive (compileOnly - 사용처에서 Servlet/Reactive 선택)
    compileOnly(libs.spring.boot.starter.webflux)
    compileOnly(libs.kotlinx.coroutines.core)

    // jOOQ (optional - for JooqQueryBuilder)
    compileOnly(libs.jooq)

    // MyBatis (optional - for MybatisSqlProvider)
    compileOnly(libs.mybatis.spring.boot.starter)
}
```

commons-web-server는 Servlet(WebMVC)과 Reactive(WebFlux) 둘 다 지원하는 라이브러리다.
두 가지를 전부 `compileOnly`로 선언해서, **사용처가 둘 중 하나를 선택**하도록 했다.

- downtime 프로젝트는 WebFlux를 선택 → `spring-boot-starter-webflux`를 자체 의존성에 추가
- 다른 프로젝트가 WebMVC를 선택 → `spring-boot-starter-webmvc`를 자체 의존성에 추가

jOOQ와 MyBatis도 마찬가지다. commons-web-server에 JooqQueryBuilder와 MybatisSqlProvider가 둘 다 있지만, 사용처가 어떤 DB 접근 기술을 쓰느냐에 따라 필요한 것만 가져간다.

## runtimeOnly

```kotlin
dependencies {
    runtimeOnly("org.postgresql:postgresql")
}
```

`compileOnly`의 정반대다. **컴파일 시에는 classpath에 없고, 런타임에만 포함**된다.

```
컴파일 시: A 모듈 → B 라이브러리 (없음!)
런타임 시: A 모듈 → B 라이브러리 (있음)
```

**언제 쓰는가:** 코드에서 직접 import하지 않지만 실행할 때 필요한 것들.

대표적인 예시:
- **JDBC 드라이버** - 코드에서는 `DataSource` 인터페이스만 쓰고, 실제 구현체(`PostgreSQL`, `MySQL`)는 런타임에 로드
- **로깅 구현체** - 코드에서는 `SLF4J` 인터페이스만 쓰고, 실제 구현(`Logback`)은 런타임에 바인딩
- **Spring DevTools** - 개발 시 자동 재시작 등의 기능을 제공하지만 코드에서 직접 참조하지 않음

```kotlin
// bank-scheduler/build.gradle
dependencies {
    runtimeOnly 'org.springframework.boot:spring-boot-devtools'
}
```

컴파일 시 classpath에 없으므로, 실수로 DevTools 클래스를 직접 import하는 것을 방지할 수 있다.

## testImplementation

```kotlin
dependencies {
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.mockito.kotlin:mockito-kotlin")
}
```

**테스트 코드(`src/test`)에서만 사용**되는 의존성. 메인 코드(`src/main`)에서는 사용 불가하고, 빌드된 jar에도 포함되지 않는다.

**언제 쓰는가:** 테스트 프레임워크, 목(mock) 라이브러리, 테스트 유틸리티 등.

```kotlin
// commons-web-server/build.gradle.kts
dependencies {
    // 메인 코드에서는 compileOnly (사용처가 선택)
    compileOnly(libs.spring.boot.starter.webflux)
    compileOnly(libs.jooq)

    // 테스트에서는 testImplementation (테스트 실행에 필요하므로)
    testImplementation(libs.spring.boot.starter.webflux)
    testImplementation(libs.jooq)
}
```

commons-web-server에서 주목할 패턴이 있다. WebFlux와 jOOQ를 메인에서는 `compileOnly`로, 테스트에서는 `testImplementation`으로 선언했다.
메인 코드는 "사용처가 알아서 가져와라"지만, 테스트는 직접 실행해야 하므로 런타임에 있어야 한다.

`test` 접두어가 붙은 변형은 다른 설정에도 있다:
- `testImplementation` - 테스트 컴파일 + 런타임
- `testCompileOnly` - 테스트 컴파일만
- `testRuntimeOnly` - 테스트 런타임만

## annotationProcessor

```kotlin
dependencies {
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
}
```

**Java 어노테이션 프로세서**를 위한 설정이다. 컴파일 시 어노테이션을 읽어서 코드를 자동 생성한다.

Lombok이 대표적인 예시로, `@Getter`, `@Builder` 등의 어노테이션을 처리해서 getter/builder 코드를 컴파일 타임에 생성한다. 런타임에는 필요 없으므로 `compileOnly`와 함께 사용한다.

```kotlin
// bank-scheduler/build.gradle (Java 프로젝트)
dependencies {
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    testCompileOnly 'org.projectlombok:lombok'
    testAnnotationProcessor 'org.projectlombok:lombok'
}
```

Kotlin 프로젝트에서는 `kapt` 또는 `ksp`를 대신 사용한다. Kotlin은 자체적으로 data class, default parameter 등을 지원하므로 Lombok이 필요 없다.

## 비교 요약

```
                      컴파일 시    런타임 시    사용처에 전이
api                   O           O           O
implementation        O           O           X
compileOnly           O           X           X
runtimeOnly           X           O           X
testImplementation    O (test)    O (test)    X
annotationProcessor   O (APT)    X           X
```

## 판단 기준

의존성을 추가할 때 이렇게 질문하면 된다:

**1단계: 런타임에 필요한가?**
- 아니오 → `compileOnly` (Lombok, 선택적 기능)

**2단계: 내 public API에 이 타입이 노출되는가?**
- 예 → `api` (메서드 파라미터/리턴 타입에 사용되는 경우)
- 아니오 → `implementation` (내부에서만 사용)

**헷갈리면 `implementation`을 쓰자.** 나중에 사용처에서 "이 타입을 직접 못 쓰겠다"는 컴파일 에러가 나면 그때 `api`로 바꾸면 된다. 반대로 `api`를 남용하면 의존성이 과도하게 퍼져서 돌이키기 어렵다.

## 참고: 일반 애플리케이션에서는?

라이브러리가 아닌 최종 실행 애플리케이션(downtime-api 같은)에서는 `api`와 `implementation`의 차이가 거의 없다. 어차피 이 프로젝트를 의존하는 다른 프로젝트가 없기 때문이다. 그래서 애플리케이션 모듈에서는 보통 `implementation`만 사용한다.
