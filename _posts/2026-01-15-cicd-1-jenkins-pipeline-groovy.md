---
layout: post
title: "[Part 1] Jenkins Pipeline 기초 - Groovy와 Pipeline 문법"
tags: [ devops, java ]
---

> **CI/CD 학습 시리즈**
> - **Part 1: Jenkins Pipeline + Groovy 기초** (현재 글)
> - [Part 2: Gradle Plugin 개발](/2026/01/cicd-2-gradle-plugin)
> - [Part 3: App-Builder Plugin 실전 분석](/2026/01/cicd-3-app-builder-plugin)

# Jenkins Pipeline 기초 학습

## 목차

1. [Jenkins Pipeline 개요](#1-jenkins-pipeline-개요)
2. [Groovy 언어 소개](#2-groovy-언어-소개)
3. [Groovy 기초 문법](#3-groovy-기초-문법)
4. [선언형 Pipeline (Declarative)](#4-선언형-pipeline-declarative)
5. [스크립트형 Pipeline (Scripted)](#5-스크립트형-pipeline-scripted)
6. [공유 라이브러리 (Shared Library)](#6-공유-라이브러리-shared-library)
7. [실전 예제](#7-실전-예제)
8. [자주 사용하는 패턴](#8-자주-사용하는-패턴)
9. [디버깅 팁](#9-디버깅-팁)
10. [참고 자료](#10-참고-자료)

---

## 1. Jenkins Pipeline 개요

### 1.1 Pipeline이란?

Jenkins Pipeline은 CI/CD 파이프라인을 **코드로 정의**하는 방법입니다.

```
기존 방식: Jenkins UI에서 클릭으로 설정
Pipeline: Jenkinsfile 코드로 정의 → 버전 관리 가능
```

### 1.2 왜 Pipeline인가?

| 장점         | 설명                 |
|------------|--------------------|
| **코드로 관리** | Git에서 버전 관리 가능     |
| **재사용**    | 공유 라이브러리로 재사용      |
| **리뷰**     | PR로 파이프라인 변경 리뷰 가능 |
| **복구**     | 이전 버전으로 쉽게 롤백      |

### 1.3 두 가지 문법

```
┌─────────────────────────────────────────────────────┐
│                  Jenkins Pipeline                    │
├─────────────────────┬───────────────────────────────┤
│   선언형            │         스크립트형              │
│   (Declarative)     │         (Scripted)             │
├─────────────────────┼───────────────────────────────┤
│   pipeline { }      │         node { }               │
│   구조화된 DSL       │         순수 Groovy            │
│   제한적이지만 간단   │         유연하지만 복잡         │
└─────────────────────┴───────────────────────────────┘
```

### 1.4 선언형 vs 스크립트형 상세 비교

#### 역사와 배경

```
2016년: Jenkins Pipeline 출시
        └─ 스크립트형 (Scripted) 먼저 등장
           - 순수 Groovy 기반
           - 유연하지만 복잡

2017년: 선언형 (Declarative) 추가
        └─ 스크립트형의 복잡함을 해결
           - 구조화된 DSL
           - 초보자 친화적
```

**현재 권장:** 선언형 (Declarative)을 기본으로, 필요시 `script { }` 블록으로 스크립트형 혼합

#### 기본 구조 비교

```groovy
// ┌─────────────────────────────────────────────────────────┐
// │                    선언형 (Declarative)                   │
// └─────────────────────────────────────────────────────────┘
pipeline {              // 반드시 pipeline으로 시작
    agent any           // 필수: 실행 환경 지정

    stages {            // 필수: stages 블록
        stage('Build') {
            steps {     // 필수: steps 블록
                echo 'Building...'
            }
        }
        stage('Test') {
            steps {
                echo 'Testing...'
            }
        }
    }
}

// ┌─────────────────────────────────────────────────────────┐
// │                    스크립트형 (Scripted)                   │
// └─────────────────────────────────────────────────────────┘
node {                  // node로 시작
    stage('Build') {    // stage만 있으면 됨 (steps 불필요)
        echo 'Building...'
    }
    stage('Test') {
        echo 'Testing...'
    }
}
```

#### 상세 비교표

| 비교 항목          | 선언형 (Declarative)       | 스크립트형 (Scripted)  |
|----------------|-------------------------|-------------------|
| **시작 키워드**     | `pipeline { }`          | `node { }`        |
| **필수 구조**      | agent, stages, steps 필수 | 자유로움              |
| **Groovy 문법**  | 제한적 (`script { }` 안에서만) | 완전히 자유로움          |
| **학습 곡선**      | 낮음 (초보자 친화적)            | 높음 (Groovy 지식 필요) |
| **가독성**        | 높음 (구조화됨)               | 낮을 수 있음           |
| **유연성**        | 낮음                      | 높음                |
| **에러 검출**      | 빌드 전 구문 검사              | 런타임에 발견           |
| **post 처리**    | 내장 지원 (`post { }`)      | 직접 try-catch 구현   |
| **when 조건**    | 내장 지원 (`when { }`)      | if문으로 직접 구현       |
| **병렬 실행**      | `parallel { }` 블록       | `parallel()` 메서드  |
| **Blue Ocean** | 완벽 지원                   | 부분 지원             |
| **권장 대상**      | 대부분의 경우                 | 복잡한 로직 필요시        |

#### 같은 작업, 다른 문법

**예제 1: 기본 빌드**

```groovy
// 선언형
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'gradle build'
            }
        }
    }
}

// 스크립트형
node {
    stage('Build') {
        sh 'gradle build'
    }
}
```

**예제 2: 조건부 실행**

```groovy
// 선언형 - when 블록 사용
pipeline {
    agent any
    stages {
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'deploy.sh'
            }
        }
    }
}

// 스크립트형 - if문 사용
node {
    stage('Deploy') {
        if (env.BRANCH_NAME == 'main') {
            sh 'deploy.sh'
        }
    }
}
```

**예제 3: 후처리 (성공/실패)**

```groovy
// 선언형 - post 블록 사용
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'gradle build'
            }
        }
    }
    post {
        success {
            echo '빌드 성공!'
            slackSend message: "성공"
        }
        failure {
            echo '빌드 실패!'
            slackSend message: "실패"
        }
        always {
            cleanWs()  // 워크스페이스 정리
        }
    }
}

// 스크립트형 - try-catch-finally 사용
node {
    try {
        stage('Build') {
            sh 'gradle build'
        }
        echo '빌드 성공!'
        slackSend message: "성공"
    } catch (Exception e) {
        echo '빌드 실패!'
        slackSend message: "실패"
        throw e
    } finally {
        cleanWs()
    }
}
```

**예제 4: 병렬 실행**

```groovy
// 선언형 - parallel 블록
pipeline {
    agent any
    stages {
        stage('Test') {
            parallel {
                stage('Unit Test') {
                    steps {
                        sh 'npm run test:unit'
                    }
                }
                stage('E2E Test') {
                    steps {
                        sh 'npm run test:e2e'
                    }
                }
            }
        }
    }
}

// 스크립트형 - parallel 메서드
node {
    stage('Test') {
        parallel(
                'Unit Test': {
                    sh 'npm run test:unit'
                },
                'E2E Test': {
                    sh 'npm run test:e2e'
                }
        )
    }
}
```

**예제 5: 동적 스테이지 생성**

```groovy
// 선언형 - 불가능! script 블록 필요
pipeline {
    agent any
    stages {
        stage('Dynamic Stages') {
            steps {
                script {
                    // script 블록 안에서 Groovy 사용
                    def modules = ['api', 'web', 'batch']
                    modules.each { module ->
                        stage("Build ${module}") {
                            sh "gradle :${module}:build"
                        }
                    }
                }
            }
        }
    }
}

// 스크립트형 - 자연스럽게 가능
node {
    def modules = ['api', 'web', 'batch']

    stage('Checkout') {
        checkout scm
    }

    // 동적으로 스테이지 생성
    modules.each { module ->
        stage("Build ${module}") {
            sh "gradle :${module}:build"
        }
    }
}
```

#### 언제 어떤 것을 사용해야 할까?

```
┌─────────────────────────────────────────────────────────────┐
│                    선언형을 사용하세요                         │
├─────────────────────────────────────────────────────────────┤
│  파이프라인이 단순하고 직관적인 경우                         │
│  팀에 Jenkins 초보자가 많은 경우                            │
│  Blue Ocean UI를 적극 활용하는 경우                         │
│  구조화된 post 처리가 필요한 경우                            │
│  when 조건이 많이 필요한 경우                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    스크립트형을 사용하세요                      │
├─────────────────────────────────────────────────────────────┤
│  복잡한 조건 분기가 필요한 경우                              │
│  동적으로 스테이지를 생성해야 하는 경우                       │
│  외부 API 호출, 복잡한 데이터 처리가 필요한 경우              │
│  공유 라이브러리를 개발하는 경우                             │
│  완전한 Groovy 제어가 필요한 경우                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    혼합 사용 (권장)                            │
├─────────────────────────────────────────────────────────────┤
│  기본 구조는 선언형으로                                     │
│  복잡한 로직이 필요한 부분만 script { } 블록 사용             │
└─────────────────────────────────────────────────────────────┘
```

#### 혼합 사용 예시 (권장 패턴)

```groovy
pipeline {
    agent any

    environment {
        DEPLOY_ENV = 'production'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'gradle build'
            }
        }

        stage('Dynamic Tests') {
            steps {
                // 복잡한 로직이 필요한 부분만 script 블록
                script {
                    def testTypes = ['unit', 'integration', 'e2e']
                    def parallelTests = [:]

                    testTypes.each { type ->
                        parallelTests[type] = {
                            sh "gradle test${type.capitalize()}"
                        }
                    }

                    parallel parallelTests
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'deploy.sh'
            }
        }
    }

    post {
        success {
            slackSend message: "빌드 성공: ${env.JOB_NAME}"
        }
        failure {
            slackSend message: "빌드 실패: ${env.JOB_NAME}"
        }
    }
}
```

#### app-builder-plugin은 어떤 방식?

> **상세 분석**: [Part 3: App-Builder Plugin 실전 분석](/2026-01-15-cicd-3-app-builder-plugin)에서 전체 구조를 다룹니다.

현재 `app-builder-plugin`의 `build.groovy`는 **스크립트형**을 사용합니다:

```groovy
// vars/build.groovy - 스크립트형
def call(Map args = [:]) {
    node('buildkit') {           // 스크립트형: node로 시작
        checkout scm

        stage("변경 감지") {       // stage만 사용 (steps 없음)
            container("buildkit") {
                // Groovy 자유롭게 사용
                buildData = getTargetsTask(config)
            }
        }

        // 동적 스테이지 생성 - 스크립트형의 장점
        buildData.modules.each { name, module ->
            stage("Build: ${name}") {
                if (module.changed) {
                    // 복잡한 로직
                }
            }
        }
    }
}
```

**스크립트형을 선택한 이유:**

1. **동적 스테이지 생성** - 모듈 수에 따라 스테이지가 달라짐
2. **복잡한 데이터 처리** - JSON 파싱, 조건 분기
3. **공유 라이브러리** - 재사용 가능한 함수 정의
4. **완전한 Groovy 제어** - Map, List, 클로저 자유롭게 사용

---

## 2. Groovy 언어 소개

### 2.1 Groovy란?

**Groovy**는 2003년 James Strachan이 만든 **JVM 기반 동적 프로그래밍 언어**입니다.

```
┌─────────────────────────────────────────────────────────┐
│                        JVM                               │
├─────────────┬─────────────┬─────────────┬───────────────┤
│    Java     │   Kotlin    │   Scala     │    Groovy     │
│   (1995)    │   (2011)    │   (2004)    │    (2003)     │
└─────────────┴─────────────┴─────────────┴───────────────┘
              모두 JVM 위에서 실행되고, 서로 호환됨
```

### 2.2 Groovy의 탄생 배경

**Java의 불편함을 해결하기 위해 탄생:**

```java
// Java - 장황함

import java.util.ArrayList;
import java.util.List;

public class Main {
	public static void main(String[] args) {
		List<String> list = new ArrayList<String>();
		list.add("apple");
		list.add("banana");

		for (String item : list) {
			System.out.println(item);
		}
	}
}
```

```groovy
// Groovy - 간결함
def list = ['apple', 'banana']
list.each { println it }
```

### 2.3 Groovy의 특징

| 특징          | 설명                 |
|-------------|--------------------|
| **Java 호환** | Java 코드를 그대로 사용 가능 |
| **동적 타입**   | `def` 키워드로 타입 추론   |
| **간결한 문법**  | 세미콜론, 괄호 생략 가능     |
| **클로저 지원**  | 함수를 값처럼 전달         |
| **DSL 친화적** | 도메인 특화 언어 작성에 적합   |
| **스크립트 지원** | 컴파일 없이 바로 실행 가능    |

### 2.4 DSL이란? (Domain Specific Language)

#### DSL의 개념

**DSL (Domain Specific Language)** = **도메인 특화 언어**

특정 분야(도메인)의 문제를 해결하기 위해 설계된 언어입니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      프로그래밍 언어                          │
├─────────────────────────────┬───────────────────────────────┤
│     GPL (범용 언어)          │        DSL (특화 언어)         │
│     General Purpose         │        Domain Specific        │
├─────────────────────────────┼───────────────────────────────┤
│  - Java                     │  - SQL (데이터베이스)          │
│  - Python                   │  - HTML/CSS (웹 페이지)        │
│  - JavaScript               │  - Regex (정규표현식)          │
│  - Groovy ─────────────────────► Jenkinsfile (CI/CD)        │
│         │                   │  - Dockerfile (컨테이너)       │
│         │                   │  - build.gradle (빌드)        │
│         │                   │                               │
│         └── DSL을 만들기 좋은 GPL                             │
│                             │                               │
│  "무엇이든 할 수 있음"        │  "특정 일을 잘함"              │
└─────────────────────────────┴───────────────────────────────┘
```

**핵심 포인트:**

- **Groovy 자체**는 GPL (범용 언어) - Java처럼 무엇이든 할 수 있음
- **Groovy로 만든 것**이 DSL - Jenkinsfile, build.gradle 등
- Groovy는 **"DSL을 만들기에 최적화된 GPL"**

#### Groovy로 작성하는 것들

```
┌─────────────────────────────────────────────────────────┐
│                      Groovy 문법                         │
│            (변수, 클로저, 맵, 리스트, 조건문 등)            │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────┐
│    Jenkinsfile      │       │   build.gradle      │
│  (Jenkins Pipeline) │       │     (Gradle)        │
├─────────────────────┤       ├─────────────────────┤
│ pipeline {          │       │ plugins {           │
│   agent any         │       │   id 'java'         │
│   stages {          │       │ }                   │
│     stage('Build'){ │       │ dependencies {      │
│       steps {       │       │   implementation '' │
│         sh 'make'   │       │ }                   │
│       }             │       │                     │
│     }               │       │                     │
│   }                 │       │                     │
│ }                   │       │                     │
└─────────────────────┘       └─────────────────────┘
        │                               │
        ▼                               ▼
   Jenkins가 제공하는            Gradle이 제공하는
   DSL 메서드들                  DSL 메서드들
   (pipeline, stage,            (plugins, dependencies,
    steps, sh, echo...)          implementation, test...)
```

**즉:**

- **Groovy 문법**을 사용해서 작성
- **Jenkins/Gradle이 제공하는 DSL 키워드(메서드)**를 호출

그래서 **Groovy 문법을 알면** → Jenkinsfile, build.gradle **둘 다 이해** 가능!

```groovy
// Jenkinsfile - Groovy 문법 + Jenkins DSL
def modules = ['api', 'web']        // Groovy: 변수, 리스트

pipeline {                          // Jenkins DSL: pipeline
    agent any                       // Jenkins DSL: agent
    stages {                        // Jenkins DSL: stages
        stage('Build') {            // Jenkins DSL: stage
            steps {                 // Jenkins DSL: steps
                modules.each {      // Groovy: 클로저, 반복
                    sh "build ${it}" // Jenkins DSL: sh + Groovy: 문자열 보간
                }
            }
        }
    }
}
```

```groovy
// build.gradle - Groovy 문법 + Gradle DSL
def springVersion = '3.0.0'         // Groovy: 변수

plugins {                           // Gradle DSL: plugins
    id 'java'                       // Gradle DSL: id
}

dependencies {                      // Gradle DSL: dependencies
    // Groovy: 문자열 보간 + Gradle DSL: implementation
    implementation "org.springframework:spring-core:${springVersion}"

    // Groovy: 조건문
    if (project.hasProperty('includeTest')) {
        testImplementation 'junit:junit:4.13'  // Gradle DSL
    }
}
```

> **참고:** Gradle은 **Kotlin DSL** (`build.gradle.kts`)도 지원합니다.
> Kotlin DSL은 타입 안전성과 IDE 자동완성이 더 좋지만, 기존 프로젝트는 대부분 Groovy DSL을 사용합니다.

#### DSL의 종류

```
┌─────────────────────────────────────────────────────────────┐
│                        DSL 종류                              │
├─────────────────────────────┬───────────────────────────────┤
│    External DSL             │       Internal DSL            │
│    (외부 DSL)                │       (내부 DSL)               │
├─────────────────────────────┼───────────────────────────────┤
│  독립적인 문법/파서 필요       │  호스트 언어 문법 활용          │
│                             │                               │
│  예시:                       │  예시:                         │
│  - SQL                      │  - Jenkinsfile (Groovy)       │
│  - HTML                     │  - build.gradle (Groovy)      │
│  - Regex                    │  - RSpec (Ruby)               │
│  - YAML                     │  - Kotest (Kotlin)            │
└─────────────────────────────┴───────────────────────────────┘
```

**Jenkins Pipeline = Groovy 기반 Internal DSL**

#### 왜 DSL을 사용하는가?

```
[일반 프로그래밍 언어로 CI/CD 작성]

BuildPipeline pipeline = new BuildPipeline();
pipeline.setAgent(new AnyAgent());

StageList stages = new StageList();
Stage buildStage = new Stage("Build");
StepList steps = new StepList();
steps.add(new ShellStep("make build"));
buildStage.setSteps(steps);
stages.add(buildStage);

pipeline.setStages(stages);
pipeline.execute();
```

```
[DSL로 CI/CD 작성]

pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
    }
}
```

| 비교         | 일반 언어      | DSL          |
|------------|------------|--------------|
| **가독성**    | 낮음 (장황함)   | 높음 (의도가 명확)  |
| **학습 곡선**  | Java 문법 필요 | 도메인 용어만 알면 됨 |
| **생산성**    | 낮음         | 높음           |
| **오류 가능성** | 높음         | 낮음           |

#### Groovy가 DSL에 적합한 이유

**1. 괄호 생략 가능**

```groovy
// 일반 메서드 호출
stage('Build', { steps({ sh('make build') }) })

// Groovy DSL 스타일 (괄호 생략)
stage('Build') {
    steps {
        sh 'make build'
    }
}
```

**2. 클로저 (Closure) 지원**

```groovy
// 클로저 = 코드 블록을 값처럼 전달
def myBlock = {
    echo 'Hello'
    sh 'make build'
}

// 함수에 블록 전달
stage('Build', myBlock)

// 또는 직접 전달
stage('Build') {
    echo 'Hello'
    sh 'make build'
}
```

**3. delegate 패턴**

```groovy
// delegate를 통해 블록 내부에서 메서드 호출 가능
pipeline {
    // 여기서 agent, stages 등은 pipeline 객체의 메서드
    agent any
    stages {
        // 여기서 stage는 stages 객체의 메서드
        stage('Build') {
            // 여기서 steps는 stage 객체의 메서드
            steps {
                // 여기서 sh, echo는 steps 객체의 메서드
                sh 'make'
            }
        }
    }
}
```

**4. 메서드 체이닝과 빌더 패턴**

```groovy
// Groovy DSL 빌더 예시
html {
    head {
        title 'My Page'
    }
    body {
        div(class: 'container') {
            p 'Hello World'
        }
    }
}

// 결과:
// <html>
//   <head><title>My Page</title></head>
//   <body>
//     <div class="container">
//       <p>Hello World</p>
//     </div>
//   </body>
// </html>
```

#### 실제 DSL 예시 비교

**Jenkins Pipeline DSL:**

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'gradle build'
            }
        }
        stage('Test') {
            steps {
                sh 'gradle test'
            }
        }
    }
}
```

**Gradle Build DSL:**

```groovy
plugins {
    id 'java'
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.0'
    testImplementation 'junit:junit:4.13'
}

tasks.register('hello') {
    doLast {
        println 'Hello from Gradle!'
    }
}
```

**Spock Test DSL:**

```groovy
def "두 숫자를 더하면 합계가 나온다"() {
    given: "두 숫자가 주어졌을 때"
    def a = 1
    def b = 2

    when: "두 숫자를 더하면"
    def result = a + b

    then: "합계가 나온다"
    result == 3
}
```

#### DSL의 장단점

| 장점             | 단점            |
|----------------|---------------|
| 도메인 전문가가 읽기 쉬움 | 학습이 필요함       |
| 코드가 간결해짐       | 디버깅이 어려울 수 있음 |
| 실수가 줄어듦        | 유연성이 제한될 수 있음 |
| 의도가 명확해짐       | DSL 설계가 어려움   |

### 2.5 Groovy가 사용되는 곳

```
┌─────────────────────────────────────────────────────────┐
│                  Groovy 사용 사례                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Jenkins Pipeline                                     │
│     └─ CI/CD 파이프라인 정의                              │
│                                                          │
│  2. Gradle 빌드 스크립트                                  │
│     └─ build.gradle 파일                                 │
│                                                          │
│  3. Spock Framework                                      │
│     └─ Java/Groovy 테스트 프레임워크                      │
│                                                          │
│  4. Grails Framework                                     │
│     └─ 웹 애플리케이션 프레임워크                          │
│                                                          │
│  5. Spring Boot 설정                                     │
│     └─ @Bean 정의, 동적 설정                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.6 Jenkins와 Groovy의 관계

#### 왜 Jenkins는 Groovy를 선택했는가?

```
2005년: Jenkins(Hudson) 탄생 - Java로 작성됨
    │
    ▼
2011년: Jenkins로 이름 변경
    │
    ▼
2014년: 문제 인식
    │   - UI 클릭 기반 설정 → 버전 관리 불가
    │   - 복잡한 파이프라인 구성 어려움
    │   - 설정 재사용 어려움
    │
    ▼
2016년: Jenkins Pipeline 출시 (Groovy 기반)
    │
    ▼
왜 Groovy인가?
├─ 1. JVM 기반 → Jenkins(Java)와 완벽 호환
├─ 2. 스크립트 언어 → 컴파일 없이 바로 실행
├─ 3. DSL 친화적 → 읽기 쉬운 파이프라인 문법 구현
├─ 4. Java 문법 호환 → Java 개발자 진입 장벽 낮음
└─ 5. 동적 타입 → 유연한 설정 가능
```

#### Groovy가 Jenkins Pipeline에 적합한 이유

**1. DSL (Domain Specific Language) 구현에 최적화**

```groovy
// Groovy의 DSL 기능으로 이런 문법이 가능해짐
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
    }
}
```

이 코드는 사실 Groovy 메서드 호출의 연속입니다:

```groovy
// 실제로는 이런 의미
pipeline({
    agent('any')
    stages({
        stage('Build', {
            steps({
                sh('make build')
            })
        })
    })
})
```

**2. 클로저(Closure)가 핵심**

```groovy
// 클로저 덕분에 블록 {} 문법이 가능
stage('Build') {
    // 이 블록이 클로저
    steps {
        // 이것도 클로저
        echo 'Building...'
    }
}

// 클로저 없이 Java 스타일이라면?
Stage buildStage = new Stage("Build");
Steps steps = new Steps();
steps.add(new EchoStep("Building..."));
buildStage.setSteps(steps);
// 훨씬 장황하고 읽기 어려움
```

**3. 메서드 괄호 생략**

```groovy
// Groovy
echo 'Hello'
sh 'make build'

// Java 스타일이라면
echo('Hello');
sh('make build');
```

**4. Java 라이브러리 직접 사용**

```groovy
// Jenkins Pipeline에서 Java 클래스 직접 사용 가능
import java.time.LocalDateTime
import java.nio.file.Files

node {
    def now = LocalDateTime.now()
    echo "Current time: ${now}"
}
```

### 2.7 Groovy vs Java 문법 비교

| 항목            | Java                 | Groovy            |
|---------------|----------------------|-------------------|
| 세미콜론          | 필수                   | 생략 가능             |
| 타입 선언         | 필수                   | `def`로 생략 가능      |
| Getter/Setter | 직접 작성                | 자동 생성             |
| 문자열 보간        | `"Hello " + name`    | `"Hello ${name}"` |
| 리스트 생성        | `Arrays.asList(...)` | `[1, 2, 3]`       |
| 맵 생성          | `new HashMap<>()`    | `[key: value]`    |
| 클로저           | 없음 (람다로 대체)          | 기본 지원             |
| null 안전       | `if (obj != null)`   | `obj?.method()`   |
| 메서드 괄호        | 필수                   | 생략 가능             |

### 2.8 Gradle에서의 Groovy

Jenkins와 함께 Groovy를 많이 사용하는 곳이 **Gradle**입니다.

```groovy
// build.gradle (Groovy DSL)
plugins {
    id 'java'
}

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter:3.0.0'
    testImplementation 'junit:junit:4.13.2'
}

// 이것도 사실 Groovy 메서드 호출
// plugins({ id('java') })
// dependencies({ implementation('...') })
```

```kotlin
// build.gradle.kts (Kotlin DSL) - 최근 대안
plugins {
    java
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter:3.0.0")
    testImplementation("junit:junit:4.13.2")
}
```

### 2.9 Jenkins Pipeline 작동 원리

```
┌─────────────────────────────────────────────────────────┐
│                    Jenkinsfile                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │ pipeline {                                        │  │
│  │     agent any                                     │  │
│  │     stages {                                      │  │
│  │         stage('Build') { ... }                    │  │
│  │     }                                             │  │
│  │ }                                                 │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Groovy Compiler/Interpreter                 │
│         Jenkinsfile을 Groovy로 파싱 및 실행               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Jenkins Pipeline Plugin                │
│  pipeline(), agent(), stage() 등 DSL 메서드 제공          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     Jenkins Core (Java)                  │
│            실제 빌드 작업 실행 (노드, 에이전트)             │
└─────────────────────────────────────────────────────────┘
```

### 2.10 알아두면 좋은 점

**Jenkins Pipeline의 Groovy 제약사항:**

```groovy
// 1. CPS (Continuation Passing Style) 변환
//    - Pipeline은 중단/재개가 가능해야 함
//    - 일부 Groovy 문법이 제한됨

// 2. Serializable 요구
//    - 변수가 직렬화 가능해야 함
//    - 일부 Java 객체 사용 제한

// 3. Sandbox 보안
//    - 위험한 메서드 호출 제한
//    - Script Approval 필요할 수 있음

// 해결책: @NonCPS 어노테이션
@NonCPS
def processData(data) {
    // CPS 변환 없이 실행
    // 순수 Groovy 문법 사용 가능
    // 단, 이 함수는 중단/재개 불가
    return data.collect { it.toUpperCase() }
}
```

---

## 3. Groovy 기초 문법

이제 Groovy 문법을 하나씩 배워봅시다.

### 3.1 변수 선언

```groovy
// def 키워드로 동적 타입 선언
def name = "Jenkins"
def count = 10
def isEnabled = true

// 타입 명시도 가능
String message = "Hello"
int number = 42

// 상수 (final)
final String VERSION = "1.0.0"
```

### 3.2 문자열

```groovy
// 작은따옴표: 일반 문자열 (변수 치환 안 됨)
def str1 = 'Hello World'

// 큰따옴표: GString (변수 치환 됨)
def name = "Jenkins"
def str2 = "Hello ${name}"      // "Hello Jenkins"
def str3 = "Count: ${1 + 2}"    // "Count: 3"

// 여러 줄 문자열
def multiLine = """
    이것은
    여러 줄
    문자열입니다.
"""

// 문자열 메서드
def text = "hello world"
text.toUpperCase()      // "HELLO WORLD"
text.contains("world")  // true
text.split(" ")         // ["hello", "world"]
text.trim()             // 앞뒤 공백 제거
```

### 3.3 리스트 (List)

```groovy
// 리스트 생성
def fruits = ['apple', 'banana', 'orange']
def numbers = [1, 2, 3, 4, 5]
def empty = []

// 접근
fruits[0]           // 'apple'
fruits[-1]          // 'orange' (마지막)
fruits.first()      // 'apple'
fruits.last()       // 'orange'

// 추가/삭제
fruits.add('grape')
fruits << 'melon'   // add와 동일
fruits.remove('banana')

// 크기
fruits.size()       // 4
fruits.isEmpty()    // false

// 포함 여부
fruits.contains('apple')  // true
'apple' in fruits         // true (Groovy 스타일)

// 반복
fruits.each { fruit ->
    println fruit
}

// 필터링
def longNames = fruits.findAll { it.length() > 5 }

// 변환
def upperFruits = fruits.collect { it.toUpperCase() }
```

### 3.4 맵 (Map)

```groovy
// 맵 생성
def person = [
        name: 'Kim',
        age : 30,
        city: 'Seoul'
]

// 접근
person.name         // 'Kim'
person['name']      // 'Kim'
person.get('name')  // 'Kim'

// 추가/수정
person.job = 'Developer'
person['email'] = 'kim@example.com'

// 삭제
person.remove('age')

// 반복
person.each { key, value ->
    println "${key}: ${value}"
}

// 키/값 목록
person.keySet()     // [name, age, city]
person.values()     // [Kim, 30, Seoul]

// 중첩 맵
def config = [
        database: [
                host: 'localhost',
                port: 5432
        ],
        cache   : [
                enabled: true
        ]
]
config.database.host  // 'localhost'
```

### 3.5 조건문

```groovy
// if-else
def score = 85

if (score >= 90) {
    println "A"
} else if (score >= 80) {
    println "B"
} else {
    println "C"
}

// 삼항 연산자
def result = score >= 60 ? "Pass" : "Fail"

// Elvis 연산자 (?:) - null 체크
def name = null
def displayName = name ?: "Unknown"  // "Unknown"

// Safe navigation (?.) - null-safe 접근
def user = null
def userName = user?.name  // null (에러 안 남)

// switch
def day = 'Monday'
switch (day) {
    case 'Monday':
    case 'Tuesday':
        println "Weekday"
        break
    case 'Saturday':
    case 'Sunday':
        println "Weekend"
        break
    default:
        println "Unknown"
}
```

### 3.6 반복문

```groovy
// for 루프
for (int i = 0; i < 5; i++) {
    println i
}

// for-in 루프
for (item in [1, 2, 3]) {
    println item
}

// 범위 (Range)
for (i in 1..5) {
    println i  // 1, 2, 3, 4, 5
}

for (i in 1..<5) {
    println i  // 1, 2, 3, 4 (5 제외)
}

// while
def count = 0
while (count < 3) {
    println count
    count++
}

// each (가장 Groovy스러운 방식)
[1, 2, 3].each { num ->
    println num
}

// eachWithIndex
['a', 'b', 'c'].eachWithIndex { item, index ->
    println "${index}: ${item}"
}

// times
5.times { i ->
    println "반복 ${i}"
}
```

### 3.7 함수 (메서드)

```groovy
// 기본 함수
def greet(name) {
    return "Hello, ${name}!"
}

greet("Kim")  // "Hello, Kim!"

// return 생략 가능 (마지막 표현식이 반환값)
def add(a, b) {
    a + b
}

add(1, 2)  // 3

// 기본값 파라미터
def sayHello(name = "World") {
    "Hello, ${name}!"
}

sayHello()       // "Hello, World!"
sayHello("Kim")  // "Hello, Kim!"

// 가변 인자
def sum(int ... numbers) {
    numbers.sum()
}

sum(1, 2, 3, 4)  // 10

// Map 파라미터 (Jenkins에서 자주 사용)
def configure(Map args) {
    println "Name: ${args.name}"
    println "Port: ${args.port ?: 8080}"
}

configure(name: 'MyApp', port: 3000)
configure(name: 'MyApp')  // port는 기본값 8080
```

### 3.8 클로저 (Closure)

클로저는 Groovy의 핵심 개념으로, Jenkins Pipeline에서 매우 중요합니다.

```groovy
// 클로저 정의
def myClosure = { println "Hello!" }
myClosure()  // "Hello!"

// 파라미터가 있는 클로저
def greet = { name -> println "Hello, ${name}!" }
greet("Kim")

// 암시적 파라미터 'it'
def double = {
    it * 2
}
double(5)  // 10

// 여러 파라미터
def add = { a, b -> a + b }
add(1, 2)  // 3

// 클로저를 인자로 받는 함수
def doTwice(closure) {
    closure()
    closure()
}

doTwice { println "Hi!" }
// Hi!
// Hi!

// 클로저와 delegate (Jenkins Pipeline 핵심)
def config = {
    name = "MyApp"
    version = "1.0"
}
// Jenkins는 이 패턴을 사용해서 DSL을 구현함
```

### 3.9 예외 처리

```groovy
// try-catch
try {
    def result = 10 / 0
} catch (ArithmeticException e) {
    println "수학 오류: ${e.message}"
} catch (Exception e) {
    println "일반 오류: ${e.message}"
} finally {
    println "항상 실행"
}

// throw
def divide(a, b) {
    if (b == 0) {
        throw new IllegalArgumentException("0으로 나눌 수 없습니다")
    }
    return a / b
}
```

---

## 4. 선언형 Pipeline (Declarative)

### 5.1 기본 구조

```groovy
pipeline {
    agent any  // 필수: 실행 환경

    stages {   // 필수: 스테이지들
        stage('Build') {
            steps {
                echo 'Building...'
            }
        }
    }
}
```

### 4.2 핵심 요소

```groovy
pipeline {
    // ─────────────────────────────────────────────
    // 1. agent: 어디서 실행할지
    // ─────────────────────────────────────────────
    agent any                    // 아무 노드에서나
    // agent none               // agent 없음 (stage별로 지정)
    // agent { label 'linux' }  // 특정 라벨 노드
    // agent { docker 'node:18' }  // Docker 컨테이너

    // ─────────────────────────────────────────────
    // 2. environment: 환경변수
    // ─────────────────────────────────────────────
    environment {
        APP_NAME = 'my-app'
        VERSION = '1.0.0'
        // credentials 사용
        DOCKER_CREDS = credentials('docker-hub-credentials')
    }

    // ─────────────────────────────────────────────
    // 3. options: 파이프라인 옵션
    // ─────────────────────────────────────────────
    options {
        timeout(time: 1, unit: 'HOURS')     // 타임아웃
        timestamps()                         // 타임스탬프 출력
        disableConcurrentBuilds()           // 동시 빌드 방지
        buildDiscarder(logRotator(numToKeepStr: '10'))  // 빌드 보관
    }

    // ─────────────────────────────────────────────
    // 4. parameters: 빌드 파라미터
    // ─────────────────────────────────────────────
    parameters {
        string(name: 'BRANCH', defaultValue: 'main', description: '브랜치')
        choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: '환경')
        booleanParam(name: 'DEPLOY', defaultValue: false, description: '배포 여부')
    }

    // ─────────────────────────────────────────────
    // 5. triggers: 자동 트리거
    // ─────────────────────────────────────────────
    triggers {
        pollSCM('H/5 * * * *')  // 5분마다 Git 폴링
        cron('0 2 * * *')       // 매일 새벽 2시
    }

    // ─────────────────────────────────────────────
    // 6. stages: 스테이지 정의 (필수)
    // ─────────────────────────────────────────────
    stages {
        stage('Build') {
            steps {
                echo "Building ${env.APP_NAME}..."
            }
        }

        stage('Test') {
            steps {
                echo 'Testing...'
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying...'
            }
        }
    }

    // ─────────────────────────────────────────────
    // 7. post: 후처리
    // ─────────────────────────────────────────────
    post {
        always {
            echo '항상 실행'
            cleanWs()  // 워크스페이스 정리
        }
        success {
            echo '성공 시 실행'
        }
        failure {
            echo '실패 시 실행'
        }
        unstable {
            echo '불안정 시 실행'
        }
        changed {
            echo '상태 변경 시 실행'
        }
    }
}
```

### 4.3 steps 상세

```groovy
stages {
    stage('Steps 예제') {
        steps {
            // ─────────────────────────────────────
            // 기본 명령어
            // ─────────────────────────────────────
            echo 'Hello World'              // 출력
            sh 'echo "Shell command"'       // 셸 명령 (Linux)
            bat 'echo "Batch command"'      // 배치 명령 (Windows)

            // ─────────────────────────────────────
            // 셸 명령 상세
            // ─────────────────────────────────────
            // 결과를 변수에 저장
            script {
                def output = sh(script: 'whoami', returnStdout: true).trim()
                echo "User: ${output}"
            }

            // 종료 코드 확인
            script {
                def status = sh(script: 'exit 0', returnStatus: true)
                echo "Exit code: ${status}"
            }

            // ─────────────────────────────────────
            // 파일 작업
            // ─────────────────────────────────────
            writeFile file: 'output.txt', text: 'Hello'
            def content = readFile 'output.txt'

            // 파일 존재 확인
            script {
                if (fileExists('output.txt')) {
                    echo 'File exists'
                }
            }

            // ─────────────────────────────────────
            // 디렉토리 작업
            // ─────────────────────────────────────
            dir('subdir') {
                // subdir 안에서 실행
                sh 'pwd'
            }

            // ─────────────────────────────────────
            // 아카이브
            // ─────────────────────────────────────
            archiveArtifacts artifacts: 'build/**/*.jar'

            // ─────────────────────────────────────
            // 빌드 중단
            // ─────────────────────────────────────
            error 'Build failed!'  // 빌드 실패 처리
        }
    }
}
```

### 4.4 조건부 실행 (when)

```groovy
stages {
    stage('Deploy to Prod') {
        when {
            // 브랜치 조건
            branch 'main'

            // 환경변수 조건
            environment name: 'DEPLOY', value: 'true'

            // 표현식 조건
            expression { return params.DEPLOY == true }

            // 여러 조건 AND
            allOf {
                branch 'main'
                environment name: 'DEPLOY', value: 'true'
            }

            // 여러 조건 OR
            anyOf {
                branch 'main'
                branch 'release/*'
            }

            // NOT 조건
            not {
                branch 'develop'
            }

            // 변경된 파일 조건
            changeset "src/**/*.java"
        }
        steps {
            echo 'Deploying to production...'
        }
    }
}
```

### 5.5 병렬 실행 (parallel)

```groovy
stages {
    stage('Test') {
        parallel {
            stage('Unit Test') {
                steps {
                    sh 'npm run test:unit'
                }
            }
            stage('Integration Test') {
                steps {
                    sh 'npm run test:integration'
                }
            }
            stage('E2E Test') {
                steps {
                    sh 'npm run test:e2e'
                }
            }
        }
    }
}
```

### 4.6 입력 대기 (input)

```groovy
stages {
    stage('Deploy Approval') {
        steps {
            input message: '프로덕션에 배포하시겠습니까?',
                    ok: '배포',
                    submitter: 'admin,deploy-team'
        }
    }

    stage('Deploy with Parameters') {
        steps {
            script {
                def userInput = input(
                        message: '배포 설정',
                        parameters: [
                                choice(name: 'ENV', choices: ['staging', 'prod']),
                                string(name: 'VERSION', defaultValue: '1.0.0')
                        ]
                )
                echo "Deploying ${userInput.VERSION} to ${userInput.ENV}"
            }
        }
    }
}
```

### 4.7 credentials 사용

```groovy
pipeline {
    agent any

    environment {
        // Username/Password
        NEXUS_CREDS = credentials('nexus-credentials')
        // → NEXUS_CREDS_USR, NEXUS_CREDS_PSW 자동 생성

        // Secret text
        API_KEY = credentials('api-key')

        // Secret file
        KUBECONFIG = credentials('kubeconfig-file')
    }

    stages {
        stage('Use Credentials') {
            steps {
                // environment에서 정의한 경우
                sh 'echo "User: ${NEXUS_CREDS_USR}"'

                // withCredentials 블록 사용
                withCredentials([
                        usernamePassword(
                                credentialsId: 'docker-hub',
                                usernameVariable: 'DOCKER_USER',
                                passwordVariable: 'DOCKER_PASS'
                        )
                ]) {
                    sh 'docker login -u ${DOCKER_USER} -p ${DOCKER_PASS}'
                }

                // SSH Key
                withCredentials([
                        sshUserPrivateKey(
                                credentialsId: 'ssh-key',
                                keyFileVariable: 'SSH_KEY'
                        )
                ]) {
                    sh 'ssh -i ${SSH_KEY} user@server'
                }
            }
        }
    }
}
```

---

## 5. 스크립트형 Pipeline (Scripted)

### 5.1 기본 구조

```groovy
node {
    // 여기에 파이프라인 로직
    stage('Build') {
        echo 'Building...'
    }
}
```

### 5.2 node와 stage

```groovy
// 특정 노드에서 실행
node('linux') {
    stage('Checkout') {
        checkout scm
    }

    stage('Build') {
        sh 'make build'
    }
}

// 여러 노드 사용
node('build-node') {
    stage('Build') {
        sh 'make build'
        stash name: 'build-output', includes: 'dist/**'
    }
}

node('test-node') {
    stage('Test') {
        unstash 'build-output'
        sh 'make test'
    }
}
```

### 5.3 완전한 Groovy 제어

스크립트형의 장점은 **완전한 Groovy 문법**을 사용할 수 있다는 것입니다.

```groovy
node {
    // 변수 사용
    def modules = ['api', 'web', 'batch']
    def buildResults = [:]

    stage('Checkout') {
        checkout scm
    }

    // 동적 스테이지 생성
    modules.each { module ->
        stage("Build ${module}") {
            try {
                sh "gradle :${module}:build"
                buildResults[module] = 'SUCCESS'
            } catch (Exception e) {
                buildResults[module] = 'FAILED'
                currentBuild.result = 'UNSTABLE'
            }
        }
    }

    // 조건부 로직
    stage('Deploy') {
        if (env.BRANCH_NAME == 'main') {
            def failedModules = buildResults.findAll { k, v -> v == 'FAILED' }

            if (failedModules.isEmpty()) {
                sh 'make deploy'
            } else {
                echo "Skipping deploy. Failed modules: ${failedModules.keySet()}"
            }
        }
    }

    // 결과 요약
    stage('Summary') {
        buildResults.each { module, result ->
            echo "${module}: ${result}"
        }
    }
}
```

### 5.4 예외 처리

```groovy
node {
    stage('Build') {
        try {
            sh 'make build'
        } catch (Exception e) {
            echo "Build failed: ${e.message}"
            currentBuild.result = 'FAILURE'
            throw e  // 다시 던지기
        } finally {
            echo 'Cleanup...'
        }
    }

    // catchError: 실패해도 계속 진행
    stage('Optional Step') {
        catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
            sh 'optional-command'
        }
    }
}
```

### 5.5 병렬 실행

```groovy
node {
    stage('Parallel Tests') {
        parallel(
                'Unit Tests': {
                    sh 'npm run test:unit'
                },
                'Integration Tests': {
                    sh 'npm run test:integration'
                },
                'E2E Tests': {
                    node('browser-node') {  // 다른 노드에서 실행
                        sh 'npm run test:e2e'
                    }
                }
        )
    }

    // 동적 병렬 빌드
    stage('Build Modules') {
        def modules = ['api', 'web', 'batch']
        def parallelBuilds = [:]

        modules.each { module ->
            parallelBuilds[module] = {
                sh "gradle :${module}:build"
            }
        }

        parallel parallelBuilds
    }
}
```

### 5.6 선언형과 스크립트형 혼합

```groovy
pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                // script 블록 안에서 스크립트형 문법 사용
                script {
                    def modules = sh(
                            script: 'ls -d */',
                            returnStdout: true
                    ).trim().split('\n')

                    modules.each { module ->
                        echo "Found module: ${module}"
                    }
                }
            }
        }
    }
}
```

---

## 6. 공유 라이브러리 (Shared Library)

### 6.1 개념

공유 라이브러리는 여러 파이프라인에서 **공통 코드를 재사용**하기 위한 방법입니다.

```
여러 Jenkinsfile에서 동일한 로직 반복
    ↓
공유 라이브러리로 추출
    ↓
@Library('my-library') _ 로 호출
```

### 6.2 디렉토리 구조

```
(shared-library-repo)/
├── vars/                    # 전역 변수/함수 (Pipeline에서 직접 호출)
│   ├── build.groovy         # build() 함수로 호출
│   ├── deploy.groovy        # deploy() 함수로 호출
│   └── notify.groovy        # notify() 함수로 호출
│
├── src/                     # Groovy 클래스 (import 필요)
│   └── com/
│       └── example/
│           └── Utils.groovy
│
└── resources/               # 리소스 파일
    └── templates/
        └── email.html
```

### 6.3 vars/ 함수 작성

**vars/build.groovy:**

```groovy
// call() 메서드가 기본 진입점
def call() {
    echo 'Default build'
}

// 파라미터 받기 (Map 권장)
def call(Map config = [:]) {
    def language = config.language ?: 'java'
    def version = config.version ?: '11'

    echo "Building ${language} project with version ${version}"

    switch (language) {
        case 'java':
            sh 'gradle build'
            break
        case 'node':
            sh 'npm install && npm run build'
            break
        default:
            error "Unknown language: ${language}"
    }
}
```

**Jenkinsfile에서 사용:**

```groovy
@Library('my-shared-library') _

build()                          // 기본 호출
build(language: 'java', version: '17')
build(language: 'node')
```

### 6.4 복잡한 예제 (app-builder-plugin 스타일)

**vars/build.groovy:**

```groovy
def call(Map args = [:]) {
    // 설정 생성
    def config = generateConfig(args)

    // Pipeline 시작
    node('buildkit') {
        checkout scm

        stage('변경 감지') {
            def modules = detectChanges(config)
            config.modules = modules
        }

        // 동적 스테이지 생성
        config.modules.each { module ->
            stage("Build: ${module.name}") {
                if (module.changed) {
                    buildModule(config, module)
                } else {
                    echo "Skipped: ${module.name}"
                }
            }
        }
    }
}

// Private 함수들
def generateConfig(Map args) {
    return [
            logLevel: args.logLevel ?: 'info',
            timeout : args.timeout ?: 30
    ]
}

def detectChanges(Map config) {
    // 변경 감지 로직
    sh 'gradle detectChanges'
    def output = readFile 'build/changes.json'
    return readJSON(text: output)
}

def buildModule(Map config, Map module) {
    sh "gradle build -p ${module.path}"
}
```

### 6.5 src/ 클래스 작성

**src/com/example/GitUtils.groovy:**

```groovy
package com.example

class GitUtils implements Serializable {
    def script  // Pipeline script 참조

    GitUtils(script) {
        this.script = script
    }

    String getBranch() {
        return script.sh(
                script: 'git branch --show-current',
                returnStdout: true
        ).trim()
    }

    String getCommitHash() {
        return script.sh(
                script: 'git rev-parse --short HEAD',
                returnStdout: true
        ).trim()
    }

    List<String> getChangedFiles() {
        def output = script.sh(
                script: 'git diff --name-only HEAD~1 HEAD',
                returnStdout: true
        ).trim()
        return output ? output.split('\n').toList() : []
    }
}
```

**Jenkinsfile에서 사용:**

```groovy
@Library('my-shared-library') _
import com.example.GitUtils

node {
    checkout scm

    def git = new GitUtils(this)

    echo "Branch: ${git.getBranch()}"
    echo "Commit: ${git.getCommitHash()}"
    echo "Changed files: ${git.getChangedFiles()}"
}
```

### 6.6 Jenkins에 라이브러리 등록

**Jenkins 관리 > System > Global Pipeline Libraries:**

| 설정                                             | 값                      |
|------------------------------------------------|------------------------|
| Name                                           | my-shared-library      |
| Default version                                | main                   |
| Load implicitly                                | 체크 시 @Library 없이 사용 가능 |
| Allow default version to be overridden         | 체크                     |
| Include @Library changes in job recent changes | 체크                     |

**Source Code Management:**

- Git
- Repository URL: https://github.com/your-org/shared-library.git
- Credentials: (선택)

---

## 7. 실전 예제

### 7.1 기본 Java 프로젝트 (선언형)

```groovy
pipeline {
    agent any

    tools {
        jdk 'JDK17'
        gradle 'Gradle8'
    }

    environment {
        GRADLE_OPTS = '-Dorg.gradle.daemon=false'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'gradle clean build -x test'
            }
        }

        stage('Test') {
            steps {
                sh 'gradle test'
            }
            post {
                always {
                    junit 'build/test-results/**/*.xml'
                }
            }
        }

        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'build/libs/*.jar'
            }
        }
    }

    post {
        failure {
            echo 'Build failed!'
        }
    }
}
```

### 7.2 멀티모듈 동적 빌드 (스크립트형)

```groovy
node {
    def changedModules = []

    stage('Checkout') {
        checkout scm
    }

    stage('Detect Changes') {
        // 변경된 파일에서 모듈 추출
        def changedFiles = sh(
                script: 'git diff --name-only HEAD~1 HEAD',
                returnStdout: true
        ).trim().split('\n')

        changedFiles.each { file ->
            def module = file.split('/')[0]
            if (!changedModules.contains(module)) {
                changedModules.add(module)
            }
        }

        echo "Changed modules: ${changedModules}"
    }

    // 변경된 모듈만 빌드
    changedModules.each { module ->
        stage("Build: ${module}") {
            dir(module) {
                sh 'gradle build'
            }
        }
    }

    stage('Summary') {
        echo "Built ${changedModules.size()} modules"
    }
}
```

### 7.3 Docker 빌드 및 배포

```groovy
pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'registry.example.com'
        IMAGE_NAME = 'my-app'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Build Image') {
            steps {
                script {
                    docker.build("${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}")
                }
            }
        }

        stage('Push Image') {
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-credentials') {
                        docker.image("${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}").push()
                        docker.image("${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}").push('latest')
                    }
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh """
                    kubectl set image deployment/my-app \
                        my-app=${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                """
            }
        }
    }
}
```

### 7.4 Kubernetes에서 실행 (app-builder-plugin 스타일)

```groovy
node('buildkit') {  // Kubernetes Pod로 실행
    checkout scm

    // buildkit 컨테이너 안에서 실행
    container('buildkit') {
        stage('Build') {
            sh 'gradle build'
        }

        stage('Docker Build') {
            sh '''
                buildctl build \
                    --frontend dockerfile.v0 \
                    --local context=. \
                    --local dockerfile=. \
                    --output type=image,name=my-image:latest,push=true
            '''
        }
    }

    // kubectl 컨테이너에서 배포
    container('kubectl') {
        stage('Deploy') {
            sh 'kubectl apply -f k8s/'
        }
    }
}
```

---

## 8. 자주 사용하는 패턴

### 8.1 환경변수 활용

```groovy
pipeline {
    agent any

    environment {
        // 직접 정의
        APP_NAME = 'my-app'

        // Jenkins 내장 변수 사용
        BUILD_ID = "${env.BUILD_NUMBER}"
        BRANCH = "${env.BRANCH_NAME}"

        // 스크립트로 값 설정
        GIT_HASH = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
    }

    stages {
        stage('Info') {
            steps {
                echo "App: ${env.APP_NAME}"
                echo "Build: ${env.BUILD_ID}"
                echo "Branch: ${env.BRANCH}"
                echo "Commit: ${env.GIT_HASH}"

                // Jenkins 내장 변수들
                echo "Workspace: ${env.WORKSPACE}"
                echo "Job Name: ${env.JOB_NAME}"
                echo "Build URL: ${env.BUILD_URL}"
            }
        }
    }
}
```

### 8.2 파라미터 활용

```groovy
pipeline {
    agent any

    parameters {
        string(name: 'VERSION', defaultValue: '1.0.0')
        choice(name: 'ENVIRONMENT', choices: ['dev', 'staging', 'prod'])
        booleanParam(name: 'RUN_TESTS', defaultValue: true)
        text(name: 'RELEASE_NOTES', defaultValue: '')
    }

    stages {
        stage('Build') {
            steps {
                echo "Version: ${params.VERSION}"
                echo "Environment: ${params.ENVIRONMENT}"
            }
        }

        stage('Test') {
            when {
                expression { params.RUN_TESTS }
            }
            steps {
                sh 'gradle test'
            }
        }
    }
}
```

### 8.3 조건부 스테이지

```groovy
pipeline {
    agent any

    stages {
        // main 브랜치에서만
        stage('Deploy to Prod') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to production'
            }
        }

        // PR에서만
        stage('PR Check') {
            when {
                changeRequest()
            }
            steps {
                echo 'Running PR checks'
            }
        }

        // 특정 파일 변경 시
        stage('Build Docs') {
            when {
                changeset "docs/**"
            }
            steps {
                echo 'Building documentation'
            }
        }
    }
}
```

---

## 9. 디버깅 팁

### 9.1 로그 출력

```groovy
// 일반 출력
echo 'Hello'
println 'Hello'  // 스크립트형에서만

// 변수 확인
echo "Variable: ${myVar}"
echo "Type: ${myVar.getClass()}"

// 맵/리스트 예쁘게 출력
echo groovy.json.JsonOutput.prettyPrint(
        groovy.json.JsonOutput.toJson(myMap)
)
```

### 9.2 환경 확인

```groovy
stage('Debug') {
    steps {
        // 모든 환경변수 출력
        sh 'printenv | sort'

        // 현재 디렉토리
        sh 'pwd'

        // 파일 목록
        sh 'ls -la'

        // Git 상태
        sh 'git status'
        sh 'git log --oneline -5'
    }
}
```

### 9.3 Replay 기능

Jenkins 빌드 페이지에서 **Replay** 버튼을 클릭하면:

- 파이프라인 코드를 수정해서 다시 실행 가능
- Git에 커밋하지 않고 테스트 가능
- 디버깅에 매우 유용

---

## 10. 참고 자료

### 공식 문서

- [Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
- [Pipeline Steps Reference](https://www.jenkins.io/doc/pipeline/steps/)
- [Shared Libraries](https://www.jenkins.io/doc/book/pipeline/shared-libraries/)

### Groovy

- [Groovy Documentation](https://groovy-lang.org/documentation.html)
- [Groovy Style Guide](https://groovy-lang.org/style-guide.html)

### 예제

- [Pipeline Examples](https://www.jenkins.io/doc/pipeline/examples/)
