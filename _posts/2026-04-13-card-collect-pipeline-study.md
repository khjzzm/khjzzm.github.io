---
layout: post
title: 외부 스크래핑 API 수집 파이프라인 학습 노트 — MSA × Spring Batch × Quartz
tags: [ architecture, spring-batch, quartz, postgresql, mybatis, msa ]
---

외부 스크래핑 API를 주기적으로 호출해서 카드 승인내역을 수집·저장하는 시스템을 공부하면서 정리한 노트. MSA + Spring Batch + Quartz + MyBatis 기반이고, 단순해 보이는 "등록 → 수집 → 조회" 흐름이 실제로는 **3단계 파이프라인** 으로 쪼개져 있다. 왜 이렇게 나뉘어 있고, 각 단계에서 어떤 테이블이 어떻게 바뀌는지를 실제 시나리오로 따라가 본다.

> ⓘ 이 글은 실제 운영 중인 프로젝트를 학습한 기록이다. 도메인은 "카드 수집" 이지만 **외부 API 를 호출해서 주기적으로 데이터를 당겨오는 모든 시스템** 에 적용 가능한 패턴들이다.

---

## 1. 시스템 개요

카드사의 승인내역 데이터를 직접 연동할 수 없는 환경에서, **외부 스크래핑 벤더 API** 를 통해 카드 승인/매입 내역을 수집하는 시스템이다. 기본 아이디어는 단순하다.

> 사용자가 카드를 등록하면 → 스케줄러가 주기적으로 외부 API 를 호출해서 내역을 긁어오고 → 사용자가 그걸 조회한다.

프로젝트는 두 개의 모듈로 나뉘어 있다.

| 모듈 | 역할 |
|------|------|
| **card-api** | 사용자 요청을 받는 Spring Boot 웹 서버 (카드 등록·수정·조회) |
| **card-scheduler** | Quartz + Spring Batch 기반 백그라운드 수집 워커 |

공통 도메인/매퍼/설정은 `card` 공통 모듈에서 공유한다.

---

## 2. 전체 데이터 흐름

수집은 단순해 보이지만 실제로는 **3단계 파이프라인** (Enqueue → Collect → Integrate) 으로 쪼개져 있다. 각 단계는 별도의 Spring Batch Job 이고, 각자 자기 입력 큐와 출력 큐를 가진다.

```
[사용자]
   │
   │ ① POST /api/cards                                [card-api]
   ▼
┌─────────────────────────────────┐
│  cards                           │ 카드 마스터
└─────────────────────────────────┘
   │
   │ ②-A 등록 트랜잭션 안에서              ②-B 주기적 재수집      [card-scheduler]
   │     registerCard() → collect()            EnqueueJob (Quartz)
   │     ※ 최초 등록·수정·복구 시            ※ 기존 SUCCESS/FAILURE 카드
   ▼                                         ▼
┌─────────────────────────────────┐
│  collect_queues                  │ 수집 대기열
└─────────────────────────────────┘
   │
   │ ③ CollectJob (Quartz)                            [card-scheduler]
   │    - 외부 스크래핑 API 호출
   ▼
┌─────────────────────────────────┐
│  approval_histories_temp         │ 수집 응답 임시 저장
│  integrate_queues                │ 통합 신호
└─────────────────────────────────┘
   │
   │ ④ IntegrateJob (Quartz)                          [card-scheduler]
   │    - temp vs 본 테이블 비교
   ▼
┌─────────────────────────────────┐
│  approval_histories              │ 본 테이블 (최종)
│  approval_histories_updated      │ 변경 이력 감사
│  approval_histories_removed      │ 삭제 이력 감사
└─────────────────────────────────┘
   │
   │ ⑤ GET /api/approval-histories                    [card-api]
   ▼
[사용자]
```

> **⚠ 중요 — 최초 수집은 EnqueueJob 을 거치지 않는다**
>
> 이 구조를 처음 볼 때 가장 오해하기 쉬운 부분이다. "카드 등록하면 스케줄러 EnqueueJob 이 다음 주기에 픽업해서 큐에 넣는다" 고 생각하기 쉽지만 실제로는 그렇지 않다.
>
> - **카드 등록/수정/복구 시점** — `card-api` 의 `CardApiServiceImpl.registerCard()` 가 트랜잭션 안에서 `collect_queues` 에 **직접 INSERT**. EnqueueJob 안 거침.
> - **EnqueueJob 은 "이미 수집된 적 있는 카드의 다음 주기 재수집" 을 담당** — `collect_status` 가 `SUCCESS`/`FAILURE`/오늘 `STOP` 인 카드만 대상.
>
> 자세한 이유와 SELECT 조건은 아래 5.2 섹션에서 다룬다.

---

## 3. 왜 단계를 3개로 나눴을까?

처음 이 구조를 보면 "카드 등록 → 수집 → 저장이면 한 Job 으로 충분하지 않나?" 라는 의문이 든다. 하지만 운영해보면 왜 3단계인지 이유가 분명히 드러난다.

### 3.1 Enqueue 와 Collect 분리 이유

두 작업의 **속도 특성이 다르기 때문** 이다.

- **Enqueue** — 수집 대상 선정. DB 쿼리 한두 번이면 끝. 빠름.
- **Collect** — 외부 API 호출. 네트워크 지연, 벤더 서버 상태, 재시도 등으로 느림.

빠른 작업과 느린 작업을 한 Job 에 묶으면

- 외부 API 느려지면 전체 파이프라인이 멈춤
- 재시도/실패 처리가 어려움
- 수집 중 상태 추적이 어려움
- 병렬화 포인트가 애매함

그래서 Enqueue 는 "오늘 수집할 명단만 빠르게 뽑아서 큐에 던지고", Collect 는 "큐에서 하나씩 천천히 꺼내서 외부 호출" 하는 식으로 **생산자-소비자** 구조를 만든다.

> ℹ️ 단, 이 프로젝트에서 "큐 생산자" 는 한 명이 아니다. **주기적 생산자인 `EnqueueJob`** 과 별개로, **즉각 생산자인 `card-api`** (카드 등록/수정/복구 API) 가 존재한다. 후자는 사용자 액션 직후 바로 수집이 돌아야 하는 케이스를 커버한다. 동일한 소비자 (`CollectJob`) 가 두 생산자의 산출물을 함께 처리하는 구조라서, 큐 분리의 이점 (재시도·병렬처리·장애 격리) 을 그대로 누리면서 즉시성도 확보된다.

### 3.2 Collect 와 Integrate 분리 이유

외부 API 응답을 **바로 본 테이블에 꽂으면 안 된다**. 왜냐면 외부 API 는 단순히 "신규 데이터" 만 주는 게 아니다.

- **과거에 받았던 승인건이 취소된 경우** → 본 테이블의 기존 레코드 업데이트 + 변경 전 모습 보관
- **과거 승인건이 응답에서 아예 사라진 경우** → 본 테이블에서 삭제 + 삭제 전 모습 보관
- **신규 승인건** → 본 테이블에 insert

이걸 하려면 **"새로 받은 데이터 vs 기존 데이터" 를 비교** 해야 하는데, 이 비교 로직은 DB 부하가 큰 편이다. 그래서

1. Collect 는 일단 응답을 임시 테이블 (`approval_histories_temp`) 에 쌓기만 하고
2. Integrate 가 나중에 배치로 temp vs 본을 비교해서 신규/변경/삭제를 판정한다

이 구조 덕분에 외부 API 호출 트랜잭션과 통합 트랜잭션이 분리되고, Integrate 는 temp 에 쌓인 걸 자기 리듬대로 처리할 수 있다.

---

## 4. 테이블 지도

실제 스키마에 존재하는 테이블을 기능별로 분류.

### 4.1 카드 마스터

| 테이블 | 역할 |
|--------|------|
| `cards` | 카드 정보 (카드번호, 웹ID/PW, 수집 상태, 최신 에러) |
| `card_logs` | 카드 변경 이력 (등록·수정·정지·복구 시점의 스냅샷) |

`cards.latest_*` 컬럼들이 눈에 띈다 — 가장 최근 수집의 결과 (에러 코드, 소요시간, 수집 건수 등) 를 카드 레코드 자체에 박아놓는다. 매번 `collect_logs` JOIN 하지 않아도 카드 조회 화면에서 "최근 수집 상태" 를 즉시 볼 수 있다.

### 4.2 수집 파이프라인

| 테이블 | 역할 |
|--------|------|
| `collect_queues` | 수집 대기열 — "어떤 카드·어떤 기간" |
| `approval_histories_temp` | 수집 응답 임시 저장 |
| `integrate_queues` | 통합 대기열 — "이 collect_queue_seq 의 temp 를 본으로 밀어라" |

큐 테이블들에는 `in_progress`, `try_count` 같은 운영 컬럼이 있어서 재시도/락 처리가 가능하다.

### 4.3 승인내역 저장소 (4종 세트)

| 테이블 | 역할 |
|--------|------|
| `approval_histories` | **본 테이블** — 사용자 조회 대상 |
| `approval_histories_updated` | 변경 이력 — 취소/금액변경 된 건의 변경 전 스냅샷 |
| `approval_histories_removed` | 삭제 이력 — 응답에서 사라진 건의 삭제 전 스냅샷 |
| `approval_histories_temp` | 임시 버퍼 (위 4.2 와 중복) |

핵심 포인트: **본 테이블은 "현재 상태" 만 담고, `_updated`/`_removed` 는 "이전 상태" 를 감사 로그로 남긴다.** 본 테이블 한 줄이 덮어쓰여도 이전 모습을 역추적할 수 있다.

### 4.4 운영/참조 테이블

| 테이블 | 역할 |
|--------|------|
| `collect_logs` | 수집 실행 이력 — 성공/실패, 에러 코드, 소요시간, 수집 건수 |
| `collectable_months` | 카드사별 최대 수집 가능 개월수 (마스터 데이터) |

`collectable_months` 는 카드사마다 "과거 몇 개월까지 긁을 수 있는지" 다르기 때문에 필요. 예컨대 "A 카드사 법인은 2개월, B 카드사 법인은 12개월" 같은 식으로 카드사별 정책이 다르다.

### 4.5 아카이브

| 테이블 | 역할 |
|--------|------|
| `archive.collect_logs_YYYY` | 연도별 `collect_logs` 백업 |
| `archive.approval_histories_YYYY` | 연도별 본 테이블 백업 |
| `archive.approval_histories_updated_YYYY` | 연도별 변경이력 백업 |
| `archive.approval_histories_removed_YYYY` | 연도별 삭제이력 백업 |

스키마에 `DO $$ WHILE base_year >= 2015 LOOP ... END LOOP $$` 블록으로 연도별 테이블을 동적 생성한다. 본 테이블이 계속 커지는 걸 막고, 과거 데이터는 연도별로 파티션처럼 분리한다.

---

## 5. 단계별 DB 입출력 상세

각 단계가 실제로 어떤 테이블을 읽고 쓰는지 세밀하게 본다. 하지만 들어가기 전에 Spring Batch 의 기본 구조를 짚고 가자 — 아래 시나리오들이 전부 Reader/Processor/Writer 삼총사를 기반으로 설명되기 때문.

### Spring Batch 기본 — Reader / Processor / Writer 삼총사

#### Chunk-Oriented Processing 의 기본 흐름

Spring Batch 의 Step 은 기본적으로 이런 사이클을 반복한다.

```
┌───────────────────────────────────────────────┐
│              하나의 chunk 사이클                   │
│                                               │
│  Reader   ────▶  Processor  ────▶  Writer     │
│  (read N개)      (N개 변환)       (N개 쓰기)       │
│                                               │
│  - SQL           - 메모리 계산      - SQL         │
│  - file          - 객체 변환        - HTTP        │
│  - queue         - 필터링           - file        │
└───────────────────────────────────────────────┘
             ↻ chunk size 마다 반복
```

`chunk(10)` 이면 "Reader 가 10개를 읽고 → Processor 가 10개를 변환하고 → Writer 가 10개를 한 번에 받아서 쓴다" 는 한 덩어리가 반복 실행되는 구조다. 이 프로젝트의 Collect/IntegrateJob 은 `chunk(1)` 이라 카드 한 장씩 처리한다.

#### 가장 중요한 차이 — Side Effect

| 구분 | Reader | Processor | Writer |
|------|--------|-----------|--------|
| **하는 일** | 데이터 읽기 | **메모리 안에서 변환** | **외부 시스템에 쓰기** |
| **Side Effect** | 읽기 (input side) | ❌ **없어야 함** | ✅ **발생함** (DB/API/파일) |
| **단위** | 1건씩 | 1건씩 (1:1 변환) | **chunk 단위** (N건 한 번에) |
| **필터링** | 애초에 안 읽거나 | **null 반환으로 스킵** | 조건부 실행 (Conditional*) |
| **실패 시** | 다음 chunk | 다음 아이템 또는 건너뜀 | chunk 전체 롤백 |

> ⭐ **제일 쉬운 구분법**: "이 작업이 외부 시스템을 건드리는가?" 만 보면 99% 맞는다.
> - **메모리 안에서만 계산한다** → Processor
> - **DB / HTTP / 파일 / 로그 등 외부를 건드린다** → Writer

#### 이 프로젝트에서의 실제 사용 비교

세 Job 이 Processor 를 다르게 쓰는 게 재밌는 학습 포인트다.

##### EnqueueJob — Processor 가 진짜 일하는 유일한 케이스

```java
@Bean
public ItemProcessor<AvailableCard, CollectQueueForEnqueue> enqueueStepProcessor(
        CardProperties cardProperties,
        DowntimeChecker downtimeChecker) {
    return availableCard ->
        CollectQueueForEnqueue.of(
            availableCard,
            LocalDate.now().minusDays(cardProperties.getCollectDaysAgo()),  // startDate 계산
            LocalDate.now(),                                                 // endDate 계산
            downtimeChecker.getCollectableDT(availableCard.getCardCompanyCode())  // 점검 시각 계산
        );
}
```

- **역할**: `AvailableCard`(DB 에서 읽은 원시 객체) → `CollectQueueForEnqueue`(INSERT 용 객체) 로 변환하면서 **수집 기간 + 다운타임 시각** 을 계산
- **왜 Processor 인가**: 날짜 계산은 순수 함수, 다운타임 체커는 메모리 캐시 조회 — **DB 를 건드리지 않음**
- **Writer 가 하는 일**: 이 변환된 객체를 `collect_queues` 에 INSERT 만

> 💡 **가장 교과서적인 패턴**: Reader 로 원시 데이터 읽고, Processor 로 비즈니스 로직 적용해서 변환하고, Writer 로 DB 에 쓴다. 관심사 분리가 명확.

##### CollectJob — Processor 가 거의 아무것도 안 함

```java
@Bean
public ItemProcessor<CollectQueue, CollectResult> collectStepProcessor() {
    return collectQueue -> CollectResult.of(this.appName, collectQueue);
}
```

- **역할**: `CollectQueue` 를 `CollectResult` 라는 **빈 컨테이너로 래핑**. 끝.
- **왜 이렇게**: CollectJob 은 writer 체인이 10개나 되고, 각 writer 가 `CollectResult` 의 상태를 채워나가는 구조. Processor 는 "빈 컨테이너를 만들어주는" 역할만.
- Processor 는 **"Reader 의 출력 타입" 과 "Writer 의 입력 타입" 을 이어주는 어댑터** 역할. 실제 로직은 없음.

##### IntegrateJob — Processor 아예 없음

```java
return stepBuilderFactory.get("수집된 승인내역 통합")
    .<IntegrateQueue, IntegrateQueue>chunk(1)   // 입력=출력 타입 동일
    .reader(integrateStepReader)
    .writer(integrateStepWriter)                 // processor 호출 없음!
    .taskExecutor(integrateJobExecutor)
    .build();
```

- Reader 가 `IntegrateQueue` 를 반환하고, Writer 체인이 그 `IntegrateQueue` 를 바로 받아서 처리
- **Processor 는 선택사항** — Reader 출력 타입과 Writer 입력 타입이 같으면 생략 가능. `.processor(...)` 체인 메소드를 호출하지 않아도 됨

##### 3개 Job 한눈에 비교

| Job | Reader 출력 | Processor | Writer 입력 | Processor 의 실제 역할 |
|---|---|---|---|---|
| **EnqueueJob** | `AvailableCard` | ✅ 있음 | `CollectQueueForEnqueue` | **실제 변환** (기간/다운타임 계산) |
| **CollectJob** | `CollectQueue` | ✅ 있음 | `CollectResult` | 빈 컨테이너 래핑만 |
| **IntegrateJob** | `IntegrateQueue` | ❌ 없음 | `IntegrateQueue` | - |

#### 언제 Processor / Writer 를 쓰나 — 결정 가이드

##### Processor 를 써야 하는 경우

1. **타입 변환이 필요할 때** — DB row → 도메인 객체 → 저장용 DTO
2. **순수 계산** — 날짜 계산, 금액 합산, 문자열 포맷, 유효성 검증 등
3. **필터링** — 조건에 안 맞으면 `return null;` 로 스킵 → writer 가 호출 안 됨
   ```java
   return item -> {
       if (item.getAmount() < 1000) return null;  // 1000원 미만 스킵
       return transform(item);
   };
   ```
4. **재사용 가능한 비즈니스 로직** — 다른 Job 에서도 같은 변환을 쓸 수 있도록 분리

##### Writer 에서 해야 하는 경우

1. **DB INSERT / UPDATE / DELETE** — MyBatis/JPA 매퍼 호출
2. **외부 API 호출** — 이 프로젝트의 `collectStepWriterCollect` 가 대표 예시
3. **파일 쓰기** — CSV 출력, 로그 파일 등
4. **여러 단계 작업을 순차 실행** — `CompositeItemWriter` 로 writer 체이닝 (CollectJob 10개, IntegrateJob 12개)
5. **조건부 실행** — `ConditionalMyBatisBatchItemWriter` 로 상태에 따라 분기 (SUCCESS/FAILURE/DOWNTIME 에 따라 실행 여부 결정)

#### 헷갈리기 쉬운 부분

##### "계산이랑 저장이 섞이면 어쩌지?" — 둘 다 쓰면 됨

예를 들어 "금액을 환율 변환해서 DB 에 저장" 하는 경우

```java
// Processor: 환율 변환 (메모리 계산)
return item -> {
    item.setAmount(item.getAmount() * exchangeRate);
    return item;
};

// Writer: DB INSERT (side effect)
.statementId("saveItem")
```

역할을 분리하면 Processor 는 단위 테스트하기 쉽고, Writer 는 교체하기 쉬움.

##### "Processor 에서 DB 조회해도 되나?" — 기술적으로는 되지만 안티 패턴

```java
// ❌ 안티 패턴
return item -> {
    var extraData = someMapper.findById(item.getRelatedId());  // DB 호출
    item.setExtra(extraData);
    return item;
};
```

가능은 하지만 권장 안 함. 이유

- Processor 는 각 아이템마다 호출되므로 **N+1 쿼리** 발생
- 대신 **Reader 에서 JOIN 으로 한 번에 가져오기** 가 정석
- 또는 **별도 Step** 으로 분리

이 프로젝트의 CollectJob Reader SQL 이 `collect_queues JOIN cards` 로 웹ID/비밀번호까지 한 번에 가져오는 게 이 원칙의 구현체다.

##### "Writer 여러 개 쓸 수 있나?" — `CompositeItemWriter` 로 체이닝

이 프로젝트처럼 writer 체인을 구성할 수 있다.

```java
CompositeItemWriter<CollectResult> composite = new CompositeItemWriter<>();
composite.setDelegates(List.of(
    writer1,  // 큐 락
    writer2,  // 외부 API 호출
    writer3,  // temp insert
    // ...
));
```

각 writer 는 **같은 chunk 의 같은 아이템 리스트를 순차적으로** 받는다. 한 writer 가 객체 상태를 바꾸면 다음 writer 가 그 상태를 볼 수 있어서 `CollectResult.status` 가 writer 체인 사이에서 공유되는 이유.

#### 3문장 요약

1. **Reader** = 읽기, **Processor** = 메모리 안에서 변환/필터링, **Writer** = 외부 시스템에 쓰기
2. "외부 시스템을 건드리는가?" 로 Processor 와 Writer 를 구분하면 99% 맞음
3. Processor 는 선택사항 — Reader 출력과 Writer 입력 타입이 같으면 생략 가능 (IntegrateJob 이 그 예시)

이제 이 삼총사 개념을 머릿속에 넣고 5.1 부터 순차적으로 시나리오를 따라가면 각 Job 의 구성이 훨씬 명확하게 보인다.

### 5.1 ① 카드 등록 (card-api) — 여기서 큐까지 들어간다

`CardApiServiceImpl.registerCard()` 는 한 트랜잭션 안에서 아래 4개 테이블에 INSERT 한다.

```
POST /api/cards
   │
   ├─ INSERT ▶ cards             (마스터 row, collect_status = STANDBY)
   ├─ INSERT ▶ card_logs         (등록 시점 스냅샷)
   ├─ INSERT ▶ collect_logs      (등록 시점 초기 로그)
   └─ collect(cardSeq) 내부 호출
        │
        └─ INSERT ▶ collect_queues   ◀── 여기! 등록 트랜잭션 안에서 큐 진입
```

`collect()` 메소드 내부에서 매퍼의 `registerCollectQueue(...)` 를 직접 호출한다. 즉 **EnqueueJob 을 거치지 않고, 등록 API 자체가 큐에 꽂아 넣는 구조**.

같은 경로로 `collect_queues` 에 직접 INSERT 되는 케이스가 3개 더 있다.

| 트리거 | 호출부 |
|--------|--------|
| 카드 등록 | `registerCard()` → `collect()` |
| 카드 수정 (중요 필드 변경) | `modifyCard()` → `collect()` (`needCollect=true` 일 때) |
| 카드 복구 | `recoverCards()` → `collect()` |
| 사용자 수동 트리거 | `GET /api/cards/collect` 엔드포인트 → `collect()` |

등록 직후 `approval_histories` 등 히스토리 테이블은 아직 비어 있다. 실제 수집은 다음 CollectJob 트리거 시점에 일어남.

##### 수정 / 정지 / 복구 시나리오 — 언제 `collect()` 가 호출되나

등록 외의 3가지 카드 라이프사이클 이벤트 (수정/정지/복구) 도 비슷한 패턴으로 큐에 진입한다. 언제 수집이 재실행되는지는 상황마다 다르다.

**수정 (Modify)**

```java
@Transactional
public Card modifyCard(Session session, int cardSeq, CardModifyDto dto) {
    Card card = getCard(cardSeq);
    boolean needCollect = card.modify(session, dto);  // 변경된 필드가 뭔지 판단
    cardApiMapper.modifyCard(card);
    cardApiMapper.registerCardLog(...);

    if (needCollect) {
        collect(CollectDto.of(card.getCardSeq()));  // ⚡ 조건부 재수집
    }
    return card;
}
```

- **`needCollect=true` 일 때만** `collect()` 호출 — **수집에 영향 있는 필드** (카드번호/`web_id`/`web_pwd` 등) 가 바뀌었을 때
- **`needCollect=false` 일 때** `collect()` 호출 안 함 — `alias`/`usage`/`memo` 같은 표시용 필드만 바뀐 경우

> **대표 시나리오**: 카드사 홈페이지 비밀번호가 만료돼서 수집이 계속 실패하던 카드 (`latest_is_permanent_err=TRUE`) 를 사용자가 새 비번으로 수정. 수정 순간 `needCollect=true` → `collect()` → 즉시 수집 큐 진입 → 다음 CollectJob 주기에 새 비번으로 재시도 → 성공 시 `collect_status` 가 `SUCCESS` 로 복귀. **즉 카드가 "다시 살아남"**.

**정지 (Stop)**

```java
@Transactional
public Map<Integer, Boolean> stopCards(Session session, List<Integer> cardSeqs) {
    for (Integer cardSeq : cardSeqs) {
        Card card = getCard(cardSeq);
        if (card == null || card.getCollectStatus().equals(STOP)) continue;

        card.stop();
        cardApiMapper.stopCard(cardSeq);
        cardApiMapper.registerCollectLog(...);
        // ⚠ collect() 호출 없음
    }
}
```

- **`collect()` 호출 안 함** — 수집을 "멈추는" 게 목적이므로 새 큐 진입 없음
- 그런데 완전히 조용한 건 아니다. **EnqueueJob 이 "오늘 정지된 카드" 조건에 걸려서 마지막으로 한 번 더 수집**한다 (5.2 섹션 시나리오 참고). "정지 직전까지의 데이터" 를 확보하려는 배려

> **대표 시나리오**: 사용자가 "이 카드 당분간 수집 끄고 싶어요" 또는 "이 카드 교체했어요, 기존 건 정지" 같은 요청. 정지 API 호출 → 그날 하루는 마지막 수집 → 그 이후로는 EnqueueJob 이 제외 → 완전히 조용해짐

**복구 (Recover)**

```java
@Transactional
public Map<Integer, Boolean> recoverCards(Session session, List<Integer> cardSeqs) {
    for (Integer cardSeq : cardSeqs) {
        Card card = getCard(cardSeq);
        if (card == null || !card.getCollectStatus().equals(STOP)) continue;

        card.recover();
        cardApiMapper.recoverCard(cardSeq);
        cardApiMapper.registerCollectLog(...);

        // ⭐ 수집큐 등록 — 복구는 항상 즉시 수집 호출
        collect(CollectDto.of(card.getCardSeq()));
    }
}
```

- **정지(STOP) 상태인 카드만** 복구 가능. 그 외 상태에서는 early skip
- **항상 `collect()` 호출** — 정지 기간 동안 누락된 거래내역을 **공백 메꾸기(gap filling)** 하려는 것
- 복구 후 `collect_status` 는 `STANDBY` 로 돌아가고, EnqueueJob 의 1순위 우선순위에 걸려서 재수집이 빠르게 돌아감

> **대표 시나리오**: Day 1 에 "당분간 수집 끄기" 로 정지 → Day 10 에 사용자가 "다시 켜야겠다" 며 복구 → 복구 즉시 `collect_queues` 에 큐 적재 → 다음 CollectJob 주기에 외부 API 호출 → **Day 2~Day 10 사이의 거래내역 8일치를 한 번에 끌어옴**. 정지 기간 동안의 데이터 공백이 이렇게 메워진다.

##### 4가지 이벤트 — `collect()` 호출 여부 비교

| 이벤트 | `collect()` 호출? | 이유 |
|------|-------------------|------|
| **등록** (`registerCard`) | ✅ **항상** | 신규 카드라 아직 `approval_histories` 에 데이터 0건. 즉시 수집 필요 |
| **수정** (`modifyCard`) | ⚠️ **`needCollect=true` 일 때만** | 수집에 영향 있는 필드 (카드번호/`web_id`/`web_pwd` 등) 변경일 때만. `alias`/`memo` 같은 표시용 필드만 바뀌면 재수집 불필요 |
| **복구** (`recoverCards`) | ✅ **항상** | 정지 기간 동안 누락된 거래내역이 있을 수 있어서 무조건 즉시 수집 |
| **정지** (`stopCards`) | ❌ **호출 안 함** | 정지 = 수집 중지가 목적. 단 EnqueueJob 이 "오늘 정지된 카드" 조건으로 마지막 한 번만 수집해줌 |

##### 왜 복구는 "즉시 수집" 이 필요한가 — 데이터 공백 문제

정지/복구는 본질적으로 **데이터 타임라인에 구멍을 뚫는** 작업이다.

```
approval_histories (card 102)
├─ 2026-03-01 ~ 2026-04-05  (정지 전 수집 데이터 ✅)
│
├─ 2026-04-05 ~ 2026-04-15  ❌ 공백! (정지 기간 — 여기 거래는 DB 에 없음)
│
└─ (복구 직후) 수집 필요
```

만약 복구만 하고 `collect()` 를 호출 안 한다면

- **나쁜 옵션 1**: 다음 EnqueueJob 주기까지 대기 → 사용자는 "복구했는데 왜 데이터 없어?" 당황
- **나쁜 옵션 2**: 사용자가 별도로 "수동 수집" 버튼을 또 눌러야 함 → UX 나쁨

그래서 **복구 API 가 내부에서 알아서 `collect()` 를 호출**해서, 사용자는 버튼 한 번만 눌러도 "복구 + 즉시 수집" 이 원자적으로 일어나게 만들었다. `registerCard()` 가 등록 + 큐 진입을 같은 트랜잭션에 묶은 것과 같은 철학이다.

##### 설계 원칙 — "사용자 액션 = 관찰 가능한 상태 변화"

위 4가지 이벤트를 종합하면 하나의 원칙이 보인다.

> **"사용자가 API 를 호출한 순간, 관찰 가능한 상태 변화가 즉시 일어나야 한다."**

- 등록 했는데 데이터 없음? ❌ 안 됨 → 등록 시 즉시 수집
- 비번 수정했는데 여전히 실패 상태? ❌ 안 됨 → 수정 시 즉시 수집
- 복구했는데 공백 기간 데이터 없음? ❌ 안 됨 → 복구 시 즉시 수집

이 모든 "즉시성 보장" 이 `registerCard/modifyCard/recoverCards` API 가 **트랜잭션 안에서 직접 `collect_queues` 에 INSERT** 하는 설계로 실현된다. 스케줄러의 주기적 동작에만 맡겼다면 지연이 생기고, 사용자가 "왜 안 되지?" 하고 기다리는 나쁜 UX 가 됐을 것이다.

### 5.2 ② EnqueueJob (card-scheduler) — 최초 수집용이 아니라 "재수집용"

주기적으로 실행되지만, **이 Job 이 다루는 건 이미 한 번 수집이 돈 카드** 다. 신규 등록 카드는 앞 5.1 단계에서 이미 큐에 들어갔으므로 여기서 또 처리하지 않는다.

EnqueueJob 의 수집 대상 SELECT 조건.

```sql
SELECT card_seq, card_company_code
FROM cards A
     LEFT JOIN collect_logs B
            ON A.card_seq = B.card_seq
           AND B.collect_status = 'STOP'
           AND B.do_dt::DATE = CURRENT_DATE
WHERE (A.collect_status IN ('STANDBY', 'SUCCESS'))
   OR (A.collect_status = 'FAILURE' AND A.latest_is_permanent_err = FALSE)
   OR (A.collect_status = 'STOP'    AND B.collect_log_seq IS NOT NULL)
ORDER BY CASE A.collect_status WHEN 'STANDBY' THEN 2 WHEN 'FAILURE' THEN 1 ELSE 0 END DESC,
         A.card_seq
```

조건을 풀어보면

| 조건 | 의미 |
|------|------|
| `STANDBY` | 대기 상태 — 등록 직후, 아직 한 번도 수집 안 된 카드 (등록 직후 첫 수집이 실패해 남아있는 경우 등 재시도 안전망) |
| `SUCCESS` | 지난 수집이 성공 — 다음 주기 재수집 대상 |
| `FAILURE` + `latest_is_permanent_err = FALSE` | 일시적 실패 — 다음 주기에 재시도 |
| `STOP` + 오늘 정지된 이력 | 오늘 정지된 카드 — 마지막으로 한 번 더 수집해서 "정지 시점까지의 데이터" 를 확보 |

```
Quartz 트리거 (cron 주기 도래)
   │
   ├─ SELECT ◀ cards + collect_logs    (위 조건)
   │
   └─ INSERT ▶ collect_queues          (card_seq, start_date, end_date, in_progress=false)
```

**핵심 포인트**: `cards` 는 읽기만, 외부 API 호출은 안 함. 단순히 "다시 수집할 카드를 큐에 적재" 만 한다. 최초 수집용이 아니라 **반복 수집의 엔진** 역할.

#### 시나리오로 따라가기 — 카드 여러 장이 큐에 들어가는 과정

추상 설명만으로는 감이 잘 안 오니까 실제 데이터로 한 번 돌려본다.

**전제 조건**
- **시각**: 2026-04-13 (월) 오전 10:00:00
- **설정값**: `card.collect-days-ago = 3` (과거 3일치까지 수집), `enqueue.chunk-size = 5`
- **점검 중**: COMPANY_A 카드사가 오늘 10:00~12:00 정기 점검

##### Before — 실행 전 테이블 상태

`cards` 테이블

| card_seq | card_company_code | card_type | collect_status | latest_is_permanent_err | 상황 |
|---|---|---|---|---|---|
| 101 | COMPANY_A | PERSONAL | **STANDBY** | NULL | 방금 등록된 카드, 아직 수집 0회 |
| 102 | COMPANY_B | PERSONAL | **SUCCESS** | NULL | 어제 수집 성공, 다음 주기 재수집 대상 |
| 103 | COMPANY_A | COMPANY | **FAILURE** | FALSE | 일시 실패 (네트워크 오류) — 재시도 가능 |
| 104 | COMPANY_C | PERSONAL | **FAILURE** | **TRUE** | 영구 실패 (비밀번호 오류) — 재시도 불가 |
| 105 | COMPANY_B | COMPANY | **STOP** | NULL | 어제(2026-04-12) 정지됨 |
| 106 | COMPANY_D | PERSONAL | **STOP** | NULL | 오늘(2026-04-13) 정지됨 |
| 107 | COMPANY_A | PERSONAL | **SUCCESS** | NULL | 어제 수집 성공 |

`collect_logs` 테이블 (관련 STOP 이력만)

| collect_log_seq | card_seq | collect_status | do_dt |
|---|---|---|---|
| 9001 | 105 | STOP | 2026-04-12 15:00:00 (어제) |
| 9010 | 106 | STOP | 2026-04-13 09:30:00 (오늘) |

`collect_queues` 테이블: **비어 있음** (이전 EnqueueJob 결과는 이미 처리되어 삭제됨)

##### Step 1 — Reader: `getAvailableCards` SELECT

EnqueueJob 매퍼 쿼리가 돌면서 각 카드의 매칭 여부를 판정한다.

| card_seq | collect_status | 매칭 조건 | 선택 여부 | 이유 |
|---|---|---|---|---|
| 101 | STANDBY | `IN ('STANDBY', 'SUCCESS')` ✓ | ✅ | 대기 상태 (첫 수집 안전망) |
| 102 | SUCCESS | `IN ('STANDBY', 'SUCCESS')` ✓ | ✅ | 재수집 |
| 103 | FAILURE | `FAILURE + permanent=FALSE` ✓ | ✅ | 일시 실패 재시도 |
| 104 | FAILURE | `FAILURE + permanent=FALSE` ✗ | ❌ | **영구 실패** — 재시도 무의미 |
| 105 | STOP | `STOP + 오늘 정지 이력` ✗ | ❌ | 어제 정지 — 오늘 JOIN 결과 없음 |
| 106 | STOP | `STOP + 오늘 정지 이력` ✓ | ✅ | **오늘 정지** — 마지막 한 번 더 수집 |
| 107 | SUCCESS | `IN ('STANDBY', 'SUCCESS')` ✓ | ✅ | 재수집 |

**ORDER BY 로 정렬된 Reader 결과**

```
순서  card_seq  company      priority  이유
────────────────────────────────────────────
 1    101       COMPANY_A    2         STANDBY 먼저
 2    103       COMPANY_A    1         FAILURE 다음
 3    102       COMPANY_B    0         나머지 (card_seq 순)
 4    106       COMPANY_D    0
 5    107       COMPANY_A    0
```

> 💡 **왜 STANDBY 를 1순위로?** 등록 직후 첫 수집이 실패해 남은 카드를 빨리 처리해서, 사용자가 "등록했는데 데이터가 안 보여요" 라는 상태를 최소화하려는 의도. STANDBY → FAILURE → 나머지 순.

##### Step 2 — Processor: 카드별 기간 계산 + 다운타임 체크

Processor 는 각 `AvailableCard` 를 `CollectQueueForEnqueue` 로 변환한다.

```java
return availableCard ->
    CollectQueueForEnqueue.of(
        availableCard,
        LocalDate.now().minusDays(cardProperties.getCollectDaysAgo()),  // startDate
        LocalDate.now(),                                                 // endDate
        downtimeChecker.getCollectableDT(availableCard.getCardCompanyCode())  // collectDT
    );
```

카드별 변환 결과

| card_seq | company | startDate | endDate | collectDT | 비고 |
|---|---|---|---|---|---|
| 101 | COMPANY_A | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 점검 → 지연 |
| 103 | COMPANY_A | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 점검 → 지연 |
| 102 | COMPANY_B | 2026-04-10 | 2026-04-13 | **2026-04-13 10:00:01** | 정상 → 즉시 |
| 106 | COMPANY_D | 2026-04-10 | 2026-04-13 | **2026-04-13 10:00:01** | 정상 → 즉시 |
| 107 | COMPANY_A | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 점검 → 지연 |

> ⭐ **핵심 포인트**: 점검 중이어도 **큐에 일단 넣는다**. 다만 `collect_dt` 를 "점검 종료 시각" 으로 미래에 설정해서, 나중에 CollectJob reader 가 `WHERE collect_dt <= NOW()` 조건으로 걸러낸다. **"지연 스케줄링"** 효과.

##### Step 3 — Writer 1: `collect_queues` INSERT

```sql
INSERT INTO collect_queues (
    card_seq, start_date, end_date, collect_dt, insert_dt, try_count, in_progress
) VALUES (
    #{availableCard.cardSeq}, #{startDate}, #{endDate}, #{collectDT},
    CURRENT_TIMESTAMP, 0, FALSE
);
```

5개 카드에 대해 5번 실행되어 5개 row 생성 (chunk 단위 batch insert).

##### Step 4 — Writer 2: Logger

```
INFO  수집큐 등록 : 2026-04-10 ~ 2026-04-13, count=5
```

##### After — 실행 후 테이블 상태

`collect_queues` (신규 5 rows)

| collect_queue_seq | card_seq | start_date | end_date | collect_dt | insert_dt | try_count | in_progress |
|---|---|---|---|---|---|---|---|
| 3001 | 101 | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 2026-04-13 10:00:02 | 0 | false |
| 3002 | 103 | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 2026-04-13 10:00:02 | 0 | false |
| 3003 | 102 | 2026-04-10 | 2026-04-13 | **2026-04-13 10:00:01** | 2026-04-13 10:00:02 | 0 | false |
| 3004 | 106 | 2026-04-10 | 2026-04-13 | **2026-04-13 10:00:01** | 2026-04-13 10:00:02 | 0 | false |
| 3005 | 107 | 2026-04-10 | 2026-04-13 | **2026-04-13 12:00:00** | 2026-04-13 10:00:02 | 0 | false |

`cards` / `card_logs` — **변화 없음**. EnqueueJob 은 `cards` 를 **읽기만** 한다. 상태 변경은 CollectJob 담당.

##### 이후 — CollectJob 이 어떻게 집어가나

**10:00:02 직후** 첫 CollectJob 트리거 (cron 5초):

CollectJob reader 가 `WHERE in_progress=false AND collect_dt <= NOW()` 조건으로 큐를 집어감.

```
NOW = 2026-04-13 10:00:05

collect_queues 에서 "지금 처리 가능한 것":
  ✅ 3003 (card 102) — collect_dt=10:00:01 < 10:00:05
  ✅ 3004 (card 106) — collect_dt=10:00:01 < 10:00:05
  ⏸ 3001, 3002, 3005 — collect_dt=12:00:00 > 10:00:05 (스킵)
```

→ **102, 106 은 먼저 수집**되고, COMPANY_A 점검이 끝나는 **12:00 이후** 에야 101, 103, 107 이 수집된다.

##### 이 시나리오에서 배울 점

| 관찰                                            | 왜 중요한가 |
|-----------------------------------------------|---|
| **card 104 (영구 실패) 는 큐에 안 들어감**               | 비밀번호 오류 같은 "고쳐지지 않는 실패" 는 계속 돌릴수록 낭비. 사용자가 카드 수정하면 `collect_status` 가 리셋되어 다시 대상이 됨 |
| **card 105 (어제 정지) 는 제외, 106 (오늘 정지) 은 포함**   | "정지된 카드" 를 영원히 재수집하면 안 되지만, **오늘 정지된 건 정지 시점까지의 데이터를 마지막으로 확보** 해야 함. LEFT JOIN + `do_dt::DATE = CURRENT_DATE` 로 하루 유예 |
| **STANDBY 카드가 최우선순위**                      | 사용자 체감 속도. 등록 직후 "데이터가 안 보여요" 시간을 최소화 |
| **점검 중이어도 큐에 들어감**                            | 큐에는 들어가되 `collect_dt` 를 미래로 설정해 지연 스케줄링. CollectJob 이 알아서 시간 되면 집어감 |
| **EnqueueJob 은 `cards` 상태를 바꾸지 않음**           | 순수하게 큐에 "복사본을 꽂는" 역할. 상태 변경은 CollectJob 담당 |
| **`collect_queues.collect_dt` 컬럼이 지연 제어의 핵심** | insert_dt (큐에 넣은 시각) 와 collect_dt (수집 가능한 시각) 가 분리되어 있어서 "미래에 수집할 것" 을 현재에 미리 등록 가능 |

### 5.3 ③ CollectJob (card-scheduler) — 핵심

```
Quartz 트리거
   │
   ├─ SELECT ◀ collect_queues        (큐에서 하나 꺼내기, in_progress=false 인 것)
   │          JOIN cards             (웹ID/PW, 카드번호 등 획득)
   │
   ├─ UPDATE ▶ collect_queues        (in_progress = true, 락)
   │
   ├─ [외부 스크래핑 API 호출] ──▶  외부 벤더
   │  ◀── 승인/매입 내역 응답 (JSON)
   │
   ├─ INSERT ▶ approval_histories_temp   (응답 레코드 N건 적재)
   ├─ INSERT ▶ integrate_queues          (통합 신호)
   ├─ UPDATE ▶ cards                     (latest_err_code, latest_collect_end_dt 등 갱신)
   ├─ INSERT ▶ collect_logs              (실행 이력 1건)
   │
   └─ DELETE ▶ collect_queues            (완료 or 영구오류)
              OR UPDATE try_count++      (일시 오류 → 재시도)
```

이 Job 은 Spring Batch 의 `CompositeItemWriter` 로 writer 10개를 체인처럼 순차 실행한다. 각 writer 가 "성공 시에만 실행", "실패 시에만 실행" 같은 조건부로 동작한다.

#### 시나리오로 따라가기 — 카드 하나가 외부 API 호출까지 가는 과정

**전제 조건** (5.2 EnqueueJob 시나리오 이어서)

- **시각**: 2026-04-13 (월) 오전 10:00:05 → 첫 CollectJob 트리거 (cron 5초)
- EnqueueJob 이 방금 `collect_queues` 에 5 rows 꽂고 종료
- CollectJob 의 `chunk(1)` 이라 한 번에 1건씩, reader 가 `in_progress=false AND collect_dt <= NOW()` 로 픽업
- `maxPoolSize=2` 라 최대 2개 스레드 병렬 — 여기서는 간단히 1개 스레드 기준으로 카드 1장을 따라간다

##### Before — `collect_queues` 상태

| collect_queue_seq | card_seq | collect_dt | in_progress | 픽업 여부 |
|---|---|---|---|---|
| 3001 | 101 | 2026-04-13 12:00:00 | false | ⏸ 미래 시각 — 스킵 |
| 3002 | 103 | 2026-04-13 12:00:00 | false | ⏸ 미래 시각 — 스킵 |
| 3003 | **102** (COMPANY_B PERSONAL) | 2026-04-13 10:00:01 | false | **✅ 첫 픽업 대상** |
| 3004 | 106 (COMPANY_D) | 2026-04-13 10:00:01 | false | (다음 chunk) |
| 3005 | 107 | 2026-04-13 12:00:00 | false | ⏸ 미래 시각 — 스킵 |

→ **Reader 가 3003 (card 102) 를 집어감.** 이 카드 한 장을 writer 체인 전체에 따라 추적하자.

**추가 전제**: card 102 는 COMPANY_B PERSONAL 이고, 외부 API 호출 결과 **3건 성공 응답** 이라고 가정. (실패 케이스는 맨 아래에 별도 시나리오로.)

##### Step 0 — Reader + Processor

**역할**: Reader 가 `collect_queues` 에서 처리할 row 한 건을 꺼내 JOIN 으로 카드의 인증정보까지 함께 가져오고, Processor 가 이를 `CollectResult` 빈 컨테이너로 감싸서 writer 체인이 상태를 채워갈 준비를 한다. 이 시점에 `collectStartDT` 가 고정되어 이후 소요시간 계산의 기준점이 된다.

```
Reader   : collect_queues 3003 (card 102 COMPANY_B PERSONAL)
           + JOIN cards 로 web_id, web_pwd, card_num 등 획득
Processor: CollectResult.of(appName, collectQueue)
           → CollectResult { collectQueue: {3003, card=102, 2026-04-10~2026-04-13, ...}, status: null }
```

##### Step 1 — Writer 1: 큐 락

**역할**: 병렬 스레드나 다른 CollectJob 인스턴스가 같은 큐 아이템을 **중복 처리하지 못하도록** `in_progress=true` 로 락을 건다. 이 Writer 가 성공해야 이후 모든 Writer 가 이 카드를 "내 것" 으로 작업할 수 있다.

```sql
UPDATE collect_queues SET in_progress = true
 WHERE collect_queue_seq = 3003
```

##### Step 2 — Writer 2: ⭐ 외부 API 호출 (핵심)

**역할**: 이 Job 의 심장. 카드사 점검 체크 → 수집 기간을 카드사별 max 단위로 분할 → 각 구간마다 외부 API HTTP 호출 → 응답 누적 → 결과에 따라 `CollectResult` 의 상태를 `SUCCESS/FAILURE/DOWNTIME` 로 마킹. 실제 HTTP 호출이 일어나는 **유일한 지점** 이다.

```java
// [1] 점검 체크
DowntimeVo downtimeVo = downtimeChecker.getDowntimeVo("COMPANY_B");
// COMPANY_B 는 점검 아님 → downtimeVo == null → 계속 진행

// [2] 기간 분할 — COMPANY_B PERSONAL = 7일 split (카드사별 정책)
//     endDate = 2026-04-13, startDate = 2026-04-13.minusDays(6) = 2026-04-07
//     clamp: 2026-04-07 < queue startDate(2026-04-10) → startDate = 2026-04-10
//     partitions.add([2026-04-10, 2026-04-13])
//     다음 루프: endDate=2026-04-06 < 2026-04-10 → break
//
//     결과: 1개 partition [2026-04-10 ~ 2026-04-13]
```

> 💡 **기간 분할이 더 긴 경우 예시**: 만약 range 가 20일이면 (예: 2026-03-24 ~ 2026-04-13), 7일 split 이 작동해서 3개 파티션으로 쪼개진다 — `[04-07~04-13]`, `[03-31~04-06]`, `[03-24~03-30]`. 각 파티션마다 외부 API 를 한 번씩 호출한다. 카드사마다 한 번에 조회 가능한 기간이 제한적이어서 이런 분할이 필요.

```java
// [3] 외부 API 호출 루프 (이번엔 1번만)
for (partition : [[2026-04-10, 2026-04-13]]) {
    result = externalApiService.getApprovalHistories(
        COMPANY_B, PERSONAL, webId, webPwd, cardNum,
        2026-04-10, 2026-04-13
    );
    // HTTP 호출 → 외부 벤더로 POST → 응답 3건 수신
    //   [A001/APPROVAL/15000/2026-04-11 12:30,
    //    A002/APPROVAL/8500 /2026-04-11 18:45,
    //    A003/APPROVAL/22000/2026-04-12 10:15]

    // 빈 결과 에러가 아닌 진짜 실패? → 아님, 성공
    approvalHistories.addAll(result.getApprovalHistories());
}

// [4] 성공 마킹
collectResult.success(periodPartitions.size=1, scrapingStartDT, now, 3건);
// CollectResult { status: SUCCESS, collectLog: {...}, approvalHistories: [3건] }
```

> 🌐 **여기가 실제 HTTP 호출이 일어나는 유일한 지점**. 외부 API 클라이언트가 POST 요청을 날리고 JSON 응답을 VO 로 파싱해서 돌려준다.

##### Step 3 — Writer 3: DowntimeReEnqueue

**역할**: 카드사가 점검 중일 때만 실행. 점검 종료 시각 이후로 `collect_dt` 를 미룬 **새 큐 row 를 하나 더 INSERT** 해서 "나중에 다시 시도" 하도록 예약한다. 기존 큐 row 는 Writer 8 이 DELETE 로 정리.

- **조건**: `status == DOWNTIME`
- **현재 상태**: SUCCESS → **skip** (SQL 실행 안 됨)

##### Step 4 — Writer 4: InsertApprovalHistoryTemps

**역할**: 외부 API 가 돌려준 거래 레코드들을 `approval_histories_temp` 임시 테이블에 저장한다. 본 테이블에 바로 넣지 않고 버퍼를 거치는 이유는 **IntegrateJob 의 Compare 로직** 이 나중에 "기존 데이터 vs 새 데이터" 를 비교해야 하기 때문. 성공일 때만 실행.

- **조건**: `status == SUCCESS` → **실행**

```sql
-- 3건이라 50씩 파티션은 1개. 3건 INSERT
INSERT INTO approval_histories_temp (
    collect_queue_seq, card_seq,
    approval_num, approval_type, approval_dt, approval_amount, ...
) VALUES
    (3003, 102, 'A001', 'APPROVAL', '2026-04-11 12:30', 15000, ...),
    (3003, 102, 'A002', 'APPROVAL', '2026-04-11 18:45', 8500,  ...),
    (3003, 102, 'A003', 'APPROVAL', '2026-04-12 10:15', 22000, ...);
-- → temp_seq 5001, 5002, 5003 생성
```

##### Step 5 — Writer 5: InsertIntegrateQueue

**역할**: `integrate_queues` 에 "이 collect_queue_seq 의 temp 데이터를 통합해 주세요" 라는 **신호 row** 를 INSERT 한다. 다음 단계인 IntegrateJob 을 깨우는 **문 두드리기** 역할. 성공일 때만 실행.

- **조건**: `status == SUCCESS` → **실행**

```sql
INSERT INTO integrate_queues (
    collect_queue_seq, card_seq, start_date, end_date, insert_dt, in_progress
) VALUES (
    3003, 102, '2026-04-10', '2026-04-13', CURRENT_TIMESTAMP, false
);
-- → integrate_queue_seq 2001 생성 (IntegrateJob 이 집어갈 신호)
```

##### Step 6 — Writer 6: UpdateCollectStatus

**역할**: `cards` 테이블의 `collect_status` 와 `latest_*` **비정규화 캐시 컬럼** 들을 이번 수집 결과로 갱신한다. 카드 리스트 화면에서 JOIN 없이 "최근 수집 상태" 를 즉시 보여주기 위한 것. 성공/실패 모두 실행 (점검은 상태 변경 없음).

- **조건**: `status == SUCCESS or FAILURE` → **실행**

```sql
UPDATE cards
   SET collect_status = 'SUCCESS',
       latest_collect_start_dt = '2026-04-13 10:00:05',
       latest_collect_end_dt   = '2026-04-13 10:00:08',
       latest_collect_duration = 3000,        -- 3초
       latest_collect_count    = 3,
       latest_err_code         = NULL,
       latest_err_number       = NULL,
       latest_err_message      = NULL,
       latest_is_permanent_err = NULL,
       latest_start_date       = '2026-04-10',
       latest_end_date         = '2026-04-13'
 WHERE card_seq = 102;
```

> 💡 카드 리스트 화면에서 "최근 수집 결과" 를 JOIN 없이 바로 보여주기 위한 **비정규화 캐시** 갱신. `collect_logs` 에도 같은 정보가 들어가지만 (writer 7), `cards.latest_*` 는 빠른 조회용 복사본이다.

##### Step 7 — Writer 7: RegisterCollectLog

**역할**: `collect_logs` 에 이번 수집 실행의 **상세 이력** 을 한 줄 INSERT 한다. 성공/실패 여부, 에러 코드, 소요 시간, 수집 건수 등 감사·디버깅용 로그. Writer 6 의 `cards.latest_*` 갱신과 비교하면 **이쪽은 히스토리 누적**, 저쪽은 "최신 상태 캐시".

- **조건**: `status == SUCCESS or FAILURE` → **실행**

```sql
INSERT INTO collect_logs (
    card_seq, collect_queue_seq, collect_status,
    collect_start_dt, collect_end_dt, collect_duration,
    collect_count, scraping_start_dt, scraping_end_dt, scraping_duration,
    try_count, ...
) VALUES (
    102, 3003, 'SUCCESS',
    '2026-04-13 10:00:05', '2026-04-13 10:00:08', 3000,
    3, '2026-04-13 10:00:05', '2026-04-13 10:00:08', 3000,
    0, ...
);
-- → collect_log_seq 10001 생성
```

##### Step 8 — Writer 8: DeleteCollectQueue

**역할**: 수집이 "끝난" 것으로 판정된 큐 row 를 `collect_queues` 에서 **물리 삭제** 한다. 성공/점검 재큐/영구 오류/재시도 초과 네 가지 종료 케이스에서 실행. "더 이상 이 큐에 대해 할 일 없음" 을 DB 에 물리적으로 표현.

- **조건**: `DOWNTIME or SUCCESS or (FAILURE + (영구 or 재시도초과))` → **실행** (SUCCESS)

```sql
DELETE FROM collect_queues WHERE collect_queue_seq = 3003;
```

##### Step 9 — Writer 9: Retry

**역할**: 일시적 실패 (네트워크 오류 등) 일 때만 실행. 큐 row 를 지우지 않고 `try_count++`, `in_progress=false` 로 리셋해서 **다음 CollectJob 주기에 reader 가 다시 픽업** 하도록 만든다. Writer 8 과 정확히 **상보적** 이라 둘 중 하나만 실행된다.

- **조건**: `FAILURE + 일시 + 재시도가능` → **skip** (SUCCESS)

##### Step 10 — Writer 10: Logger

**역할**: 최종 결과를 상태별로 info/warn 레벨 로그 출력. 수집연기/수집성공/수집실패 각각 다른 포맷. DB 작업 없이 **순수 로깅** 만 담당해서 운영자가 실시간으로 파이프라인 상태를 추적할 수 있게 한다.

```
INFO  수집성공 : collectQueueSeq=3003, cardSeq=102, cardNum=****-****-****-1234,
                 2026-04-10 ~ 2026-04-13, scrapingDuration=3000, collectCount=3
```

##### After — 실행 후 테이블 상태

| 테이블 | 변화 |
|---|---|
| `collect_queues` | 3003 **DELETE** (나머지 3001/3002/3004/3005 그대로) |
| `approval_histories_temp` | **+3 rows** (temp_seq 5001~5003) |
| `integrate_queues` | **+1 row** (integrate_queue_seq 2001) |
| `cards` | card_seq=102 **UPDATE** (`latest_*` + `collect_status=SUCCESS`) |
| `collect_logs` | **+1 row** (collect_log_seq 10001) |
| `approval_histories` | 변화 없음 — IntegrateJob 담당 |

이제 **IntegrateJob 이 다음 cron 주기에 `integrate_queues.2001` 을 집어가서** temp 의 3건을 본 테이블로 통합한다 (다음 5.4 섹션).

---

#### 변형 시나리오 — 다른 결과 분기

CollectJob 의 재미는 `CollectResult.status` 에 따라 writer 가 **다르게 실행**된다는 점. 위의 SUCCESS 외에 3가지 분기가 있다.

##### Variation A — DOWNTIME (점검 감지됨)

**상황**: EnqueueJob 이 10:00:00 에 돌 때는 COMPANY_B 가 정상이었는데, CollectJob 이 10:00:05 에 호출을 시도하는 **그 사이에** COMPANY_B 가 점검 공지를 냈다고 하자.

| # | Writer | 실행? | 작동 |
|---|---|---|---|
| 1 | UpdateCollectQueueInProgress | ✅ | 락 걸기 |
| 2 | Collect | ✅ | `downtimeChecker.getDowntimeVo(COMPANY_B)` → 점검 감지 → `collectResult.downtime()` 후 즉시 return. **외부 API 호출 안 함** |
| 3 | DowntimeReEnqueue | **✅** | 새 row INSERT — `collect_dt` 를 점검 종료 시각 이후로 미룸 |
| 4~7 | temp/integrate/status/log | ❌ | skip (DOWNTIME 은 성공도 실패도 아님) |
| 8 | DeleteCollectQueue | ✅ | 원래 row 3003 DELETE (writer 3 이 새 row 를 이미 만들었음) |
| 9 | Retry | ❌ | skip |
| 10 | Logger | ✅ | `"수집연기 : ..., downtime=2026-04-13 10:00 ~ 12:00"` |

**결과**: 원래 3003 이 사라지고 새 row 3006 이 `collect_dt=2026-04-13 12:00:00` 으로 새로 들어감. CollectJob 이 12시 이후에 다시 픽업. `cards` 와 `collect_logs` 는 **변화 없음**.

##### Variation B — FAILURE (일시 오류, 재시도 가능)

**상황**: 네트워크 타임아웃으로 외부 API 호출 실패. `errCode` 가 `isPermanentErrorCode` 목록에 없음 → 일시 오류로 판정.

| # | Writer | 실행? | 작동 |
|---|---|---|---|
| 1 | UpdateCollectQueueInProgress | ✅ | 락 걸기 |
| 2 | Collect | ✅ | API 호출 → 실패 → `collectResult.failure(..., isPermanent=false)` |
| 3 | DowntimeReEnqueue | ❌ | skip |
| 4 | InsertApprovalHistoryTemps | ❌ | skip (SUCCESS 아님) |
| 5 | InsertIntegrateQueue | ❌ | skip |
| 6 | UpdateCollectStatus | ✅ | `cards.collect_status = FAILURE`, `latest_err_code = 'TIMEOUT'`, `latest_is_permanent_err = FALSE` |
| 7 | RegisterCollectLog | ✅ | `collect_logs` 에 실패 로그 INSERT |
| 8 | DeleteCollectQueue | ❌ | 영구 오류 아니고 재시도 한도 미도달 → skip |
| 9 | Retry | **✅** | `UPDATE collect_queues SET try_count = try_count + 1, in_progress = false WHERE collect_queue_seq = 3003` |
| 10 | Logger | ✅ | `"수집실패 : ..., errCode=TIMEOUT, isPermanentErr=false"` |

**결과**: 3003 row 가 **그대로 남고** `try_count=1, in_progress=false` 로 리셋. 다음 CollectJob 트리거 시 reader 가 다시 픽업해서 재시도.

##### Variation C — FAILURE (영구 오류 or 재시도 초과)

**상황**: 비밀번호 오류 (`errCode` 가 `isPermanentErrorCode` 매칭) 또는 `try_count >= numberOfRetry - 1` 도달.

| # | Writer | 실행? | 작동 |
|---|---|---|---|
| 1 | UpdateCollectQueueInProgress | ✅ | 락 걸기 |
| 2 | Collect | ✅ | 실패 → `collectResult.failure(..., isPermanent=true)` |
| 3 | DowntimeReEnqueue | ❌ | skip |
| 4~5 | temp/integrate | ❌ | skip |
| 6 | UpdateCollectStatus | ✅ | `cards.collect_status = FAILURE`, `latest_is_permanent_err = TRUE` |
| 7 | RegisterCollectLog | ✅ | 실패 로그 INSERT |
| 8 | DeleteCollectQueue | **✅** | 영구 오류 판정 → 큐에서 제거 (더 재시도 안 함) |
| 9 | Retry | ❌ | skip |
| 10 | Logger | ✅ | `"수집실패 : ..., isPermanentErr=true"` |

**결과**: 3003 row DELETE. `cards.collect_status=FAILURE, latest_is_permanent_err=TRUE`. 다음 EnqueueJob 이 돌 때 이 카드는 **선택 조건에서 제외** (앞 5.2 Reader SELECT 참고) → 사용자가 카드 정보를 수정해서 상태가 리셋될 때까지 대기.

##### 4가지 분기 비교표

| Writer | SUCCESS | DOWNTIME | FAILURE (일시) | FAILURE (영구/초과) |
|---|---|---|---|---|
| 1 Lock | ✅ | ✅ | ✅ | ✅ |
| 2 Collect | ✅ | ✅ (downtime 감지) | ✅ (API 실패) | ✅ (API 실패) |
| 3 DowntimeReEnqueue | — | **✅** | — | — |
| 4 InsertTemps | **✅** | — | — | — |
| 5 InsertIntegrateQueue | **✅** | — | — | — |
| 6 UpdateCollectStatus | ✅ | — | ✅ | ✅ |
| 7 RegisterCollectLog | ✅ | — | ✅ | ✅ |
| 8 DeleteCollectQueue | ✅ | ✅ | — | ✅ |
| 9 Retry | — | — | **✅** | — |
| 10 Logger | ✅ | ✅ | ✅ | ✅ |

**핵심 관찰**:
- **4·5 (temp 적재, 통합 신호)** 는 SUCCESS 에만. 실패/점검 상황에서는 절대 temp 에 데이터 안 들어감 → 데이터 오염 방지
- **6·7 (상태 갱신, 로그)** 은 SUCCESS/FAILURE 에 공통. 운영 추적용
- **8·9 (큐 DELETE vs Retry)** 는 **정확히 상보적**. 큐가 삭제되거나 재시도 상태로 리셋되거나 둘 중 하나 — 큐 row 가 "좀비" 상태로 남지 않음

### 5.4 ④ IntegrateJob (card-scheduler)

IntegrateJob 은 `IntegrateJobConfig.integrateStepWriter()` 에서 **12개 writer 체인** 으로 구성된다. `CollectJob` 과 달리 단순히 temp 를 본 테이블에 옮기는 게 아니라, 외부 API 의 **데이터 변덕을 흡수하는 정교한 비교 로직** 이 핵심.

#### "데이터 변덕을 흡수한다" 는 게 무슨 뜻인가

외부 스크래핑 API 는 카드사 홈페이지를 긁어서 데이터를 돌려주는 구조라서, 응답이 **완벽하게 일관적이지 않다**. 같은 거래가 시점에 따라 미묘하게 다르게 내려오거나, 아예 응답에서 사라졌다가 다시 나타나는 일이 흔하다. "변덕" 은 이런 예측 불가능한 흔들림을 의미한다.

대표적인 변덕 6가지와 Compare 로직이 각각을 어떻게 처리하는지.

| 변덕 | 상황 | Compare 처리 |
|------|------|-------------|
| **1. 같은 거래인데 승인유형 변경** | Day 1 "승인번호 A001, 10000원, 승인" → Day 2 "A001, 10000원, 취소" | Phase 3 **cross-match** 로 같은 거래 감지 → 기존 `approval_history_seq` 유지한 채 UPDATE |
| **2. 승인 일시의 시간만 미세 변경** | Day 1 "A001, 12:30:45" → Day 2 "A001, 12:30:47" | Phase 1 에서 자연 키 (날짜까지만) 로 매칭 → "시간만 다름" 분기 → UPDATE + 기존 휴폐업 정보 보존 |
| **3. 가맹점 사업자번호가 뒤늦게 채워짐** | Day 1 `storeBizId=NULL` → Day 2 `storeBizId='1234567890'` | `UPDATED_STORE_BIZ_ID` 분류 → UPDATE + Writer 4 가 과세유형 **재조회** |
| **4. 완전히 동일한 레코드가 반복 등장** | 변화 없는 거래가 매 수집마다 응답에 포함됨 | `DO_NOTHING` 분류 → **아무 SQL 도 실행 안 함** (불필요한 I/O 방지) |
| **5. 거래가 응답에서 사라짐** | Day 1 `[A001, A002, A003]` → Day 2 `[A001, A003]` | Phase 2 에서 olds 잔여분으로 감지 → `REMOVED` → DELETE + `_removed` 스냅샷 |
| **6. API 장애로 빈 응답** | Day 2 응답이 `"LIST": []` (성공인데 0건) | Writer 2 의 **0건 방어 로직** (`temps.isEmpty() && !olds.isEmpty()`) 으로 **Compare 자체 스킵** → 기존 데이터 보호 |

##### 흡수 안 하면 벌어지는 일 (naive 방식의 결과)

비교 없이 "temp 를 본 테이블에 그대로 INSERT" 하는 단순 방식이었다면

- **변덕 1**: 같은 거래가 "승인" + "취소" 두 번 존재 → 금액 합산 오류
- **변덕 2**: 중복 레코드 누적
- **변덕 4**: 매 수집마다 수백 건 쓸모없는 UPDATE → DB 부하
- **변덕 5**: 사용자가 취소한 거래가 조회 화면에 계속 남음 (유령 거래)
- **변덕 6**: ❗ **DB 데이터 전멸** — 기존 수천 건이 전부 `_removed` 로 날아감

즉 외부 API 의 변덕이 본 테이블까지 그대로 전파되면 **데이터 오염 / 유실 / 성능 저하** 가 줄줄이 발생한다.

##### "흡수" 라는 표현의 의미

```
[외부 API] ── 변덕스러운 응답 ──▶ [IntegrateJob Compare] ── 정제된 결과 ──▶ [approval_histories]
                                        ⬆
                                    여기가 "흡수층"
```

Compare 로직은 외부 시스템의 불완전함이 우리 DB 까지 전파되지 않도록 **중간 필터** 역할을 한다. 외부가 엉망이어도 본 테이블은 항상 깨끗한 "현재 진실" 만 유지. 이게 "**외부 변덕을 통합 레이어에서 흡수**" 의 의미.

> 💡 일반화하면 "**외부 데이터 소스를 100% 신뢰하지 말고, 통합 레이어에서 방어적으로 동작하라**" 는 원칙이다. 이 패턴은 결제 게이트웨이 멱등성 처리, 환율 피드 이상치 필터, 로그 수집기의 시계 오차 보정 등 다른 도메인에서도 자주 등장한다.

#### Writer 체인 실행 순서

```
 1. updateIntegrateQueueInProgress        ─ 큐 락
 2. getCollectStartDTAndTempsAndOlds      ─ temp + 본 테이블 데이터 읽기
 3. Compare                                ─ ⭐ 분류 로직 (3단계)
 4. CollectStoreTaxType                    ─ 가맹점 과세유형 외부 조회
 5. DeleteRemovedApprovalHistories         ─ REMOVED 처리
 6. UpdateExistingApprovalHistories        ─ UPDATED 처리
 7. RegisterNewApprovalHistories           ─ NEW 처리
 8. DeleteIntegrateQueue                   ─ 큐 삭제
 9. DeleteApprovalHistoriesTemp            ─ temp 청소
10. UpdateCollectResult                    ─ cards.latest_* 갱신
11. UpdateCollectLog                       ─ collect_logs 갱신
12. Logger
```

3번이 "어떻게 분류할지" 를 정하고, 5~7번이 결정을 실제 DB 에 반영한다.

#### 2번 — temp + 본 테이블 읽기 + 0건 방어 로직

```java
List<ApprovalHistory> temps = getApprovalHistoryTemps(collectQueueSeq);
List<ApprovalHistory> olds  = getApprovalHistories(cardSeq, startDT, endDT);

// ⭐ 핵심 방어
// 수집된 내역은 없고 기존 내역이 있으면, 외부 API 장애로 0건 수집된 경우로 간주
// 처리 없이 완료시킨다.
if (temps.isEmpty() && !olds.isEmpty()) {
    // 빈 리스트로 세팅하고 return → 5~7번이 아무것도 안 함
    return;
}
```

**왜 중요한가**: 이 가드가 없으면 외부 API 가 일시 장애로 빈 응답을 한 번만 줘도 해당 기간 본 테이블 데이터가 전부 `REMOVED` 로 판정되어 `_removed` 로 날아갈 수 있다. **"데이터 보수적 유지"** 설계.

#### 3번 — Compare 로직 (3단계)

가장 복잡한 부분. 세 단계로 분류가 진행된다.

##### Phase 1 — temp 순회, 기존 건 매칭 (가장 정교한 단계)

Phase 1 은 단순히 "같은지 다른지" 만 판정하는 게 아니라, **5가지 세부 분기** 를 통해 **"각 temp 레코드를 이후 Writer 들이 어떻게 처리할지"** 를 미리 정해두는 **작업 디스패처** 역할을 한다.

###### 의사 코드 — Phase 1 의 전체 구조

```
for each temp in temps:
    matched ← null
    for each old in olds:
        if temp 와 old 가 자연 키 일치:
            matched ← old
            break

    if matched == null:
        → NEW (매칭 실패)
    else:
        1) olds 에서 matched 제거        ← Phase 2 의 복선
        2) temp 에 기존 seq 주입          ← UPDATE 대상 고정
        3) 세부 비교 (equalsAll):
             if 전체 필드 동일:
                 if 휴폐업 정보가 NULL:
                     → STORE_TAX_TYPE_IS_NULL
                 else if approval_dt 시간만 다름:
                     → UPDATED (휴폐업 정보 보존)
                 else:
                     → DO_NOTHING
             else (필드 차이 있음):
                 if storeBizId 바뀜:
                     → UPDATED_STORE_BIZ_ID
                 else:
                     → UPDATED (휴폐업 정보 보존)
```

이중 루프 (O(N × M)) 구조인데, 카드 1장의 한 수집 주기 데이터가 수십~수백 건 수준이라 nested loop 로 충분하다. 수만 건 규모가 되면 Map 기반 O(N+M) 로 재작성이 필요하지만 현재 스케일에서는 오히려 nested loop 가 메모리 효율이 더 좋을 수 있다.

###### 매칭 기준 — 자연 키 4개 필드

`temp.equalsByApprovalNumAndDTAndAmountAndType(old)` 메소드가 비교하는 건 **단 4개 필드**.

| 필드 | 의미 | 비교 방식 |
|------|------|----------|
| `approvalNum` | 승인번호 | 문자열 정확히 일치 |
| `approvalDT` | 승인 일시 | **날짜만 비교** (시간 부분 무시) |
| `approvalAmount` | 승인 금액 | 숫자 정확히 일치 |
| `approvalType` | 승인 유형 (APPROVAL/CANCEL/PARTIAL_CANCEL/REJECT 등) | enum 일치 |

> ⚠ `approval_histories` 테이블에 `approval_key` 컬럼이 있지만 실제 매칭에는 **사용하지 않는다**. 코드 주석도 `"승인유형, 승인번호, 승인일자(시간제외), 승인금액 비교"` 라고 명시.

**왜 날짜만 비교하고 시간은 무시하나?** 외부 API 가 동일 거래를 미세하게 다른 시각으로 돌려줄 때가 있다 (앞서 설명한 "변덕 2"). 시간까지 엄격히 비교하면 매칭 실패 → NEW + REMOVED 로 중복 분류되어 정합성이 깨진다. "같은 날의 같은 승인번호 + 같은 금액 + 같은 유형" 이면 같은 거래로 간주하는 게 현실적.

**왜 `approvalType` 을 자연 키에 포함시켰나?** 이게 Phase 3 cross-match 가 동작하는 전제 조건이다. `approvalType` 을 키에 포함시키면 "승인 → 취소" 전환이 Phase 1 에서 매칭 실패 → Phase 2 에서 REMOVED 후보가 되고, Phase 3 가 "NEW + REMOVED 가 사실 같은 거래" 임을 찾아낼 수 있다. 만약 자연 키에서 `approvalType` 을 빼버리면 전환 케이스가 단순 UPDATE 로 잡혀버리고, Phase 3 자체가 불필요해진다. 설계자가 의도적으로 키에 포함시킨 것.

###### 매칭 실패 시 — `NEW`

```
if (matched == null) {
    temp.setCompareResult(NEW);
}
```

가장 단순한 케이스. temp 에만 있고 olds 에 대응하는 게 없으면 새 거래로 분류. 나중에 **Writer 7 이 본 테이블에 INSERT**.

단, 이 `NEW` 판정은 **"최종" 이 아니다**. Phase 3 에서 REMOVED 와 교차 매칭되면 UPDATED 로 재분류될 수 있다 (승인유형 전환 감지). Phase 1 의 결과는 잠정 판정.

###### 매칭 성공 시 — 공통 준비 2가지

매칭이 되면 바로 세부 분기로 가기 전에 **두 가지 부수 작업** 을 먼저 한다.

**(1) olds 에서 matched 제거 — Phase 2 의 복선**

```java
integrateQueue.getOlds().remove(matched);
```

매칭된 항목을 즉시 olds 리스트에서 빼낸다. 이유는 **Phase 2 에서 "olds 에 남아있는 것 = 삭제된 것"** 으로 판정하기 때문. Phase 1 이 끝나는 시점에

- 매칭된 olds → Phase 1 이 처리 완료
- 매칭 안 된 olds → Phase 2 에서 `REMOVED` 로 분류

이렇게 책임이 분리된다. 이 패턴은 "**set difference via consumption**" — 소진 방식으로 차집합을 구하는 기법이다.

**(2) seq 주입 — UPDATE 대상 고정**

```java
temp.setApprovalHistorySeq(matched.getApprovalHistorySeq());
```

`temp` 는 방금 외부 API 에서 받은 데이터라서 `approval_history_seq` 가 없다 (본 테이블에 아직 없으니까). 여기서 매칭된 old 의 seq 를 temp 에 주입하면, 나중에 Writer 6 이 UPDATE 할 때 **"어느 row 를 UPDATE 할지"** 가 확정된다.

```sql
UPDATE approval_histories
   SET (필드들) = (새 값들)
 WHERE approval_history_seq = #{seq};   -- ← 여기서 사용됨
```

이 seq 주입이 **이력 연속성** 의 핵심이다. DELETE + INSERT 로 처리하면 seq 가 바뀌어 외부 시스템 참조가 깨지지만, 기존 seq 유지 UPDATE 는 감사 로그와 외부 참조를 모두 보존.

###### 매칭 성공 시 — 5가지 세부 분기

공통 준비가 끝나면 `equalsAll` (전체 필드 비교) 를 기준으로 트리 분기가 시작된다.

**분기 1 — 전체 동일 + 휴폐업 NULL → `STORE_TAX_TYPE_IS_NULL`**

데이터 자체는 완전 동일한데 `storeCompanyType` 또는 `storeCompanyTaxType` 이 NULL 인 경우. 휴폐업 정보는 **외부 사내 API** (`KnetApiService.getClosedInfo`) 로 채우는 부가 정보인데, 과거에 해당 API 호출이 실패했거나 조회 대상이 아니었을 때 NULL 로 남는다.

→ **본 테이블 UPDATE 는 안 함**. 대신 Writer 4 (CollectStoreTaxType) 가 이 분류에 해당하는 건들의 `storeBizId` 만 배치로 추려서 휴폐업 API 를 호출해 NULL 을 채워 넣는다.

**분기 2 — 전체 동일 + 시간만 다름 → `UPDATED` (시간 보정)**

`equalsAll` 은 날짜까지만 비교하고, `getApprovalDT().equals()` 는 시간까지 비교한다. 즉 "날짜는 같은데 시간은 다른" 케이스 감지. 이 시간 값을 본 테이블에 반영해서 최신 데이터 유지.

**중요한 점**: 이 분기에서 **기존 old 의 휴폐업 정보를 temp 에 복사** 한다.

```java
temp.setStoreCompanyType(matched.getStoreCompanyType());
temp.setStoreCompanyTaxType(matched.getStoreCompanyTaxType());
```

왜냐면 temp 는 외부 API 에서 방금 받은 데이터라 휴폐업 필드가 NULL. 이걸 그대로 UPDATE 하면 본 테이블의 기존 휴폐업 정보가 **NULL 로 덮어써져 사라진다**. 휴폐업 조회는 외부 API 호출이라 **비용이 비싼데**, 한 번 조회한 값을 불필요하게 날려버리면 다음 수집에서 재호출해야 해서 낭비. 이 복사 로직이 **비용 최적화** 의 핵심.

**분기 3 — 완전 동일 → `DO_NOTHING`** ⭐ (가장 중요)

모든 필드가 완전히 같고 휴폐업 정보도 채워져 있음. **변화 전혀 없음**.

→ **아무 SQL 도 실행하지 않는다**. Writer 6 이 순회할 때 이 분류를 그냥 건너뜀.

**왜 이게 가장 중요한 분기냐?** 외부 API 응답의 **대부분이 사실 변화 없는 데이터** 이기 때문이다. 매 수집마다 최근 3일치를 긁어오는데, 그 3일치 중 오늘의 신규 건 몇 개만 빼면 대부분 어제/그제 이미 본 테이블에 있는 동일 데이터. 이걸 매번 UPDATE 하면 **쓸데없는 DB I/O 가 폭발** 한다. 카드 수천 장 × 하루 수십 건 × 매 수집 주기 = 초당 수백~수천 건의 의미없는 UPDATE.

`DO_NOTHING` 분류는 **"변화 없는 건 그냥 놔둬" 원칙** 의 구현체. 이게 없으면 DB 부하가 몇 배로 늘어난다.

**분기 4 — 필드 차이 + 사업자번호 변경 → `UPDATED_STORE_BIZ_ID`**

필드가 바뀌었는데 특히 `storeBizId` 가 바뀐 경우. 사업자번호가 바뀌면 **"다른 가맹점"** 이 되어버려서, 기존에 조회해둔 휴폐업 정보는 **옛 사업자번호 기준** 이라 무효.

→ Writer 4 가 이 분류의 레코드들을 모아서 휴폐업 API 를 **재조회**. 주의할 점은 **기존 휴폐업 정보를 복사하지 않는다** — 어차피 재조회해서 덮어쓸 거니까.

**분기 5 — 필드 차이 + 사업자번호 그대로 → `UPDATED` (일반)**

필드가 바뀌었지만 사업자번호는 그대로. 예를 들어 금액이 변경되거나 할부 정보가 바뀐 경우. 일반 UPDATE 를 실행하되, 휴폐업 정보는 **기존 값 복사** (사업자번호가 안 바뀌었으니 기존 휴폐업도 여전히 유효).

###### 5가지 분기 한눈에

| CompareResult | 전체 필드 | `approvalDT` 시간 | `storeCompanyType` | `storeBizId` | 처리 |
|---|---|---|---|---|---|
| **`DO_NOTHING`** | 동일 | 동일 | 채워져 있음 | 동일 | 아무 작업 안 함 ⭐ |
| **`STORE_TAX_TYPE_IS_NULL`** | 동일 | 동일 | **NULL** | 동일 | Writer 4 가 휴폐업 보강 |
| **`UPDATED` (시간만)** | 동일 | **다름** | 채워져 있음 | 동일 | UPDATE + 기존 휴폐업 보존 |
| **`UPDATED_STORE_BIZ_ID`** | 차이 있음 | - | - | **변경** | UPDATE + Writer 4 가 휴폐업 **재조회** |
| **`UPDATED` (일반)** | 차이 있음 | - | - | 동일 | UPDATE + 기존 휴폐업 보존 |

###### Phase 1 의 3가지 설계 의도

Phase 1 을 끝까지 파보면 세 가지 설계 의도가 드러난다.

1. **변화 없는 건은 절대 건드리지 않는다** — `DO_NOTHING` 분류로 대다수의 "이미 본 건" 을 걸러냄. 쓸데없는 UPDATE 방지로 DB 부하 최소화.

2. **비싼 외부 API 호출을 최소화한다** — 휴폐업 API 호출은 네트워크 비용이 크다. 이미 조회한 값을 **최대한 재활용** 하려고 (1) 매칭된 건의 기존 휴폐업 정보를 temp 에 복사해서 덮어쓰기 방지, (2) 실제 재조회가 필요한 건만 `UPDATED_STORE_BIZ_ID` / `STORE_TAX_TYPE_IS_NULL` 로 좁힘, (3) Writer 4 가 이 두 분류만 **배치 조회** 로 처리.

3. **이력 연속성을 보존한다** — 매칭된 건은 기존 `approval_history_seq` 를 유지한 채 UPDATE. 그래서 (1) `_updated` 테이블에 "변경 전 → 변경 후" 이력이 연속적으로 추적되고, (2) 동일 거래가 DB 상에서 여러 번 INSERT 되어 데이터가 뒤죽박죽되지 않고, (3) 외부 시스템이 이 seq 를 참조하고 있어도 깨지지 않는다.

###### Day 2 시나리오에서 Phase 1 루프 돌아가는 모습

이 시나리오의 Day 2 데이터로 Phase 1 루프가 실제로 어떻게 돌아가는지 한 번 따라가보면

```
temps: [A001(CANCEL/15000), A003(APPROVAL/22000), A004(APPROVAL/4500)]
olds:  [A001(APPROVAL/15000), A002(APPROVAL/8500), A003(APPROVAL/22000)]
```

**1회 루프 — temp = A001 (CANCEL)**
- inner: A001(APPROVAL) → `approvalType` 다름 → 매칭 실패
- inner: A002 → `approvalNum` 다름 → 실패
- inner: A003 → `approvalNum` 다름 → 실패
- 매칭 없음 → **A001 → NEW**
- olds: `[A001, A002, A003]` (변화 없음)

**2회 루프 — temp = A003 (APPROVAL)**
- inner: A001 → 실패
- inner: A002 → 실패
- inner: A003 → **자연 키 4개 모두 일치** → matched = A003, break
- `olds.remove(A003)` 실행
- `equalsAll` 체크 → 전체 동일 → `storeCompanyType` 채워져 있고 시간도 동일
- **A003 → DO_NOTHING**
- olds: `[A001, A002]` ← A003 제거됨

**3회 루프 — temp = A004 (APPROVAL)**
- inner: A001 → 실패
- inner: A002 → 실패
- 매칭 없음 → **A004 → NEW**
- olds: `[A001, A002]` (변화 없음)

**Phase 1 종료 시점 상태**
- temps 분류: `[A001/NEW, A003/DO_NOTHING, A004/NEW]`
- olds 잔여: `[A001(APPROVAL), A002(APPROVAL)]` ← **Phase 2 에서 REMOVED 로 분류될 예정**

###### Phase 1 결정 트리 (시각화)

```
temp 하나
  │
  ▼
olds 순회하며 자연 키 매칭 시도
  │
  ├─ 매칭 실패 ──────────────────────────────────▶ NEW
  │                                               (Phase 3 에서 REMOVED 와 cross-match 될 수 있음)
  │
  └─ 매칭 성공
       │
       ├─ olds 에서 제거 (Phase 2 복선)
       ├─ seq 주입
       │
       ▼
     equalsAll?
       │
       ├─ 전체 동일
       │   │
       │   ├─ storeCompanyType NULL?
       │   │   └─ Yes ─────────────────────────▶ STORE_TAX_TYPE_IS_NULL
       │   │                                      (Writer 4 가 휴폐업 보강)
       │   │
       │   └─ No
       │       │
       │       ├─ approvalDT 시간만 다름? ─────▶ UPDATED (시간 보정)
       │       │                                  (기존 휴폐업 보존)
       │       │
       │       └─ 완전 동일 ───────────────────▶ DO_NOTHING
       │                                          (아무 SQL 실행 안 함)
       │
       └─ 필드 차이 있음
           │
           ├─ storeBizId 바뀜? ────────────────▶ UPDATED_STORE_BIZ_ID
           │                                      (Writer 4 가 휴폐업 재조회)
           │
           └─ storeBizId 그대로 ────────────────▶ UPDATED (일반)
                                                  (기존 휴폐업 보존)
```

###### Phase 1 한 문장 요약

> **"temp 를 하나씩 꺼내 olds 와 자연 키로 매칭을 시도하고, 매칭 성공 시에는 세부 비교를 통해 5가지 하위 분류로 나누어 이후 Writer 들이 각자 최소한의 작업만 하도록 미리 분류하는 단계"** 다. 단순한 "같은지 다른지" 가 아니라 **"UPDATE 할지 / 안 할지 / 휴폐업만 보강할지 / 휴폐업까지 재조회할지"** 를 미리 정해두는 **작업 디스패처** 역할.

##### Phase 2 — 삭제 건 추출

Phase 1 이 끝난 뒤 olds 에 남아 있는 레코드 = temp 에서 매칭되지 않은 기존 건 = **삭제된 건**.
전부 `REMOVED` 로 마킹 후 temps 리스트에 합친다 (한 리스트로 통합 처리하려고).

##### Phase 3 — 승인유형 전환 Cross-Match ⭐ (중복 처리의 핵심)

Phase 1·2 만으로는 아래 케이스를 처리하지 못한다.

> Day 1: 외부 API 응답 `"승인번호 A001, 10000원, 승인"` → 본 테이블 저장
> Day 2: 외부 API 응답 `"승인번호 A001, 10000원, 취소"` 로 내려옴

Phase 1 에서 자연 키에 `approvalType` 이 포함되므로 **매칭 실패** → `NEW` 로 분류.
Phase 2 에서 기존 "승인" 건은 olds 에 남음 → `REMOVED` 로 분류.

즉 **같은 거래 한 건이 "NEW + REMOVED" 두 개로 중복 분류** 되어 버린다. 이대로 두면
- 본 테이블: 기존 "승인" 건 DELETE, 새 "취소" 건 INSERT (**새 `approval_history_seq`**)
- `_removed`: 기존 "승인" 건 스냅샷 저장
- **결과: 같은 거래가 DB 상 다른 레코드로 치환되고 이력 추적이 끊긴다**

Phase 3 는 이걸 고친다. **NEW 목록과 REMOVED 목록을 cross-match 해서 "같은 거래의 유형 전환" 을 찾아내고 단일 UPDATE 로 병합**:

```java
for (newly : news) {
    for (deleting : deleted) {
        switch (newly.getApprovalType()) {
            case APPROVAL:      // 승인(신규) ↔ 취소/거절/부분취소(기존)
            case CANCEL:        // 취소(신규) ↔ 승인/거절/부분취소(기존)
            case PARTIAL_CANCEL:// 부분취소(신규) ↔ 승인/부분취소/취소/거절(기존)
            case REJECT:        // 거절(신규) ↔ 승인/취소/부분취소(기존)
        }
    }
    if (matched) {
        // ⭐ 기존 approval_history_seq 유지한 채 UPDATE 로 전환
        newly.setApprovalHistorySeq(matched.getApprovalHistorySeq());
        newly.setCompareResult(UPDATED);
    }
}
```

**효과**:
- NEW + REMOVED 두 건으로 잡힌 것 → 하나의 `UPDATED` 로 병합
- 기존 `approval_history_seq` 유지 → 이력 연속성 보존
- DELETE + INSERT 가 아니라 UPDATE + `_updated` 로 "변경 이력" 기록

> 코드 주석에 **(정상)** / **(버그)** 표기가 섞여 있는데, (버그) 는 외부 API 가 비정상적인 상태 전환을 보내는 케이스를 "그래도 매칭해주자" 로 **관대하게 수용** 하는 것이다. 대표 케이스

| 전환 | 분류 |
|------|------|
| 취소 ← 승인 (금액 동일) | **정상** — 가장 흔함 |
| 부분취소 ← 승인 (날짜·번호 일치) | **정상** |
| 부분취소 ← 부분취소 (금액만 다름) | **정상** — 할부 추가 취소 |
| 승인 ← 취소/거절 | (버그 수용) |
| 거절 ← 승인 | (버그 수용) |

이 관대함은 **외부 API 의 변덕을 시스템이 흡수** 하겠다는 설계 결단이다.

#### 5번 — DELETE 처리 (REMOVED)

```java
for (partition : Lists.partition(removed, 50)) {
    registerApprovalHistoriesRemoved(partition);  // _removed INSERT
    deleteApprovalHistories(partition);           // 본 테이블 DELETE
}
```

흥미로운 점: `_removed` INSERT 쿼리는 애플리케이션 값이 아니라 **본 테이블에서 직접 SELECT 해서 복사** 한다.

```sql
INSERT INTO approval_histories_removed (...)
SELECT ..., CURRENT_TIMESTAMP
FROM approval_histories
WHERE approval_history_seq IN (...)
```

애플리케이션 메모리의 값을 신뢰하지 않고 DB 를 원천으로 삼는 방식. "DB 에 있는 그대로의 상태" 가 스냅샷으로 남는다.

#### 6번 — UPDATE 처리 (UPDATED)

```java
for (partition : Lists.partition(updated, 50)) {
    registerApprovalHistoriesUpdated(partition);  // _updated INSERT (변경 전)
    for (ah : partition) {
        updateApprovalHistory(ah);                 // 본 테이블 UPDATE (변경 후)
    }
}
```

**순서가 중요**: `_updated` INSERT 가 먼저. 반대로 하면 변경 전 값을 잃어버린다. `_updated` 도 `INSERT ... SELECT FROM approval_histories` 로 현재 본 테이블 값을 복사한 뒤, 그 다음 줄에서 본 테이블을 덮어쓴다.

#### 7번 — INSERT 처리 (NEW)

```java
List<Long> seqs = mapper.getApprovalHistorySeqs(count);  // 시퀀스 한 번에 뭉치로
for (int i = 0; i < count; i++) {
    approvalHistories.get(i).setApprovalHistorySeq(seqs.get(i));
}
mapper.registerApprovalHistories(approvalHistories);
```

시퀀스를 한 번에 받는 쿼리:

```sql
SELECT NEXTVAL('approval_histories_approval_history_seq_seq')
FROM GENERATE_SERIES(1, #{count})
```

50번 개별 INSERT + `RETURNING` 보다 훨씬 효율적.

#### 5 → 6 → 7 순서의 의미

**DELETE → UPDATE → INSERT** 순서로 실행된다. 만약 로직 버그로 같은 `approval_history_seq` 가 중복 분류되는 사고가 나도, 이 순서면 UPDATE 가 살아남는다. 방어적 순서.

#### 핵심 인사이트

- **매칭 기준은 `approval_key` 가 아니라 자연 키 4개 필드 조합**
- Compare 는 `NEW` / `UPDATED` / `UPDATED_STORE_BIZ_ID` / `STORE_TAX_TYPE_IS_NULL` / `DO_NOTHING` / `REMOVED` 6가지로 분류
- **Phase 3 cross-match** 가 "같은 거래의 유형 전환" 을 하나의 UPDATE 로 병합
- **0건 수집 방어 로직** 이 API 장애 시 기존 데이터를 보호

#### 시나리오로 따라가기 — temp 에 쌓인 3건이 본 테이블로 넘어가는 과정

**전제 조건** (5.3 CollectJob 시나리오 이어서)

- **시각**: 2026-04-13 (월) 오전 10:00:10 → IntegrateJob 트리거 (cron 5초)
- CollectJob 이 10:00:08 에 끝났고, `integrate_queues` 에 신호 2001 이 적재된 상태
- card 102 는 **최초 수집** 이라 `approval_histories` 본 테이블에 기존 데이터 **0건**
- 따라서 Compare 로직이 전부 `NEW` 로 분류되는 **가장 단순한 케이스** — Phase 3 cross-match 가 발동되는 복잡한 케이스는 6장 Day 2 시나리오 참고

##### Before — 관련 테이블 상태

`integrate_queues`

| integrate_queue_seq | collect_queue_seq | card_seq | start_date | end_date | in_progress |
|---|---|---|---|---|---|
| **2001** | 3003 | 102 | 2026-04-10 | 2026-04-13 | false |

`approval_histories_temp`

| temp_seq | collect_queue_seq | card_seq | approval_num | approval_type | approval_dt | amount |
|---|---|---|---|---|---|---|
| 5001 | 3003 | 102 | A001 | APPROVAL | 2026-04-11 12:30 | 15000 |
| 5002 | 3003 | 102 | A002 | APPROVAL | 2026-04-11 18:45 | 8500  |
| 5003 | 3003 | 102 | A003 | APPROVAL | 2026-04-12 10:15 | 22000 |

`approval_histories` (card 102 관련)

**비어있음** (최초 수집이라 아직 본 테이블에 데이터 없음)

##### Step 0 — Reader

IntegrateJob 매퍼의 SQL 이 `DISTINCT ON (card_seq) + FOR UPDATE SKIP LOCKED` 로 2001 을 집어감.

```
Reader: IntegrateQueue {2001, collect_queue_seq=3003, card_seq=102,
                       cardNum=****-****-****-1234, 2026-04-10 ~ 2026-04-13}
```

##### Step 1 — Writer 1: 큐 락

```sql
UPDATE integrate_queues SET in_progress = true
 WHERE integrate_queue_seq = 2001
```

##### Step 2 — Writer 2: temp + 본 테이블 읽기 + 0건 방어

```java
collectStartDT = integrateJobService.getCollectStartDT(3003);
// → '2026-04-13 10:00:05' (CollectJob 시작 시각, collect_logs 에서 조회)

temps = getApprovalHistoryTemps(3003);
// → [5001/A001, 5002/A002, 5003/A003]  (3건)

olds  = getApprovalHistories(102, 2026-04-10 00:00, 2026-04-13 23:59);
// → []  (최초 수집이라 0건)

// 0건 방어 체크: temps.isEmpty() && !olds.isEmpty() ? → (false && true) = false
// 방어 로직 발동 안 함, 정상 진행
integrateQueue.setTemps(temps);
integrateQueue.setOlds(olds);
```

###### 잠깐 — `temps` 와 `olds` 가 각각 뭐지?

Compare 로직을 이해하려면 이 두 변수의 정체를 먼저 알아야 한다.

| 변수 | 출처 테이블 | 의미 | 언제 저장됨 |
|------|------------|------|------------|
| **`temps`** | `approval_histories_temp` | **방금 수집한 새 데이터** | 직전 CollectJob 의 Writer 4 가 INSERT |
| **`olds`** | `approval_histories` (본 테이블) | **이미 DB 에 쌓여 있는 기존 데이터** | 과거 IntegrateJob 들이 누적해온 본 테이블 기록 |

`olds` 를 가져오는 쿼리는 **두 조건으로 좁혀서** 본 테이블을 읽는다.

```sql
SELECT *
FROM approval_histories
WHERE card_seq    = #{cardSeq}                      -- 이번에 처리 중인 그 카드만
  AND approval_dt BETWEEN #{startDT} AND #{endDT}   -- 이번 수집 기간 안의 것만
```

- **`card_seq` 일치**: 다른 카드 데이터는 섞일 수가 없음
- **`approval_dt` 기간 필터**: 이번 수집이 다룬 구간 바깥의 과거 데이터는 비교할 이유 없음. 전체 본 테이블을 다 가져오면 오래된 카드는 수만~수십만 건이라 메모리 폭발

즉 **"이번 수집 범위와 겹치는 기존 데이터만"** 정확히 꺼내와서 비교 대상으로 쓴다. 이번 수집 범위 밖은 건드리지 않음.

###### 왜 `olds` 가 필요한가 — `temps` 하나만으로는 부족한 이유

IntegrateJob 의 목적은 **"방금 받은 데이터"** 와 **"이미 저장된 데이터"** 를 비교해서

- 새로 등장한 거래 → INSERT (`NEW`)
- 기존 거래가 변경 → UPDATE (`UPDATED`)
- 기존 거래가 응답에서 사라짐 → DELETE (`REMOVED`)
- 변화 없음 → 아무 작업 없음 (`DO_NOTHING`)

이렇게 4가지로 분류하는 것. 이 분류를 하려면 **"기존에 뭐가 있었는지"** 를 알아야 한다. `olds` 가 바로 그 "기존" 이다.

**특히 `REMOVED` 감지는 `olds` 없이는 불가능**하다. "오늘 응답에 없다" 는 사실을 알려면 "어제까지 있었는데 이제 없음" 이라는 비교가 필요한데, 그 "어제까지 있었던 목록" 이 `olds` 이기 때문.

###### Day 1 vs Day 2 로 보는 `olds` 의 역할

**Day 1 — 최초 수집**

```
temps: [A001, A002, A003]            ← 방금 수집
olds:  []                             ← 본 테이블 비어있음 (첫 수집이라서)
```

- `olds` 가 비어있어서 Compare Phase 1/2/3 모두 사실상 no-op
- 모든 `temps` 가 `NEW` 로 분류 → 본 테이블에 3건 신규 INSERT

**Day 2 — 재수집**

```
temps: [A001(CANCEL), A003, A004]              ← 방금 수집
olds:  [A001(APPROVAL), A002, A003]            ← Day 1 에서 저장된 본 테이블 데이터
```

- `A001`: 양쪽 존재, `approvalType` 다름 → Phase 3 cross-match → **UPDATED**
- `A002`: `olds` 에만 있음 → Phase 2 → **REMOVED**
- `A003`: 양쪽 동일 → **DO_NOTHING**
- `A004`: `temps` 에만 있음 → Phase 1 → **NEW**

**만약 `olds` 가 없었다면** A002 가 사라진 걸 감지할 방법이 없고, A001 의 "승인→취소 전환" 도 "전혀 새로운 거래" 로 오인되어 이력 연속성이 끊긴다.

###### 그림으로 정리

```
[외부 API 응답]  ──── CollectJob ────▶  approval_histories_temp
                                              │
                                              │ IntegrateJob 이 읽음
                                              ▼
                                            ┌─────┐
                                            │temps│  "방금 도착한 따끈한 데이터"
                                            └─────┘
                                              │
                                              │ Compare 로직의 입력 1
                                              │
approval_histories  ──── IntegrateJob 이 읽음 ─┼── Compare 로직의 입력 2
    (본 테이블)                                │
                                              ▼
                                            ┌────┐
                                            │olds│   "기존에 쌓여있던 누적 데이터"
                                            └────┘
                                              │
                                              ▼
                                   (NEW/UPDATED/REMOVED/DO_NOTHING 분류)
```

`temps` 는 **Collect 단계의 산물**, `olds` 는 **Integrate 단계가 자기 책상에 이미 있는 재고 목록을 꺼내온 것** 이라고 보면 된다. 그 둘을 맞춰봐서 "뭐가 새로 들어왔고, 뭐가 변했고, 뭐가 사라졌는지" 판단하는 게 IntegrateJob 의 일.

##### Step 3 — Writer 3: ⭐ Compare 로직 (3단계)

```java
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1: temp 순회하며 olds 매칭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
for (temp : [A001, A002, A003]) {
    for (old : []) { /* olds 가 비어있음 */ }
    // 매칭 없음 → 모두 NEW
    temp.setCompareResult(NEW);
}

// Phase 1 종료 상태:
//   temps: [A001/NEW, A002/NEW, A003/NEW]
//   olds:  []

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: olds 에 남은 건 REMOVED 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
for (removed : []) { /* 없음 */ }
// 아무 변화 없음

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: NEW + REMOVED cross-match (유형 전환 감지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
news    = [A001, A002, A003]  (NEW 필터)
deleted = []                   (REMOVED 필터 — 없음)

for (newly : news) {
    for (deleting : []) { /* 없음 */ }
    // cross-match 없음 → 분류 그대로 유지
}

// 최종 분류
//   A001 → NEW
//   A002 → NEW
//   A003 → NEW
```

> 💡 **최초 수집의 단순함**: 본 테이블이 비어있으니 Compare 가 사실상 "모두 NEW" 로 끝난다. Phase 1 의 매칭 루프는 inner loop 이 0회 → 바로 else 분기로 빠지고, Phase 2·3 도 빈 리스트라 no-op. 재미있는 비교 로직은 Day 2 재수집부터 나온다.

##### Step 4 — Writer 4: CollectStoreTaxType (가맹점 과세유형 외부 조회)

```java
// NEW / UPDATED_STORE_BIZ_ID / STORE_TAX_TYPE_IS_NULL 이면서
// storeBizId 가 10자리 숫자인 것만 필터
targets = temps.filter(NEW && validBizId);  // 3건

bizIds = ['1234567890', '2345678901', '3456789012'];  // 예시
closedInfoMap = apiService.getClosedInfo(bizIds);
// → 외부 휴폐업 조회 API 호출

for (ah : targets) {
    ah.setStoreCompanyType(closedInfoMap.get(ah.storeBizId).getCompanyType());
    ah.setStoreCompanyTaxType(closedInfoMap.get(ah.storeBizId).getCompanyTaxType());
}
```

> 💡 이 writer 는 별개의 사내 API (휴폐업/과세유형 조회) 를 호출한다. 외부 스크래핑 벤더와는 다른 시스템.

##### Step 5 — Writer 5: DeleteRemovedApprovalHistories

- **처리 대상**: `removedApprovalHistories` (REMOVED 분류)
- **현재**: 빈 리스트 → `if (removedApprovalHistories.isEmpty())` 걸려서 early return
- 로그: `"삭제 : ... / deleteCount=0"`

##### Step 6 — Writer 6: UpdateExistingApprovalHistories

- **처리 대상**: `updatedApprovalHistories` (UPDATED 분류)
- **현재**: 빈 리스트 → early return
- 로그: `"수정 : ... / updateCount=0"`

##### Step 7 — Writer 7: RegisterNewApprovalHistories — 실제 INSERT

```java
// 시퀀스 3개 한 번에 가져오기
seqs = mapper.getApprovalHistorySeqs(3);  // [7001, 7002, 7003]
for (i : 0..2) {
    approvalHistories.get(i).setApprovalHistorySeq(seqs.get(i));
}
mapper.registerApprovalHistories(approvalHistories);
```

```sql
-- 시퀀스 뭉치 조회
SELECT NEXTVAL('approval_histories_approval_history_seq_seq')
FROM GENERATE_SERIES(1, 3);
-- → [7001, 7002, 7003]

-- 본 테이블 INSERT
INSERT INTO approval_histories (
    approval_history_seq, card_seq,
    approval_num, approval_type, approval_dt, approval_amount,
    store_num, store_biz_id, store_name, ..., collect_dt, insert_dt
) VALUES
    (7001, 102, 'A001', 'APPROVAL', '2026-04-11 12:30', 15000, ..., '2026-04-13 10:00:05', NOW()),
    (7002, 102, 'A002', 'APPROVAL', '2026-04-11 18:45', 8500,  ..., '2026-04-13 10:00:05', NOW()),
    (7003, 102, 'A003', 'APPROVAL', '2026-04-12 10:15', 22000, ..., '2026-04-13 10:00:05', NOW());
```

##### Step 8 — Writer 8: DeleteIntegrateQueue

```sql
DELETE FROM integrate_queues WHERE integrate_queue_seq = 2001;
```

##### Step 9 — Writer 9: DeleteApprovalHistoriesTemp

```sql
DELETE FROM approval_histories_temp WHERE collect_queue_seq = 3003;
-- → temp_seq 5001, 5002, 5003 삭제
```

> 💡 temp 는 **원장이 아니라 버퍼**. 통합이 끝나면 즉시 청소해서 테이블이 무한정 커지지 않게 한다.

##### Step 10 — Writer 10: UpdateCollectResult

```sql
UPDATE cards
   SET latest_collect_end_dt   = '2026-04-13 10:00:12',  -- 통합 종료 시각
       latest_collect_duration = 7000,                    -- CollectJob 시작부터 총 7초
       latest_register_count   = 3,  -- 신규 건수
       latest_update_count     = 0,
       latest_delete_count     = 0
 WHERE card_seq = 102;
```

> 💡 **"건수" 3종** (`latest_register_count` / `latest_update_count` / `latest_delete_count`) 는 CollectJob 시점에는 알 수 없는 정보. Compare 로직이 끝난 IntegrateJob 시점에야 분류 결과가 확정되므로 여기서 뒤늦게 채워넣는 것.

##### Step 11 — Writer 11: UpdateCollectLog

```sql
UPDATE collect_logs
   SET collect_end_dt   = cards.latest_collect_end_dt,
       collect_duration = cards.latest_collect_duration,
       register_count   = 3,
       update_count     = 0,
       delete_count     = 0
  FROM cards
 WHERE cards.card_seq = collect_logs.card_seq
   AND collect_logs.collect_log_seq = 10001;
```

CollectJob 이 writer 7 에서 만든 `collect_log_seq=10001` 레코드를 업데이트해서 신규/변경/삭제 건수를 뒤늦게 보정한다.

##### Step 12 — Writer 12: Logger

```
INFO  통합완료 : integrateQueueSeq=2001, cardSeq=102,
                 registerCount=3, updateCount=0, deleteCount=0
```

##### After — 실행 후 테이블 상태

| 테이블 | 변화 |
|---|---|
| `approval_histories` | **+3 rows** (seq 7001~7003) — 최종 본 테이블에 도착 |
| `approval_histories_updated` | 변화 없음 (UPDATED 0건) |
| `approval_histories_removed` | 변화 없음 (REMOVED 0건) |
| `approval_histories_temp` | **-3 rows** (temp_seq 5001~5003 DELETE) |
| `integrate_queues` | **-1 row** (2001 DELETE) |
| `cards` | card_seq=102 UPDATE (`latest_register_count=3` 등) |
| `collect_logs` | collect_log_seq=10001 UPDATE (건수 보정) |

**이제 사용자가 `GET /api/approval-histories?cardSeq=102` 호출하면 7001, 7002, 7003 세 건이 조회된다.**

##### 시나리오에서 배울 점

| 관찰 | 왜 중요한가 |
|---|---|
| **최초 수집은 Compare 가 단순함** | olds 가 비어있으니 Phase 1/2/3 모두 no-op 에 가깝고, 전부 NEW 로 INSERT. 재미있는 비교 로직은 Day 2 재수집부터 |
| **writer 5·6 (DELETE·UPDATE) 는 빈 리스트면 early return** | "대상이 없는 경우" 를 if 체크로 걸러내서 SQL 실행 자체를 스킵. 불필요한 DB 호출 방지 |
| **writer 10·11 (건수 보정)** | CollectJob 시점에는 `collect_count=3` (수집된 건수) 만 알 수 있고, `register/update/delete_count` 는 IntegrateJob 이 끝나야 확정됨. 분산된 정보를 뒤늦게 이어붙이는 패턴 |
| **temp DELETE 는 통합 완료 직후** | temp 는 버퍼이므로 보관 가치 없음. integrate_queues DELETE 와 같이 묶어서 "작업 끝났음" 을 물리적으로 표현 |
| **더 복잡한 케이스는 6장 Day 2 참고** | 이 시나리오 (최초 수집) 는 Compare 의 Phase 3 cross-match 가 동작하지 않는다. 승인→취소 전환 같은 핵심 케이스는 6장 Day 2 시나리오에서 자세히 다룬다 |

#### 왜 대량 처리는 50개씩 나누나 — 배치 사이즈 관례

CollectJob (`InsertApprovalHistoryTemps`) 과 IntegrateJob (`DeleteRemoved` / `UpdateExisting` / `RegisterNew`) 모두 처리 대상을 **50개씩 파티션으로 쪼개서** 반복 처리한다. 왜 통째로 한 번에 INSERT/DELETE 하지 않고 50개씩 나눌까?

##### 이유 1 — DB 드라이버의 기술적 한계

한 번의 SQL 문에 담을 수 있는 데이터는 무한하지 않다.

- **PostgreSQL 파라미터 상한** — 한 쿼리당 최대 65,535개 바인딩 파라미터. `approval_histories_temp` 는 컬럼이 약 30개라서, 이론상 2,000 row 근처에서 한계에 걸린다. 50 × 30 = 1,500 파라미터라 **한계의 2% 수준** 으로 매우 안전한 여유.
- **SQL 문자열 크기** — MyBatis `<foreach>` 가 `INSERT ... VALUES (...), (...), ...` 형태로 거대한 문자열을 JVM heap 에 만드는데, N 이 크면 메모리 압박 발생. 50개면 SQL 문자열이 수 KB 수준.
- **네트워크 패킷** — 작은 배치는 JDBC 드라이버의 전송 버퍼 (수십 KB) 안에 들어가서 왕복 지연이 적다.

한 카드가 과거 6개월치를 한 번에 긁어오면 **수천 건**이 나올 수 있어서, 분할 없이 INSERT 하면 이 한계들에 부딪힌다.

##### 이유 2 — 성능 균형점

극단적인 두 전략을 비교하면 50개씩 배치가 왜 스윗 스팟인지 보인다.

| 전략 | 장점 | 단점 |
|------|------|------|
| **1건씩 개별 INSERT** | 메모리 가볍고, 실패 영향 작음 | 네트워크 왕복이 건수만큼 → **매우 느림** |
| **전체를 한 번에 INSERT** | 네트워크 왕복 1번 → 최대 성능 | 파라미터/메모리 한계, 실패 시 **전체 롤백**, lock 장기 유지 |
| **50개씩 배치** ⭐ | 왕복 수 급감 (1건씩 대비 최대 50배 빠름), 한계 걱정 없음, 실패 영향 1 배치로 한정 | 살짝 이론적 최대치에는 못 미침 (실용상 무관) |

**1건씩이 너무 느리고, 전체가 너무 위험한 중간 지점** 이 50개씩 배치다.

##### 이유 3 — 운영/가시성

50개마다 처리 진행 로그를 남길 수 있다. 대량 수집에서는 "지금 어디까지 진행됐는지" 모니터링이 중요한데, 한 방에 INSERT 해버리면 "시작" 로그 이후 완료까지 아무 정보 없이 조용해진다. 배치 단위 로그가 있으면 **"50/300 저장 완료", "100/300 저장 완료", ..."** 형태로 실시간 진행도를 볼 수 있다.

또한 **실패 시 영향 범위가 1 배치 (50건)** 로 한정된다. 300건을 한 번에 INSERT 하다가 실패하면 300건 전체가 롤백되지만, 50씩 6번 나누면 실패한 배치만 영향을 받는다.

##### 이유 4 — 왜 하필 "50" 인가

"50" 은 수학적 정답이 아니라 **경험적 관례** 다. 많은 프레임워크가 비슷한 값을 쓴다.

| 프레임워크 | 기본 배치 크기 |
|---|---|
| Hibernate `hibernate.jdbc.batch_size` | 15~50 (권장) |
| Spring Data JPA | 20~50 (권장) |
| 일반 bulk INSERT 가이드 | 10~100 |

50은 **"너무 작아서 비효율적이지도 않고, 너무 커서 위험하지도 않은"** 안전 지대다. 개발자가 "50 정도면 문제 없겠지" 라는 실전 감각으로 정한 숫자에 가깝고, 상수 하나만 바꾸면 조정 가능하다.

##### 학습 포인트

- **대량 INSERT/UPDATE/DELETE 는 항상 배치 사이즈로 분할** — 이 프로젝트는 모든 대량 처리 지점에서 동일하게 50 을 사용 (일관성 ✓)
- **배치 사이즈는 DB 드라이버 한계 + 성능 + 관측성의 균형점** — 한 가지 기준으로만 정하지 않음
- **하드코딩된 50 을 나중에 설정으로 뺄 여지가 있음** — 대량 초기 적재는 100~500 으로 올리고, DB 부하 큰 시간대는 25로 낮추는 식의 튜닝 가능

### 5.5 ⑤ 조회 (card-api)

```
GET /api/approval-histories
   │
   └─ SELECT ◀ approval_histories
             + JOIN cards             (카드정보 함께 표시)
```

사용자는 **오로지 `approval_histories` 본 테이블만** 본다. `_temp`, `_updated`, `_removed`, `integrate_queues` 등은 조회 대상이 아니다. 운영/감사/재수집 판정용 내부 테이블.

### 5.6 Quartz 실행 주기 및 카드 등록 직후 타임라인

dev 기본값 예시:

```yaml
card.scheduler.job:
  enqueue:    { enabled: false, cron: '0/10 * * * * ?' }   # 매 10초
  collect:    { enabled: false, cron: '0/5 * * * * ?'  }   # 매 5초
  integrate:  { enabled: false, cron: '0/5 * * * * ?'  }   # 매 5초
```

- `enabled: false` → **기본 비활성화**. 운영 환경은 별도 프로파일 yml 또는 config 서버에서 override.
- 주기 (5~10초) 는 dev/로컬용. 운영은 더 긴 주기일 가능성 높음.

**카드 등록 직후 실제 타임라인 (dev 기본값 기준)**

```
T+0ms    사용자: POST /api/cards
           │
           └─ card-api 트랜잭션
               ├─ INSERT cards (STANDBY)
               ├─ INSERT card_logs
               ├─ INSERT collect_logs (등록 로그)
               └─ INSERT collect_queues  ◀── 이 시점에 이미 큐 적재 완료

T+최대 5s CollectJob 트리거 (cron 5초)
           │
           ├─ 외부 스크래핑 API 호출
           ├─ INSERT approval_histories_temp (N건)
           ├─ INSERT integrate_queues
           ├─ UPDATE cards (latest_*, collect_status=SUCCESS)
           ├─ INSERT collect_logs (실행 이력)
           └─ DELETE collect_queues

T+최대 10s IntegrateJob 트리거 (cron 5초)
           │
           ├─ SELECT integrate_queues
           ├─ temp vs 본 비교
           ├─ INSERT/UPDATE/DELETE approval_histories
           ├─ DELETE approval_histories_temp
           └─ DELETE integrate_queues

T+10~수십초 이후 첫 EnqueueJob 관여 (cron 10초)
           │
           └─ collect_status=SUCCESS 인 101번 카드를
              다음 주기 재수집 대상으로 픽업 → 2회차 시작
```

- **등록 후 첫 수집 완료까지**: dev 기본값 기준 약 **10~20초 이내** (CollectJob 주기 + IntegrateJob 주기).
- **EnqueueJob 은 최소 한 번 CollectJob 이 돌고 나서야 관여**. 즉 EnqueueJob 이 첫 수집의 병목은 아니다.

---

## 6. 실제 시나리오로 보는 데이터 흐름

각 단계에서 어떤 테이블에 **INSERT / UPDATE / DELETE** 가 일어나는지를 실제 데이터로 따라가본다.
시나리오: **임의 카드 1장을 등록 → Day 1 최초 수집 → Day 2 재수집 (변경/삭제/신규 발생)**.

### Day 1 — 최초 수집

#### ① 카드 등록 — 한 트랜잭션 안에서 큐까지 진입

```
POST /api/cards
{ "cardCompanyCode": "COMPANY_A", "cardType": "PERSONAL", "cardNum": "****-****-****-3456", ... }
```

`registerCard()` 가 한 트랜잭션 안에서 아래를 수행한다.

```sql
-- INSERT (cards)
cards:          + (card_seq=101, company=COMPANY_A, type=PERSONAL, collect_status=STANDBY, ...)

-- INSERT (card_logs)
card_logs:      + (card_log_seq=501, card_seq=101, do_dt=2026-04-12 09:00, ...)

-- INSERT (collect_logs) — 등록 시점 초기 로그
collect_logs:   + (collect_log_seq=8901, card_seq=101, collect_status=STANDBY, do_dt=2026-04-12 09:00, ...)

-- INSERT (collect_queues) — collect() 내부 호출, EnqueueJob 안 거침!
collect_queues: + (collect_queue_seq=1001, card_seq=101,
                   start_date=2026-03-12, end_date=2026-04-12,
                   in_progress=false, try_count=0)
```

| 테이블 | 액션 | 설명 |
|--------|------|------|
| `cards` | INSERT 1행 | 카드 마스터 등록 (`collect_status=STANDBY`) |
| `card_logs` | INSERT 1행 | 등록 시점 스냅샷 |
| `collect_logs` | INSERT 1행 | 등록 시점 초기 로그 |
| `collect_queues` | **INSERT 1행** | **`collect()` 내부 호출이 직접 큐 적재 (EnqueueJob 안 거침)** |

> **이 시점에 이미 수집 큐가 차 있다.** 다음 `CollectJob` 트리거만 기다리면 바로 외부 API 호출이 시작된다. 히스토리 테이블은 아직 비어 있음.

#### ② (건너뜀) — 최초 등록이므로 EnqueueJob 관여 없음

Day 1 최초 수집 흐름에서는 **EnqueueJob 이 일을 하지 않는다**. 카드는 이미 위 ① 단계의 `registerCard()` 트랜잭션 안에서 `collect_queues` 에 들어간 상태이기 때문.

EnqueueJob 이 관여하는 건 **Day 2 이후 주기적 재수집** 때부터다 (`collect_status = SUCCESS` 상태인 101번 카드를 다시 큐에 넣는 작업). → Day 2 시나리오 참고.

#### ③ CollectJob — 외부 API 호출, 3건 수신

```sql
-- 1) 큐 락
collect_queues: UPDATE in_progress=true WHERE collect_queue_seq=1001

-- 2) 외부 API 응답 임시 적재
approval_histories_temp:
  + (temp_seq=5001, collect_queue_seq=1001, card_seq=101,
     approval_num=A001, approval_dt=2026-04-10 12:30, amount=15000, approval_type=APPROVAL)
  + (temp_seq=5002, collect_queue_seq=1001, card_seq=101,
     approval_num=A002, approval_dt=2026-04-10 18:45, amount=8500,  approval_type=APPROVAL)
  + (temp_seq=5003, collect_queue_seq=1001, card_seq=101,
     approval_num=A003, approval_dt=2026-04-11 10:15, amount=22000, approval_type=APPROVAL)

-- 3) 통합 신호
integrate_queues:
  + (integrate_queue_seq=2001, collect_queue_seq=1001, card_seq=101, in_progress=false)

-- 4) 카드 최신 상태 갱신
cards:
  UPDATE latest_collect_end_dt=2026-04-12 09:10, latest_collect_count=3,
         collect_status=SUCCESS, latest_err_code=NULL
  WHERE card_seq=101

-- 5) 실행 이력 기록
collect_logs:
  + (collect_log_seq=9001, card_seq=101, collect_queue_seq=1001,
     collect_status=SUCCESS, collect_count=3)

-- 6) 완료된 큐 제거
collect_queues: DELETE WHERE collect_queue_seq=1001
```

| 테이블 | 액션 | 건수 |
|--------|------|------|
| `collect_queues` | UPDATE → DELETE | 1행 (락 → 완료 후 제거) |
| `approval_histories_temp` | **INSERT** | **3행** |
| `integrate_queues` | INSERT | 1행 |
| `cards` | UPDATE | 1행 (latest_* 갱신) |
| `collect_logs` | INSERT | 1행 |

#### ④ IntegrateJob — temp 를 본 테이블로 통합

```sql
-- 1) 큐 락
integrate_queues: UPDATE in_progress=true WHERE integrate_queue_seq=2001

-- 2) 비교 대상 읽기
approval_histories_temp: SELECT WHERE collect_queue_seq=1001 → 3건
approval_histories:      SELECT WHERE card_seq=101           → 0건 (최초라 비어있음)

-- 3) 모두 신규 → 본 테이블 INSERT
approval_histories:
  + (approval_history_seq=7001, card_seq=101,
     approval_num=A001, amount=15000, approval_type=APPROVAL)
  + (approval_history_seq=7002, card_seq=101,
     approval_num=A002, amount=8500,  approval_type=APPROVAL)
  + (approval_history_seq=7003, card_seq=101,
     approval_num=A003, amount=22000, approval_type=APPROVAL)

-- 4) 정리
approval_histories_temp: DELETE WHERE collect_queue_seq=1001
integrate_queues:        DELETE WHERE integrate_queue_seq=2001
```

| 테이블 | 액션 | 건수 |
|--------|------|------|
| `approval_histories` | **INSERT** | **3행** (신규) |
| `approval_histories_updated` | — | 변경 없음 (최초 수집) |
| `approval_histories_removed` | — | 변경 없음 (최초 수집) |
| `approval_histories_temp` | DELETE | 3행 (청소) |
| `integrate_queues` | DELETE | 1행 (신호 소비) |

**Day 1 종료 시점 `approval_histories`**

| approval_history_seq | approval_num | amount | approval_type |
|---|---|---|---|
| 7001 | A001 | 15000 | APPROVAL |
| 7002 | A002 | 8500  | APPROVAL |
| 7003 | A003 | 22000 | APPROVAL |

---

### Day 2 — 재수집 (여기가 핵심)

사용자가 Day 1에 쓴 A001 (15000원) 을 취소했다. 다음날 외부 API 응답이 달라진다.

**Day 2 외부 API 응답**
- **A001**: `approval_type=CANCEL` 로 바뀜 (Day 1 에는 APPROVAL 이었음)
- **A002**: 응답에서 **사라짐**
- **A003**: 그대로
- **A004**: 신규 거래 (Day 1 이후 새로 발생)

#### ② EnqueueJob — 이번엔 진짜 EnqueueJob 이 일한다

카드 101번은 Day 1 에 수집을 마치고 `collect_status = SUCCESS` 상태. 다음 EnqueueJob 주기가 도래하면 SELECT 조건 (`SUCCESS` 포함) 에 걸려서 재수집 대상이 된다.

```sql
-- READ
cards: SELECT ... WHERE collect_status IN ('STANDBY', 'SUCCESS') ... → card_seq=101 발견

-- INSERT
collect_queues:
  + (collect_queue_seq=1002, card_seq=101,
     start_date=2026-03-13, end_date=2026-04-13,
     in_progress=false, try_count=0)
```

> Day 1 등록 시에는 `card-api` 가 직접 큐에 넣었지만, Day 2 부터는 EnqueueJob 이 자동으로 큐에 넣는다. **같은 테이블 (`collect_queues`) 에 두 생산자가 쓰는 구조**.

#### ③ CollectJob (동일 플로우, 외부 API 응답만 다름)

```sql
-- CollectJob 종료 시점 temp 상태
approval_histories_temp:
  + (temp_seq=5101, approval_num=A001, amount=15000, approval_type=CANCEL)   -- 변경본
  + (temp_seq=5102, approval_num=A003, amount=22000, approval_type=APPROVAL) -- 그대로
  + (temp_seq=5103, approval_num=A004, amount=4500,  approval_type=APPROVAL) -- 신규
```

⚠ **A002 는 응답에 없음 → temp 에도 없음**. 이게 "사라진 건" 판정의 핵심 단서.

#### ④ IntegrateJob — 3단계 Compare 로직 적용

```
-- 1) Phase 1: temp 순회하며 기존 건 매칭
--    매칭 기준 = approvalNum + approvalDT(날짜) + approvalAmount + approvalType

temp  (신규 도착): [A001/CANCEL, A003/APPROVAL, A004/APPROVAL]
olds  (기존)     : [A001/APPROVAL, A002/APPROVAL, A003/APPROVAL]

--   A001(신규 CANCEL) vs A001(기존 APPROVAL)  → approvalType 달라서 매칭 실패 → NEW
--   A003(신규 APPROVAL) vs A003(기존 APPROVAL) → 완전 동일 → DO_NOTHING
--   A004(신규 APPROVAL)                        → 매칭 없음 → NEW

-- Phase 1 종료 시점
--   temps: [A001/NEW, A003/DO_NOTHING, A004/NEW]
--   olds:  [A001/APPROVAL(남음), A002/APPROVAL(남음)]  ← A003 은 매칭되어 제거됨

-- 2) Phase 2: olds 에 남은 건을 REMOVED 로 마킹 후 temps 에 합침
--   temps: [A001/NEW, A003/DO_NOTHING, A004/NEW, A001/APPROVAL/REMOVED, A002/APPROVAL/REMOVED]

-- 3) Phase 3: NEW 와 REMOVED 를 cross-match (⭐ 중복 처리의 핵심)
--   A001/NEW(CANCEL) ↔ A001/REMOVED(APPROVAL)
--     → switch(CANCEL) case: "승인 건 찾기 (정상)" 매치!
--     → 기존 approval_history_seq=7001 을 A001/NEW 에 주입
--     → A001/NEW 를 UPDATED 로 변경
--     → A001/REMOVED 는 목록에서 삭제

-- Phase 3 종료 시점 최종 분류
--   A001 → UPDATED (승인→취소, approval_history_seq=7001 유지!)
--   A002 → REMOVED (응답에서 사라짐)
--   A003 → DO_NOTHING
--   A004 → NEW

-- 4) 처리 순서 (Writer 5 → 6 → 7)
--   Writer 5 DELETE: A002 만
--   Writer 6 UPDATE: A001 (DELETE+INSERT 가 아니라 UPDATE!)
--   Writer 7 INSERT: A004 만

-- 실제 쿼리

-- [A001] 변경 처리
approval_histories_updated:
  + (updated_seq=8001, approval_history_seq=7001, card_seq=101,
     approval_type=APPROVAL, amount=15000,     -- ← 변경 전 값 보관!
     update_dt=2026-04-13 09:20)
approval_histories:
  UPDATE approval_type=CANCEL, update_dt=2026-04-13 09:20
  WHERE approval_history_seq=7001

-- [A002] 삭제 처리
approval_histories_removed:
  + (removed_seq=8501, approval_history_seq=7002, card_seq=101,
     approval_type=APPROVAL, amount=8500,      -- ← 삭제 전 값 보관!
     remove_dt=2026-04-13 09:20)
approval_histories:
  DELETE WHERE approval_history_seq=7002

-- [A003] 아무 작업 없음 (데이터 동일)

-- [A004] 신규 INSERT
approval_histories:
  + (approval_history_seq=7004, card_seq=101,
     approval_num=A004, amount=4500, approval_type=APPROVAL)

-- 정리
approval_histories_temp: DELETE WHERE collect_queue_seq=1002
integrate_queues:        DELETE WHERE integrate_queue_seq=2002
```

| 테이블 | 액션 | 건수 | 어떤 레코드? |
|--------|------|------|--------------|
| `approval_histories` | **UPDATE** | 1행 | A001 (승인→취소) |
| `approval_histories` | **DELETE** | 1행 | A002 (응답 사라짐) |
| `approval_histories` | **INSERT** | 1행 | A004 (신규) |
| `approval_histories_updated` | **INSERT** | 1행 | A001 의 변경 **전** 스냅샷 |
| `approval_histories_removed` | **INSERT** | 1행 | A002 의 삭제 **전** 스냅샷 |
| `approval_histories_temp` | DELETE | 3행 | 통합 후 청소 |
| `integrate_queues` | DELETE | 1행 | 신호 소비 |

#### Day 2 종료 시점 테이블 상태

**`approval_histories`** ("현재 진실" 만 유지)

| approval_history_seq | approval_num | amount | approval_type | update_dt |
|---|---|---|---|---|
| 7001 | A001 | 15000 | **CANCEL** | 2026-04-13 09:20 |
| ~~7002~~ | ~~A002~~ | | ~~(삭제됨)~~ | |
| 7003 | A003 | 22000 | APPROVAL | (변화 없음) |
| 7004 | A004 | 4500  | APPROVAL | (신규) |

**`approval_histories_updated`** (변경 전 감사 로그)

| updated_seq | approval_history_seq | approval_type | amount |
|---|---|---|---|
| 8001 | 7001 | **APPROVAL** ← 변경 전! | 15000 |

**`approval_histories_removed`** (삭제 전 감사 로그)

| removed_seq | approval_history_seq | approval_type | amount |
|---|---|---|---|
| 8501 | 7002 | **APPROVAL** ← 삭제 전! | 8500 |

### 시나리오에서 뽑은 핵심 관찰

1. **본 테이블은 "현재 상태" 만 유지** — A001 은 CANCEL 로 덮어씌워지고 원래 모습은 사라진다.
2. **`_updated` / `_removed` 는 "이전 모습" 을 보관** — "A001 이 원래 승인이었다" 는 사실이 `_updated` 에 살아 있어서 나중에 감사/추적 가능.
3. **변화 없는 건 (A003) 은 아예 건드리지 않음** — Phase 1 에서 `DO_NOTHING` 으로 분류. 불필요한 UPDATE 없음.
4. **A001 은 DELETE+INSERT 가 아니라 UPDATE** — 승인유형이 바뀌었지만 Phase 3 cross-match 덕분에 **기존 `approval_history_seq=7001` 이 그대로 유지** 되고 UPDATE 로 처리됨. 만약 cross-match 가 없었다면 7001 은 삭제되고 새 seq 로 INSERT 되어 이력이 끊겼을 것.
5. **temp 는 통합이 끝나면 즉시 DELETE** — 원장이 아니라 버퍼. 계속 쌓이지 않는다.
6. **신규 건 (A004) 은 `_updated`/`_removed` 에 아무것도 안 남음** — 신규 INSERT 는 감사 대상이 아니라서.
7. **"사라진 건" 판정은 Phase 2 의 잔여 `olds`** — Phase 1 에서 매칭된 건은 `olds` 에서 제거되므로, 끝까지 남아있는 것만 REMOVED 로 분류된다.
8. **0건 수집 방어 — 시나리오에 없지만 중요**: 만약 Day 2 외부 API 가 장애로 **빈 배열** 을 응답했다면, Compare 로직은 실행되지 않고 아무 작업 없이 종료된다. (`temps.isEmpty() && !olds.isEmpty()` 가드) 기존 데이터가 전부 `_removed` 로 날아가는 파국을 막는다.

---

## 7. 데이터 흐름 한 줄 요약

```
cards ─(EnqueueJob)─▶ collect_queues ─(CollectJob)─▶ approval_histories_temp ─(IntegrateJob)─▶ approval_histories ─▶ 사용자
                              │                              │                                     │
                              │                              └──▶ integrate_queues                 ├──▶ _updated (감사)
                              │                                                                     └──▶ _removed (감사)
                              └── collect_logs / cards.latest_* (운영 관찰)
```

---

## 8. 배울 점 (설계 교훈)

이 시스템을 공부하면서 건진 설계 원칙들.

### 8.1 외부 API 호출은 빠른 작업과 분리해라

느린 외부 호출이 빠른 DB 작업을 블로킹하지 않도록 **큐로 분리**. 생산자-소비자 패턴을 Job 단위로 구현한 게 이 프로젝트의 Enqueue/Collect 분리다.

### 8.2 외부 응답은 바로 본 테이블에 쓰지 마라

일단 **임시 테이블에 받아놓고**, 기존 데이터와 비교한 뒤 신규/변경/삭제를 판정해서 본 테이블에 반영. 이게 Collect/Integrate 분리의 이유다. 특히 외부 API 가 "과거 데이터의 변경/삭제" 도 반영되는 경우라면 이 패턴이 거의 필수.

### 8.3 "현재 상태" 테이블 옆에 "이전 상태" 감사 테이블을 둬라

`approval_histories` 옆의 `_updated`/`_removed`. 본 테이블은 가벼운 상태로 유지하고, 감사 로그는 별도로. "왜 이 건이 사라졌지?", "원래 금액이 얼마였지?" 같은 질문에 답할 수 있다.

### 8.4 큐 테이블에는 `in_progress` + `try_count` 를 박아라

중복 처리 방지 락 + 재시도 카운터. 가장 단순하면서 강력한 운영 패턴.

### 8.5 최신 상태는 카드 레코드 자체에 비정규화해둬라

`cards.latest_err_code`, `latest_collect_end_dt`, `latest_collect_count` 등. 리스트 화면에서 매번 `collect_logs` 를 JOIN 할 필요 없이 카드 조회만으로 최신 상태가 보인다. 엄밀한 정규화는 아니지만 **리스트 성능** 측면에서 실용적.

### 8.6 커질 테이블은 연도별 아카이브를 미리 설계해둬라

`archive.approval_histories_YYYY` 같은 연도 파티션. 본 테이블이 무한정 커지지 않도록 처음부터 이관 전략을 잡아두는 것.

### 8.7 외부 API 의 변덕은 통합 레이어에서 흡수해라

외부 스크래핑 API 는 가끔 "같은 거래를 승인 → 취소 → 거절 → 부분취소 로 유형을 바꿔서 재응답" 하는 등 데이터 일관성이 완벽하지 않다. 이때 단순히 자연 키 매칭만 하면 **"사실은 같은 거래인데 NEW + REMOVED 로 중복 분류"** 되는 문제가 발생한다.

이 프로젝트는 `IntegrateJob` 의 Compare 로직 **Phase 3 cross-match** 로 이 문제를 해결한다. NEW 와 REMOVED 목록을 교차 매칭해서 "승인유형만 바뀐 같은 거래" 를 찾아내고, DELETE + INSERT 가 아니라 **`approval_history_seq` 를 유지한 채 UPDATE** 로 병합한다.

**교훈**: 외부 시스템이 보내는 데이터가 완벽하다고 가정하지 마라. 통합 레이어가 방어적으로 동작해야 한다. 특히 "중복 분류" 와 "이력 연속성 파괴" 는 자연스럽게 발생하므로, 이를 의식적으로 고쳐주는 코드가 필요하다.

### 8.8 "0건 응답" 은 특별 케이스로 처리해라

외부 API 가 일시 장애로 **빈 응답** 을 주면, 순진한 통합 로직은 "기존 건 전부가 사라진 것" 으로 판정해서 본 테이블 데이터를 전부 `_removed` 로 이관해버린다. 복구 가능하긴 하지만 파국적.

```java
if (temps.isEmpty() && !olds.isEmpty()) {
    // 수집된 내역은 없고 기존 내역이 있으면, API 장애로 간주하고 처리 없이 완료
    return;
}
```

이 한 줄짜리 가드가 **"데이터 보수적 유지"** 원칙을 지킨다. **교훈**: 외부 API 가 주는 데이터가 평소보다 **극단적으로 적을 때** 는 판정을 보류하는 게 안전하다. 반응형이 아니라 방어형으로 설계할 것.

---

## 마치며

처음에 봤을 때는 "카드 등록 → 수집 → 저장" 이 왜 이렇게 복잡한지 이해가 안 갔다. 근데 파고들수록 각 단계의 존재 이유가 분명해진다.

- Enqueue/Collect 분리 → **속도 특성 분리**
- Collect/Integrate 분리 → **외부 데이터 비교 로직의 무게 분산**
- 본 테이블 + `_updated` + `_removed` → **현재 상태 + 감사 로그 분리**
- Phase 3 cross-match → **외부 API 변덕의 정합성 흡수**
- 0건 응답 가드 → **장애 시 데이터 보호**

"외부 API 를 주기적으로 긁어오는 시스템" 을 설계하게 되면 이 패턴들을 기억해두면 많은 실수를 피할 수 있을 것 같다. 특히 **"외부 데이터를 있는 그대로 믿지 말 것"** 과 **"감사 로그는 공짜가 아니지만 없으면 후회한다"** 는 두 교훈이 핵심이다.
