---
layout: post
title: "[Part 2] Gradle Plugin 개발 - Extension, Task, 배포까지"
tags: [ gradle, kotlin ]
---

> **CI/CD 학습 시리즈**
> - [Part 1: Jenkins Pipeline + Groovy 기초](/2026-01-15-cicd-1-jenkins-pipeline-groovy)
> - **Part 2: Gradle Plugin 개발** (현재 글)
> - [Part 3: App-Builder Plugin 실전 분석](/2026-01-15-cicd-3-app-builder-plugin)

## 목차

1. [Gradle 개요](#1-gradle-개요)
2. [Gradle 플러그인이란?](#2-gradle-플러그인이란)
3. [핵심 개념](#3-핵심-개념)
4. [플러그인 개발 기초](#4-플러그인-개발-기초)
5. [Extension (DSL 설정)](#5-extension-dsl-설정)
6. [Task 개발](#6-task-개발)
7. [플러그인 배포](#7-플러그인-배포)
8. [실전 예제: app-builder-plugin](#8-실전-예제-app-builder-plugin) *(Part 3 참조)*
9. [실습: 간단한 플러그인 만들기](#9-실습-간단한-플러그인-만들기)
10. [핵심 요약](#10-핵심-요약)
11. [참고 자료](#11-참고-자료)

---

## 1. Gradle 개요

### 1.1 Gradle이란?

**Gradle**은 JVM 기반의 **빌드 자동화 도구**입니다.

> **쉽게 말해서...**
>
> 코드를 작성하고 나면 "컴파일 → 테스트 → 패키징 → 배포" 같은 작업을 해야 하는데,
> 이걸 매번 손으로 하면 너무 귀찮잖아요?
>
> Gradle은 이런 반복 작업을 **자동으로** 해주는 도구예요.
> `gradle build` 한 번이면 알아서 다 해줍니다.
>
> 마치 **세탁기**처럼요. 빨래를 넣고 버튼만 누르면
> "세탁 → 헹굼 → 탈수"를 자동으로 해주듯이,
> Gradle도 코드를 넣고 명령만 실행하면 빌드 과정을 자동으로 처리해줍니다.

```
┌─────────────────────────────────────────────────────────────┐
│                     빌드 도구 발전사                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Ant (2000)  →  Maven (2004)  →  Gradle (2012)              │
│     │              │                │                        │
│     │              │                └─ Groovy/Kotlin DSL     │
│     │              │                   유연함 + 성능          │
│     │              │                                         │
│     │              └─ XML 기반, Convention over Config       │
│     │                 의존성 관리 도입                        │
│     │                                                        │
│     └─ XML 기반, 절차적 빌드                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Gradle vs Maven

> **Maven과 Gradle, 뭐가 다를까요?**
>
> 둘 다 빌드 도구인데, **Maven**은 XML로 설정하고 **Gradle**은 코드(Groovy/Kotlin)로 설정해요.
>
> 비유하자면:
> - **Maven** = 정해진 양식에 맞춰 작성하는 **공문서** (딱딱하지만 명확함)
> - **Gradle** = 자유롭게 쓸 수 있는 **메모장** (유연하지만 배울 게 좀 있음)
>
> 요즘은 Gradle이 더 인기 있어요. 특히 **빌드 속도**가 빠르고,
> "이전에 빌드한 거랑 뭐가 바뀌었지?" 확인해서 바뀐 것만 다시 빌드해주거든요.

| 비교          | Maven           | Gradle                         |
|-------------|-----------------|--------------------------------|
| **설정 파일**   | `pom.xml` (XML) | `build.gradle` (Groovy/Kotlin) |
| **빌드 속도**   | 느림              | 빠름 (증분 빌드, 캐싱)                 |
| **유연성**     | 제한적             | 매우 유연                          |
| **학습 곡선**   | 낮음              | 중간                             |
| **플러그인 개발** | 복잡              | 상대적으로 쉬움                       |
| **멀티 모듈**   | 지원              | 더 강력한 지원                       |

### 1.3 Gradle 빌드 파일

> **build.gradle 파일이 뭐예요?**
>
> 프로젝트의 "**빌드 설명서**"예요.
> "이 프로젝트는 Java 프로젝트야", "Spring 라이브러리가 필요해", "버전은 1.0.0이야"
> 이런 정보를 적어두는 파일이에요.
>
> 요리로 치면 **레시피**와 같아요.
> "재료(dependencies)는 뭐가 필요하고, 어떤 순서로 만들지(tasks)" 적어둔 거죠.

```groovy
// build.gradle (Groovy DSL)
plugins {
    id 'java'
}

group = 'com.example'
version = '1.0.0'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.0'
    testImplementation 'junit:junit:4.13'
}

tasks.register('hello') {
    doLast {
        println 'Hello, Gradle!'
    }
}
```

```kotlin
// build.gradle.kts (Kotlin DSL)
plugins {
    java
}

group = "com.example"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework:spring-core:5.3.0")
    testImplementation("junit:junit:4.13")
}

tasks.register("hello") {
    doLast {
        println("Hello, Gradle!")
    }
}
```

### 1.4 Gradle 빌드 라이프사이클

> **Gradle은 어떤 순서로 동작할까요?**
>
> `gradle build`를 실행하면 Gradle은 **3단계**로 동작해요:
>
> 1. **초기화**: "어떤 프로젝트들이 있지?" 확인 (settings.gradle 읽기)
> 2. **구성**: "뭘 해야 하지?" 파악 (build.gradle 읽고 할 일 목록 만들기)
> 3. **실행**: "자, 이제 하자!" 실제 빌드 작업 수행
>
> 마치 요리사가:
> 1. 냉장고 열어서 재료 확인하고 (초기화)
> 2. 레시피 보면서 순서 정리하고 (구성)
> 3. 실제로 요리하는 것 (실행)
     > 과 같아요!

```
┌─────────────────────────────────────────────────────────────┐
│                  Gradle 빌드 라이프사이클                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 초기화 (Initialization)                                  │
│     └─ settings.gradle 읽기                                  │
│     └─ 어떤 프로젝트가 빌드에 포함되는지 결정                   │
│                                                              │
│  2. 구성 (Configuration)                                     │
│     └─ build.gradle 실행                                     │
│     └─ Task 그래프 생성                                       │
│     └─ 플러그인 적용, 의존성 해석                              │
│                                                              │
│  3. 실행 (Execution)                                         │
│     └─ 선택된 Task 실행                                       │
│     └─ 의존성 순서대로 실행                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

$ gradle build
    │
    ▼
[초기화] settings.gradle 읽기
    │
    ▼
[구성] build.gradle 실행, Task 그래프 생성
    │
    ▼
[실행] compileJava → processResources → classes → jar → build
```

---

## 2. Gradle 플러그인이란?

> **한 줄 요약**: 플러그인 = **기능 확장팩**
>
> 게임에서 DLC(다운로드 콘텐츠) 깔면 새로운 기능이 생기잖아요?
> Gradle 플러그인도 똑같아요. 설치하면 새로운 기능이 추가돼요!

### 2.1 플러그인의 역할

**플러그인** = 재사용 가능한 빌드 로직을 패키징한 것

> **왜 플러그인이 필요할까요?**
>
> 예를 들어, Java 프로젝트를 빌드하려면:
> - 소스 코드 컴파일하고
> - 테스트 실행하고
> - JAR 파일 만들고...
>
> 이걸 매번 직접 설정하면 엄청 귀찮겠죠?
>
> `plugins { id 'java' }` 한 줄만 쓰면,
> 누군가 미리 만들어둔 "Java 빌드 기능"이 **뿅!** 하고 추가돼요.
>
> 마치 스마트폰에 앱 설치하듯이,
> Gradle에 플러그인을 설치하면 새로운 기능을 쓸 수 있는 거예요.

```
┌─────────────────────────────────────────────────────────────┐
│                    플러그인이 하는 일                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Task 추가                                                │
│     └─ compileJava, test, jar 등                            │
│                                                              │
│  2. 설정(Convention) 추가                                    │
│     └─ sourceCompatibility, targetCompatibility 등          │
│                                                              │
│  3. Extension 추가 (DSL)                                     │
│     └─ java { }, application { } 등                         │
│                                                              │
│  4. 다른 플러그인 적용                                        │
│     └─ java 플러그인은 base 플러그인을 자동 적용               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 플러그인 종류

> **플러그인도 종류가 있어요**
>
> 1. **Core 플러그인**: Gradle에 기본으로 들어있는 것 (무료 기본 앱 같은 거)
> 2. **Community 플러그인**: 다른 사람들이 만들어서 공유한 것 (앱스토어 앱)
> 3. **Custom 플러그인**: 우리가 직접 만드는 것 (직접 개발한 앱)

```
┌─────────────────────────────────────────────────────────────┐
│                      플러그인 종류                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Core 플러그인 (Gradle 내장)                              │
│     └─ java, application, war, groovy 등                    │
│     └─ plugins { id 'java' }                                │
│                                                              │
│  2. Community 플러그인 (Gradle Plugin Portal)               │
│     └─ org.springframework.boot, com.github.node-gradle 등  │
│     └─ plugins { id 'org.springframework.boot' version '3.0'}│
│                                                              │
│  3. Custom 플러그인 (직접 개발)                               │
│     └─ 회사/프로젝트 맞춤형 빌드 로직                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 플러그인 적용 방법

```groovy
// 1. Core 플러그인
plugins {
    id 'java'
}

// 2. Community 플러그인 (버전 필요)
plugins {
    id 'org.springframework.boot' version '3.0.0'
}

// 3. Custom 플러그인 (로컬 또는 사설 저장소)
plugins {
    id 'com.example.plugins.app-builder-gradle-plugin' version '1.0.0'
}

// 저장소 설정 (settings.gradle.kts)
pluginManagement {
    repositories {
        gradlePluginPortal()
        maven { url = uri("https://nexus.company.com/repository/maven-public/") }
    }
}
```

---

## 3. 핵심 개념

> **플러그인 개발 전에 알아야 할 3가지**
>
> Gradle 플러그인을 만들려면 3가지 개념만 알면 돼요:
>
> | 개념 | 쉬운 설명 | 비유 |
> |------|----------|------|
> | **Project** | 빌드 대상 | 요리할 **재료** |
> | **Task** | 실행할 작업 | 요리 **레시피의 각 단계** |
> | **Extension** | 설정값 | 요리 **양념 조절** (소금 많이/적게) |
>
> 이 3가지만 이해하면 플러그인 개발의 80%는 끝이에요!

### 3.1 Project

**Project** = 빌드의 기본 단위

> **Project가 뭐예요?**
>
> 간단해요. **빌드할 프로젝트 그 자체**예요.
>
> `build.gradle` 파일이 있는 폴더 하나가 Project 하나예요.
> 멀티 모듈 프로젝트면 여러 개의 Project가 있는 거고요.
>
> 플러그인 입장에서 Project는 "내가 작업할 대상"이에요.
> "이 프로젝트에 어떤 Task를 추가할까?", "어떤 설정을 적용할까?" 하는 거죠.

```groovy
// build.gradle에서 암시적으로 사용 가능
project.name        // 프로젝트 이름
project.version     // 버전
project.group       // 그룹
project.buildDir    // 빌드 디렉토리
project.projectDir  // 프로젝트 디렉토리
project.rootDir     // 루트 디렉토리

// 멀티 모듈에서
project.parent      // 부모 프로젝트
project.subprojects // 자식 프로젝트들
project.allprojects // 모든 프로젝트
```

```kotlin
// 플러그인 코드에서 (Kotlin)
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        println("프로젝트 이름: ${project.name}")
        println("빌드 디렉토리: ${project.buildDir}")
    }
}
```

### 3.2 Task

**Task** = 실행 가능한 작업 단위

> **Task가 뭐예요?**
>
> `gradle build`하면 실행되는 **하나하나의 작업**이에요.
>
> - `compileJava` → Java 코드 컴파일하는 Task
> - `test` → 테스트 실행하는 Task
> - `jar` → JAR 파일 만드는 Task
>
> 레시피에서 "1. 양파 썰기", "2. 볶기", "3. 간 맞추기" 같은 **각 단계**라고 생각하면 돼요.
>
> Task끼리 순서가 있어요. "컴파일 끝나야 테스트할 수 있다" 이런 식으로요.
> 이걸 **Task 의존성**이라고 해요.

```
┌─────────────────────────────────────────────────────────────┐
│                       Task 개념                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  $ gradle build                                              │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ compile │ → │  test   │ → │   jar   │ → │  build  │     │
│  │  Java   │    │         │    │         │    │         │   │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                    Task 의존성 체인                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

```groovy
// Task 정의 (build.gradle)
tasks.register('hello') {
    group = 'custom'
    description = '인사 출력'

    doFirst {
        println 'Task 시작!'
    }

    doLast {
        println 'Hello, World!'
    }
}

// Task 의존성
tasks.register('goodbye') {
    dependsOn 'hello'

    doLast {
        println 'Goodbye!'
    }
}

// $ gradle goodbye
// 출력:
// Task 시작!
// Hello, World!
// Goodbye!
```

### 3.3 Extension

**Extension** = 플러그인의 DSL 설정

> **Extension이 뭐예요?**
>
> 플러그인 사용자가 **설정을 바꿀 수 있게** 해주는 거예요.
>
> 예를 들어 app-builder 플러그인을 쓸 때:
> ```groovy
> appBuilder {
>     ecrRegistry = 'xxx.dkr.ecr.ap-northeast-2.amazonaws.com'
> }
> ```
> 이렇게 설정하잖아요? 이 `appBuilder { }` 블록이 Extension이에요!
>
> 비유하자면:
> - **플러그인** = 전자레인지
> - **Extension** = 전자레인지의 **버튼들** (시간 설정, 온도 설정)
>
> Extension 덕분에 같은 플러그인이라도 프로젝트마다 다르게 설정할 수 있어요.

```groovy
// java 플러그인이 제공하는 Extension
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

// application 플러그인이 제공하는 Extension
application {
    mainClass = 'com.example.Main'
}

// Custom Extension (app-builder-plugin)
appBuilder {
    ecrRegistry = 'xxx.dkr.ecr.region.amazonaws.com'
    helmValuesRepo = 'https://github.com/org/helm-values.git'
}
```

### 3.4 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                   Gradle 플러그인 구조                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Plugin (플러그인)                                           │
│    │                                                         │
│    ├─ Extension 등록 (DSL 설정)                              │
│    │    └─ appBuilder { ecrRegistry = '...' }               │
│    │                                                         │
│    ├─ Task 등록                                              │
│    │    └─ GetTargets, AppBuilder 등                        │
│    │                                                         │
│    └─ Convention 설정                                        │
│         └─ 기본값, 소스 디렉토리 등                           │
│                                                              │
│  build.gradle에서 사용:                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ plugins {                                           │    │
│  │     id 'com.example.plugins.app-builder' version '1.0' │    │
│  │ }                                                   │    │
│  │                                                     │    │
│  │ appBuilder {        ← Extension 사용               │    │
│  │     ecrRegistry = 'xxx'                            │    │
│  │ }                                                   │    │
│  │                                                     │    │
│  │ $ gradle GetTargets  ← Task 실행                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 플러그인 개발 기초

> **드디어 플러그인을 만들어볼 차례!**
>
> 지금까지 배운 걸 정리하면:
> 1. **플러그인** = 빌드 기능을 추가하는 확장팩
> 2. **Project** = 작업 대상
> 3. **Task** = 실행할 작업
> 4. **Extension** = 설정 옵션
>
> 이제 이것들을 조합해서 플러그인을 만들어볼 거예요.
>
> 플러그인을 만드는 건 크게 3단계예요:
> 1. Extension 클래스 만들기 (설정 옵션 정의)
> 2. Task 클래스 만들기 (실제 할 일 정의)
> 3. Plugin 클래스에서 1, 2를 등록하기

### 4.1 프로젝트 구조

> **플러그인 프로젝트는 이렇게 생겼어요**
>
> 일반 Kotlin/Java 프로젝트랑 거의 같아요.
> 다만 `gradlePlugin { }` 설정으로 "이건 플러그인이야"라고 알려줘야 해요.

```
my-gradle-plugin/
├── build.gradle.kts          # 플러그인 빌드 설정
├── settings.gradle.kts       # 프로젝트 설정
├── src/
│   ├── main/
│   │   └── kotlin/           # 또는 java/, groovy/
│   │       └── com/example/
│   │           ├── MyPlugin.kt           # 플러그인 메인 클래스
│   │           ├── MyExtension.kt        # Extension (DSL)
│   │           └── tasks/
│   │               └── MyTask.kt         # Task 클래스
│   └── test/
│       └── kotlin/
│           └── com/example/
│               └── MyPluginTest.kt
└── gradle/
    └── wrapper/
```

### 4.2 build.gradle.kts (플러그인 프로젝트)

> **플러그인 프로젝트의 build.gradle.kts 해석**
>
> 아래 코드가 좀 길어 보이지만, 핵심은 간단해요:
> - `kotlin-dsl`: "Kotlin으로 플러그인 만들 거야"
> - `gradlePlugin { }`: "플러그인 ID는 이거고, 메인 클래스는 이거야"

```kotlin
plugins {
    `kotlin-dsl`        // Kotlin으로 플러그인 개발
    `maven-publish`     // 배포용
}

group = "com.example"
version = "1.0.0"

repositories {
    mavenCentral()
    gradlePluginPortal()
}

dependencies {
    // Gradle API (자동 포함)
    // implementation(gradleApi())

    // 테스트
    testImplementation(gradleTestKit())
    testImplementation("org.junit.jupiter:junit-jupiter:5.9.0")
}

// 플러그인 정의
gradlePlugin {
    plugins {
        create("myPlugin") {
            id = "com.example.my-plugin"                    // 플러그인 ID
            implementationClass = "com.example.MyPlugin"    // 메인 클래스
            displayName = "My Custom Plugin"
            description = "내 커스텀 플러그인 설명"
        }
    }
}

// 테스트 설정
tasks.test {
    useJUnitPlatform()
}
```

### 4.3 기본 플러그인 클래스

> **플러그인의 핵심! Plugin 클래스**
>
> 모든 플러그인은 `Plugin<Project>` 인터페이스를 구현해요.
> `apply()` 메서드 하나만 구현하면 끝!
>
> `apply()`는 **사용자가 플러그인을 적용할 때 실행**돼요.
> 여기서 Extension 등록하고, Task 등록하고... 초기 설정을 다 해요.
>
> ```
> 사용자가 plugins { id 'com.example.my-plugin' } 쓰면
>      ↓
> MyPlugin.apply(project) 가 자동으로 호출됨!
> ```

```kotlin
// src/main/kotlin/com/example/MyPlugin.kt
package com.example

import org.gradle.api.Plugin
import org.gradle.api.Project

class MyPlugin : Plugin<Project> {

    override fun apply(project: Project) {
        // 1. 플러그인이 적용될 때 실행되는 코드
        println("MyPlugin이 ${project.name}에 적용되었습니다!")

        // 2. Extension 등록 → 사용자가 myConfig { } 블록을 쓸 수 있게 됨
        project.extensions.create("myConfig", MyExtension::class.java)

        // 3. Task 등록 → 사용자가 gradle myTask 를 실행할 수 있게 됨
        project.tasks.register("myTask", MyTask::class.java) {
            it.group = "custom"
            it.description = "내 커스텀 태스크"
        }
    }
}
```

### 4.4 사용자 프로젝트에서 적용

```groovy
// 사용자의 build.gradle
plugins {
    id 'com.example.my-plugin' version '1.0.0'
}

// Extension 사용
myConfig {
    message = 'Hello from config!'
}

// Task 실행
// $ gradle myTask
```

---

## 5. Extension (DSL 설정)

> **Extension = 플러그인의 "설정 화면"**
>
> 앱에 설정 화면이 있듯이, 플러그인에도 설정이 필요해요.
> Extension이 바로 그 설정을 담당해요.
>
> 사용자가 `build.gradle`에서:
> ```groovy
> myConfig {
>     message = 'Hello'
>     count = 10
> }
> ```
> 이렇게 쓸 수 있게 해주는 게 Extension이에요!

### 5.1 Extension이란?

**Extension** = 플러그인 사용자가 설정할 수 있는 DSL 블록

```groovy
// 이런 DSL을 제공하고 싶다면:
appBuilder {
    ecrRegistry = 'xxx.dkr.ecr.region.amazonaws.com'
    workspace = '/path/to/project'

    github {
        username = 'user'
        password = 'token'
    }
}
```

### 5.2 단순 Extension

> **가장 기본적인 Extension 만들기**
>
> Extension 클래스는 **설정값을 담는 그릇**이에요.
>
> `Property<String>`이 뭐냐고요?
> 그냥 `String` 쓰면 안 되나요? 안 돼요!
>
> Gradle은 **지연 평가(Lazy Evaluation)**를 써요.
> "지금 당장 값이 뭔지 몰라도 돼, 나중에 필요할 때 가져올게"
>
> 왜냐하면 build.gradle 파일이 위에서 아래로 순서대로 실행되는데,
> Extension 등록할 때는 아직 사용자가 값을 안 넣었을 수도 있거든요.
>
> `Property`는 "나중에 값이 들어올 박스"라고 생각하면 돼요.

```kotlin
// Extension 클래스
package com.example

import org.gradle.api.provider.Property

abstract class MyExtension {
    // Property: Gradle의 지연 평가 타입 (나중에 값이 채워질 박스)
    abstract val message: Property<String>
    abstract val count: Property<Int>

    init {
        // 기본값 설정
        message.convention("Default message")
        count.convention(10)
    }
}
```

```kotlin
// 플러그인에서 등록
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        // Extension 등록
        val extension = project.extensions.create(
            "myConfig",
            MyExtension::class.java
        )

        // Task에서 Extension 값 사용
        project.tasks.register("printConfig") {
            it.doLast {
                println("Message: ${extension.message.get()}")
                println("Count: ${extension.count.get()}")
            }
        }
    }
}
```

```groovy
// 사용자의 build.gradle
myConfig {
    message = 'Hello!'
    count = 42
}

// $ gradle printConfig
// Message: Hello!
// Count: 42
```

### 5.3 중첩 Extension

> **설정 안에 설정이 있다면?**
>
> 설정이 복잡해지면 그룹으로 묶고 싶을 때가 있어요.
>
> ```groovy
> appBuilder {
>     ecrRegistry = '...'
>
>     github {           // ← 이렇게 그룹으로 묶고 싶다!
>         username = '...'
>         password = '...'
>     }
> }
> ```
>
> 이런 걸 **중첩 Extension**이라고 해요.
> Extension 안에 또 다른 Extension을 넣는 거죠.

```kotlin
// 중첩 설정을 위한 클래스들
abstract class AppBuilderExtension(objects: ObjectFactory) {
    abstract val ecrRegistry: Property<String>
    abstract val workspace: Property<String>

    // 중첩 Extension
    val github: GithubConfig = objects.newInstance(GithubConfig::class.java)
    val nexus: NexusConfig = objects.newInstance(NexusConfig::class.java)

    companion object {
        const val NAME = "appBuilder"
    }
}

abstract class GithubConfig {
    abstract val username: Property<String>
    abstract val password: Property<String>
}

abstract class NexusConfig {
    abstract val url: Property<String>
    abstract val username: Property<String>
    abstract val password: Property<String>
}
```

```kotlin
// 플러그인에서 등록
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.extensions.create(
            AppBuilderExtension.NAME,
            AppBuilderExtension::class.java,
            project.objects  // ObjectFactory 전달
        )
    }
}
```

```groovy
// 사용자의 build.gradle
appBuilder {
    ecrRegistry = 'xxx.dkr.ecr.region.amazonaws.com'
    workspace = '/path/to/project'

    github {
        username = 'myuser'
        password = 'mytoken'
    }

    nexus {
        url = 'https://nexus.company.com'
        username = 'nexus-user'
        password = 'nexus-pass'
    }
}
```

### 5.4 환경변수와 Extension 통합

```kotlin
abstract class AppBuilderExtension(objects: ObjectFactory) {
    abstract val ecrRegistry: Property<String>

    init {
        // 환경변수를 기본값으로 사용
        ecrRegistry.convention(
            System.getenv("ECR_REGISTRY") ?: ""
        )
    }
}
```

```groovy
// 사용자는 환경변수 또는 직접 설정 가능
appBuilder {
    // 설정하면 환경변수보다 우선
    ecrRegistry = 'custom-registry.com'

    // 설정 안 하면 환경변수 ECR_REGISTRY 사용
}
```

---

## 6. Task 개발

> **Task = 플러그인이 "실제로 하는 일"**
>
> Extension이 "설정"이라면, Task는 "행동"이에요.
>
> 예를 들어:
> - `GetTargets` Task → 변경된 모듈 찾기
> - `AppBuilder` Task → Docker 이미지 빌드하기
>
> Task 클래스를 만들 때 핵심은:
> 1. `@TaskAction` 붙은 메서드 = **실제 실행될 코드**
> 2. `@Input` 붙은 필드 = **입력값** (이게 바뀌면 Task 다시 실행)
> 3. `@Output` 붙은 필드 = **출력물** (캐싱에 사용)

### 6.1 Task 기본 구조

> **Task 클래스의 뼈대**
>
> Task는 `DefaultTask`를 상속받아서 만들어요.
> `@TaskAction`이 붙은 메서드가 `gradle myTask` 할 때 실행되는 코드예요.

```kotlin
package com.example.tasks

import org.gradle.api.DefaultTask
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.OutputFile
import org.gradle.api.provider.Property
import org.gradle.api.file.RegularFileProperty
import java.io.File

abstract class MyTask : DefaultTask() {

    // 입력 값 (변경되면 Task 재실행)
    @get:Input
    abstract val message: Property<String>

    // 출력 파일
    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    init {
        // 기본값
        group = "custom"
        description = "내 커스텀 태스크"
    }

    @TaskAction
    fun execute() {
        // Task 실행 로직
        val msg = message.get()
        val file = outputFile.get().asFile

        println("메시지: $msg")
        file.writeText(msg)
        println("파일 생성: ${file.absolutePath}")
    }

    companion object {
        const val TASK_NAME = "myTask"
    }
}
```

### 6.2 Task를 플러그인에 등록

```kotlin
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        // Extension 등록
        val extension = project.extensions.create(
            "myConfig",
            MyExtension::class.java
        )

        // Task 등록 및 Extension과 연결
        project.tasks.register(MyTask.TASK_NAME, MyTask::class.java) { task ->
            // Extension 값을 Task에 전달
            task.message.set(extension.message)

            // 출력 파일 경로 설정
            task.outputFile.set(
                project.layout.buildDirectory.file("output/result.txt")
            )
        }
    }
}
```

### 6.3 Task 입출력 어노테이션

> **왜 @Input, @Output을 붙일까요?**
>
> Gradle의 강력한 기능 중 하나가 **증분 빌드**예요.
> "이전에 빌드한 거랑 뭐가 달라졌지?" 확인해서, 달라진 것만 다시 빌드해요.
>
> 이걸 위해 Gradle이 알아야 하는 게:
> - **@Input**: "이 값이 바뀌면 Task 다시 실행해야 해"
> - **@Output**: "이 파일이 결과물이야, 캐싱해둬"
>
> 예를 들어 `@Input version = "1.0.0"`인데 값이 안 바뀌었으면?
> → Task 스킵! (시간 절약)
>
> ```
> $ gradle build
> > Task :compileJava UP-TO-DATE  ← 입력이 안 바뀌어서 스킵됨!
> ```

```kotlin
abstract class BuildTask : DefaultTask() {

    // ─────────────────────────────────────────────
    // 입력 (Input) - 값이 바뀌면 Task 재실행
    // ─────────────────────────────────────────────

    @get:Input                          // 단순 값
    abstract val version: Property<String>

    @get:Input
    @get:Optional                       // 선택적 입력
    abstract val optionalConfig: Property<String>

    @get:InputFile                      // 입력 파일
    abstract val configFile: RegularFileProperty

    @get:InputDirectory                 // 입력 디렉토리
    abstract val sourceDir: DirectoryProperty

    @get:InputFiles                     // 여러 파일
    abstract val resources: ConfigurableFileCollection

    // ─────────────────────────────────────────────
    // 출력 (Output) - 증분 빌드에 사용
    // ─────────────────────────────────────────────

    @get:OutputFile                     // 출력 파일
    abstract val outputFile: RegularFileProperty

    @get:OutputDirectory                // 출력 디렉토리
    abstract val outputDir: DirectoryProperty

    // ─────────────────────────────────────────────
    // 내부 (Internal) - 캐싱에 영향 없음
    // ─────────────────────────────────────────────

    @get:Internal
    abstract val tempData: Property<String>

    @TaskAction
    fun execute() {
        // 구현
    }
}
```

### 6.4 Task 의존성

> **Task끼리 순서가 있어요**
>
> "테스트하려면 먼저 컴파일해야 해" 이런 순서 관계를 **의존성**이라고 해요.
>
> - `dependsOn(taskA)`: "taskA가 먼저 실행되어야 해"
> - `mustRunAfter(taskB)`: "taskB 다음에 실행해줘 (근데 taskB는 필수는 아냐)"
>
> 마치 요리할 때:
> - 볶음밥 만들려면 → 먼저 밥이 있어야 함 (`dependsOn`)
> - 밥 있으면 → 볶음밥 만든 다음에 설거지 (`mustRunAfter`)

```kotlin
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        // Task A 등록
        val taskA = project.tasks.register("taskA") {
            it.doLast { println("Task A 실행") }
        }

        // Task B 등록 (A에 의존)
        val taskB = project.tasks.register("taskB") {
            it.dependsOn(taskA)
            it.doLast { println("Task B 실행") }
        }

        // Task C 등록 (B 다음에 실행)
        project.tasks.register("taskC") {
            it.mustRunAfter(taskB)
            it.doLast { println("Task C 실행") }
        }

        // 기존 Task에 의존성 추가
        project.tasks.named("build").configure {
            it.dependsOn(taskB)
        }
    }
}

// $ gradle taskB
// 출력:
// Task A 실행
// Task B 실행

// $ gradle taskC taskB
// 출력:
// Task A 실행
// Task B 실행
// Task C 실행 (B 다음에)
```

### 6.5 외부 명령 실행

```kotlin
abstract class ShellTask : DefaultTask() {

    @get:Input
    abstract val command: Property<String>

    @TaskAction
    fun execute() {
        val cmd = command.get()

        // 방법 1: project.exec
        project.exec {
            it.commandLine("sh", "-c", cmd)
        }

        // 방법 2: ProcessBuilder (더 세밀한 제어)
        val processBuilder = ProcessBuilder("sh", "-c", cmd)
            .directory(project.projectDir)
            .redirectErrorStream(true)

        val process = processBuilder.start()
        val output = process.inputStream.bufferedReader().readText()
        val exitCode = process.waitFor()

        if (exitCode != 0) {
            throw RuntimeException("명령 실패: $cmd\n$output")
        }

        println(output)
    }
}
```

---

## 7. 플러그인 배포

> **만든 플러그인을 어떻게 공유할까요?**
>
> 플러그인을 만들었으면 다른 프로젝트에서 쓸 수 있게 **배포**해야 해요.
>
> 배포 방법 3가지:
> 1. **로컬 배포** (내 컴퓨터에서만) - 테스트용
> 2. **사설 저장소** (회사 Nexus) - 회사 내부용
> 3. **Gradle Plugin Portal** (전 세계 공개) - 오픈소스용

### 7.1 로컬 테스트 (publishToMavenLocal)

> **일단 내 컴퓨터에서 테스트해보기**
>
> `gradle publishToMavenLocal` 하면 내 컴퓨터의 `~/.m2/repository`에 플러그인이 설치돼요.
> 다른 프로젝트에서 `mavenLocal()`을 추가하면 이 플러그인을 가져다 쓸 수 있어요.

```kotlin
// build.gradle.kts
plugins {
    `kotlin-dsl`
    `maven-publish`
}

// $ gradle publishToMavenLocal
// ~/.m2/repository에 배포됨
```

```groovy
// 테스트 프로젝트의 settings.gradle
pluginManagement {
    repositories {
        mavenLocal()  // 로컬 저장소 우선
        gradlePluginPortal()
    }
}
```

### 7.2 사설 저장소 배포 (Nexus)

```kotlin
// build.gradle.kts
publishing {
    repositories {
        maven {
            name = "nexus"
            url = uri("https://nexus.company.com/repository/maven-hosted/")
            credentials {
                username = System.getenv("NEXUS_USERNAME")
                    ?: providers.gradleProperty("NEXUS_USERNAME").orNull
                password = System.getenv("NEXUS_PASSWORD")
                    ?: providers.gradleProperty("NEXUS_PASSWORD").orNull
            }
        }
    }
}

// $ gradle publish
```

### 7.3 Gradle Plugin Portal 배포

```kotlin
// build.gradle.kts
plugins {
    `kotlin-dsl`
    `com.gradle.plugin-publish` version "1.2.0"
}

gradlePlugin {
    website = "https://github.com/yourorg/your-plugin"
    vcsUrl = "https://github.com/yourorg/your-plugin.git"

    plugins {
        create("myPlugin") {
            id = "com.example.my-plugin"
            implementationClass = "com.example.MyPlugin"
            displayName = "My Plugin"
            description = "플러그인 설명"
            tags = listOf("ci", "cd", "build")
        }
    }
}

// $ gradle publishPlugins
```

---

## 8. 실전 예제: app-builder-plugin

> **이 섹션은 간략한 소개입니다.**
>
> app-builder-plugin의 **상세한 분석**은 [Part 3: App-Builder Plugin 실전 분석](/2026-01-15-cicd-3-app-builder-plugin)에서 다룹니다.

### 배운 개념이 어떻게 적용되는가?

| 개념               | app-builder-plugin 적용                              |
|------------------|----------------------------------------------------|
| **Plugin**       | `AppBuilderPlugin.kt` - 진입점                        |
| **Extension**    | `AppBuilderExtension.kt` - `appBuilder { }` DSL 제공 |
| **Task**         | `GetTargetsTask`, `AppBuilderTask`                 |
| **중첩 Extension** | `github { }`, `nexus { }` 등                        |

### 플러그인 구조 요약

```
app-builder-plugin/
├── AppBuilderPlugin.kt      # Plugin<Project> 구현
├── extension/
│   └── AppBuilderExtension.kt  # appBuilder { } 블록
└── tasks/
    ├── GetTargetsTask.kt    # 변경 감지
    └── AppBuilderTask.kt    # 빌드 실행
```

### 전체 흐름 (요약)

```
plugins { id 'app-builder' }  →  AppBuilderPlugin.apply()
        ↓                              ↓
appBuilder { ... } 설정         Extension, Task 등록
        ↓
gradle GetTargets  →  gradle AppBuilder
```

> **다음 단계**: [Part 3](/2026-01-15-cicd-3-app-builder-plugin)에서 각 컴포넌트의 상세 구현, CI/CD 흐름, Executor 패턴 등을 학습하세요.

---

## 9. 실습: 간단한 플러그인 만들기

> **직접 만들어보는 게 최고의 공부!**
>
> 지금까지 배운 내용을 총정리해서, 아주 간단한 "인사 플러그인"을 만들어볼게요.
>
> 만들 플러그인:
> ```groovy
> // 사용자가 이렇게 설정하면
> greeting {
>     name = 'Gradle'
>     greeting = '안녕하세요'
> }
>
> // gradle greet 실행하면
> // 출력: 안녕하세요, Gradle!
> ```

### 9.1 프로젝트 생성

```bash
mkdir my-gradle-plugin
cd my-gradle-plugin
gradle init --type kotlin-gradle-plugin
```

### 9.2 Extension 작성

```kotlin
// src/main/kotlin/com/example/GreetingExtension.kt
package com.example

import org.gradle.api.provider.Property

abstract class GreetingExtension {
    abstract val name: Property<String>
    abstract val greeting: Property<String>

    init {
        name.convention("World")
        greeting.convention("Hello")
    }

    companion object {
        const val NAME = "greeting"
    }
}
```

### 9.3 Task 작성

```kotlin
// src/main/kotlin/com/example/GreetingTask.kt
package com.example

import org.gradle.api.DefaultTask
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

abstract class GreetingTask : DefaultTask() {

    @get:Input
    abstract val name: Property<String>

    @get:Input
    abstract val greeting: Property<String>

    init {
        group = "greeting"
        description = "인사말을 출력합니다"
    }

    @TaskAction
    fun greet() {
        val message = "${greeting.get()}, ${name.get()}!"
        println(message)
    }

    companion object {
        const val TASK_NAME = "greet"
    }
}
```

### 9.4 플러그인 작성

```kotlin
// src/main/kotlin/com/example/GreetingPlugin.kt
package com.example

import org.gradle.api.Plugin
import org.gradle.api.Project

class GreetingPlugin : Plugin<Project> {

    override fun apply(project: Project) {
        // Extension 등록
        val extension = project.extensions.create(
            GreetingExtension.NAME,
            GreetingExtension::class.java
        )

        // Task 등록
        project.tasks.register(GreetingTask.TASK_NAME, GreetingTask::class.java) {
            it.name.set(extension.name)
            it.greeting.set(extension.greeting)
        }
    }
}
```

### 9.5 테스트

```groovy
// 테스트 프로젝트의 build.gradle
plugins {
    id 'com.example.greeting' version '1.0.0'
}

greeting {
    name = 'Gradle'
    greeting = '안녕하세요'
}

// $ gradle greet
// 출력: 안녕하세요, Gradle!
```

---

## 10. 핵심 요약

> **이것만 기억하세요!**
>
> ### 플러그인 = Extension + Task
>
> ```
> ┌─────────────────────────────────────────────────────────────┐
> │                    플러그인 만들기 3줄 요약                    │
> ├─────────────────────────────────────────────────────────────┤
> │                                                              │
> │  1. Extension 클래스 만들기                                  │
> │     → 사용자가 설정할 수 있는 옵션 정의                       │
> │     → build.gradle에서 myConfig { } 블록으로 사용            │
> │                                                              │
> │  2. Task 클래스 만들기                                       │
> │     → 실제로 수행할 작업 정의                                 │
> │     → @TaskAction 메서드가 실행됨                            │
> │                                                              │
> │  3. Plugin 클래스에서 등록하기                                │
> │     → apply() 메서드에서 Extension, Task 등록                │
> │     → plugins { id '...' } 하면 apply()가 호출됨             │
> │                                                              │
> └─────────────────────────────────────────────────────────────┘
> ```
>
> ### 비유로 정리
>
> | 개념 | 비유 | 설명 |
> |------|------|------|
> | **Gradle** | 세탁기 | 빌드 자동화 도구 |
> | **Plugin** | 세탁기 기능 | 새로운 빌드 기능 추가 |
> | **Extension** | 버튼/다이얼 | 설정 옵션 |
> | **Task** | 세탁/헹굼/탈수 | 실행할 작업 |
> | **Property** | 값이 들어올 박스 | 지연 평가를 위한 타입 |
>
> ### 코드 흐름
>
> ```
> 사용자가 plugins { id 'my-plugin' } 쓰면
>     ↓
> Plugin.apply(project) 호출됨
>     ↓
> Extension 등록 (myConfig { } 사용 가능)
> Task 등록 (gradle myTask 실행 가능)
>     ↓
> 사용자가 myConfig { message = 'Hello' } 로 설정
>     ↓
> gradle myTask 실행하면 Task의 @TaskAction 메서드 실행!
> ```

---

## 11. 참고 자료

### 공식 문서

- [Gradle User Manual](https://docs.gradle.org/current/userguide/userguide.html)
- [Developing Custom Plugins](https://docs.gradle.org/current/userguide/custom_plugins.html)
- [Gradle Kotlin DSL Primer](https://docs.gradle.org/current/userguide/kotlin_dsl.html)

### API 문서

- [Project API](https://docs.gradle.org/current/javadoc/org/gradle/api/Project.html)
- [Task API](https://docs.gradle.org/current/javadoc/org/gradle/api/Task.html)

### 예제

- [Gradle Plugin Samples](https://github.com/gradle/gradle/tree/master/subprojects/docs/src/samples)
