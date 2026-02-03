---
layout: post
title: Spring ChainedTransactionManager - 멀티 데이터소스 트랜잭션 관리
tags: [ spring, java, database, transaction ]
---

## ChainedTransactionManager란?

여러 DataSource의 트랜잭션을 하나로 묶어서 관리하는 트랜잭션 매니저다.

하나의 비즈니스 로직에서 여러 DB에 동시에 쓰기 작업을 할 때, 모든 DB가 함께 커밋되거나 함께 롤백되어야 하는 경우 사용한다.

---

## 동작 원리

```
┌─────────────────────────────────────────────────────────────┐
│                 ChainedTransactionManager                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ faxTxMgr    │ │ hanafaxTxMgr│ │ lgTxMgr     │            │
│  │ (FAX DB)    │ │ (하나팩스 DB)│ │ (LG DB)     │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘

트랜잭션 시작: fax → hanafax → lg (순차)
커밋:        lg → hanafax → fax (역순, LIFO)
롤백:        lg → hanafax → fax (역순, LIFO)
```

트랜잭션 매니저들이 체인처럼 연결되어, 시작은 순서대로, 커밋/롤백은 역순으로 처리된다.

---

## 설정 방법

```kotlin
@Configuration
class ChainedTransactionConfig {

    @Bean
    fun chainedTransactionManager(
        faxTransactionManager: PlatformTransactionManager,
        hanafaxTransactionManager: PlatformTransactionManager,
        sejongTransactionManager: PlatformTransactionManager,
        lgTransactionManager: PlatformTransactionManager
    ): PlatformTransactionManager = ChainedTransactionManager(
        faxTransactionManager,      // 1번째 시작 → 4번째 커밋
        hanafaxTransactionManager,  // 2번째 시작 → 3번째 커밋
        sejongTransactionManager,   // 3번째 시작 → 2번째 커밋
        lgTransactionManager        // 4번째 시작 → 1번째 커밋
    )
}
```

---

## 사용 예시: Spring Batch Job

팩스 전송 배치에서 4개 DB에 동시에 쓰기 작업을 하는 경우:

```kotlin
@Bean
fun sendStep(
    jobRepository: JobRepository,
    chainedTransactionManager: PlatformTransactionManager,  // 체인된 트랜잭션
    sendStepReader: MyBatisPagingItemReader<SendQueue>,
    sendStepWriter: CompositeItemWriter<SendQueue>
): Step = StepBuilder("전송", jobRepository)
        .chunk<SendQueue, SendQueue>(100)
        .transactionManager(chainedTransactionManager)
        .reader(sendStepReader)
        .writer(sendStepWriter)
        .build()
```

Writer에서 4개 DB에 동시 쓰기:

```
┌─────────────────────────────────────────────────────────────────┐
│  CompositeItemWriter (하나의 Chunk)                              │
│                                                                  │
│  1. fax DB      → SendQueue 조회/삭제                           │
│  2. hanafax DB  → 하나팩스로 전송 등록                           │
│  3. lg DB       → LG로 전송 등록                                 │
│  4. sejong DB   → 세종으로 전송 등록                             │
│                                                                  │
│  모든 작업이 함께 커밋 또는 함께 롤백                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Best Effort 1PC 방식의 한계

ChainedTransactionManager는 **진정한 분산 트랜잭션(XA/2PC)이 아니다**.

### 부분 커밋 발생 가능

```
커밋 순서 (역순):
1. lg DB       커밋 ✅ 성공
2. sejong DB   커밋 ✅ 성공
3. hanafax DB  커밋 ❌ 실패!

결과:
- lg, sejong    → 이미 커밋됨 (롤백 불가)
- hanafax       → 롤백됨
- fax           → 커밋 시도 안 함 (롤백)

데이터 불일치 발생!
```

### XA/2PC vs Best Effort 1PC

| 방식                  | 동작                                | 정합성   | 성능 |
|---------------------|-----------------------------------|-------|----|
| **XA/2PC**          | 모든 DB에 prepare → 모두 성공 시 commit   | 완벽 보장 | 느림 |
| **Best Effort 1PC** | 순서대로 commit (실패 시 이미 커밋된 건 롤백 불가) | 부분 보장 | 빠름 |

---

## deprecated 상태

```
⚠️ Spring Data 2.5 (2021년)부터 deprecated
   하지만 아직 제거 예정 없음, 정상 동작
```

### 대안

| 대안                             | 복잡도 | 설명                                    |
|--------------------------------|-----|---------------------------------------|
| **JTA + Atomikos/Narayana**    | 높음  | 진정한 2PC 분산 트랜잭션                       |
| **커스텀 구현**                     | 중간  | AbstractPlatformTransactionManager 상속 |
| **TransactionSynchronization** | 중간  | Spring 기본 제공 동기화 메커니즘                 |
| **Saga 패턴**                    | 높음  | 보상 트랜잭션 기반 (MSA 환경)                   |

### 언제 대안으로 바꿔야 하나?

실제로 대안을 검토해야 하는 경우:

1. Spring Data에서 실제로 제거될 때
2. 부분 커밋이 비즈니스에 치명적인 경우
3. 금융 등 강한 정합성이 필수인 도메인

대부분의 경우 재처리 로직이 있다면 Best Effort 1PC로 충분하다.

---

## 언제 사용하나?

### ChainedTransactionManager가 적합한 경우

- 하나의 Chunk/트랜잭션에서 여러 DB 동시 쓰기
- 실패 시 재처리 가능한 비즈니스 로직
- 부분 커밋 발생해도 복구 가능한 구조

### 사용하지 않아도 되는 경우

- Step별로 다른 DB를 사용 (각 Step이 독립적)
- 읽기만 하는 DB가 있는 경우
- 단일 DataSource만 사용

---

## Step별 분리 vs Chained 비교

### Step별 분리 (ArchiveJob 예시)

각 Step이 독립적으로 실행:

```kotlin
@Bean
fun archiveJob(...): Job = JobBuilder("ArchiveJob", jobRepository)
        .start(archiveStep)           // faxTransactionManager
        .next(archiveHanafaxStep)     // hanafaxTransactionManager
        .next(archiveSejongStep)      // sejongTransactionManager
        .next(archiveLgStep)          // lgTransactionManager
        .build()
```

```
Step1 실행 → fax DB 커밋
Step2 실행 → hanafax DB 커밋
Step3 실행 → sejong DB 커밋
Step4 실행 → lg DB 커밋

각 Step이 독립적 → 체인 필요 없음
```

### ChainedTransactionManager (SendJob 예시)

하나의 Step에서 4개 DB 동시 사용:

```kotlin
@Bean
fun sendStep(...): Step = StepBuilder("전송", jobRepository)
        .chunk<SendQueue, SendQueue>(100)
        .transactionManager(chainedTransactionManager)  // 4개 DB 묶음
        .reader(sendStepReader)        // fax DB 조회
        .writer(sendStepWriter)        // 4개 DB 동시 쓰기
        .build()
```

```
Chunk 처리:
  fax DB 조회 → hanafax/lg/sejong DB 등록 → fax DB 삭제
  모두 같은 트랜잭션 → 체인 필요
```

---

## 정리

| 항목     | 내용                         |
|--------|----------------------------|
| **목적** | 여러 DataSource 트랜잭션을 하나로 묶음 |
| **동작** | 시작 순서대로, 커밋/롤백은 역순 (LIFO)  |
| **한계** | Best Effort 1PC (부분 커밋 가능) |
| **상태** | deprecated지만 당장 제거 예정 없음   |
| **대안** | JTA, 커스텀 구현, Saga 패턴 등     |
| **권장** | 재처리 가능한 로직이면 그대로 사용        |

주석으로 한계점과 대안을 문서화해두면, 추후 담당자 변경 시에도 이해하기 쉽다:

```kotlin
/**
 * 여러 DataSource의 트랜잭션을 체이닝하여 관리하는 설정
 *
 * ChainedTransactionManager는 Spring Data 2.5부터 deprecated 됨
 * - 동작: 순서대로 시작, 역순으로 커밋/롤백 (LIFO)
 * - 주의: 진정한 XA/2PC 분산 트랜잭션이 아님 (부분 커밋 발생 가능)
 *
 * 향후 대안:
 * 1. JTA + Atomikos/Narayana: 진정한 분산 트랜잭션
 * 2. 커스텀 구현: AbstractPlatformTransactionManager 상속
 * 3. TransactionSynchronization 활용
 */
@Configuration
class ChainedTransactionConfig { ... }
```
