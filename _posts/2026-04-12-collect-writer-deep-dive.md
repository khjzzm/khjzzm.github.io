---
layout: post
title: 외부 스크래핑 API 의 유일한 접촉점 — collectStepWriterCollect 딥다이브 (1/2)
tags: [ architecture, spring-batch, mybatis, refactoring ]
---

[지난 글](/2026/04/card-collect-pipeline-study) 에서 외부 스크래핑 수집 파이프라인의 전체 지도 (Enqueue → Collect → Integrate) 를 그려봤다. 이 글은 그 지도에서 ⭐ 표시했던 **`collectStepWriterCollect`** — CollectJob 의 10개 writer 체인 중 **유일하게 외부 세계에 HTTP 호출을 던지는 writer** — 를 한 줄씩 따라가는 딥다이브다.

> ⓘ 이 글은 2편짜리 딥다이브의 1편이다. 2편은 IntegrateJob 의 뇌 — `integrateStepWriterCompare` 의 3단계 Compare 로직을 다룬다.

---

## 1. 메소드의 자리

CollectJob 은 Spring Batch Step 하나에 **chunk=1** 로 동작하고, 카드 한 장당 10개의 writer 가 순서대로 실행된다. `collect_queues` 에서 카드를 한 장 꺼내 (Reader) → `CollectResult` 라는 빈 작업 시트로 감싼 뒤 (Processor) → writer 체인이 차례로 일하는 구조.

| # | Writer Bean | 역할 |
|---|-------------|------|
| 1 | `UpdateCollectQueueInProgress` | 큐 락 |
| 2 | ⭐ **`Collect`** | **외부 스크래핑 API 호출** |
| 3 | `DowntimeReEnqueue` | 점검 중이면 재큐 |
| 4 | `InsertApprovalHistoryTemps` | 응답을 `_temp` 저장 |
| 5 | `InsertIntegrateQueue` | 통합 신호 |
| 6 | `UpdateCollectStatus` | `cards.latest_*` 갱신 |
| 7 | `RegisterCollectLog` | 로그 INSERT |
| 8 | `DeleteCollectQueue` | 큐 삭제 |
| 9 | `Retry` | 재시도 카운트 |
| 10 | `Logger` | info/warn 로그 |

이 글이 다루는 건 Writer 2 한 개. **나머지 9개 writer 는 Writer 2 가 결정한 `CollectResult.status` 를 보고 자기 차례에 일할지 말지 판단할 뿐**이라서, 사실상 이 한 메소드가 CollectJob 의 운명을 쥐고 있다.

---

## 2. 메소드 시그니처와 의존성

```java
@Bean
@StepScope
public ItemWriter<CollectResult> collectStepWriterCollect(
        CardProperties cardProperties,
        CardSchedulerProperties cardSchedulerProperties,
        DowntimeChecker downtimeChecker,
        KwicCardService kwicCardService) {
    return collectResults -> { ... };
}
```

다른 writer 들이 보통 1~2개의 Mapper 만 받는 것과 달리 **4개의 의존성** 을 받는다. 그리고 `MyBatisBatchItemWriter` 계열이 아니라 **순수 람다** — DB 가 아니라 HTTP 호출이 본업이라 그렇다.

| 의존성 | 역할 |
|--------|------|
| `CardProperties` | 외부 API 에러 코드 분류 (`isEmptyListErrorCode`, `isPermanentErrorCode`) |
| `CardSchedulerProperties` | 카드사별 기간 분할 일수 (`getPeriodPartitionDays`) |
| `DowntimeChecker` | 카드사 점검 중인지 확인 |
| `KwicCardService` | ⭐ 실제 외부 HTTP 호출 (`getApprovalHistories`) |

### 입출력 규약 — side-effect 기반

```
입력: List<CollectResult> (chunk=1 이라 항상 1개)
출력: void
```

`return` 값으로 결과를 돌려주지 않고 **입력 `CollectResult` 객체의 상태를 직접 바꾸는** mutator 형태다. 구체적으로 다음 셋 중 정확히 하나가 호출되어 상태가 확정된다.

```java
collectResult.downtime(downtimeVo);                        // → status = DOWNTIME
collectResult.success(partition, startDT, endDT, list);    // → status = SUCCESS
collectResult.failure(req, startDT, endDT, code, ...);     // → status = FAILURE
```

이후 Writer 3~10 이 이 status 를 보고 각자 실행 여부를 판단한다. **Writer 2 = 지휘관, 나머지 = 부대원** 같은 느낌.

---

## 3. 4단계 처리 구조 한눈에

한 메소드 안에 region 을 나누진 않았지만 논리적으로 4단계가 순차 실행된다.

```
┌──────────────────────────────────┐
│ [1단계] 점검 체크 (Downtime)        │  점검 중이면 → DOWNTIME 마킹 후 즉시 return
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│ [2단계] 기간 분할 (Partition)       │  카드사별 최대 조회 일수로 쪼갬
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│ [3단계] HTTP 호출 루프 (Core)        │  각 구간마다 외부 API 호출 → 응답 누적
└──────────────────────────────────┘   한 구간 실패 → FAILURE 마킹 후 즉시 return
              │
              ▼
┌──────────────────────────────────┐
│ [4단계] 결과 마킹 (Success)         │  SUCCESS 확정
└──────────────────────────────────┘
```

이제 단계별로 들어간다.

---

## 4. [1단계] 점검 체크 — 가장 먼저 하는 방어

```java
DowntimeVo downtimeVo = downtimeChecker.getDowntimeVo(
    collectResult.getCollectQueue().getCardCompanyCode()
);
if (downtimeVo != null) {
    collectResult.downtime(downtimeVo);
    return;
}
```

세 줄짜리 분기지만 의미는 묵직하다.

### 왜 여기서 또 점검을 보나?

EnqueueJob 도 점검 체크를 한다. 이미 한 번 걸렀는데 CollectJob 에서 **또** 본다. 이유는 **EnqueueJob → CollectJob 사이의 시간 차** 동안 카드사 점검이 새로 공지될 수 있어서다. "방어 layered" 구조 — 비싼 외부 호출 직전 가장 최신 점검 정보를 한 번 더 확인.

> 외부 API 호출은 비용이 큰 작업이라, "어차피 실패할 호출" 을 미리 막는 게 네트워크/시간/외부 벤더 쿼터 모두 절약된다.

### DOWNTIME 경로의 흥미로운 점

DOWNTIME 으로 마킹되면 이후 Writer 들은 다음과 같이 반응한다.

| Writer | 동작 |
|--------|------|
| Writer 3 (`DowntimeReEnqueue`) | ✅ 새 큐 row INSERT (`collect_dt` 를 점검 종료 이후로) |
| Writer 4~7 | ❌ skip (SUCCESS/FAILURE 가 아님) |
| Writer 8 (`DeleteCollectQueue`) | ✅ 원래 큐 row DELETE |
| Writer 9 (`Retry`) | ❌ skip |
| Writer 10 (`Logger`) | ✅ "수집연기" 로그 |

종합하면 DOWNTIME 경로는 **"기존 큐 row 삭제 + 새 큐 row 삽입 (점검 종료 이후 시각으로)"** = 사실상 "나중에 다시 시도" 로 스케줄을 미루는 것. 외부 API 는 한 번도 호출되지 않는다.

---

## 5. [2단계] 기간 분할 — 카드사 제약을 투명하게 흡수

### 왜 분할하나?

외부 스크래핑 API 는 카드사마다 **한 번에 조회 가능한 최대 기간** 이 다르다.

| 카드사 | 한 번 호출당 최대 일수 |
|--------|-----|
| SHINHAN | 7일 |
| HYUNDAI | 28일 |
| WOORI | 5일 |
| BC | 5일 |
| DEFAULT | 28일 (설정 없는 카드사) |

사용자가 "과거 30일치 가져와줘" 라고 요청해도, 시스템은 카드사 제약에 맞춰 자동으로 쪼개서 여러 번 호출해야 한다. 이 카드사 제약은 `application.yml` 의 `period-partition-days` 리스트에 캡슐화되어 있고, `CardSchedulerProperties.getPeriodPartitionDays(cardCompanyCode, cardType)` 로 조회한다.

```java
int periodPartitionDays = cardSchedulerProperties.getCollect()
    .getPeriodPartitionDays(
        collectResult.getCollectQueue().getCardCompanyCode(),
        collectResult.getCollectQueue().getCardType()
    );
```

내부 로직은 **"Override with Fallback"** 패턴 — 카드타입이 일치하는 항목들 중 특정 카드사 매칭이 있으면 그걸 쓰고, 없으면 `DEFAULT.<type>` 으로 폴백.

### 분할 루프 — 거꾸로 7일씩

```java
List<List<LocalDate>> periodPartitions = Lists.newArrayList();

LocalDate endDate = collectResult.getCollectQueue().getEndDate();
LocalDate startDate = endDate.minusDays((long) periodPartitionDays - 1);

while (true) {
    if (startDate.isBefore(queueStartDate)) {
        startDate = queueStartDate;  // clamp
    }
    if (endDate.isBefore(queueStartDate)) {
        break;
    }
    periodPartitions.add(Lists.newArrayList(startDate, endDate));
    startDate = startDate.minusDays(periodPartitionDays);
    endDate = endDate.minusDays(periodPartitionDays);
}
```

여기에 정교함이 세 가지 숨어있다.

### (1) `endDate - (N-1)` — inclusive 계산의 고전 함정 회피

```java
startDate = endDate.minusDays((long) periodPartitionDays - 1);
```

`periodPartitionDays = 7`, `endDate = 2026-04-13` 이면 `startDate = 2026-04-07`. 양쪽 포함 시 `[04-07, 04-08, ..., 04-13] = 7일` 정확히 맞는다. 만약 `-7` 을 썼다면 `[04-06 ~ 04-13] = 8일` 로 카드사 제약을 위반.

### (2) 뒤에서 앞으로 — 거꾸로 가는 이유

가장 최근 구간부터 추가하고, 점점 과거로 이동한다. 왜?

1. **사용자 입장에서 최근 데이터가 가장 급함** — 화면에 먼저 보여줘야 할 건 어제의 거래.
2. **중간에 실패해도 최근 데이터는 이미 확보** — 첫 구간 성공 후 뒷구간이 망해도 가장 가치 있는 데이터는 손에 있다.
3. **마지막 잔여 조각이 가장 과거** — 분할 경계와 범위가 딱 안 맞는 잔여분을 "가장 덜 중요한 과거" 로 자연스럽게 몰아줄 수 있음.

(엄밀히 말하면 이 코드는 한 구간이라도 실패하면 전체를 버리고 FAILURE 로 처리하므로 "최근 데이터 우선 확보" 의 실익은 줄어들지만, 디자인 의도는 여전히 읽힌다.)

### (3) Clamp — 마지막 조각의 부드러운 처리

```java
if (startDate.isBefore(queueStartDate)) {
    startDate = queueStartDate;
}
```

분할이 과거로 갈수록 `startDate` 가 사용자 요청 범위의 시작점보다 더 이전으로 갈 수 있다. 이때 강제로 끌어올리면 **마지막 파티션이 `periodPartitionDays` 보다 짧아지면서** 자연스럽게 잔여 조각이 된다.

> 예: queue `[2026-03-01 ~ 2026-04-13]`, partition=7일
>
> ```
> [04-07, 04-13] (7일)
> [03-31, 04-06] (7일)
> [03-24, 03-30] (7일)
> [03-17, 03-23] (7일)
> [03-10, 03-16] (7일)
> [03-03, 03-09] (7일)
> [03-01, 03-02] (2일)  ← clamp 발동, 마지막 조각
> ```

### 잠재 함정 — `periodPartitionDays = 0`

설정 오류로 0 이 들어오면 `minusDays(0)` 이라 날짜가 움직이지 않고 `while(true)` 무한 루프. 방어 코드는 없다. 실전에선 yml 검증으로 막히지만 안전하게 한다면 메소드 진입 시 `if (periodPartitionDays <= 0) throw ...` 한 줄.

---

## 6. [3단계] HTTP 호출 루프 — 진짜 심장

```java
List<KwicApprovalHistory> kwicApprovalHistories = Lists.newArrayList();

for (List<LocalDate> periodPartition : periodPartitions) {
    startDate = periodPartition.get(0);
    endDate = periodPartition.get(1);

    KwicCardApiResult kwicCardApiResult = kwicCardService.getApprovalHistories(
        collectResult.getCollectQueue().getCardCompanyCode(),
        collectResult.getCollectQueue().getCardType(),
        collectResult.getCollectQueue().getWebId(),
        collectResult.getCollectQueue().getWebPwd(),
        collectResult.getCollectQueue().getCardNum(),
        startDate,
        endDate
    );

    if (!kwicCardApiResult.isSuccess() &&
        !cardProperties.getKwic().isEmptyListErrorCode(kwicCardApiResult.getErrCode())) {
        collectResult.failure(...);
        return;  // 한 구간 실패 시 즉시 전체 중단
    }

    kwicApprovalHistories.addAll(kwicCardApiResult.getApprovalHistories());
}
```

이 한 줄 — `kwicCardService.getApprovalHistories(...)` — 이 **CollectJob 의 진짜 심장이자 유일한 네트워크 경계**다. 내부 구현 (`KwicCardServiceImpl.callKwicApi`) 이 JSON body 를 빌딩하고, HTTP POST 를 던지고, 응답을 파싱해서 `KwicCardApiResult` 로 돌려준다.

### 응답 판정 — 두 단계 필터

```java
if (!isSuccess() && !isEmptyListErrorCode(errCode)) { /* 실패 */ }
```

조건이 두 개로 묶여 있는 이유가 핵심이다. 외부 API 는 **"해당 기간에 거래 없음"** 을 에러 코드 (예: `MSG11009`) 로 응답하는 카드사가 있다. 그런데 이건 시스템 오류가 아니라 **거래가 없는 정상 상태**다. 만약 이 코드를 그대로 실패 처리하면 **거래 없는 카드는 매번 FAILURE 로 잡히는 폭주**가 생긴다.

`cardProperties` 에 "빈 결과로 간주할 에러 코드 목록" 이 등록되어 있고, `isEmptyListErrorCode` 가 그 리스트와 매칭. 정상 응답은 아니지만 0건 성공으로 처리한다. **외부 API 의 변덕을 yml 설정 한 줄로 흡수**하는 정교함.

### 한 구간 실패 = 전체 실패 원칙

```java
collectResult.failure(...);
return;  // 나머지 구간 호출 안 함
```

7개 구간 중 첫 번째에서 실패하면 나머지 6개는 호출조차 안 한다. 그리고 만약 5번째 구간에서 네트워크 타임아웃이 났다면, **앞의 4개 구간에서 받아둔 응답도 모두 버려진다.**

장단점이 명확하다.

- ✅ **장점**: 로직 단순. "다 받거나 다 버리거나". Compare 로직이 부분 데이터 처리를 신경쓸 필요 없음.
- ❌ **단점**: 일부라도 저장하면 유용한 상황에서 아깝게 버림.

이건 **"일관성 > 가용성"** 선택이다. 카드 한 장에 대한 호출이라서 첫 구간 실패는 다른 구간도 실패할 가능성이 높고 (예: 비밀번호 오류면 모든 구간 동일 에러), 빨리 실패 상태를 확정해야 이후 writer 들이 정확하게 반응할 수 있다.

### 영구/일시 오류 분류 — 운영 비용을 좌우

```java
collectResult.failure(
    requestData,
    scrapingStartDT,
    LocalDateTime.now(),
    errCode,
    errNumber,
    errMsg,
    cardProperties.getKwic().isPermanentErrorCode(errCode)  // ← 이 마지막 인자
);
```

마지막 인자 `isPermanent` 가 운영 비용을 결정한다.

| 분류 | 예시 | `latest_is_permanent_err` | Writer 8 | Writer 9 |
|------|------|---------|----------|----------|
| **영구** | 비밀번호 오류, 계정 잠김 | TRUE | ✅ 큐 DELETE | ❌ skip |
| **일시** | 네트워크 타임아웃, 5xx | FALSE | ❌ skip | ✅ 재시도 |

영구 오류로 분류되면 큐가 DELETE 되고, 카드는 EnqueueJob 에서도 더 이상 픽업되지 않는다 (사용자가 카드 정보 수정할 때까지 대기). 이 분류가 없으면 비밀번호 오류 카드가 매 주기마다 외부 API 를 두드려서 **벤더 쿼터 소진 + 계정 잠금 강화** 의 악순환이 생긴다.

---

## 7. [4단계] 결과 마킹

```java
collectResult.success(
    periodPartitions.size(),
    scrapingStartDT,
    LocalDateTime.now(),
    kwicApprovalHistories
);
```

특별한 로직 없이 `success()` 호출 한 번. 내부에서:
- `status = SUCCESS`
- `collectLog` 빌더로 통계 객체 생성
- `kwicApprovalHistories` 를 `CollectResult` 내부 리스트에 복사
- **"조회기간 벗어난 건" 필터링** (`isDateInRange == false` 인 건 제외) — 외부 API 가 가끔 요청 범위 밖 거래도 같이 돌려주는 일이 있어서 마지막 방어 한 번.

---

## 8. 세 가지 결과 경로 — 이후 Writer 들의 반응표

이 한 메소드가 결정하는 것 = `CollectResult.status`. 이게 곧 Writer 3~10 의 지시서가 된다.

| Writer | DOWNTIME | SUCCESS | FAILURE (일시) | FAILURE (영구) |
|--------|:-:|:-:|:-:|:-:|
| 3. `DowntimeReEnqueue` | ✅ 새 큐 INSERT | ❌ | ❌ | ❌ |
| 4. `InsertApprovalHistoryTemps` | ❌ | ✅ N건 | ❌ | ❌ |
| 5. `InsertIntegrateQueue` | ❌ | ✅ 신호 | ❌ | ❌ |
| 6. `UpdateCollectStatus` | ❌ | ✅ SUCCESS | ✅ FAILURE | ✅ FAILURE + permanent |
| 7. `RegisterCollectLog` | ❌ | ✅ | ✅ | ✅ |
| 8. `DeleteCollectQueue` | ✅ 원래 큐 | ✅ | ❌ (재시도용) | ✅ (재시도 안 함) |
| 9. `Retry` | ❌ | ❌ | ✅ try_count++ | ❌ |
| 10. `Logger` | ✅ "수집연기" | ✅ "수집성공" | ✅ "수집실패" | ✅ "수집실패" |

이 표를 외워두면 운영 중 어떤 카드의 `collect_status` 가 왜 그 상태인지 역추적이 빨라진다.

---

## 9. Day 1 시나리오 — 성공 경로 따라가기

```
입력 collectQueue:
  cardCompanyCode = SHINHAN
  cardType        = PERSONAL
  startDate       = 2026-03-01
  endDate         = 2026-04-13
```

**[1단계]** `downtimeChecker.getDowntimeVo("SHINHAN") → null` (점검 아님). 통과.

**[2단계]** SHINHAN PERSONAL 의 `periodPartitionDays = 7`. 분할 결과 7개 구간 (44일):

```
[04-07, 04-13]  [03-31, 04-06]  [03-24, 03-30]  [03-17, 03-23]
[03-10, 03-16]  [03-03, 03-09]  [03-01, 03-02]  ← clamp 잔여
```

**[3단계]** 구간별 호출:

| 반복 | 구간 | 응답 | 누적 |
|------|------|------|------|
| 1 | 04-07~04-13 | 5건 성공 | 5 |
| 2 | 03-31~04-06 | 3건 성공 | 8 |
| 3 | 03-24~03-30 | 0건 (`MSG11009`, 빈결과) | 8 |
| 4~7 | ... | 12건 합계 | 20 |

**[4단계]** `collectResult.success(7, scrapingStartDT, now, [20건])` → `status = SUCCESS`.

이후 Writer 4 가 20건을 `_temp` 에 INSERT 하고, Writer 5 가 `integrate_queues` 에 신호 1건, Writer 6 이 `cards.collect_status = SUCCESS` 갱신... 까지 진행된다.

---

## 10. 실패 시나리오 — 비밀번호 오류

같은 입력. **[1·2단계]** 동일.

**[3단계 첫 반복]**

```
getApprovalHistories(..., 04-07, 04-13)
  → {result: "FAILURE", errCode: "MSG12001", errMsg: "비밀번호 오류"}
  → isSuccess() == false
  → isEmptyListErrorCode("MSG12001") == false
  → 진짜 실패
```

```java
collectResult.failure(
    requestData,
    scrapingStartDT,
    now,
    "MSG12001",
    null,
    "비밀번호 오류",
    isPermanentErrorCode("MSG12001")  // → TRUE
);
return;  // 반복 2~7 은 호출 안 됨
```

이후:
- Writer 6 → `cards.collect_status = FAILURE`, `latest_is_permanent_err = TRUE`
- Writer 7 → `collect_logs` FAILURE 이력 INSERT
- Writer 8 → `collect_queues` DELETE (영구 오류 판정)
- Writer 9 → skip
- Writer 10 → `log.warn("수집실패 ... errCode=MSG12001, isPermanentErr=true")`

이 카드는 EnqueueJob 의 SELECT 에서 `latest_is_permanent_err = TRUE` 조건으로 걸러지므로 **사용자가 비밀번호를 수정할 때까지 픽업되지 않는다.** 외부 API 호출은 단 1회만 발생하고 끝.

---

## 11. 숨은 가정과 엣지 케이스

코드를 따라가다 보면 명시적이지 않은 가정 몇 개가 보인다.

### 가정 1 — `periodPartitionDays > 0`

설정이 0 이면 무한 루프. 방어 코드 없음.

### 가정 2 — `DowntimeChecker` 가 정확한 최신 정보

캐시를 쓰면 실제 점검 시작과 캐시 갱신 사이에 호출이 들어갈 수 있다. 이 경우 일시 오류로 분류되어 다음 주기에 재시도 — eventual consistency 로 흡수된다.

### 가정 3 — 외부 API 가 `startDate`/`endDate` 를 양쪽 포함으로 해석

분할 경계가 안 겹치는 건 inclusive 가정 위에서만 성립. 만약 API 가 exclusive end 라면 경계 날짜 거래가 누락된다.

### 가정 4 — 한 구간 실패 = 전체 실패

5번째 구간에서 네트워크 타임아웃이 나면 앞의 4개 구간 응답도 모두 버려진다. "일부 성공" 같은 중간 상태는 없다.

### 가정 5 — `kwicApprovalHistories` 가 메모리에 다 들어감

한 카드의 수개월치 거래라도 보통 수백 건 수준. 수만 건 카드라면 JVM heap 압박 — 현실에선 거의 발생 안 함.

---

## 12. 핵심 교훈

1. **유일한 외부 세계 접촉점.** 10개 writer 중 HTTP 호출은 이 하나뿐. 장애 원인의 99% 가 여기서 발생하고, 모니터링/알람도 여기 집중되어야 한다.

2. **`CollectResult.status` 가 나머지 writer 들의 지시서.** Writer 2 가 지휘관 역할을 하고, Writer 3~10 은 그 status 를 보고 자기 차례에 일할지 판단한다. 이 분리 덕분에 각 writer 가 단순해진다.

3. **카드사 API 제약은 yml 로 캡슐화.** 사용자 코드는 "30일치 가져와" 라고만 요청하고, 카드사별 7일/28일/5일 같은 제약은 시스템이 자동 흡수.

4. **빈 결과 에러를 성공으로 처리하는 정교함.** "거래 없음" 을 실패로 간주했다면 비활성 카드가 매번 FAILURE 로 잡혀서 운영 알람이 폭주했을 것.

5. **영구/일시 오류 분류가 운영 비용을 좌우.** 영구 오류를 계속 재시도하면 외부 벤더 쿼터 소진 + 계정 잠금 강화. 이 분류 덕분에 "고칠 수 있는 실패" 와 "사용자 개입 필요 실패" 가 깔끔히 갈린다.

6. **거꾸로 분할의 UX 의도.** 중간 실패 시 가장 가치 있는 데이터를 우선 확보하려는 의도. (현재 "한 구간 실패 = 전체 실패" 정책 때문에 실익은 줄었지만 의도는 여전히 의미 있음.)

7. **"일관성 > 가용성" 트레이드오프.** 부분 성공 중간 상태를 두지 않고 단순성을 선택한 디자인. 그 단순성 덕분에 다음 글에서 다룰 IntegrateJob Compare 로직이 부분 데이터를 신경쓸 필요가 없다.

---

## 13. 한 문장 요약

> `collectStepWriterCollect` 는 CollectJob 의 심장으로,
> [1] 카드사 점검 체크 → [2] 카드사별 최대 조회 일수로 기간 분할 →
> [3] 각 구간마다 외부 스크래핑 API 를 HTTP 호출하며 응답 누적 →
> [4] 성공이면 SUCCESS, 실패이면 FAILURE, 점검이면 DOWNTIME 으로
> `CollectResult.status` 를 확정하는 **유일한 네트워크 경계이자 상태 결정자**다.

---

다음 글에서는 이 메소드가 `_temp` 에 던져둔 데이터를 IntegrateJob 이 어떻게 본 테이블의 정합성으로 번역하는지 — **`integrateStepWriterCompare` 의 3단계 Compare 로직** 을 따라간다. 이쪽이 진짜 미궁이다.
