---
layout: post
title: ProblemDetail - Spring Boot 4의 표준 에러 응답
tags: [ spring, kotlin ]
---

## API 에러 응답의 현실

팀마다, 서비스마다 에러 응답 형식이 다르다.

```json
// A 서비스
{ "error": "not found", "code": 404 }

// B 서비스
{ "message": "사용자를 찾을 수 없습니다", "status": "FAIL" }

// C 서비스
{ "err_msg": "NOT_FOUND", "result": false, "data": null }
```

클라이언트 입장에서는 서비스마다 에러 파싱 로직을 따로 만들어야 한다. MSA 환경에서 서비스가 10개면 에러 처리 코드도 10벌이다.

이 문제를 해결하기 위해 IETF가 HTTP API 에러 응답 표준을 만들었다.

---

## RFC 9457 — Problem Details for HTTP APIs

RFC 7807(2016)로 처음 제안되었고, RFC 9457(2023)로 개정되었다. 핵심은 간단하다. **에러 응답의 JSON 필드 이름과 의미를 통일하자.**

### 표준 필드

```json
{
  "type": "https://api.example.com/errors/user-not-found",
  "title": "User Not Found",
  "status": 404,
  "detail": "사용자 ID 42를 찾을 수 없습니다",
  "instance": "/api/users/42"
}
```

| 필드         | 의미                                        | 예시                                              |
|------------|-------------------------------------------|-------------------------------------------------|
| `type`     | 에러 종류를 식별하는 URI. 해당 URI에 에러 설명 문서가 있으면 좋다 | `https://api.example.com/errors/user-not-found` |
| `title`    | 에러 종류의 짧은 요약. 사람이 읽을 수 있는 제목              | `"User Not Found"`                              |
| `status`   | HTTP 상태 코드                                | `404`                                           |
| `detail`   | 이 요청에서 **구체적으로** 뭐가 잘못됐는지                 | `"사용자 ID 42를 찾을 수 없습니다"`                        |
| `instance` | 문제가 발생한 요청의 URI                           | `"/api/users/42"`                               |

모든 필드가 선택(optional)이다. `type`의 기본값은 `about:blank`이다.

### title vs detail

이 둘의 차이가 중요하다.

```
title:  "Insufficient Balance"          ← 에러 종류 (항상 같은 문구)
detail: "잔액이 3,000원 부족합니다"       ← 이 요청에서 구체적으로 뭐가 부족한지
```

```
title:  "Validation Failed"             ← 에러 종류
detail: "endDT는 startDT보다 이후여야 합니다"  ← 이 요청에서 뭐가 틀렸는지
```

`title`은 에러 카테고리, `detail`은 에러 인스턴스다.

### 커스텀 필드 확장

표준 5개 필드 외에 자유롭게 필드를 추가할 수 있다.

```json
{
  "type": "https://api.example.com/errors/invalid-period",
  "title": "Invalid Period",
  "status": 400,
  "detail": "시작시간이 종료시간보다 늦습니다",
  "instance": "/api/downtimes",
  "errorCode": "DOWNTIME_003",
  "timestamp": "2026-02-25T14:30:00",
  "traceId": "abc123def456"
}
```

`errorCode`, `timestamp`, `traceId`는 표준에 없는 필드지만 추가해도 된다. RFC 9457이 명시적으로 확장을 허용한다.

### Content-Type

ProblemDetail 응답의 Content-Type은 `application/problem+json`이다. 일반 JSON 응답(`application/json`)과 구분할 수 있어서, 클라이언트가 에러 응답인지 정상 응답인지 Content-Type만 보고도 판단할 수 있다.

---

## Spring Boot 4에서의 지원

Spring Framework 6에서 `ProblemDetail` 클래스가 추가되었고, Spring Boot 4(Spring Framework 7)에서 더 개선되었다.

### 활성화

```yaml
# application.yml
spring:
  mvc:
    problemdetail:
      enabled: true
```

이 설정을 켜면 `@ExceptionHandler`가 없는 예외도 자동으로 RFC 9457 형식으로 응답된다.

### 활성화 전후 비교

**비활성화 (기본값)** — `TypeMismatchException` 발생 시:

```json
{
  "timestamp": "2026-02-25T14:30:00.000+00:00",
  "status": 400,
  "error": "Bad Request",
  "path": "/api/downtimes"
}
```

Spring Boot의 자체 포맷이다. `type`, `title`, `detail`이 없다.

**활성화 후** — 동일한 예외:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Failed to convert 'downtimeSeq' with value: 'abc'",
  "instance": "/api/downtimes"
}
```

RFC 9457 형식으로 바뀐다. `detail`에 구체적인 원인이 담긴다.

---

## 실제 적용

### 기본 사용

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(ex: NoSuchElementException, request: HttpServletRequest): ProblemDetail {
        val problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.NOT_FOUND,
            ex.message ?: "리소스를 찾을 수 없습니다"
        )
        problem.instance = URI.create(request.requestURI)
        return problem
    }
}
```

응답:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "다운타임 시퀀스 999를 찾을 수 없습니다",
  "instance": "/api/downtimes/999"
}
```

`ProblemDetail.forStatusAndDetail()`로 생성하면 `title`은 HTTP 상태 코드의 reason phrase(`"Not Found"`)가 자동으로 채워진다.

### ErrorCode 체계와 결합

대부분의 프로젝트에는 이미 커스텀 ErrorCode가 있다. ProblemDetail과 자연스럽게 결합할 수 있다.

```kotlin
interface ErrorCode {
    val status: HttpStatus
    val code: String
    val message: String
}

enum class DowntimeErrorCode(
    override val status: HttpStatus,
    override val code: String,
    override val message: String
) : ErrorCode {
    INVALID_PERIOD(HttpStatus.BAD_REQUEST, "DOWNTIME_001", "시작시간이 종료시간보다 늦습니다"),
    ALREADY_DELETED(HttpStatus.BAD_REQUEST, "DOWNTIME_002", "이미 삭제된 다운타임입니다"),
    INVALID_TARGET_TYPE(HttpStatus.BAD_REQUEST, "DOWNTIME_003", "해당 서비스에서 사용할 수 없는 타겟입니다"),
}

class BusinessException(val errorCode: ErrorCode) : RuntimeException(errorCode.message)
```

ExceptionHandler:

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException::class)
    fun handleBusiness(ex: BusinessException, request: HttpServletRequest): ProblemDetail {
        val problem = ProblemDetail.forStatusAndDetail(ex.errorCode.status, ex.message)
        problem.title = ex.errorCode.code
        problem.instance = URI.create(request.requestURI)
        problem.setProperty("errorCode", ex.errorCode.code)
        problem.setProperty("timestamp", LocalDateTime.now())
        return problem
    }
}
```

```kotlin
// 서비스 코드
fun deleteDowntime(downtimeSeq: Long) {
    val downtime = repository.findById(downtimeSeq)
        ?: throw BusinessException(DowntimeErrorCode.ALREADY_DELETED)
    // ...
}
```

응답:

```json
{
  "type": "about:blank",
  "title": "DOWNTIME_002",
  "status": 400,
  "detail": "이미 삭제된 다운타임입니다",
  "instance": "/api/downtimes/42",
  "errorCode": "DOWNTIME_002",
  "timestamp": "2026-02-25T14:30:00"
}
```

### Bean Validation 에러

`@Valid` 검증 실패 시 어떤 필드가 왜 실패했는지 알려줘야 한다.

```kotlin
@ExceptionHandler(MethodArgumentNotValidException::class)
fun handleValidation(ex: MethodArgumentNotValidException, request: HttpServletRequest): ProblemDetail {
    val problem = ProblemDetail.forStatusAndDetail(
        HttpStatus.BAD_REQUEST,
        "입력값 검증에 실패했습니다"
    )
    problem.title = "Validation Failed"
    problem.instance = URI.create(request.requestURI)

    val fieldErrors = ex.bindingResult.fieldErrors.map { error ->
        mapOf(
            "field" to error.field,
            "rejectedValue" to error.rejectedValue,
            "message" to error.defaultMessage
        )
    }
    problem.setProperty("fieldErrors", fieldErrors)

    return problem
}
```

응답:

```json
{
  "type": "about:blank",
  "title": "Validation Failed",
  "status": 400,
  "detail": "입력값 검증에 실패했습니다",
  "instance": "/api/downtimes",
  "fieldErrors": [
    {
      "field": "startDT",
      "rejectedValue": null,
      "message": "must not be null"
    },
    {
      "field": "serviceType",
      "rejectedValue": null,
      "message": "must not be null"
    }
  ]
}
```

### traceId 자동 주입

OpenTelemetry를 사용하고 있다면 모든 에러 응답에 traceId를 넣어두면 디버깅이 쉬워진다.

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {

    // 모든 ProblemDetail 응답에 traceId 추가
    private fun ProblemDetail.withTrace(request: HttpServletRequest): ProblemDetail {
        this.instance = URI.create(request.requestURI)
        this.setProperty("traceId", MDC.get("traceId"))
        this.setProperty("timestamp", LocalDateTime.now())
        return this
    }

    @ExceptionHandler(BusinessException::class)
    fun handleBusiness(ex: BusinessException, request: HttpServletRequest): ProblemDetail {
        return ProblemDetail.forStatusAndDetail(ex.errorCode.status, ex.message)
            .apply { title = ex.errorCode.code }
            .withTrace(request)
    }

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(ex: NoSuchElementException, request: HttpServletRequest): ProblemDetail {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.message ?: "리소스를 찾을 수 없습니다")
            .withTrace(request)
    }
}
```

에러 발생 시 운영팀에 traceId만 전달하면 해당 요청의 전체 흐름을 추적할 수 있다.

---

## ErrorResponse 인터페이스

예외 클래스 자체가 ProblemDetail을 만들도록 할 수도 있다. Spring의 `ErrorResponse` 인터페이스를 구현하면 된다.

```kotlin
class DowntimeNotFoundException(
    val downtimeSeq: Long
) : ErrorResponseException(
    HttpStatus.NOT_FOUND,
    ProblemDetail.forStatusAndDetail(
        HttpStatus.NOT_FOUND,
        "다운타임 시퀀스 ${downtimeSeq}를 찾을 수 없습니다"
    ).apply {
        title = "Downtime Not Found"
        setProperty("downtimeSeq", downtimeSeq)
    },
    null
)
```

```kotlin
// 서비스 코드
fun getDowntime(downtimeSeq: Long): Downtime {
    return repository.findById(downtimeSeq)
        ?: throw DowntimeNotFoundException(downtimeSeq)
}
```

`ErrorResponseException`을 상속하면 `@ExceptionHandler`를 별도로 작성하지 않아도 Spring이 자동으로 ProblemDetail 응답을 생성한다.

### @ExceptionHandler vs ErrorResponseException

|              | `@ExceptionHandler`           | `ErrorResponseException`       |
|--------------|-------------------------------|--------------------------------|
| **에러 정의 위치** | `@RestControllerAdvice`에 모여있음 | 예외 클래스 자체에 포함                  |
| **장점**       | 에러 처리 로직이 한 곳에서 관리됨           | 예외 생성 시점에 응답이 결정됨. Handler 불필요 |
| **단점**       | Handler 클래스가 비대해질 수 있음        | 예외 클래스마다 응답 로직이 분산됨            |
| **권장**       | BusinessException처럼 공통 패턴     | 특정 도메인 전용 예외                   |

둘을 섞어 써도 된다. 공통 에러(`BusinessException`)는 `@ExceptionHandler`로, 특정 도메인 에러(`DowntimeNotFoundException`)는 `ErrorResponseException`으로 처리하면 깔끔하다.

---

## 기존 에러 응답에서 마이그레이션

이미 커스텀 에러 응답 형식을 쓰고 있다면 한 번에 바꿀 필요는 없다.

### 기존 형식

```kotlin
data class ApiErrorResponse(
    val status: Int,
    val code: String,
    val message: String?,
    val path: String
)
```

```json
{ "status": 400, "code": "DOWNTIME_001", "message": "시작시간이 종료시간보다 늦습니다", "path": "/api/downtimes" }
```

### ProblemDetail로 전환

```json
{
  "type": "about:blank",
  "title": "DOWNTIME_001",
  "status": 400,
  "detail": "시작시간이 종료시간보다 늦습니다",
  "instance": "/api/downtimes",
  "errorCode": "DOWNTIME_001"
}
```

매핑 관계:

```
기존 code    → ProblemDetail title + 커스텀 errorCode
기존 message → ProblemDetail detail
기존 path    → ProblemDetail instance
기존 status  → ProblemDetail status
```

클라이언트가 `status`, `detail`(구 `message`), `errorCode`(구 `code`)를 파싱하면 되므로 호환성 유지가 어렵지 않다. 다만 필드 이름이 바뀌므로 클라이언트 측 수정은 필요하다.

---

## 정리

```
문제:  서비스마다 에러 응답 형식이 제각각
      → 클라이언트가 서비스별로 에러 파싱 로직을 따로 작성

해결:  RFC 9457이 표준 형식을 정의
      → type, title, status, detail, instance + 커스텀 확장

Spring 지원:  ProblemDetail 클래스 기본 제공
             spring.mvc.problemdetail.enabled=true 한 줄로 활성화
             @ExceptionHandler에서 ProblemDetail 반환하면 끝
```

새 프로젝트를 시작한다면 처음부터 ProblemDetail을 도입하는 게 좋다. 별도 에러 응답 DTO를 만들 필요 없이 표준을 따르면서도 커스텀 필드를 자유롭게 확장할 수 있다.
