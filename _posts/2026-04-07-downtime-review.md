---
layout: post
title: Downtime 서비스 코드 리뷰 가이드
tags: [ kotlin, spring-boot, webflux, jooq, review ]
---


> 다운타임 관리 서비스 전체 분석 문서 (팀 공유용)
>
> **구 버전**: `downtime-api/v1.0.x` (Java 8, Spring Boot 2.3, MyBatis, JDBC)
> **신 버전**: `downtime-api/v2.0.x` (Kotlin, Spring Boot 4.0, jOOQ, R2DBC)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [downtime 모듈 (공유 라이브러리)](#2-downtime-모듈-공유-라이브러리)
3. [downtime-api 모듈 (REST API 서버)](#3-downtime-api-모듈-rest-api-서버)
4. [빌드 시스템](#4-빌드-시스템)
5. [설정 파일 분석](#5-설정-파일-분석)
6. [테스트 코드 분석](#6-테스트-코드-분석)
7. [요청 흐름 따라가기](#7-요청-흐름-따라가기)
8. [핵심 패턴 & 기법 정리](#8-핵심-패턴--기법-정리)
9. [핵심 설계 원칙 요약](#9-핵심-설계-원칙-요약)
10. [v1 vs v2 변경점 비교](#10-v1-vs-v2-변경점-비교)
11. [Kotlin 핵심 문법 입문](#11-kotlin-핵심-문법-입문)
12. [예상 질문 & 답변 (Q&A)](#12-예상-질문--답변-qa)
13. [향후 적용 계획](#13-향후-적용-계획)
14. [전체 정리](#14-전체-정리)

---

## 1. 프로젝트 개요

### 1.1 목적

다운타임 관리 서비스. 문자, 팩스, 카카오톡, 카드, 계좌, 세금계산서, 현금영수증 등 각 서비스의 외부 연동 대상(타겟)별 점검/장애 일정을 등록·조회·삭제한다. 다른 MSA 서비스가 이 API를 호출하여 현재 다운타임 여부를 판단하고, 필요 시 대체 타겟으로 우회 처리한다.

### 1.2 기술 스택

| 항목 | 기술 |
|------|------|
| 언어 | Kotlin 2.3.10 |
| JDK | Java 25 |
| 프레임워크 | Spring Boot 4.0.3 (WebFlux) |
| DB 접근 | R2DBC (Non-blocking) + jOOQ 3.20 (Type-safe DSL) |
| DB | PostgreSQL 17 |
| DB 마이그레이션 | Flyway |
| 비동기 모델 | Kotlin Coroutines + Flow |
| 빌드 | Gradle (Kotlin DSL), Nx (모노레포 관리) |
| 보안 | Spring Security OAuth2 Resource Server (JWT) |
| 설정 | Spring Cloud Config 2025.1.1 |
| 모니터링 | Spring Actuator + Micrometer Prometheus |
| 테스트 | Testcontainers + WebTestClient |
| CI/CD | Jenkins, Nexus (Maven 저장소) |

### 1.3 아키텍처 & 모듈 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Downtime 서비스                              │
│                                                                     │
│  ┌──────────────────┐      ┌─────────────────────────────────────┐  │
│  │  downtime 모듈   │      │        downtime-api 모듈            │  │
│  │  (공유 라이브러리)│◄────│        (REST API 서버)               │  │
│  │                  │      │                                     │  │
│  │  - ServiceType   │      │  Controller ─► Service ─► Repository│  │
│  │  - TargetType    │      │       │            │                │  │
│  │  - Properties    │      │       │       Validator             │  │
│  │  - Flyway SQL    │      │       │                             │  │
│  └──────────────────┘      └──────────┬──────────────────────────┘  │
│           │                           │                             │
│           ▼                           ▼                             │
│   다른 MSA에서                    PostgreSQL                        │
│   라이브러리로 의존               (R2DBC + jOOQ)                    │
└─────────────────────────────────────────────────────────────────────┘
         ▲
         │ GET /api/downtimes/active
         │
    다른 MSA 서비스들
    (문자, 팩스, 카카오 등)
```

**이 서비스가 하는 일:**
- 문자, 팩스, 카카오톡, 카드, 계좌, 세금계산서, 현금영수증 등 외부 연동 서비스의 **점검/장애 일정을 관리**
- 다른 MSA가 "지금 KB은행 점검 중이야?" 같은 질문을 이 API에 물어보고, 점검 중이면 대체 타겟으로 우회

```
downtime/                          # 루트 프로젝트
├── build.gradle.kts               # 루트 빌드 (공통 플러그인, 레포지토리 설정)
├── settings.gradle.kts            # include("downtime"), include("downtime-api")
├── gradle.properties              # 프로젝트 그룹, Nexus URL, Gradle 옵션
├── nx.json                        # Nx 모노레포 설정 (릴리즈/버전 관리)
│
├── downtime/                      # [모듈 1] 공유 라이브러리
│   ├── build.gradle.kts           # maven-publish 포함 → Nexus에 배포
│   └── src/main/
│       ├── kotlin/.../enums/      # ServiceType, TargetType enum
│       ├── kotlin/.../config/     # DowntimeProperties
│       └── resources/
│           ├── application-downtime.yaml
│           └── db/migration/      # Flyway SQL 스크립트
│
└── downtime-api/                  # [모듈 2] REST API 서버
    ├── build.gradle.kts           # jOOQ 코드 생성, 의존성 정의
    └── src/
        ├── main/kotlin/.../api/
        │   ├── DowntimeApiApplication.kt
        │   ├── config/            # JooqR2dbcConfig
        │   ├── controller/        # DowntimeController
        │   ├── service/           # DowntimeService
        │   ├── repository/        # DowntimeRepository
        │   ├── domain/            # Downtime (도메인 모델)
        │   ├── dto/               # DowntimeInsertDto
        │   ├── validator/         # DowntimeValidator
        │   └── exception/         # DowntimeErrorCode
        └── test/kotlin/           # 테스트 코드
```

**왜 2개 모듈로 나눴을까?**
- `downtime` 모듈에 있는 `DowntimeServiceType`, `DowntimeTargetType` enum은 **다른 MSA 서비스에서도 필요**
- 예: 문자 서비스가 `DowntimeTargetType.MESSAGE_LG` 같은 값을 사용해야 함
- 그래서 enum만 담긴 경량 모듈을 분리해서 라이브러리로 배포 (Nexus에 publish)
- `downtime-api`는 실제 서버 → 배포(deploy) 단위

### 1.4 빌드 설정 핵심 포인트

- **Java 25 Toolchain**: `JavaLanguageVersion.of(25)` — 모든 모듈을 Java 25 기준으로 일관 빌드
- **버전 관리**: 각 모듈의 `package.json`에서 version 읽음 (Nx 기반 릴리즈)
- **Nexus 배포**: `maven-publish` 플러그인으로 `nexus-hosted` 저장소에 발행
- **Branch 전략**: `main` → `latest.release`, 그 외 → `latest.integration`
- **Kotlin 컴파일러 옵션**: `-Xjsr305=strict` (null 안전성 강화), `-Xannotation-default-target=param-property`
- **jOOQ 코드 생성**: 빌드 시 Testcontainers + Flyway + jOOQ Generator로 타입 안전 코드 자동 생성

---

## 2. downtime 모듈 (공유 라이브러리)

### 2.1 DowntimeServiceType.kt - 서비스 유형 enum

> 파일: `downtime/src/main/kotlin/.../enums/DowntimeServiceType.kt`

```kotlin
enum class DowntimeServiceType(val text: String) {
    MESSAGE("문자"),
    FAX("팩스"),
    KAKAO("카카오톡"),
    CARD("카드"),
    BANK("계좌"),
    TAXINVOICE("세금계산서"),
    CASHBILL("현금영수증")
}
```

**분석:**
- 총 **7개 서비스 유형** 정의
- `text` 프로퍼티로 한글명을 갖고 있음 (UI 표시용)
- 이 enum 값이 DB의 `service_type` 컬럼에 문자열(`"FAX"`, `"BANK"` 등)로 저장됨

### 2.2 DowntimeTargetType.kt - 연동 대상 enum

> 파일: `downtime/src/main/kotlin/.../enums/DowntimeTargetType.kt`

```kotlin
enum class DowntimeTargetType(val serviceType: DowntimeServiceType) {
    // TAXINVOICE
    TAXINVOICE_HOMETAX(DowntimeServiceType.TAXINVOICE),
    TAXINVOICE_NTS(DowntimeServiceType.TAXINVOICE),

    // MESSAGE
    MESSAGE_INNOPOST(DowntimeServiceType.MESSAGE),
    MESSAGE_LG(DowntimeServiceType.MESSAGE),
    MESSAGE_SEJONG(DowntimeServiceType.MESSAGE),

    // BANK - 20개 은행
    BANK_KB(DowntimeServiceType.BANK),
    BANK_SHINHAN(DowntimeServiceType.BANK),
    // ... 생략
}
```

**분석:**
- 각 TargetType은 **자신이 속한 ServiceType을 프로퍼티로 보유**
- 네이밍 규칙: `{ServiceType}_{대상명}` (예: `BANK_KB`, `FAX_HANAFAX`)
- 이 관계가 등록 검증에서 사용됨: `targetType.serviceType == serviceType` 여부 확인
- **총 44개 타겟** (세금계산서 2, 현금영수증 2, 문자 3, 팩스 3, 카카오 1, 카드 13, 계좌 20)

**포인트:** enum 생성자에 `serviceType`을 넣은 것이 핵심 설계. 이걸로 "이 타겟이 이 서비스에 맞는지" 검증이 코드 한 줄로 가능해짐.

### 2.3 DowntimeProperties.kt - 설정 클래스

> 파일: `downtime/src/main/kotlin/.../config/properties/DowntimeProperties.kt`

```kotlin
@ConfigurationProperties(prefix = "knet.downtime")
data class DowntimeProperties(
    val afterWaitTime: Int   // 다운타임 종료 후 추가 대기 시간(초)
)
```

**분석:**
- `@ConfigurationProperties`로 `application.yaml`의 `knet.downtime.after-wait-time` 값을 바인딩
- 기본값 60초 (application-downtime.yaml에 정의)
- `afterWaitTime` = 다운타임이 끝나도 바로 전환하지 않고 60초 더 대기 (안전 마진)

### 2.4 application-downtime.yaml - 기본 설정

> 파일: `downtime/src/main/resources/application-downtime.yaml`

```yaml
knet:
  downtime:
    after-wait-time: 60
```

- downtime-api의 application.yaml에서 `spring.config.import: classpath:application-downtime.yaml`로 가져옴
- 별도 yaml로 분리한 이유: downtime 모듈은 다른 MSA에서도 의존하는 공유 라이브러리이므로, 기본값(`afterWaitTime: 60`)을 JAR에 포함시켜 **한 곳에서 관리**. 의존하는 MSA는 import만 하면 기본값이 적용되고, 필요 시 오버라이드 가능

### 2.5 V202602261430__init.sql - DB 스키마 (Flyway)

> 파일: `downtime/src/main/resources/db/migration/V202602261430__init.sql`

```sql
CREATE TABLE "downtimes" (
    -- 기본 키
    "downtime_seq"              INT GENERATED BY DEFAULT AS IDENTITY,

    -- 다운타임 기본 정보
    "service_type"              TEXT NOT NULL,
    "target_type"               TEXT NOT NULL,

    -- 다운타임 일정 정보
    "start_dt"                  TIMESTAMP NOT NULL,
    "end_dt"                    TIMESTAMP NOT NULL,
    "replacement_target_type"   TEXT      NULL,
    "memo"                      TEXT      NULL,

    -- 등록자 세션 정보 (9개 컬럼)
    "brand"                     TEXT      NULL,
    "product"                   TEXT      NULL,
    "partner_seq"               INT       NULL,
    "member_seq"                INT       NULL,
    "user_seq"                  INT       NULL,
    "do_session_type"           TEXT      NOT NULL,
    "do_session_seq"            INT       NULL,
    "do_dt"                     TIMESTAMP NOT NULL,
    "do_ip"                     TEXT      NULL,

    -- 삭제 여부
    "is_deleted"                BOOLEAN   NOT NULL,

    -- 삭제자 세션 정보 (9개 컬럼)
    "delete_brand"              TEXT      NULL,
    "delete_product"            TEXT      NULL,
    ...

    CONSTRAINT "pk_downtimes" PRIMARY KEY ("downtime_seq")
);
```

**분석:**
- **Flyway 네이밍 규칙**: `V{yyyyMMddHHmm}__{설명}.sql` → 버전 기반 마이그레이션
- `GENERATED BY DEFAULT AS IDENTITY` = PostgreSQL의 자동 증가 PK (SERIAL 대신 최신 방식)
- `service_type`, `target_type`은 TEXT로 저장 (enum명 그대로)
- 세션 정보가 등록/삭제 각각 **9개 컬럼**씩 총 18개 → 누가 언제 등록/삭제했는지 감사 추적
- `is_deleted` = Soft Delete용 플래그

---

## 3. downtime-api 모듈 (REST API 서버)

### 3.1 DowntimeApiApplication.kt - 진입점

> 파일: `downtime-api/src/main/kotlin/.../api/DowntimeApiApplication.kt`

```kotlin
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableConfigurationProperties(DowntimeProperties::class)
class DowntimeApiApplication

fun main(args: Array<String>) {
    runApplication<DowntimeApiApplication>(*args)
}
```

**분석:**
- `@SpringBootApplication`: 스프링 부트 표준 진입점
- `@ConfigurationPropertiesScan`: `@ConfigurationProperties` 붙은 클래스를 자동 스캔
- `@EnableConfigurationProperties(DowntimeProperties::class)`: **다른 모듈**(downtime)의 Properties를 명시적으로 활성화
  - downtime 모듈은 별도의 `@SpringBootApplication`이 없으므로, 여기서 명시적으로 등록해야 함

### 3.2 JooqR2dbcConfig.kt - jOOQ 설정

> 파일: `downtime-api/src/main/kotlin/.../api/config/JooqR2dbcConfig.kt`

```kotlin
@Configuration
class JooqR2dbcConfig {

    @Bean
    fun dslContext(connectionFactory: ConnectionFactory): DSLContext {
        return DSL.using(connectionFactory, SQLDialect.POSTGRES)
    }
}
```

**분석:**
- R2DBC의 `ConnectionFactory`를 받아서 jOOQ의 `DSLContext`를 생성
- `SQLDialect.POSTGRES` → PostgreSQL 문법 사용
- `DSLContext`가 Repository에 주입되어 타입 안전 쿼리 작성에 사용됨
- **핵심**: jOOQ는 원래 JDBC용이지만, R2DBC `ConnectionFactory`를 넘겨서 reactive로 동작

### 3.3 DowntimeInsertDto.kt - 등록 요청 DTO

> 파일: `downtime-api/src/main/kotlin/.../api/dto/DowntimeInsertDto.kt`

```kotlin
data class DowntimeInsertDto(
    val serviceType: DowntimeServiceType,     // 필수
    val targetType: DowntimeTargetType,       // 필수
    val startDt: LocalDateTime,               // 필수
    val endDt: LocalDateTime,                 // 필수
    val replacementTargetType: DowntimeTargetType? = null,  // 선택
    val memo: String? = null                  // 선택
)
```

**분석:**
- `data class`: equals/hashCode/toString/copy 자동 생성
- `val` = 불변(immutable) → 한번 생성되면 변경 불가
- `? = null` → Kotlin nullable + 기본값. JSON에서 해당 필드를 안 보내면 null로 처리
- DTO는 클라이언트 요청 데이터만 담고, 세션/삭제 정보는 포함하지 않음 (관심사 분리)

### 3.4 Downtime.kt - 도메인 모델 (핵심!)

> 파일: `downtime-api/src/main/kotlin/.../api/domain/Downtime.kt`

```kotlin
class Downtime(
    var downtimeSeq: Int? = null,            // PK (INSERT 시 null → DB에서 생성)

    var serviceType: DowntimeServiceType,
    var targetType: DowntimeTargetType,

    var startDt: LocalDateTime,
    var endDt: LocalDateTime,
    var replacementTargetType: DowntimeTargetType? = null,
    var memo: String? = null,

    var isDeleted: Boolean = false,

    var session: Session = Session(),        // 등록 세션
    var deleteSession: Session? = null       // 삭제 세션 (삭제 전엔 null)
)
```

**Q: 왜 `data class`가 아니라 일반 `class`인가?**
- `var`를 사용해서 상태가 변경됨 (insert 후 `downtimeSeq` 할당, delete 시 `isDeleted` 변경)
- `data class`는 불변 객체에 적합, 이처럼 상태가 변하는 도메인 객체는 일반 class가 더 적합

#### delete() 메서드

```kotlin
fun delete(session: Session) {
    this.isDeleted = true
    this.deleteSession = session
}
```

- 도메인 객체가 스스로 삭제 상태로 전이하는 **도메인 로직**
- 외부에서 필드를 직접 조작하지 않고, 의미 있는 메서드를 통해 상태 변경

#### companion object - FIELD_MAP (jOOQ 동적 쿼리 지원)

```kotlin
companion object {
    // Kotlin 프로퍼티명 → jOOQ 필드 매핑 (리플렉션으로 1회 자동 생성)
    val FIELD_MAP: Map<String, Field<*>> = Downtime::class.primaryConstructor?.parameters
        ?.mapNotNull { param ->
            param.name?.let { name ->
                DOWNTIMES.field(name.toSnakeCase())?.let { name to it }
            }
        }
        ?.toMap() ?: emptyMap()
```

**이게 뭘 하는 건가?**

1. `Downtime` 클래스의 생성자 파라미터를 리플렉션으로 순회
2. 각 파라미터명(예: `serviceType`)을 snake_case(예: `service_type`)로 변환
3. `DOWNTIMES` 테이블에서 해당 컬럼을 찾아 매핑

**결과 예시:**
```
{
  "downtimeSeq"  → DOWNTIMES.DOWNTIME_SEQ,
  "serviceType"  → DOWNTIMES.SERVICE_TYPE,
  "startDt"      → DOWNTIMES.START_DT,
  ...
}
```

**왜 필요한가?**
- search API에서 `?filters[serviceType][$eq]=FAX&sort[0]=startDt:desc` 같은 동적 쿼리를 받을 때
- 클라이언트가 보내는 필드명(`serviceType`)을 jOOQ 컬럼(`DOWNTIMES.SERVICE_TYPE`)으로 변환해야 함
- 이 매핑이 그 다리 역할

#### companion object - FIELD_EXPANSIONS

```kotlin
val FIELD_EXPANSIONS: Map<String, List<Field<*>>> = mapOf(
    "session" to Session.columns().mapNotNull { DOWNTIMES.field(it.toSnakeCase()) },
    "deleteSession" to Session.columns("delete").mapNotNull { DOWNTIMES.field(it.toSnakeCase()) }
)
```

- `session`은 실제로 DB에서 9개 컬럼으로 구성 (brand, product, partnerSeq, ...)
- `?fields=session`이라고 요청하면 9개 컬럼을 모두 SELECT하도록 확장

#### companion object - from() 팩토리 메서드

```kotlin
fun from(dto: DowntimeInsertDto, session: Session): Downtime {
    return Downtime(
        serviceType = dto.serviceType,
        targetType = dto.targetType,
        startDt = dto.startDt,
        endDt = dto.endDt,
        replacementTargetType = dto.replacementTargetType,
        memo = dto.memo,
        session = session
    )
}
```

- DTO + Session → 도메인 객체 변환
- `downtimeSeq`는 null (DB에서 생성), `isDeleted`는 false (기본값)

### 3.5 DowntimeErrorCode.kt - 에러 코드 정의

> 파일: `downtime-api/src/main/kotlin/.../api/exception/DowntimeErrorCode.kt`

```kotlin
enum class DowntimeErrorCode(
    override val status: Int,
    override val text: String
) : ErrorCode {

    ALREADY_DELETED(400, "이미 삭제된 다운타임."),
    INVALID_TARGET_TYPE(400, "대상 타겟이 서비스 타입과 일치하지 않음."),
    INVALID_REPLACEMENT_TYPE(400, "대체 타겟이 서비스 타입과 일치하지 않음."),
    TARGET_SAME_REPLACEMENT(400, "대체 타겟이 대상 타겟과 동일함."),
    INVALID_PERIOD(400, "시작 시간이 종료 시간보다 늦음."),
    SAME_START_END_TIME(400, "시작 시간과 종료 시간이 같음.");

    override val code: String
        get() = this.name   // enum 이름 자체가 에러 코드
}
```

**분석:**
- `ErrorCode` 인터페이스 구현 (commons 라이브러리에서 제공)
- 모든 에러는 **400 Bad Request** → 클라이언트 입력 오류
- `code`는 enum 이름(`ALREADY_DELETED` 등)을 그대로 사용
- `BusinessException(DowntimeErrorCode.INVALID_PERIOD)`로 던지면 공통 에러 핸들러가 처리

### 3.6 DowntimeValidator.kt - 비즈니스 검증

> 파일: `downtime-api/src/main/kotlin/.../api/validator/DowntimeValidator.kt`

```kotlin
@Component
class DowntimeValidator {

    fun validateForInsert(downtime: Downtime) {
        // 1. 시간 검증
        if (downtime.startDt > downtime.endDt)
            throw BusinessException(DowntimeErrorCode.INVALID_PERIOD)
        if (downtime.startDt == downtime.endDt)
            throw BusinessException(DowntimeErrorCode.SAME_START_END_TIME)

        // 2. 타겟 타입 검증
        if (downtime.targetType.serviceType != downtime.serviceType)
            throw BusinessException(DowntimeErrorCode.INVALID_TARGET_TYPE)

        // 3. 대체 타겟 검증 (있을 때만)
        downtime.replacementTargetType?.let { replacement ->
            if (replacement.serviceType != downtime.serviceType)
                throw BusinessException(DowntimeErrorCode.INVALID_REPLACEMENT_TYPE)
            if (replacement == downtime.targetType)
                throw BusinessException(DowntimeErrorCode.TARGET_SAME_REPLACEMENT)
        }
    }

    fun validateForDelete(downtime: Downtime?, downtimeSeq: Int): Downtime {
        if (downtime == null)
            throw BusinessException(CommonWebServerErrorCode.NOT_FOUND, downtimeSeq.toString())
        if (downtime.isDeleted)
            throw BusinessException(DowntimeErrorCode.ALREADY_DELETED, downtimeSeq.toString())
        return downtime
    }
}
```

**등록 검증 순서 (5가지):**

| 순서 | 검증 | 에러 코드 | 설명 |
|------|------|-----------|------|
| 1 | startDt > endDt | INVALID_PERIOD | 시작이 종료보다 늦으면 안 됨 |
| 2 | startDt == endDt | SAME_START_END_TIME | 시작과 종료가 같으면 안 됨 |
| 3 | targetType의 serviceType != serviceType | INVALID_TARGET_TYPE | FAX인데 BANK_KB를 넣으면 안 됨 |
| 4 | replacementTargetType의 serviceType != serviceType | INVALID_REPLACEMENT_TYPE | 대체 타겟도 같은 서비스여야 함 |
| 5 | targetType == replacementTargetType | TARGET_SAME_REPLACEMENT | 자기 자신으로 대체는 의미 없음 |

**삭제 검증 (2가지):**

| 순서 | 검증 | 에러 코드 |
|------|------|-----------|
| 1 | downtime == null | NOT_FOUND |
| 2 | isDeleted == true | ALREADY_DELETED |

**포인트:**
- `?.let { }` = Kotlin null-safe scope function. `replacementTargetType`이 null이면 블록 전체를 건너뜀
- `validateForDelete`는 null 체크 후 non-null `Downtime`을 반환 → 호출측에서 `!!` 없이 안전하게 사용

### 3.7 DowntimeService.kt - 비즈니스 로직

> 파일: `downtime-api/src/main/kotlin/.../api/service/DowntimeService.kt`

```kotlin
@Service
@Transactional(readOnly = true)        // 클래스 레벨: 기본 읽기 전용
class DowntimeService(
    private val downtimeRepository: DowntimeRepository,
    private val downtimeValidator: DowntimeValidator
) {
```

**트랜잭션 전략:**
- 클래스에 `@Transactional(readOnly = true)` → 기본적으로 읽기 전용 (SELECT 성능 최적화)
- 쓰기가 필요한 메서드에만 `@Transactional` 오버라이드

#### insert() - 다운타임 등록

```kotlin
@Transactional
suspend fun insert(dto: DowntimeInsertDto, session: Session): Downtime {
    val downtime = Downtime.from(dto, session)     // 1. DTO → 도메인 변환
    downtimeValidator.validateForInsert(downtime)   // 2. 비즈니스 검증
    downtimeRepository.insert(downtime)             // 3. DB INSERT
    return downtime                                  // 4. 응답 (downtimeSeq 포함)
}
```

**흐름:**
1. `Downtime.from()` 으로 DTO+세션 → 도메인 객체 생성
2. Validator로 비즈니스 규칙 검증 (실패 시 BusinessException 던짐)
3. Repository로 DB INSERT (`RETURNING downtime_seq`로 PK 받아옴)
4. `downtimeSeq`가 채워진 도메인 객체 반환

#### delete() - 다운타임 삭제 (Soft Delete)

```kotlin
@Transactional
suspend fun delete(downtimeSeq: Int, session: Session): Downtime {
    val downtime = downtimeValidator.validateForDelete(
        downtimeRepository.findBySeqForUpdate(downtimeSeq),  // 1. SELECT FOR UPDATE
        downtimeSeq
    )
    downtime.delete(session)                 // 2. 도메인 상태 변경
    downtimeRepository.softDelete(downtime)  // 3. DB UPDATE
    return downtime
}
```

**흐름:**
1. `findBySeqForUpdate()` → **비관적 락**으로 조회 (동시 삭제 방지)
2. Validator가 존재 여부/중복 삭제 검증
3. `downtime.delete(session)` → isDeleted=true, deleteSession 설정
4. Repository가 DB에 UPDATE 반영

**비관적 락(SELECT FOR UPDATE)이 왜 필요한가?**
- 두 관리자가 동시에 같은 다운타임을 삭제하려 할 때
- 락 없으면: 둘 다 `is_deleted=false`를 읽고 둘 다 삭제 시도 → 삭제 세션 정보가 덮어써짐
- 락 있으면: 먼저 조회한 쪽이 락을 잡고, 두 번째는 대기 → 첫 번째가 커밋하면 두 번째는 `is_deleted=true`를 읽음 → ALREADY_DELETED 에러

#### findActive() - 활성 다운타임 조회

```kotlin
fun findActive(serviceType: DowntimeServiceType, baseDt: LocalDateTime?): Flow<Downtime> =
    downtimeRepository.findActive(serviceType.name, baseDt ?: LocalDateTime.now())
```

- `baseDt`가 null이면 현재 시각 사용
- `suspend` 아닌 일반 함수 → `Flow`를 반환 (lazy 스트림)
- 다른 MSA에서 가장 많이 호출하는 API

#### search() - 검색 (관리 화면용)

```kotlin
suspend fun search(query: StrapiQuery): Page<Downtime> {
    val criteria = JooqSearchCriteria.from(
        query = query,
        fieldMap = Downtime.FIELD_MAP,          // 필드명 → jOOQ 컬럼 매핑
        fieldExpansions = Downtime.FIELD_EXPANSIONS  // session 같은 가상 필드 확장
    )
    val content = downtimeRepository.search(criteria).toList()
    val totalElements = downtimeRepository.searchCount(criteria)
    return PageImpl(content, query.toPageable(), totalElements)
}
```

**StrapiQuery란?**
- Strapi CMS 스타일의 쿼리 파라미터를 파싱하는 공통 라이브러리 기능
- `?filters[serviceType][$eq]=FAX&sort[0]=startDt:desc&page=0&size=25`
- `JooqSearchCriteria`가 이를 jOOQ 조건(WHERE, ORDER BY, LIMIT, OFFSET)으로 변환

### 3.8 DowntimeController.kt - REST 엔드포인트

> 파일: `downtime-api/src/main/kotlin/.../api/controller/DowntimeController.kt`

```kotlin
@RestController
@RequestMapping("/api/downtimes")
class DowntimeController(
    private val downtimeService: DowntimeService
) {
```

#### defaultSession() - 개발용 기본 세션

```kotlin
private fun defaultSession() = Session(
    doSessionType = SessionType.USER,
    doSessionSeq = 0,
    doDt = LocalDateTime.now(),
    doIp = "127.0.0.1"
)
```

- `@RequireSession`이 주석 처리되어 있어서, 세션 없이 요청하면 이 기본 세션이 사용됨
- **개발/테스트 편의용** (운영에서는 `@RequireSession` 활성화 예정)

#### POST /api/downtimes - 등록

```kotlin
@PostMapping
// @RequireSession  ← 아직 주석 처리 (개발 중)
suspend fun insert(
    @RequestBody dto: DowntimeInsertDto,
    session: Session?            // nullable → 세션 없으면 null
): ResponseEntity<Downtime> =
    ResponseEntity.status(HttpStatus.CREATED)
        .body(downtimeService.insert(dto, session ?: defaultSession()))
```

- `suspend fun` = 코루틴 기반 비동기 처리
- `Session?` = Spring Security의 커스텀 ArgumentResolver가 JWT에서 Session을 추출
- `session ?: defaultSession()` = 세션 없으면 기본 세션 사용

#### DELETE /api/downtimes/{downtimeSeq} - 삭제

```kotlin
@DeleteMapping("/{downtimeSeq}")
suspend fun delete(
    @PathVariable downtimeSeq: Int,
    session: Session?
): ResponseEntity<Downtime> =
    ResponseEntity.ok(downtimeService.delete(downtimeSeq, session ?: defaultSession()))
```

#### GET /api/downtimes/search - 검색

```kotlin
@GetMapping("/search")
suspend fun search(query: StrapiQuery): ResponseEntity<Page<Downtime>> =
    ResponseEntity.ok(downtimeService.search(query))
```

- `StrapiQuery`는 쿼리 파라미터를 자동 바인딩 (커스텀 ArgumentResolver)
- 인증 불필요 (관리 화면에서 조회)

#### GET /api/downtimes/active - 활성 다운타임 조회

```kotlin
@GetMapping("/active")
fun findActive(
    @RequestParam serviceType: DowntimeServiceType,
    @RequestParam(required = false) baseDt: LocalDateTime?
): ResponseEntity<Flow<Downtime>> =
    ResponseEntity.ok(downtimeService.findActive(serviceType, baseDt))
```

- `suspend fun`이 아닌 일반 `fun` → `Flow`를 반환하므로 suspend 불필요
- `serviceType`은 필수, `baseDt`는 선택 (미지정 시 현재 시각)
- `Flow<Downtime>`을 반환 → WebFlux가 스트리밍 응답으로 변환 (JSON Array)

### 3.9 DowntimeRepository.kt - 데이터 접근 (jOOQ + R2DBC)

> 파일: `downtime-api/src/main/kotlin/.../api/repository/DowntimeRepository.kt`

```kotlin
@Repository
class DowntimeRepository(
    private val dsl: DSLContext       // jOOQ DSL 컨텍스트
) {
```

#### insert() - INSERT 쿼리

```kotlin
suspend fun insert(downtime: Downtime) {
    val session = downtime.session
    val result = Mono.from(
        dsl.insertInto(DOWNTIMES)
            .set(DOWNTIMES.SERVICE_TYPE, downtime.serviceType.name)
            .set(DOWNTIMES.TARGET_TYPE, downtime.targetType.name)
            .set(DOWNTIMES.START_DT, downtime.startDt)
            .set(DOWNTIMES.END_DT, downtime.endDt)
            .set(DOWNTIMES.REPLACEMENT_TARGET_TYPE, downtime.replacementTargetType?.name)
            .set(DOWNTIMES.MEMO, downtime.memo)
            .set(DOWNTIMES.IS_DELETED, downtime.isDeleted)
            // 세션 정보 9개 컬럼
            .set(DOWNTIMES.BRAND, session.brand?.name)
            .set(DOWNTIMES.PRODUCT, session.product)
            // ... 생략
            .returning(DOWNTIMES.DOWNTIME_SEQ)   // PK 반환
    ).awaitSingleOrNull()

    downtime.downtimeSeq = result?.get(DOWNTIMES.DOWNTIME_SEQ)  // PK 할당
}
```

**핵심 패턴:**
1. `dsl.insertInto(DOWNTIMES)` → jOOQ가 타입 안전 INSERT 생성
2. `.returning(DOWNTIMES.DOWNTIME_SEQ)` → INSERT 후 생성된 PK를 바로 반환 (추가 SELECT 불필요)
3. `Mono.from(...)` → jOOQ의 Publisher를 Reactor Mono로 변환
4. `.awaitSingleOrNull()` → Mono를 코루틴 suspend로 변환 (Reactor ↔ Coroutines 브릿지)
5. `downtime.downtimeSeq = result?.get(...)` → 생성된 PK를 도메인 객체에 반영

#### findBySeqForUpdate() - 비관적 락 조회

```kotlin
suspend fun findBySeqForUpdate(downtimeSeq: Int): Downtime? {
    return Mono.from(
        dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.DOWNTIME_SEQ.eq(downtimeSeq))
            .forUpdate()                          // ← SELECT FOR UPDATE
    ).awaitSingleOrNull()?.let { mapToDowntime(it) }
}
```

- `.forUpdate()` = 해당 레코드에 배타적 락을 건 채로 조회
- 같은 레코드를 조회하려는 다른 트랜잭션은 이 트랜잭션이 끝날 때까지 대기

#### softDelete() - 논리 삭제

```kotlin
suspend fun softDelete(downtime: Downtime) {
    val deleteSession = downtime.deleteSession
    Mono.from(
        dsl.update(DOWNTIMES)
            .set(DOWNTIMES.IS_DELETED, true)
            .set(DOWNTIMES.DELETE_BRAND, deleteSession?.brand?.name)
            // ... 삭제 세션 9개 컬럼 UPDATE
            .where(DOWNTIMES.DOWNTIME_SEQ.eq(downtime.downtimeSeq))
    ).awaitSingleOrNull()
}
```

- 물리 삭제(DELETE) 대신 `is_deleted = true`로 UPDATE → **데이터 보존**
- 삭제자의 세션 정보도 기록 → 누가 삭제했는지 추적 가능

#### findActive() - 활성 다운타임 조회

```kotlin
fun findActive(serviceType: String, baseDt: LocalDateTime): Flow<Downtime> {
    return Flux.from(
        dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.SERVICE_TYPE.eq(serviceType))
            .and(DOWNTIMES.START_DT.le(baseDt))       // startDt <= 기준시각
            .and(DOWNTIMES.END_DT.ge(baseDt))         // endDt >= 기준시각
            .and(DOWNTIMES.IS_DELETED.eq(false))       // 삭제되지 않은 것만
            .orderBy(DOWNTIMES.START_DT)
    ).asFlow().map { mapToDowntime(it) }
}
```

**WHERE 조건 해석:**
```
기준시각이 startDt와 endDt 사이에 있고, 삭제되지 않은 다운타임
```

- `Flux.from(...)` → 여러 건 조회 (0건 이상)
- `.asFlow()` → Reactor Flux를 Kotlin Flow로 변환
- `.map { mapToDowntime(it) }` → jOOQ Record를 Downtime 도메인 객체로 변환

#### search() / searchCount() - 동적 검색

```kotlin
fun search(criteria: JooqSearchCriteria): Flow<Downtime> {
    val baseQuery = if (criteria.hasSelectFields) {
        dsl.select(criteria.selectFields).from(DOWNTIMES)     // 특정 필드만 SELECT
    } else {
        dsl.selectFrom(DOWNTIMES)                              // 전체 SELECT
    }

    val query = baseQuery
        .where(DOWNTIMES.IS_DELETED.eq(false))  // 삭제되지 않은 것만 (고정 조건)
        .and(criteria.condition)                 // 동적 필터 조건

    val orderedQuery = if (criteria.sortFields.isNotEmpty()) {
        query.orderBy(criteria.sortFields)       // 동적 정렬
    } else {
        query.orderBy(DOWNTIMES.DOWNTIME_SEQ.desc())  // 기본: 최신순
    }

    return Flux.from(
        orderedQuery
            .limit(criteria.limit)
            .offset(criteria.offset)
    ).asFlow().map { mapToDowntime(it) }
}
```

**포인트:**
- `is_deleted = false`는 **고정 조건** → search는 항상 삭제되지 않은 것만 조회
- `criteria.condition` = Strapi 쿼리에서 변환된 동적 WHERE 조건
- `criteria.sortFields` = 동적 ORDER BY
- 기본 정렬은 `downtime_seq DESC` (최신순)

#### mapToDowntime() - Record → Domain 변환

```kotlin
private fun mapToDowntime(record: Record) = Downtime(
    downtimeSeq = record.getOrNull(DOWNTIMES.DOWNTIME_SEQ),
    serviceType = DowntimeServiceType.valueOf(record.getOrNull(DOWNTIMES.SERVICE_TYPE)!!),
    targetType = DowntimeTargetType.valueOf(record.getOrNull(DOWNTIMES.TARGET_TYPE)!!),
    startDt = record.getOrNull(DOWNTIMES.START_DT)!!,
    endDt = record.getOrNull(DOWNTIMES.END_DT)!!,
    replacementTargetType = record.getOrNull(DOWNTIMES.REPLACEMENT_TARGET_TYPE)
        ?.let { DowntimeTargetType.valueOf(it) },
    // ...
    session = Session(
        brand = record.getOrNull(DOWNTIMES.BRAND)?.let { Brand.valueOf(it) },
        // ... 9개 필드 매핑
    ),
    deleteSession = record.getOrNull(DOWNTIMES.DELETE_DO_SESSION_TYPE)?.let { deleteDoSessionType ->
        Session(/* ... 9개 필드 매핑 */)
    }
)
```

**분석:**
- jOOQ `Record`에서 타입 안전하게 값을 꺼내서 도메인 객체 생성
- `getOrNull()` = 값이 없으면 null 반환 (공통 라이브러리 확장 함수)
- `getOrDefault()` = 값이 없으면 기본값 반환 (예: `isDeleted` → false)
- enum은 `valueOf()`로 문자열 → enum 변환
- `deleteSession`은 `delete_do_session_type`이 있을 때만 생성 (null이면 삭제 안 된 것)

---

## 4. 빌드 시스템 이해

### 4.1 루트 build.gradle.kts

**주요 설정:**

```kotlin
// Nexus 인증 (사설 Maven 레포)
extra["nexusUsername"] = project.findProperty("NEXUS_USERNAME") ?: System.getenv("NEXUS_USERNAME")
extra["nexusPassword"] = project.findProperty("NEXUS_PASSWORD") ?: System.getenv("NEXUS_PASSWORD")

// 공통 라이브러리 버전 결정
val knetVersion = if (branchName == "main") "latest.release" else "latest.integration"
```

- `main` 브랜치 → `latest.release` (안정 버전)
- 그 외 브랜치 → `latest.integration` (개발 중인 SNAPSHOT 버전)

```kotlin
// Java 25 Toolchain
configure<JavaPluginExtension> {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}
```

### 4.2 downtime-api/build.gradle.kts - 전체 주석 분석

> 파일: `downtime-api/build.gradle.kts`

**jOOQ 코드 자동생성 파이프라인:**

```
./gradlew build
  → compileKotlin이 generateJooq에 의존
  → onlyIf: SQL 변경됐나? ─ No → 건너뜀 (빠름)
                            │ Yes
                            ▼
  → doFirst: Docker PostgreSQL 시작 → Flyway 마이그레이션 → jOOQ 접속 정보 설정
  → jOOQ Generator: DB 스키마 읽어 Kotlin 코드 생성
  → doLast: 컨테이너 종료
  → compileKotlin: 생성된 코드 + 프로젝트 코드 함께 컴파일
```

**전체 소스 (주석 포함):**

```kotlin
import nu.studer.gradle.jooq.JooqEdition
import org.flywaydb.core.Flyway
import org.testcontainers.postgresql.PostgreSQLContainer

plugins {
    alias(libs.plugins.kotlin.jvm)       // Kotlin JVM 플러그인 (libs.versions.toml에서 버전 관리)
    alias(libs.plugins.kotlin.spring)    // Kotlin Spring 지원 (open class 자동 적용 등)
    alias(libs.plugins.spring.boot)      // Spring Boot 플러그인 (bootJar, bootRun 등)
    alias(libs.plugins.jooq)             // nu.studer.jooq 플러그인 (jOOQ 코드 생성)
}

// package.json에서 version 읽기 (Nx가 관리하는 버전을 Gradle에서 사용)
version = (groovy.json.JsonSlurper().parse(file("package.json")) as Map<*, *>)["version"] as String

dependencies {
    // ── KNET 공통 모듈 ──
    implementation("com.knet.commons:commons-web-server:${rootProject.extra["knetVersion"]}")  // 공통 웹 서버
    implementation(project(":downtime"))  // downtime 공유 모듈 (enum, Properties, Flyway SQL)

    // ── Kotlin Coroutines ──
    implementation(libs.kotlinx.coroutines.core)     // 코루틴 기본 (suspend, Flow 등)
    implementation(libs.kotlinx.coroutines.reactor)   // Reactor ↔ Coroutines 브릿지

    // ── Spring WebFlux (Reactive 웹) ──
    implementation(libs.spring.boot.starter.webflux)                  // WebFlux 스타터 (Netty 서버)
    implementation(libs.spring.boot.starter.oauth2.resource.server)   // OAuth2 Resource Server (JWT 검증)
    implementation(libs.spring.boot.starter.data.r2dbc)               // R2DBC 스타터 (Non-blocking DB)
    implementation(libs.spring.data.commons)                          // Spring Data 공통 (Page, Pageable)

    // ── Spring Cloud ──
    implementation(libs.spring.cloud.starter.config)  // Config Server 클라이언트

    // ── Actuator (모니터링) ──
    implementation(libs.spring.boot.starter.actuator)       // 헬스체크, 메트릭 엔드포인트
    implementation(libs.micrometer.registry.prometheus)      // Prometheus 메트릭 수집

    // ── jOOQ (Type-safe SQL) ──
    implementation(libs.jooq)               // jOOQ 런타임 (DSLContext, Condition 등)
    implementation(libs.jooq.kotlin)        // jOOQ Kotlin 확장
    jooqGenerator(libs.postgresql)          // 코드 생성 시 PostgreSQL JDBC 드라이버
    jooqGenerator(libs.jooq)               // 코드 생성 시 jOOQ 라이브러리
    jooqGenerator(libs.jooq.meta)          // 코드 생성 시 DB 메타데이터 리더

    // ── Database ──
    runtimeOnly(libs.postgresql)            // PostgreSQL JDBC 드라이버 (Flyway가 사용)
    runtimeOnly(libs.r2dbc.postgresql)      // PostgreSQL R2DBC 드라이버 (앱 런타임)

    // ── Flyway (DB 마이그레이션) ──
    implementation(libs.spring.boot.starter.flyway)      // 앱 시작 시 마이그레이션 자동 실행
    runtimeOnly(libs.flyway.database.postgresql)          // Flyway PostgreSQL 지원

    // ── Testing ──
    testImplementation(libs.spring.boot.starter.test)          // Spring Boot 테스트
    testImplementation(libs.spring.boot.starter.webflux.test)  // WebTestClient
    testImplementation(libs.spring.security.test)              // Security 테스트 유틸
    testImplementation(libs.kotlinx.coroutines.test)           // 코루틴 테스트
    testImplementation(libs.mockito.kotlin)                    // Mockito Kotlin 확장
    testImplementation(libs.spring.boot.testcontainers)        // Testcontainers 통합
    testImplementation(libs.testcontainers)                    // Testcontainers 코어
    testImplementation(libs.testcontainers.junit.jupiter)      // JUnit5 확장
    testImplementation(libs.testcontainers.postgresql)         // PostgreSQL 컨테이너
    testImplementation(libs.testcontainers.r2dbc)              // R2DBC 지원
    testImplementation(libs.kotlin.test.junit5)                // Kotlin JUnit5
    testRuntimeOnly(libs.junit.platform.launcher)              // JUnit Platform 실행기
}

// ════════════════════════════════════════════════════════════
// region jOOQ Code Generation
// ════════════════════════════════════════════════════════════

// ── buildscript: Gradle 자체가 빌드 시점에 사용하는 라이브러리 ──
// (앱 코드의 dependencies와 별개)
buildscript {
    repositories {
        maven {
            url = uri(property("nexusPublicUrl") as String)  // 사내 Nexus
            credentials { /* NEXUS_USERNAME, NEXUS_PASSWORD */ }
        }
    }
    dependencies {
        classpath("...testcontainers...")            // 빌드 시 Docker 컨테이너 기동
        classpath("...postgresql...")                // 빌드 시 Flyway가 JDBC로 접속
        classpath("...flyway-core...")               // 빌드 시 마이그레이션 실행
    }
}

// ── DataSource 정의: DB가 여러 개면 여기에 추가 ──
data class JooqDataSource(
    val name: String,          // "downtime" (태스크명, 출력 디렉토리에 사용)
    val migrationDir: String,  // "db/migration" (Flyway SQL 경로)
    val packageName: String    // 생성될 Kotlin 코드의 패키지명
)

val dataSources = listOf(
    JooqDataSource("downtime", "db/migration", "com.knet.msa.downtime.api.generated.downtime"),
)

// ── jOOQ 플러그인 설정: 코드 생성기 구성 ──
jooq {
    version.set("3.20.10")
    edition.set(JooqEdition.OSS)            // 오픈소스 에디션

    configurations {
        dataSources.forEach { ds ->
            create(ds.name) {
                generator.apply {
                    name = "org.jooq.codegen.KotlinGenerator"  // Kotlin 코드 생성
                    database.apply {
                        name = "org.jooq.meta.postgres.PostgresDatabase"
                        inputSchema = "public"
                    }
                    generate.apply {
                        // 생성할 것
                        isTables = true                    // 테이블 참조 (DOWNTIMES)
                        isRecords = true                   // Record 클래스
                        isPojos = true                     // POJO
                        isPojosAsKotlinDataClasses = true  // data class로 생성

                        // 생성하지 않을 것
                        isDaos = false       // 직접 Repository 작성
                        isRoutines = false   // 스토어드 프로시저 안 씀
                        isSequences = false  // 시퀀스 불필요
                    }
                }
            }
        }
    }
}

// ── 각 DataSource별 실행 로직 ──
dataSources.forEach { ds ->
    tasks.named<JooqGenerate>(ds.taskName()) {

        // 스킵 조건: SQL이 변경되지 않았으면 재생성 안 함 (빌드 시간 절약)
        onlyIf {
            migrationLastModified > outputLastModified
        }

        // 실행 전: 컨테이너 기동 + Flyway + 접속 정보 설정
        doFirst {
            db = PostgreSQLContainer("postgres:17-alpine").apply { start() }
            Flyway.configure().dataSource(db.jdbcUrl, ...).load().migrate()
            jooq.configurations[ds.name].jooqConfiguration.jdbc.url = db.jdbcUrl
            // → 이후 jOOQ Generator가 DB 스키마를 읽어 Kotlin 코드 생성
        }

        // 실행 후: 컨테이너 종료
        doLast { db.stop() }
    }
}

// ── 컴파일 전에 jOOQ 코드 생성이 먼저 실행되도록 순서 보장 ──
tasks.named("compileKotlin") { dependsOn("generateJooq") }
// endregion
```

**영역별 요약:**

| 영역 | 설명 |
|------|------|
| plugins | 4개 플러그인 (Kotlin, Spring, Boot, jOOQ) |
| dependencies | 9개 카테고리 (KNET, Coroutines, WebFlux, Cloud, Actuator, jOOQ, DB, Flyway, Testing) |
| buildscript | 빌드 스크립트 자체의 의존성 (앱 의존성과 별개) |
| JooqDataSource | DataSource 정의 (DB 추가 시 여기에 추가) |
| jooq { } | 코드 생성기 설정 (생성할 것 / 안 할 것) |
| 태스크 설정 | onlyIf(스킵) → doFirst(컨테이너+Flyway) → doLast(종료) |
| 컴파일 순서 | generateJooq → compileKotlin 순서 보장 |

### 4.3 downtime/build.gradle.kts - 공유 모듈 배포

```kotlin
publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
        }
    }
    repositories {
        maven {
            name = "nexus"
            url = uri(property("nexusHostedUrl") as String)
        }
    }
}
```

- `maven-publish` 플러그인으로 Nexus에 라이브러리 배포
- 다른 MSA에서 `implementation("com.knet.msa.downtime:downtime:x.x.x")`로 의존

### 4.4 nx.json - Nx 모노레포

```json
{
  "release": {
    "projects": ["downtime", "downtime-api"],
    "projectsRelationship": "independent",
    "releaseTagPattern": "{projectName}/v{version}",
    "version": {
      "conventionalCommits": true
    }
  }
}
```

- 두 모듈은 **독립적으로 버전 관리** (`independent`)
- Conventional Commits 기반 자동 버전 결정 (feat → minor, fix → patch)
- 태그 형식: `downtime/v1.0.0`, `downtime-api/v1.0.0`

### 4.5 Gradle Version Catalog

> 파일: `gradle/libs.versions.toml` (루트 프로젝트 공유 파일)

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.3.10"
spring-boot = "4.0.3"
spring-cloud = "2025.1.1"
jooq = "3.20.10"

[libraries]
spring-boot-starter-webflux = { module = "org.springframework.boot:spring-boot-starter-webflux" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "kotlinx-coroutines" }
```

```kotlin
// build.gradle.kts에서 사용
dependencies {
    implementation(libs.spring.boot.starter.webflux)    // toml에 정의된 라이브러리 참조
    implementation(libs.kotlinx.coroutines.core)
}
```

**v1과의 차이:**
- v1: 각 `build.gradle`에 버전을 직접 명시 (`'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.3.2'`)
- v2: `libs.versions.toml` 한 파일에서 모든 버전 관리

**장점:**
- 멀티 모듈 프로젝트에서 **버전 일원화** (downtime, downtime-api가 같은 버전 참조)
- IDE 자동완성으로 오타 방지 (`libs.spring.boot.starter.` 까지 치면 목록 나옴)
- 의존성 변경 이력을 **한 파일에서 추적** 가능

### 4.6 Java 25 + Kotlin 컴파일러 설정

```kotlin
// settings.gradle.kts - Java Toolchain
configure<JavaPluginExtension> {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))   // Java 25
    }
}

// Kotlin 컴파일러 옵션
compilerOptions {
    freeCompilerArgs.addAll(
        "-Xjsr305=strict",                    // Spring @Nullable을 Kotlin 타입에 반영
        "-Xannotation-default-target=param-property"
    )
}
```

- **`-Xjsr305=strict`**: Spring 프레임워크의 `@Nullable` 어노테이션을 Kotlin 컴파일러가 인식해서, null이 될 수 있는 Java 반환값을 `T?`로 처리하도록 강제. 이게 없으면 Java에서 온 null이 Kotlin에서 NPE를 일으킬 수 있음.

---

## 5. 설정 파일 분석

### application.yaml (downtime-api)

```yaml
server:
  port: 27000                    # 서버 포트

spring:
  application:
    name: downtime-api           # 서비스 이름
  config:
    import: classpath:application-downtime.yaml  # downtime 모듈의 설정 가져오기
  cloud:
    config:
      enabled: false             # 로컬에서는 Config Server 비활성화
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/downtime  # R2DBC 접속 정보
  flyway:
    url: jdbc:postgresql://localhost:5432/downtime   # Flyway는 JDBC 사용 (R2DBC 미지원)
    table: _flyway_schema_history                     # 마이그레이션 이력 테이블명

knet:
  commons:
    web:
      enabled: true              # 공통 웹 설정 활성화
      trace-enabled: true        # 요청 추적 활성화
    security:
      enabled: true              # 보안 설정 활성화
```

**프로필별 설정:**
- `test` 프로필: `flyway.clean-disabled: false` → 테스트 시 DB 초기화 허용
- `dev | prod` 프로필: Config Server 연결 활성화
  - `spring.cloud.config.enabled: true`
  - `configserver:http://${CONFIG_SERVER_HOST}:${CONFIG_SERVER_PORT}`

---

## 6. 테스트 코드 분석

### 6.1 AbstractIntegrationTest.kt - 테스트 인프라 기반

```kotlin
abstract class AbstractIntegrationTest {
    companion object {
        @JvmStatic
        val downtimeDatabase: PostgreSQLContainer = PostgreSQLContainer("postgres:17-alpine")
            .withDatabaseName("downtime")
            .apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun configureProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.r2dbc.url") {
                "r2dbc:postgresql://${downtimeDatabase.host}:${downtimeDatabase.getMappedPort(5432)}/..."
            }
            // R2DBC + Flyway 접속 정보를 동적으로 설정
        }
    }
}
```

**패턴 설명:**
- `companion object` + `@JvmStatic` → 모든 테스트 클래스에서 **하나의 DB 컨테이너 공유**
- `@DynamicPropertySource` → 런타임에 결정되는 컨테이너 포트를 Spring 설정에 주입
- Flyway가 테스트 시작 시 자동으로 마이그레이션 실행

### 6.2 DowntimeValidatorTest.kt - 단위 테스트

```kotlin
class DowntimeValidatorTest {
    private val validator = DowntimeValidator()  // Spring 컨텍스트 없이 직접 생성
```

- DB/Spring 없이 순수 로직만 테스트 → **빠름**
- 모든 검증 규칙에 대해 정상/에러 케이스 커버

**테스트 케이스 목록:**

| 메서드 | 테스트 | 기대 결과 |
|--------|--------|-----------|
| validateForInsert | 정상 | 예외 없음 |
| validateForInsert | replacementTargetType null | 예외 없음 |
| validateForInsert | startDt > endDt | INVALID_PERIOD |
| validateForInsert | startDt == endDt | SAME_START_END_TIME |
| validateForInsert | targetType serviceType 불일치 | INVALID_TARGET_TYPE |
| validateForInsert | replacementTargetType serviceType 불일치 | INVALID_REPLACEMENT_TYPE |
| validateForInsert | target == replacement | TARGET_SAME_REPLACEMENT |
| validateForDelete | 정상 | Downtime 반환 |
| validateForDelete | null | NOT_FOUND |
| validateForDelete | 이미 삭제됨 | ALREADY_DELETED |

### 6.3 DowntimeServiceTest.kt - 통합 테스트

```kotlin
@SpringBootTest
@ActiveProfiles("test")
class DowntimeServiceTest : AbstractIntegrationTest() {
```

- `@SpringBootTest` = 전체 Spring 컨텍스트 로드
- `AbstractIntegrationTest` 상속 → Testcontainers DB 사용
- **실제 DB에 INSERT/SELECT/UPDATE** 수행

### 6.4 DowntimeControllerTest.kt - API 통합 테스트

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class DowntimeControllerTest : AbstractIntegrationTest() {
```

- `RANDOM_PORT` = 랜덤 포트로 서버 기동
- `WebTestClient`로 **실제 HTTP 요청** 수행
- JWT 토큰 생성해서 인증 헤더에 포함

**인증 테스트 패턴:**
```kotlin
// 인증 있는 요청
webTestClient.post().uri("/api/downtimes")
    .header(HttpHeaders.AUTHORIZATION, "Bearer ${createJwtToken(createSession())}")
    .bodyValue(dto)
    .exchange()
    .expectStatus().isCreated()

// 인증 없는 요청 → 401
webTestClient.post().uri("/api/downtimes")
    .bodyValue(dto)
    .exchange()
    .expectStatus().isUnauthorized()
```

---

## 7. 요청 흐름 따라가기 (시나리오별)

### 시나리오 1: "KB은행 점검 다운타임 등록"

**요청:**
```http
POST /api/downtimes
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "serviceType": "BANK",
  "targetType": "BANK_KB",
  "startDt": "2026-04-07T23:00:00",
  "endDt": "2026-04-08T05:00:00",
  "replacementTargetType": "BANK_SHINHAN",
  "memo": "KB은행 야간 정기점검"
}
```

**코드 흐름:**

```
1. DowntimeController.insert()
   ├── @RequestBody로 JSON → DowntimeInsertDto 변환
   ├── JWT에서 Session 추출 (또는 defaultSession)
   └── downtimeService.insert(dto, session) 호출

2. DowntimeService.insert()
   ├── Downtime.from(dto, session) → Downtime 도메인 객체 생성
   │   └── downtimeSeq = null, isDeleted = false
   │
   ├── downtimeValidator.validateForInsert(downtime)
   │   ├── startDt(23:00) < endDt(05:00 다음날) → OK
   │   ├── startDt ≠ endDt → OK
   │   ├── BANK_KB.serviceType == BANK → OK
   │   ├── BANK_SHINHAN.serviceType == BANK → OK
   │   └── BANK_KB ≠ BANK_SHINHAN → OK
   │
   └── downtimeRepository.insert(downtime)
       ├── INSERT INTO downtimes (...) VALUES (...) RETURNING downtime_seq
       └── downtime.downtimeSeq = 42 (DB에서 생성된 PK)

3. ResponseEntity.status(201).body(downtime) 반환
```

**응답:**
```json
{
  "downtimeSeq": 42,
  "serviceType": "BANK",
  "targetType": "BANK_KB",
  "startDt": "2026-04-07T23:00:00",
  "endDt": "2026-04-08T05:00:00",
  "replacementTargetType": "BANK_SHINHAN",
  "memo": "KB은행 야간 정기점검",
  "isDeleted": false,
  "session": { "brand": "BAROBILL", "doSessionType": "USER", ... },
  "deleteSession": null
}
```

### 시나리오 2: "문자 서비스가 현재 다운타임 확인"

**요청:**
```http
GET /api/downtimes/active?serviceType=MESSAGE
```

**코드 흐름:**

```
1. DowntimeController.findActive()
   ├── serviceType = MESSAGE
   └── baseDt = null → LocalDateTime.now() 사용

2. DowntimeService.findActive()
   └── downtimeRepository.findActive("MESSAGE", 2026-04-07T14:30:00)

3. DowntimeRepository.findActive()
   └── SELECT * FROM downtimes
       WHERE service_type = 'MESSAGE'
         AND start_dt <= '2026-04-07T14:30:00'
         AND end_dt >= '2026-04-07T14:30:00'
         AND is_deleted = false
       ORDER BY start_dt

4. Flow<Downtime> 반환 → WebFlux가 JSON Array로 직렬화
```

**응답 (활성 다운타임이 있는 경우):**
```json
[
  {
    "downtimeSeq": 35,
    "serviceType": "MESSAGE",
    "targetType": "MESSAGE_LG",
    "startDt": "2026-04-07T14:00:00",
    "endDt": "2026-04-07T16:00:00",
    "replacementTargetType": "MESSAGE_SEJONG",
    ...
  }
]
```

→ 문자 서비스는 이 응답을 보고 LG 대신 세종으로 우회 발송

### 시나리오 3: "등록 시 검증 실패 - 타겟 불일치"

**요청:**
```json
{
  "serviceType": "FAX",
  "targetType": "BANK_KB",    ← FAX인데 BANK 타겟!
  "startDt": "2026-04-07T23:00:00",
  "endDt": "2026-04-08T05:00:00"
}
```

```
1. DowntimeValidator.validateForInsert()
   └── BANK_KB.serviceType(BANK) != FAX → INVALID_TARGET_TYPE 예외!

2. BusinessException(DowntimeErrorCode.INVALID_TARGET_TYPE)
   └── 공통 에러 핸들러가 처리

3. 응답: 400 Bad Request
   {
     "code": "INVALID_TARGET_TYPE",
     "message": "대상 타겟이 서비스 타입과 일치하지 않음."
   }
```

---

## 8. 핵심 패턴 & 기법 정리

### 패턴 1: Reactor ↔ Coroutines 브릿지

```kotlin
// 단건: Mono → suspend fun (awaitSingleOrNull)
suspend fun findBySeq(downtimeSeq: Int): Downtime? {
    return Mono.from(dsl.selectFrom(DOWNTIMES)...).awaitSingleOrNull()?.let { mapToDowntime(it) }
}

// 다건: Flux → Flow (asFlow)
fun findActive(...): Flow<Downtime> {
    return Flux.from(dsl.selectFrom(DOWNTIMES)...).asFlow().map { mapToDowntime(it) }
}
```

| Reactor | Coroutines | 변환 |
|---------|-----------|------|
| `Mono<T>` | `suspend fun`: T? | `.awaitSingleOrNull()` |
| `Flux<T>` | `Flow<T>` | `.asFlow()` |

### 패턴 2: Soft Delete + 감사 추적

```
등록 시: is_deleted=false, session 정보 기록 (누가 등록했는지)
삭제 시: is_deleted=true, deleteSession 정보 기록 (누가 삭제했는지)
조회 시: WHERE is_deleted = false (삭제된 건 안 보임)
```

→ 물리 삭제 없이 데이터를 보존하면서도, 조회 시엔 삭제된 것처럼 동작

### 패턴 3: Validator 분리

```
Controller → Service → Validator (검증)
                     → Repository (DB)
```

- 검증 로직을 별도 `@Component`로 분리
- 장점: 단위 테스트 용이 (DB 없이 Validator만 테스트 가능)
- Service는 오케스트레이션만 담당 (얇은 서비스 계층)

### 패턴 4: jOOQ 코드 생성으로 타입 안전

```
SQL 파일 → (빌드 시) Testcontainers → Flyway → jOOQ Generator → Kotlin 코드
                                                                      ↓
            Repository에서 DOWNTIMES.SERVICE_TYPE 같은 타입 안전 참조 사용
```

- DB 스키마 변경 → 코드 재생성 → 컴파일 에러로 불일치 즉시 감지

### 패턴 5: 도메인 객체의 팩토리 메서드 + 상태 전이

```kotlin
// 생성: 팩토리 메서드
val downtime = Downtime.from(dto, session)

// 상태 전이: 도메인 메서드
downtime.delete(session)
```

- DTO → Domain 변환은 `companion object`의 `from()`으로 한 곳에 집중
- 상태 변경은 도메인 객체의 메서드를 통해 (외부에서 필드 직접 조작 방지 의도)

---

## 9. 핵심 설계 원칙 요약

| 원칙 | 설명 | 적용 사례 |
|------|------|----------|
| 불필요한 추상화 제거 | 구현체가 하나뿐인 Interface 제거 | Service Interface+Impl → 단일 클래스 |
| 외부 의존 최소화 | 다른 MSA 모듈에 대한 의존 임시 제거 (각 MSA 최신 버전 전환 후 재연결 예정) | TargetType에서 fax/card/message/bank 의존 제거 |
| 관심사 분리 | 검증/상태전이/영속화를 각 계층에 배치 | Validator 분리, afterWaitTime을 호출측으로 위임 |
| 타입 안전성 강화 | 컴파일 타임에 오류를 잡는 구조 | MyBatis XML → jOOQ, Java null → Kotlin non-null |
| Non-blocking 전환 | DB I/O까지 Non-blocking으로 처리 | MVC+JDBC → WebFlux+R2DBC+Coroutines |
| 인프라 자동화 | 수동 작업을 자동화 | 수동 스키마 → Flyway, 수동 버전 → Nx, 외부 DB → Testcontainers |

---

## 10. v1 vs v2 변경점 비교 (downtime-api/v1.0.16 → v2.0.x)

> v1 = `downtime-api/v1.0.0` ~ `v1.0.16` (Java 8 + Spring Boot 2.x)
> v2 = `downtime-api/v2.0.0` ~ 현재 (Kotlin + Spring Boot 4.x)

### 10.1 기술 스택 전면 교체

| 항목 | v1 | v2 | 변경 이유 |
|------|:--:|:--:|-----------|
| JDK | Java 8 | **Java 25** | 최신 JVM 성능 + Virtual Thread 등 |
| 언어 | Java + Lombok | **Kotlin** | null safety, coroutines, 간결한 문법 |
| Framework | Spring Boot 2.3.0 | **Spring Boot 4.0.3** | 최신 버전 마이그레이션 |
| Web | Spring MVC (Blocking) | **WebFlux (Reactive)** | Non-blocking I/O |
| DB 접근 | JDBC (Blocking) | **R2DBC (Non-blocking)** | DB까지 Non-blocking |
| SQL | MyBatis (XML) | **jOOQ (Type-safe DSL)** | 컴파일 타임 SQL 검증 |
| DB 마이그레이션 | 수동 schema.sql | **Flyway** | 버전 관리 자동화 |
| 빌드 스크립트 | Groovy DSL | **Kotlin DSL (.kts)** | 타입 안전 빌드 |
| 의존성 관리 | 직접 버전 명시 | **Version Catalog** | 일원화 |
| 테스트 | 외부 DB + MockMvc | **Testcontainers + WebTestClient** | 독립적 테스트 |
| 인증 | OAuth2 Resource Server | **commons-web-server (JWT)** | 공통 라이브러리로 통합 |
| 버전 관리 | 수동 | **Nx + Conventional Commits** | 자동화 |
| Spring Cloud | Hoxton.SR4 | **2025.1.1** | 최신 버전 |

### 10.2 파일 구조 비교

```
v1 (Java 8 + MyBatis)                         v2 (Kotlin + jOOQ)
================================              ================================
build.gradle (Groovy)                         build.gradle.kts (Kotlin DSL)
settings.gradle                               settings.gradle.kts
                                              gradle/libs.versions.toml (신규)
                                              nx.json (신규)
                                              package.json (신규)

downtime/                                     downtime/
├── build.gradle                              ├── build.gradle.kts
├── enums/                                    ├── enums/
│   ├── DowntimeServiceType.java              │   ├── DowntimeServiceType.kt
│   └── DowntimeTargetType.java               │   └── DowntimeTargetType.kt
├── config/                                   ├── config/
│   ├── DowntimeProperties.java               │   └── DowntimeProperties.kt
│   ├── DowntimeInitializer.java              │   (삭제됨)
│   └── DowntimeSqlSessionConfig.java         │   (삭제됨 - MyBatis 제거)
├── application-downtime.yml                  ├── application-downtime.yaml
├── database-downtime/schema.sql              └── db/migration/V202602261430__init.sql
└── mybatis-config.xml                            (삭제됨 - MyBatis 제거)

downtime-api/                                 downtime-api/
├── build.gradle                              ├── build.gradle.kts
├── DowntimeApiApplication.java               ├── DowntimeApiApplication.kt
├── controller/                               ├── controller/
│   └── DowntimeApiController.java            │   └── DowntimeController.kt
├── service/                                  ├── service/
│   ├── DownTimeApiService.java (인터페이스)    │   └── DowntimeService.kt (클래스만)
│   └── DownTimeApiServiceImpl.java           │       (인터페이스 제거)
├── domain/                                   ├── domain/
│   └── Downtime.java                         │   └── Downtime.kt
├── dto/                                      ├── dto/
│   ├── DowntimeRegisterDto.java              │   └── DowntimeInsertDto.kt
│   ├── DowntimeSearchDto.java                │       (삭제 - StrapiQuery로 대체)
│   └── CurrentDowntimeSearchDto.java         │       (삭제 - @RequestParam으로 대체)
├── exception/                                ├── exception/
│   └── DowntimeApiErrorCode.java             │   └── DowntimeErrorCode.kt
├── mapper/                                   ├── repository/
│   └── DowntimeApiMapper.java (인터페이스)     │   └── DowntimeRepository.kt (클래스)
│                                             ├── validator/
│   (Downtime.java 내부에 검증 로직)            │   └── DowntimeValidator.kt (신규 분리)
├── aop/                                      │   (삭제 - commons에서 처리)
│   └── DowntimeApiAspect.java                │
├── config/                                   ├── config/
│   ├── DowntimeApiResourceServerConfig.java  │   └── JooqR2dbcConfig.kt
│   ├── DowntimeApiWebMvcConfig.java          │       (삭제 - commons에서 처리)
│   └── mybatis/DowntimeApiSqlSessionConfig   │       (삭제 - MyBatis 제거)
├── application.yml + bootstrap.yml           ├── application.yaml
└── mybatis/DowntimeApiMapper.xml             │   (삭제 - jOOQ로 대체)
                                              └── (jOOQ 코드는 빌드 시 자동 생성)
```

### 10.3 DowntimeServiceType 변경

**v1.0.0** - 세금계산서/현금영수증을 스크래핑/전송으로 분리 (9종)
```java
TAXINVOICE_SCRAPING("세금계산서 스크래핑"),
CASHBILL_SCRAPING("현금영수증 스크래핑"),
TAXINVOICE_SUBMIT("세금계산서 국세청 전송"),
CASHBILL_SUBMIT("현금영수증 국세청 전송"),
```

**v1.0.16 → v2** - 통합 (7종)
```kotlin
TAXINVOICE("세금계산서"),
CASHBILL("현금영수증"),
```

> v1 중간에 `SCRAPING`/`SUBMIT` 구분을 없애고 하나로 통합함. v2도 동일. 각 MSA(세금계산서, 현금영수증 등)가 최신 버전으로 전환되면 ServiceType도 그에 맞게 재조정 예정.

### 10.4 DowntimeTargetType 변경 - 외부 MSA 의존 제거

**v1 (다른 MSA 모듈에 의존)**
```java
// 카드사 코드를 card 모듈의 enum에서 참조
CARD_BC(DowntimeServiceType.CARD, CardCompanyCode.BC),
BANK_KB(DowntimeServiceType.BANK, BankCode.KB),
FAX_HANAFAX(DowntimeServiceType.FAX, com.knet.msa.fax.fax.enums.Vendor.HANAFAX),

// 타입 변환 헬퍼 메서드도 제공
public CardCompanyCode getCardCompanyCode() { ... }
public BankCode getBankCode() { ... }
```

**v2 (자체 완결)**
```kotlin
// 다른 MSA 모듈 의존 없이 serviceType만 보유
CARD_BC(DowntimeServiceType.CARD),
BANK_KB(DowntimeServiceType.BANK),
FAX_HANAFAX(DowntimeServiceType.FAX),
// 헬퍼 메서드 없음
```

**왜 바꿨나?**
- v1의 downtime 모듈이 fax, card, message, bank 4개 모듈에 의존
- 이러면 downtime을 빌드하려면 4개 모듈이 다 있어야 함 → **순환/과도한 의존**
- v2에서 `targetCode`, `getCardCompanyCode()` 등을 제거하고 순수 enum으로 단순화
- 타겟 코드 변환이 필요한 곳은 호출하는 MSA 쪽에서 직접 처리

```
v1: downtime → fax, card, message, bank (4개 모듈 의존)
v2: downtime → (의존 없음, 자체 완결)
```

### 10.5 Controller 변경

**v1 - Java + MVC + AOP**
```java
@RestController
@RequiredArgsConstructor
public class DowntimeApiController {

    // 반환 타입이 Object → 타입 불안전
    @PostMapping
    @RequireSession
    public Object registerDowntime(Session session, @RequestBody DowntimeRegisterDto dto) {
        dto.validate();                    // DTO에서 null 체크
        return downTimeApiService.registerDowntime(session, dto);
    }

    // 검색: 커스텀 DTO + Pageable
    @GetMapping
    public Object searchDowntimes(
        @PageableDefault(sort = {"startDT"}, direction = Sort.Direction.DESC) Pageable pageable,
        DowntimeSearchDto downtimeSearchDto) { ... }

    // 활성 조회: /current 경로
    @GetMapping("/current")
    public Object getCurrentDowntimes(CurrentDowntimeSearchDto dto) { ... }
}
```

**v2 - Kotlin + WebFlux + Coroutines**
```kotlin
@RestController
class DowntimeController(private val downtimeService: DowntimeService) {

    // 반환 타입이 명확: ResponseEntity<Downtime>
    @PostMapping
    suspend fun insert(
        @RequestBody dto: DowntimeInsertDto,
        session: Session?               // Kotlin nullable로 세션 처리
    ): ResponseEntity<Downtime> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(downtimeService.insert(dto, session ?: defaultSession()))

    // 검색: 범용 StrapiQuery 사용 (커스텀 DTO 제거)
    @GetMapping("/search")
    suspend fun search(query: StrapiQuery): ResponseEntity<Page<Downtime>> = ...

    // 활성 조회: /active 경로, 단일 serviceType
    @GetMapping("/active")
    fun findActive(
        @RequestParam serviceType: DowntimeServiceType,
        @RequestParam(required = false) baseDt: LocalDateTime?
    ): ResponseEntity<Flow<Downtime>> = ...
}
```

**변경 포인트:**

| 항목 | v1 | v2 |
|------|:--:|:--:|
| 반환 타입 | `Object` | `ResponseEntity<T>` |
| 비동기 | 동기 (Thread-per-request) | `suspend fun` / `Flow` |
| 세션 처리 | `@RequireSession` 어노테이션 | `Session?` nullable 파라미터 |
| DTO null 검증 | `dto.validate()` (수동 null 체크) | Kotlin non-null 타입 (불필요) |
| 검색 쿼리 | `DowntimeSearchDto` (커스텀) | `StrapiQuery` (범용) |
| 활성 조회 경로 | `/current` | `/active` |
| 활성 조회 파라미터 | `List<ServiceType>` (다건) → `ServiceType` (단건, v1.0.16) | `ServiceType` (단건) |
| AOP | `DowntimeApiAspect` (수동) | commons-web-server (자동) |

### 10.6 Service 계층 변경

**v1 - Interface + Implementation 분리**
```java
public interface DownTimeApiService {
    Downtime registerDowntime(Session session, DowntimeRegisterDto dto);
    Downtime deleteDowntime(Session session, int downtimeSeq);
    SimplePage<Downtime> searchDowntimes(Pageable pageable, DowntimeSearchDto dto);
    List<Downtime> currentDowntimes(CurrentDowntimeSearchDto dto);
}

@Service
@Transactional(readOnly = true)
public class DownTimeApiServiceImpl implements DownTimeApiService {
    ...
}
```

**v2 - 단일 클래스**
```kotlin
@Service
@Transactional(readOnly = true)
class DowntimeService(
    private val downtimeRepository: DowntimeRepository,
    private val downtimeValidator: DowntimeValidator
) { ... }
```

**변경 포인트:**

| 항목 | v1 | v2 |
|------|:--:|:--:|
| 구조 | Interface + Impl | 단일 클래스 |
| 이유 | 관례적 분리 | 불필요한 추상화 제거 |
| Validator | 없음 (도메인 내부) | 별도 `@Component` |
| afterWaitTime | 서비스에서 필터링 | 호출측에 위임 |
| 동시성 제어 | 없음 | `SELECT FOR UPDATE` |

### 10.7 afterWaitTime 로직 변경 (중요!)

**v1 - 서비스 내에서 Java 코드로 필터링**
```java
public List<Downtime> currentDowntimes(...) {
    List<Downtime> allDowntimes = downtimeApiMapper.getCurrentDowntimes(baseDT, serviceTypes);

    Integer afterWaitTime = downtimeProperties.getDowntimeAfterWaitTime();

    return allDowntimes.stream()
        .filter(downtime -> {
            LocalDateTime plussedEndDT = downtime.getEndDT().plusSeconds(afterWaitTime);
            // endDT + 60초가 아직 안 지났으면 → 아직 점검 중으로 간주
            return !LocalDateTime.now().isAfter(plussedEndDT);
        })
        .collect(Collectors.toList());
}
```

→ DB에서 전체 활성 다운타임을 가져온 후, Java에서 `endDT + 60초` 필터링

**v2 - afterWaitTime을 DB 쿼리 레벨에서 처리**
```kotlin
// Service: DowntimeProperties에서 afterWaitTime 주입
fun findActive(serviceType: DowntimeServiceType, baseDt: LocalDateTime?): Flow<Downtime> =
    downtimeRepository.findActive(
        serviceType.name,
        baseDt ?: LocalDateTime.now(),
        downtimeProperties.afterWaitTime.toLong()
    )

// Repository: baseDt에서 afterWaitTime을 빼서 DB 쿼리 조건에 반영
fun findActive(serviceType: String, baseDt: LocalDateTime, afterWaitTimeSeconds: Long = 0): Flow<Downtime> {
    // endDt + afterWaitTime >= baseDt → endDt >= baseDt - afterWaitTime (동일 조건)
    val adjustedBaseDt = baseDt.minusSeconds(afterWaitTimeSeconds)
    return Flux.from(
        dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.SERVICE_TYPE.eq(serviceType))
            .and(DOWNTIMES.START_DT.le(baseDt))
            .and(DOWNTIMES.END_DT.ge(adjustedBaseDt))    // 종료 + 60초까지 활성으로 간주
            .and(DOWNTIMES.IS_DELETED.eq(false))
    ).asFlow().map { mapToDowntime(it) }
}
```

**v1 → v2 개선 포인트:**
- v1: DB에서 전체 조회 → Java에서 필터링 (불필요한 데이터 전송)
- v2: DB 쿼리 조건에 afterWaitTime을 반영하여 **필요한 데이터만 조회** (효율적)
- v1: `LocalDateTime.now()`를 필터 안에서 호출 (매 레코드마다 시각이 다를 수 있음)
- v2: `baseDt`를 한 번만 계산해서 일관된 기준 시각 사용

### 10.8 Domain 모델 변경

**v1**
```java
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Downtime extends Session.Wrapper {    // Session.Wrapper 상속

    @Deprecated @Builder
    private Downtime(...) { ... }                  // 빌더 패턴

    public static Downtime of(Session session, DowntimeRegisterDto dto) {
        Downtime downtime = Downtime.builder()...build();
        downtime.validate();                       // 생성 시 검증 포함
        return downtime;
    }

    private void validate() {                      // 검증 로직이 도메인 내부
        if (this.getSession() == null) throw ...
        if (this.targetType.getServiceType() != this.serviceType) throw ...
        ...
    }

    public void delete(Session session) {
        if (this.isDeleted) throw ...              // 삭제 검증도 도메인 내부
        this.isDeleted = true;
        this.deleteSession = session;
    }
}
```

**v2**
```kotlin
class Downtime(
    var downtimeSeq: Int? = null,
    var serviceType: DowntimeServiceType,
    ...
    var session: Session = Session(),              // 상속 대신 구성(Composition)
    var deleteSession: Session? = null
) {
    fun delete(session: Session) {                 // 상태 전이만 담당
        this.isDeleted = true
        this.deleteSession = session
    }

    companion object {
        val FIELD_MAP: Map<String, Field<*>> = ... // jOOQ 필드 매핑 (신규)
        val FIELD_EXPANSIONS: Map<...> = ...       // 가상 필드 확장 (신규)
        fun from(dto: DowntimeInsertDto, session: Session): Downtime = ... // 팩토리
    }
}
```

**변경 포인트:**

| 항목 | v1 | v2 |
|------|:--:|:--:|
| 언어 | Java + Lombok | Kotlin (Lombok 불필요) |
| 세션 관계 | `extends Session.Wrapper` (상속) | `session: Session` (구성) |
| 생성 패턴 | `@Builder` + `Downtime.of()` | `Downtime(...)` + `Downtime.from()` |
| 검증 위치 | **도메인 내부** `validate()` | **외부** `DowntimeValidator` |
| `delete()` | 검증 + 상태 전이 | 상태 전이만 |
| jOOQ 지원 | 없음 | `FIELD_MAP`, `FIELD_EXPANSIONS` |

### 10.9 DTO 변경 - 대폭 간소화

**v1 - 3개 DTO**

```java
// 1. 등록 DTO - 수동 null 검증
public class DowntimeRegisterDto {
    private DowntimeServiceType serviceType;
    ...
    public void validate() {
        if (this.serviceType == null) throw new BusinessException(EMPTY_SERVICE_TYPE);
        if (this.targetType == null) throw new BusinessException(EMPTY_TARGET_TYPE);
        if (this.startDT == null) throw new BusinessException(EMPTY_START_DT);
        if (this.endDT == null) throw new BusinessException(EMPTY_END_DT);
    }
}

// 2. 검색 DTO - 14개 필터 필드를 직접 정의
public class DowntimeSearchDto extends SessionSearchDto {
    private String serviceTypes;      // 쉼표 구분 문자열
    private String targetTypes;
    private String startDTRanges;
    private String endDTRanges;
    private Boolean isDeleted;
    private String memo;
    // + 부모 클래스의 brands, products, partnerSeqs, memberSeqs, ...
}

// 3. 활성 조회 DTO
public class CurrentDowntimeSearchDto {
    private DowntimeServiceType serviceType;
    private LocalDateTime baseDT;
}
```

**v2 - 1개 DTO**

```kotlin
// 등록 DTO만 존재 (나머지는 제거)
data class DowntimeInsertDto(
    val serviceType: DowntimeServiceType,     // non-null → null이면 JSON 파싱에서 에러
    val targetType: DowntimeTargetType,       // non-null
    val startDt: LocalDateTime,               // non-null
    val endDt: LocalDateTime,                 // non-null
    val replacementTargetType: DowntimeTargetType? = null,
    val memo: String? = null
)
// 검색: StrapiQuery (범용 공통 모듈)로 대체
// 활성 조회: @RequestParam으로 직접 받음
```

**왜 바꿨나?**
- v1 `DowntimeSearchDto`는 **필드 하나 추가할 때마다 DTO + MyBatis XML 둘 다 수정** 필요
- v2는 `StrapiQuery` + jOOQ `FIELD_MAP`으로 **새 필드 추가 시 코드 수정 불필요**
- v1의 수동 null 검증 → Kotlin non-null 타입으로 **언어 레벨에서 해결**

### 10.10 데이터 접근 계층 변경 (MyBatis → jOOQ)

**v1 - MyBatis Mapper Interface + XML (155줄)**
```java
// Java Interface
@Mapper
public interface DowntimeApiMapper {
    void registerDowntime(Downtime downtime);
    Downtime getDowntime(@Param("downtimeSeq") int downtimeSeq);
    void deleteDowntime(Downtime downtime);
    int getDowntimesCount(@Param("downtimeSearchDto") DowntimeSearchDto dto);
    List<Downtime> searchDowntimes(@Param("pageable") Pageable pageable, @Param("downtimeSearchDto") DowntimeSearchDto dto);
    List<Downtime> getCurrentDowntimes(@Param("baseDT") LocalDateTime baseDT, @Param("serviceType") DowntimeServiceType serviceType);
}
```
```xml
<!-- MyBatis XML: SQL과 매핑을 별도 파일에 작성 -->
<insert id="registerDowntime" ...>
    <selectKey order="BEFORE" keyProperty="downtimeSeq" resultType="java.lang.Integer">
        SELECT NEXTVAL('downtimes_downtime_seq_seq');     <!-- 시퀀스 직접 호출 -->
    </selectKey>
    INSERT INTO "downtimes" (...) VALUES (...)
</insert>

<select id="getDowntime" resultMap="DowntimeMap">         <!-- 수동 ResultMap -->
    SELECT * FROM "downtimes" WHERE "downtime_seq" = #{downtimeSeq}
</select>

<!-- 동적 검색: XML의 <if>, <foreach>로 조건 조립 -->
<sql id="searchDowntimesWhere">
    <where>
        <if test="downtimeSearchDto.serviceType != null and !downtimeSearchDto.serviceType.isEmpty()">
            AND "service_type" IN
            <foreach collection="downtimeSearchDto.serviceType" item="value" separator="," open="(" close=")">
                #{value}
            </foreach>
        </if>
        <!-- ... 14개 필터 조건 반복 ... -->
    </where>
</sql>
```

**v2 - jOOQ + R2DBC (175줄, Kotlin 코드)**
```kotlin
@Repository
class DowntimeRepository(private val dsl: DSLContext) {

    suspend fun insert(downtime: Downtime) {
        val result = Mono.from(
            dsl.insertInto(DOWNTIMES)
                .set(DOWNTIMES.SERVICE_TYPE, downtime.serviceType.name)  // 타입 안전
                ...
                .returning(DOWNTIMES.DOWNTIME_SEQ)     // RETURNING으로 PK 바로 반환
        ).awaitSingleOrNull()
        downtime.downtimeSeq = result?.get(DOWNTIMES.DOWNTIME_SEQ)
    }

    suspend fun findBySeqForUpdate(downtimeSeq: Int): Downtime? {  // v1에 없던 FOR UPDATE
        return Mono.from(
            dsl.selectFrom(DOWNTIMES)
                .where(DOWNTIMES.DOWNTIME_SEQ.eq(downtimeSeq))
                .forUpdate()                            // 비관적 락
        ).awaitSingleOrNull()?.let { mapToDowntime(it) }
    }

    // 동적 검색: Kotlin 코드로 조건 조립
    fun search(criteria: JooqSearchCriteria): Flow<Downtime> {
        val query = dsl.selectFrom(DOWNTIMES)
            .where(DOWNTIMES.IS_DELETED.eq(false))
            .and(criteria.condition)                    // StrapiQuery에서 자동 변환
            ...
    }
}
```

**핵심 차이 비교:**

| 항목 | v1 MyBatis | v2 jOOQ |
|------|:----------:|:-------:|
| SQL 작성 위치 | XML 파일 | Kotlin 코드 |
| 타입 안전성 | 런타임 오류 | **컴파일 타임 오류** |
| IDE 지원 | 제한적 | **자동완성 완벽** |
| ResultMap | XML에 수동 매핑 | `mapToDowntime()` 코드로 명시 |
| PK 생성 | `NEXTVAL('시퀀스')` | `RETURNING downtime_seq` |
| 동적 쿼리 | `<if>` `<foreach>` XML | `JooqSearchCriteria` (공통 라이브러리) |
| I/O 모델 | Blocking (JDBC) | **Non-blocking (R2DBC)** |
| 동시성 제어 | 없음 | `SELECT FOR UPDATE` |

### 10.11 에러 코드 변경

**v1 (11개)**
```java
EMPTY_SESSION,              // v2에서 제거 - commons에서 처리
NOT_FOUND,                  // v2에서 제거 - 공통 에러 코드 사용
ALREADY_DELETED,
INVALID_TARGET_TYPE,
INVALID_REPLACEMENT_TYPE,
TARGET_SAME_REPLACEMENT,
INVALID_PERIOD,
SAME_START_END_TIME,
EMPTY_SERVICE_TYPE,         // v2에서 제거 - Kotlin non-null
EMPTY_TARGET_TYPE,          // v2에서 제거 - Kotlin non-null
EMPTY_START_DT,             // v2에서 제거 - Kotlin non-null
EMPTY_END_DT                // v2에서 제거 - Kotlin non-null
```

**v2 (6개)**
```kotlin
ALREADY_DELETED,
INVALID_TARGET_TYPE,
INVALID_REPLACEMENT_TYPE,
TARGET_SAME_REPLACEMENT,
INVALID_PERIOD,
SAME_START_END_TIME
```

**제거된 5개:**
- `EMPTY_SESSION` → commons-web-server가 JWT 검증 시 처리
- `NOT_FOUND` → `CommonWebServerErrorCode.NOT_FOUND` 공통 코드 사용
- `EMPTY_SERVICE_TYPE`, `EMPTY_TARGET_TYPE`, `EMPTY_START_DT`, `EMPTY_END_DT` → Kotlin non-null 타입이므로 JSON 파싱 단계에서 자동 검증 (코드에 도달하기 전에 400 에러)

### 10.12 삭제된 클래스 (v1에만 존재)

| v1 클래스 | 역할 | v2에서 제거 이유 |
|-----------|------|-----------------|
| `DowntimeApiAspect` | Controller AOP (응답 래핑) | commons-web-server에서 자동 처리 |
| `DowntimeApiResourceServerConfig` | OAuth2 Resource Server 설정 | commons-web-server의 보안 모듈로 대체 |
| `DowntimeApiWebMvcConfig` | WebMVC 설정 + Pageable Resolver | WebFlux 전환으로 불필요 |
| `DowntimeApiSqlSessionConfig` | MyBatis SqlSession 설정 | MyBatis → jOOQ 전환으로 제거 |
| `DowntimeSqlSessionConfig` | 공유 모듈 MyBatis 설정 | 동일 |
| `DowntimeInitializer` | 초기화 빈 (빈 내용) | 불필요 코드 제거 |
| `mybatis-config.xml` | MyBatis 전역 설정 | MyBatis 제거 |
| `DowntimeApiMapper.xml` | SQL 매핑 (155줄) | jOOQ로 대체 |
| `DowntimeSearchDto` | 검색 전용 DTO (14개 필터) | StrapiQuery로 대체 |
| `CurrentDowntimeSearchDto` | 활성 조회 DTO | @RequestParam으로 대체 |
| `bootstrap.yml` | Spring Cloud Config 부트스트랩 | `spring.config.import`로 대체 (Boot 3+) |
| `logback-spring.xml` | 로깅 설정 | 기본 설정 사용 |
| `Dockerfile.*` | Docker 빌드 | Jenkins + Nx 파이프라인으로 대체 |

### 10.13 설정 구조 변경

**v1 - bootstrap.yml + application.yml 분리**
```yaml
# bootstrap.yml (Config Server 설정)
spring:
  application:
    name: downtime-api
  cloud:
    config:
      enabled: false
---
spring.profiles: cloudconfig     # 프로필명으로 Config Server 활성화
spring:
  cloud:
    config:
      enabled: true
      uri: http://${CONFIG_SERVER_HOST}:${CONFIG_SERVER_PORT}

# application.yml (서버 설정)
server:
  port: 27000

# application-downtime.yml (DB 설정 - JDBC)
downtime:
  datasource:
    downtime:
      driver-class-name: org.postgresql.Driver
      jdbc-url: jdbc:postgresql://localhost/downtime
```

**v2 - application.yaml 통합**
```yaml
# application.yaml (전부 한 파일)
server:
  port: 27000
spring:
  r2dbc:                                    # R2DBC (Non-blocking)
    url: r2dbc:postgresql://localhost:5432/downtime
  flyway:                                   # Flyway (JDBC, 마이그레이션용)
    url: jdbc:postgresql://localhost:5432/downtime
  cloud:
    config:
      enabled: false                        # 로컬에서는 비활성화
---
spring.config.activate.on-profile: dev | prod   # Spring Boot 3 이후 프로필 문법
spring:
  config:
    import: configserver:http://${CONFIG_SERVER_HOST}:${CONFIG_SERVER_PORT}
  cloud:
    config:
      enabled: true
```

**변경 포인트:**
- `bootstrap.yml` 제거 → Spring Boot 3 이후 `spring.config.import`로 대체
- `spring.profiles: cloudconfig` → `spring.config.activate.on-profile: dev | prod`
- 커스텀 DataSource 설정 → Spring Boot 자동 설정 (`spring.r2dbc.*`)
- JDBC → R2DBC + Flyway용 JDBC 이중 설정

### 10.14 빌드 시스템 변경

**v1 - Groovy DSL**
```groovy
plugins {
    id 'org.springframework.boot' version '2.3.0.RELEASE'
}
sourceCompatibility = '1.8'

dependencies {
    // 다른 MSA 모듈 4개 의존!
    api "com.knet.msa.fax:fax:latest.${withSnapshot ? "integration" : "release"}"
    api "com.knet.msa.card:card:latest.${withSnapshot ? "integration" : "release"}"
    api "com.knet.msa.message:message:latest.${withSnapshot ? "integration" : "release"}"
    api "com.knet.msa.bank:bank:latest.${withSnapshot ? "integration" : "release"}"

    // MyBatis
    api 'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.3.2'

    // Lombok
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

**v2 - Kotlin DSL + Version Catalog**
```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.jooq)
}

dependencies {
    // 공통 모듈 1개만 의존 (다른 MSA 의존 없음!)
    implementation("com.knet.commons:commons-web-server:${rootProject.extra["knetVersion"]}")
    implementation(project(":downtime"))

    // jOOQ (MyBatis 대체)
    implementation(libs.jooq)
    jooqGenerator(libs.postgresql)

    // Kotlin Coroutines
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.reactor)

    // Testcontainers (신규)
    testImplementation(libs.testcontainers.postgresql)
}
```

**핵심 차이:**

| 항목 | v1 | v2 |
|------|:--:|:--:|
| 외부 MSA 의존 | fax, card, message, bank **(4개)** | **없음** |
| 공통 라이브러리 | commons-util + 5개 util | commons-web-server **(1개)** |
| Lombok | 필수 | **불필요** (Kotlin) |
| MyBatis | 필수 | **제거** → jOOQ |
| 테스트 DB | 외부 DB 의존 | **Testcontainers** |
| jOOQ 코드 생성 | 없음 | **빌드 시 자동 생성** |

### 10.15 테스트 인프라 변경

**v1**
```
- 외부 PostgreSQL DB에 의존 (로컬에 DB가 있어야 테스트 가능)
- schema.sql: DROP TABLE IF EXISTS + CREATE TABLE (매번 초기화)
- data.sql: 테스트 데이터 직접 삽입
- MockMvc로 API 테스트
```

**v2**
```
- Testcontainers로 PostgreSQL 17 컨테이너 자동 기동 (Docker만 있으면 OK)
- Flyway가 마이그레이션 자동 실행 (스키마 생성)
- 테스트 코드에서 직접 데이터 생성 (createTestDowntime())
- WebTestClient로 실제 HTTP 요청 테스트
- AbstractIntegrationTest 기반 클래스로 공통화
```

### 10.16 API 엔드포인트 변경

| 기능 | v1 경로 | v2 경로 | 변경 사항 |
|------|---------|---------|-----------|
| 등록 | `POST /api/downtimes` | `POST /api/downtimes` | 동일 (DTO명만 변경) |
| 삭제 | `DELETE /api/downtimes/{seq}` | `DELETE /api/downtimes/{seq}` | 동일 |
| 검색 | `GET /api/downtimes` | `GET /api/downtimes/search` | 경로 변경, 쿼리 방식 변경 |
| 활성 조회 | `GET /api/downtimes/current` | `GET /api/downtimes/active` | 경로 + 파라미터 변경 |

**검색 API 쿼리 방식 변경:**
```
v1: ?serviceTypes=FAX,MESSAGE&isDeleted=false&page=0&size=25&sort=startDT,desc
v2: ?filters[serviceType][$eq]=FAX&sort[0]=startDt:desc&page=0&size=25
```
→ v2는 Strapi 스타일 쿼리 (범용적, 필터 연산자 지원: `$eq`, `$ne`, `$gt`, `$lt` 등)

**활성 조회 API 파라미터 변경:**
```
v1.0.0:  ?serviceType=FAX&serviceType=MESSAGE  (다중 ServiceType, List)
v1.0.16: ?serviceType=FAX                       (단일 ServiceType)
v2:      ?serviceType=FAX&baseDt=2026-04-07T14:00:00  (단일 ServiceType + 선택적 baseDt)
```

### 10.17 동시성 제어 추가 (v2 신규)

**v1 - 동시 삭제 시 문제 가능**
```java
Downtime downtime = downtimeApiMapper.getDowntime(downtimeSeq);  // 일반 SELECT
downtime.delete(session);                                         // 상태 변경
downtimeApiMapper.deleteDowntime(downtime);                       // UPDATE
```
→ 두 요청이 동시에 `getDowntime()`을 호출하면, 둘 다 `isDeleted=false`를 읽고 동시에 삭제 → 삭제 세션 정보 덮어쓰기 가능

**v2 - SELECT FOR UPDATE로 안전**
```kotlin
val downtime = downtimeRepository.findBySeqForUpdate(downtimeSeq)  // SELECT FOR UPDATE
downtime.delete(session)
downtimeRepository.softDelete(downtime)
```
→ 첫 번째 요청이 락을 잡으면 두 번째 요청은 대기 → 안전하게 처리

### 10.18 변경 요약 한눈에 보기

```
v1 구조:
Controller (Object 반환, AOP 래핑)
  → DTO.validate() (수동 null 체크)
  → Service Interface → ServiceImpl
    → MyBatis Mapper Interface → XML (SQL)
      → JDBC → PostgreSQL (Blocking)
  → Domain.validate() (도메인 내 검증)
  → Domain.delete() (검증 + 상태 전이)

v2 구조:
Controller (ResponseEntity 반환, suspend/Flow)
  → Service (단일 클래스)
    → Validator (검증 분리)
    → Repository (jOOQ DSL, Kotlin 코드)
      → R2DBC → PostgreSQL (Non-blocking)
  → Domain.from() (팩토리)
  → Domain.delete() (상태 전이만)
```

**핵심 설계 철학 변화:**
1. **불필요한 추상화 제거**: Interface+Impl → 단일 클래스, 커스텀 SearchDTO → 범용 StrapiQuery
2. **외부 의존 제거**: 4개 MSA 모듈 의존 → 자체 완결
3. **관심사 분리**: 검증을 Validator로, afterWaitTime을 호출측으로 분리
4. **타입 안전성 강화**: XML 문자열 → jOOQ 타입 안전, Java null → Kotlin non-null
5. **Non-blocking 전환**: MVC+JDBC → WebFlux+R2DBC+Coroutines
6. **자동화**: 수동 스키마 → Flyway, 수동 버전 → Nx, 수동 테스트 DB → Testcontainers

---

## 11. Kotlin 핵심 문법 입문

> Java를 아는 팀원이 이 프로젝트 코드를 읽기 위해 알아야 할 Kotlin 문법만 정리.

### 11.1 Null Safety - 컴파일 타임 null 체크

```kotlin
// Non-null: 절대 null이 될 수 없음 (Java에는 없는 개념)
val serviceType: DowntimeServiceType    // null 넣으면 컴파일 에러

// Nullable: null 허용을 명시적으로 선언
val memo: String?                       // null 가능
val baseDt: LocalDateTime? = null       // 기본값으로 null 지정

// Safe call (?.) - null이면 평가 중단, null 반환
downtime.replacementTargetType?.name    // Java: downtime.getReplacementTargetType() != null ? ... : null

// Elvis (?:) - null이면 대체값 사용
session ?: defaultSession()             // Java: session != null ? session : defaultSession()
```

**Java와 비교:**
```java
// Java - 런타임에 NPE 발생 가능
String name = downtime.getReplacementTargetType().name();  // NPE 위험!

// Java - 방어 코드 필요
if (downtime.getReplacementTargetType() != null) {
    String name = downtime.getReplacementTargetType().name();
}
```

```kotlin
// Kotlin - 컴파일러가 null 체크를 강제
val name = downtime.replacementTargetType?.name     // null-safe, NPE 불가능
```

이 프로젝트에서 **nullable이 쓰인 곳:** DTO의 `replacementTargetType?`, `memo?`, Controller의 `Session?`, `baseDt?`, Domain의 `downtimeSeq?`, `deleteSession?`

### 11.2 val / var - 불변과 가변

```kotlin
val name = "hello"      // final String name = "hello";  (불변, 재할당 불가)
var count = 0           // int count = 0;                 (가변, 재할당 가능)
count = 1               // OK
name = "world"          // 컴파일 에러!
```

이 프로젝트에서의 규칙:
- **DTO**: `val`만 사용 → 생성 후 변경 불가 (안전)
- **Domain**: `var` 사용 → insert 후 `downtimeSeq` 할당, delete 시 `isDeleted` 변경 필요

### 11.3 data class - Java의 Lombok 대체

```java
// Java + Lombok: 여전히 annotation processor 필요
@Getter @Setter @EqualsAndHashCode @ToString @AllArgsConstructor
public class DowntimeRegisterDto {
    private DowntimeServiceType serviceType;
    private DowntimeTargetType targetType;
    private LocalDateTime startDT;
    private LocalDateTime endDT;
    private DowntimeTargetType replacementTargetType;
    private String memo;
}
```

```kotlin
// Kotlin: 한 줄로 동일한 기능 (getter/setter/equals/hashCode/toString/copy 자동 생성)
data class DowntimeInsertDto(
    val serviceType: DowntimeServiceType,
    val targetType: DowntimeTargetType,
    val startDt: LocalDateTime,
    val endDt: LocalDateTime,
    val replacementTargetType: DowntimeTargetType? = null,  // 기본값 지정 가능
    val memo: String? = null
)
```

### 11.4 suspend fun / Flow - 비동기를 동기처럼

```java
// Java - CompletableFuture로 비동기 처리 (콜백 지옥 가능)
CompletableFuture<Downtime> future = repository.findBySeq(seq);
future.thenApply(downtime -> {
    downtime.delete(session);
    return repository.softDelete(downtime);
}).thenApply(result -> ...);
```

```kotlin
// Kotlin Coroutines - 비동기인데 동기처럼 읽힌다
suspend fun delete(downtimeSeq: Int, session: Session): Downtime {
    val downtime = downtimeRepository.findBySeqForUpdate(downtimeSeq)  // 비동기 대기 (자동)
    downtime.delete(session)                                            // 일반 코드
    downtimeRepository.softDelete(downtime)                             // 비동기 대기 (자동)
    return downtime
}
```

| 개념 | 역할 | Java 대응 |
|------|------|-----------|
| `suspend fun` | 일시 중단 가능한 함수 (단건) | `CompletableFuture<T>` / `Mono<T>` |
| `Flow<T>` | 여러 값을 비동기로 내보내는 스트림 (다건) | `Stream<T>` / `Flux<T>` |
| `awaitSingleOrNull()` | Mono → suspend 변환 | `.get()` / `.block()` |
| `.asFlow()` | Flux → Flow 변환 | - |

### 11.5 let, apply - 스코프 함수

이 프로젝트에서 자주 나오는 두 가지:

```kotlin
// let: null이 아닐 때만 블록 실행 (it = 해당 값)
record.getOrNull(DOWNTIMES.REPLACEMENT_TARGET_TYPE)
    ?.let { DowntimeTargetType.valueOf(it) }
// Java: String val = record.get(...); return val != null ? DowntimeTargetType.valueOf(val) : null;

// apply: 객체 설정 후 자신을 반환
PostgreSQLContainer("postgres:17-alpine")
    .withDatabaseName("downtime")
    .withUsername("postgres")
    .apply { start() }              // start() 호출 후 컨테이너 객체 반환
```

### 11.6 when - Java switch의 강화판

```kotlin
// 이 프로젝트에서 직접 쓰이진 않지만, 호출하는 MSA에서 쓸 패턴
when (downtime.targetType) {
    CARD_BC      -> handleBC()
    CARD_KB      -> handleKB()
    CARD_SHINHAN -> handleShinhan()
    else         -> handleDefault()
}
```

- `break` 불필요 (자동)
- 표현식으로 사용 가능 (`val result = when (x) { ... }`)
- enum의 모든 케이스를 처리했는지 컴파일러가 검증 (`else` 없으면 경고)

---

## 12. 예상 질문 & 답변 (Q&A)

### Q1. WebFlux로 바꾸면 성능이 실제로 얼마나 좋아지나? 우리 서비스에 Reactive가 필요한 수준인가?

**답변:**

Downtime API는 트래픽이 높은 서비스는 아니다. 하지만 이 서비스를 **호출하는 쪽**(문자, 팩스, 카드 등)은 고트래픽이다. 예를 들어 문자 발송 건마다 `/active`를 호출하면 동시 요청이 많아질 수 있다.

- MVC(Thread-per-request): 요청 1개 = 스레드 1개. DB I/O 대기 중 스레드가 블로킹 → 동시 요청 많으면 스레드 고갈
- WebFlux(Non-blocking): 적은 스레드로 많은 요청 처리 가능. DB I/O 대기 중에도 스레드가 다른 요청 처리

다만 **성능 향상보다 중요한 이유는 기술 표준화**다. 이번 프로젝트를 파일럿으로 검증하고, 이후 다른 MSA에도 동일 스택을 적용할 예정. 한 서비스에서 먼저 검증하고 패턴을 잡아두는 것이 목적.

### Q2. Kotlin을 모르는 팀원이 많은데, 러닝 커브는 어떤가?

**답변:**

Java를 아는 사람이 Kotlin을 배우는 건 비교적 쉽다. 100% JVM 호환이라 Java 라이브러리 그대로 사용 가능.

**이 프로젝트에서 사용된 Kotlin 문법은 사실 몇 가지 안 된다:**

| 문법 | 예시 | Java 대응 |
|------|------|-----------|
| `val` / `var` | `val name = "hello"` | `final` / 일반 변수 |
| nullable `?` | `val memo: String?` | `@Nullable String` |
| elvis `?:` | `session ?: defaultSession()` | `session != null ? session : defaultSession()` |
| safe call `?.` | `brand?.name` | `brand != null ? brand.getName() : null` |
| `let` | `x?.let { use(it) }` | `if (x != null) { use(x); }` |
| `data class` | `data class Dto(val a: Int)` | Lombok `@Data` + `@AllArgsConstructor` |
| `suspend fun` | `suspend fun insert(...)` | 새로운 개념 (코루틴) |
| `Flow<T>` | `fun findActive(): Flow<Downtime>` | `Flux<Downtime>` 대응 |

실질적으로 새로 배울 건 **suspend/Flow(코루틴)** 정도이고, 나머지는 Java 코드의 축약형이라 읽으면 바로 이해 가능하다.

### Q3. jOOQ로 바꾸면 MyBatis처럼 복잡한 동적 쿼리도 다 가능한가?

**답변:**

가능하다. v1의 MyBatis XML에서 `<if>`, `<foreach>`로 14개 필터 조건을 조립하던 것을 v2에서는 `JooqSearchCriteria`가 대체한다.

```
v1 (MyBatis XML):
<if test="downtimeSearchDto.serviceType != null">
    AND "service_type" IN <foreach ...>#{value}</foreach>
</if>
<!-- 이런 블록이 14개 반복 -->

v2 (jOOQ + StrapiQuery):
val query = dsl.selectFrom(DOWNTIMES)
    .where(DOWNTIMES.IS_DELETED.eq(false))
    .and(criteria.condition)    ← 이 한 줄이 14개 필터를 자동 처리
```

오히려 v2가 더 유연하다. v1은 필터 하나 추가하려면 DTO에 필드 추가 + XML에 `<if>` 블록 추가가 필요했지만, v2는 `Downtime.FIELD_MAP`에 자동 매핑되므로 **코드 수정 없이 새 필드 검색이 가능**하다.

### Q4. v1에서 afterWaitTime을 서비스에서 처리했는데, v2에서 빼버리면 호출하는 MSA 쪽에서 다 수정해야 하는 거 아닌가?

**답변:**

맞다. 이건 **의도적인 설계 변경**이다.

v1에서 afterWaitTime을 이 서비스에서 처리하면 문제가 있었다:
- 다운타임이 끝났는데도 60초 동안 "아직 점검 중"이라고 응답 → 호출하는 MSA 입장에서 혼란
- "endDt가 14:00인데 왜 14:00:30에도 점검 중이라고 나와?" 같은 이슈

v2에서는 다운타임 API는 **등록된 일정 그대로 반환**하고, afterWaitTime 적용은 호출측에서 판단한다. 이렇게 하면:
- 다운타임 API의 응답이 예측 가능 (등록한 대로 나옴)
- 각 MSA가 자기 서비스 특성에 맞게 대기 시간을 다르게 적용할 수도 있음
- `DowntimeProperties.afterWaitTime` 값은 여전히 설정에 있으므로, 호출측이 이 값을 참조

### Q5. SELECT FOR UPDATE를 쓰면 성능 문제가 없나? 락을 거는 거니까 느려지지 않나?

**답변:**

삭제는 관리자가 수동으로 하는 작업이라 **초당 수십 건씩 삭제하는 시나리오가 아니다**. 실질적으로 같은 다운타임을 동시에 삭제하는 경우는 극히 드물다.

만약 락 경합이 발생해도:
- 트랜잭션이 짧다 (SELECT → 상태변경 → UPDATE, 3단계 끝)
- 대기 시간은 밀리초 단위
- 데이터 정합성 > 성능이 중요한 작업

v1에서 락 없이 동시 삭제 시 **삭제 세션 정보가 덮어써지는 것**(누가 삭제했는지 추적 불가)이 더 큰 문제다. 감사(audit) 관점에서 FOR UPDATE는 반드시 필요하다.

### Q6. Testcontainers를 쓰면 Docker가 필수인데, CI 서버나 개발자 PC에 Docker가 없으면 어떻게 하나?

**답변:**

**Docker는 필수다.** 현재 환경:
- 개발자 PC: Docker Desktop 또는 Rancher Desktop 설치 필요
- CI(Jenkins): Docker가 이미 설치되어 있음

Docker 없이 로컬에서 테스트만 돌리고 싶다면, 별도로 PostgreSQL을 띄우고 `application.yaml`의 접속 정보를 맞추면 되긴 한다. 하지만 **Testcontainers가 주는 이점이 크다:**
- 환경마다 DB 버전/설정이 달라서 "내 PC에서는 되는데?" 문제가 없어짐
- 테스트가 격리됨 (다른 사람의 테스트 데이터에 영향 안 받음)
- CI에서 별도 DB 인스턴스 관리 불필요

jOOQ 코드 생성도 Testcontainers를 쓰므로, **빌드 자체에 Docker가 필요**하다.

### Q7. Flyway 마이그레이션을 잘못 작성하면 운영 DB가 망가질 수 있지 않나? 롤백은 어떻게 하나?

**답변:**

Flyway는 **한번 적용된 마이그레이션은 수정 불가**가 원칙이다. 체크섬으로 검증하기 때문에 이미 적용된 SQL을 수정하면 애플리케이션 시작이 실패한다.

**안전 장치:**
1. `flyway.clean-disabled: true` (기본값) → 운영에서 `flyway clean`(전체 삭제) 실행 불가
2. `test` 프로필에서만 `clean-disabled: false` → 테스트 DB만 초기화 가능
3. 마이그레이션 파일은 `V{날짜시간}__{설명}.sql` 형식 → 순서가 보장됨

**롤백이 필요하면:**
- Flyway Community(현재 사용)는 자동 롤백 미지원
- 수동으로 역방향 SQL 작성 (`V2__rollback_xxx.sql`)
- 또는 DB 백업에서 복원

**실수를 방지하려면:**
- PR 리뷰에서 마이그레이션 SQL 반드시 확인
- dev 환경에서 먼저 적용 후 prod 배포
- 위험한 DDL(컬럼 삭제, 타입 변경)은 단계적으로 진행

### Q8. v1의 DowntimeSearchDto가 지원하던 세부 검색 필터(brands, products, partnerSeqs 등)가 v2에서도 다 되나?

**답변:**

된다. v2에서는 `StrapiQuery` + `Downtime.FIELD_MAP`이 이를 대체한다.

```
v1: ?brands=BAROBILL&products=test&partnerSeqs=1,2,3
    → DowntimeSearchDto에 필드가 하나하나 정의되어 있어야 함

v2: ?filters[session.brand][$eq]=BAROBILL&filters[session.partnerSeq][$in]=1,2,3
    → FIELD_MAP에 매핑된 모든 필드를 자동으로 검색 가능
```

`Downtime.FIELD_EXPANSIONS`에서 `"session"` → 9개 컬럼으로 확장해주므로, 세션 관련 필드도 모두 검색 가능하다.

오히려 v2가 더 유연하다:
- v1: `IN` 검색만 가능 → v2: `$eq`, `$ne`, `$gt`, `$lt`, `$in` 등 연산자 지원
- v1: 필드 추가 시 DTO + XML 수정 필요 → v2: 자동 매핑 (코드 수정 불필요)
- 단, v1의 `isDeleted` 필터는 v2에서 **고정 조건**(`is_deleted = false`)이므로 삭제된 건 조회 불가 (의도적)

### Q9. v1에서 쓰던 다른 MSA 모듈 의존(fax, card, message, bank)을 제거하면, TargetType에서 벤더 코드를 어떻게 알 수 있나?

**답변:**

v1에서는 `DowntimeTargetType.CARD_BC.getCardCompanyCode()` → `CardCompanyCode.BC`를 반환했다. 이건 다운타임 모듈이 카드 모듈의 enum을 직접 참조했기 때문에 가능했다.

v2에서는 이 변환을 **호출하는 MSA 쪽에서** 한다:

```kotlin
// 카드 MSA에서
val activeDowntimes = downtimeApi.findActive(CARD)
for (downtime in activeDowntimes) {
    when (downtime.targetType) {
        CARD_BC -> // BC 카드사 우회 처리
        CARD_KB -> // KB 카드사 우회 처리
        ...
    }
}
```

`DowntimeTargetType` enum 값의 이름 자체가 `CARD_BC`, `BANK_KB` 등으로 **의미가 명확**하기 때문에, 별도의 `getCardCompanyCode()` 같은 변환 메서드 없이도 각 MSA에서 충분히 매핑할 수 있다. 오히려 이렇게 하면:

- 다운타임 모듈이 가벼워짐 (의존 0개)
- 카드 모듈의 enum이 바뀌어도 다운타임 모듈은 영향 없음
- 빌드가 빨라짐 (4개 모듈 다운로드 불필요)

### Q10. 이 구조를 다른 MSA에도 적용할 때, 매번 jOOQ 코드 생성 설정을 처음부터 해야 하나?

**답변:**

`downtime-api/build.gradle.kts`의 jOOQ 코드 생성 부분이 꽤 길지만(약 70줄), 구조가 **패턴화**되어 있어서 복사 후 수정하면 된다.

바꿀 부분은 이것뿐이다:
```kotlin
val dataSources = listOf(
    JooqDataSource("downtime", "db/migration", "com.knet.msa.downtime.api.generated.downtime"),
    // 여러 DB를 쓰면 여기에 추가
)
```

나머지는 동일하게 재사용 가능하다. 향후에는 이 빌드 설정 자체를 **공통 Gradle 플러그인**으로 만들어서 한 줄로 적용하는 방안도 고려할 수 있다.

실제로 다른 MSA에 적용할 때 필요한 단계:
1. `build.gradle.kts`의 jOOQ 설정 복사 (DataSource명, 패키지명만 변경)
2. Flyway 마이그레이션 SQL 작성
3. `JooqR2dbcConfig.kt` 복사 (수정 불필요, 그대로 사용)
4. 빌드 → jOOQ 코드 자동 생성 → Repository에서 사용

### Q11. 운영 중인 v1 API를 호출하는 다른 MSA가 있을 텐데, v2로 전환할 때 하위 호환은 어떻게 하나?

**답변:**

**API 경로가 바뀌었기 때문에 호출하는 MSA도 수정이 필요하다:**

| 기능 | v1 경로 | v2 경로 |
|------|---------|---------|
| 활성 조회 | `GET /api/downtimes/current` | `GET /api/downtimes/active` |
| 검색 | `GET /api/downtimes` | `GET /api/downtimes/search` |

또한 파라미터도 변경됨:
- v1 `currentDowntimes`의 `serviceType`이 `List` → v2는 단일 값
- v1 검색 DTO의 쉼표 구분 쿼리 → v2는 Strapi 스타일 쿼리

**전환 전략:**
1. v2를 dev 환경에 배포
2. 호출하는 MSA에서 v2 API 형식으로 수정 + 테스트
3. 모든 호출측 준비 완료 후 v2를 prod 배포
4. v1은 일정 기간 유지 후 제거

또는, 필요하다면 v2에서 v1 경로를 **deprecated 엔드포인트**로 일시적으로 유지하는 것도 가능하다.

---

### Q12. `@RequireSession`이 왜 주석 처리되어 있나?
개발/테스트 편의를 위해 임시로 비활성화. 운영 배포 시 주석 해제하면 JWT 토큰 없는 요청은 401 반환.

### Q13. `suspend fun`과 그냥 `fun`의 차이는?
- `suspend fun`: 코루틴 안에서 실행, 비동기 작업을 동기처럼 작성 가능 (단건)
- `fun`: `Flow`를 반환할 때는 suspend 불필요. Flow 자체가 lazy 스트림이라 구독 시점에 실행

### Q14. R2DBC인데 왜 Flyway는 JDBC를 쓰나?
Flyway는 마이그레이션 실행 시 DDL을 수행하는데, 이건 R2DBC로 할 수 없음. Flyway는 애플리케이션 시작 시 한 번만 실행되므로 JDBC로 충분.

### Q15. `Mono.from()`이 뭔가?
jOOQ의 쿼리 결과는 `Publisher<T>` (Reactive Streams 표준). `Mono.from()`은 이를 Reactor의 `Mono`로 감싸는 것. 그 후 `.awaitSingleOrNull()`로 코루틴으로 전환.

### Q16. downtime 모듈을 다른 MSA에서 어떻게 사용하나?
```kotlin
// 다른 MSA의 build.gradle.kts
dependencies {
    implementation("com.knet.msa.downtime:downtime:x.x.x")
}

// 코드에서 enum 사용
if (targetType == DowntimeTargetType.BANK_KB) { ... }
```
Nexus에 publish된 JAR을 의존성으로 추가.

### Q17. 왜 `data class`가 아닌 일반 `class`를 Domain에 썼나?
Downtime 도메인 객체는 `var`로 상태가 변경됨 (insert 후 PK 할당, delete 시 상태 전이). `data class`의 `equals()`/`hashCode()`가 가변 필드를 포함하면 HashSet/HashMap에서 문제가 생길 수 있어 일반 class 사용.

### Q18. AfterWaitTime은 어디서 사용하나?
`DowntimeProperties.afterWaitTime` (60초)은 이 서비스 자체에서 사용하기보단, 이 API를 호출하는 **다른 MSA**에서 활용하는 설정. 다운타임이 끝나도 바로 전환하지 않고 60초 더 기다리는 안전 마진.

---

## 13. 향후 적용 계획

- 이번 Downtime 서비스를 **파일럿 프로젝트**로 검증
- 검증 완료 후 다른 MSA 서비스에도 순차 적용
- 공통 라이브러리(`commons-web-server`) 기반으로 일관된 패턴 유지

---

## 14. 전체 정리

| 변경 | 효과 |
|------|------|
| Java 8 → **Java 25** | 최신 JDK 기능 활용, 성능 향상 |
| Java → **Kotlin** | Null safety, 간결한 코드, Coroutines |
| MVC → **WebFlux** | Non-blocking I/O, 높은 동시성 |
| JDBC → **R2DBC** | DB 레벨까지 Non-blocking |
| MyBatis → **jOOQ** | 컴파일 타임 SQL 검증, 타입 안전 |
| 수동 DDL → **Flyway** | DB 스키마 버전 관리 자동화 |
| 외부 DB → **Testcontainers** | 독립적 테스트 환경 |
| Groovy DSL → **Kotlin DSL** | 빌드 스크립트도 타입 안전 |
| 4개 MSA 의존 → **자체 완결** | 빌드 속도 향상, 결합도 제거 |
| Interface+Impl → **단일 클래스** | 불필요한 추상화 제거 |
| 도메인 내 검증 → **Validator 분리** | 단위 테스트 용이 |
| 수동 버전 → **Nx + Conventional Commits** | 릴리즈 자동화 |
