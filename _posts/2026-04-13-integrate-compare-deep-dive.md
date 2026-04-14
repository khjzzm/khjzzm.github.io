---
layout: post
title: 외부의 혼돈을 내부의 질서로 — integrateStepWriterCompare 3단계 딥다이브 (2/2)
tags: [ architecture, spring-batch, mybatis, refactoring ]
---

[1편](/2026/04/collect-writer-deep-dive) 에서 다룬 `collectStepWriterCollect` 가 외부 스크래핑 API 의 응답을 그대로 `approval_histories_temp` 에 던져두는 "외부와 만나는 문" 이었다면, 이번 글의 주인공 — **`integrateStepWriterCompare`** 는 그 임시 바구니의 데이터를 **본 테이블 (`approval_histories`) 의 정합성으로 번역하는** "외부의 혼돈을 내부의 질서로 옮기는 지점" 이다.

이 메소드는 외부 API 의 변덕 (시간이 살짝 바뀐다, 같은 거래의 승인유형이 취소로 바뀐다, 잠깐 응답에서 사라졌다 다시 나타난다) 을 흡수하는 **3단계 Compare 로직** 을 갖고 있다. 한 줄씩 따라가면서, 마지막에 **모든 분기를 한 번에 발동시키는 10건 종합 시나리오** 까지 손으로 따라가본다.

> ⓘ 이 글은 2편짜리 딥다이브의 2편이다. 1편은 [CollectJob 의 유일한 HTTP 호출 지점](/2026/04/collect-writer-deep-dive) 을 다뤘다.

---

## 1. 메소드의 자리

IntegrateJob 도 **chunk=1**. `integrate_queues` 에서 신호 한 건을 꺼내 (Reader) → Processor 없이 바로 → 12개 writer 체인이 차례로 실행된다. 이 글의 주인공은 그 중 Writer 3.

| # | Writer Bean | 역할 |
|---|-------------|------|
| 1 | `UpdateIntegrateQueueInProgress` | 큐 락 |
| 2 | `GetCollectStartDTAndTempsAndOlds` | `_temp` + 본 테이블 데이터 읽기 |
| 3 | ⭐⭐ **`Compare`** | **Phase 1 자연 키 매칭 / Phase 2 잔여 olds → REMOVED / Phase 3 cross-match** |
| 4 | `CollectStoreTaxType` | 가맹점 과세유형 외부 조회 |
| 5 | `DeleteRemovedApprovalHistories` | DELETE (REMOVED) |
| 6 | `UpdateExistingApprovalHistories` | UPDATE + `_updated` 박제 |
| 7 | `RegisterNewApprovalHistories` | INSERT (NEW) |
| 8~12 | 큐·temp 정리, 건수 보정, 로그 | ... |

Writer 3 의 결과물은 **temps 리스트의 각 요소에 부착된 `CompareResult` 라벨**이다. Writer 4~7 은 그 라벨만 보고 자기 일을 하면 된다. 즉 **Compare 는 DB 에 아무것도 쓰지 않는 순수 메모리 연산**인데, 이 한 메소드의 분류 결과가 이후 모든 Writer 의 행동을 결정한다.

---

## 2. 메소드 시그니처와 입출력 규약

```java
@Bean
@StepScope
public ItemWriter<IntegrateQueue> integrateStepWriterCompare() {
    return integrateQueues -> { ... };
}
```

특이점:

- **인자 없음.** 다른 writer 들이 `SqlSessionFactory` 나 외부 서비스 빈을 받는 것과 달리 이 메소드는 의존성 0개. 즉 **DB·외부 호출을 일체 하지 않는다는 선언**.
- `MyBatisBatchItemWriter` 가 아니라 **순수 람다**.
- `@StepScope` — Step 실행마다 새로 생성.

```
입력: List<IntegrateQueue> (chunk=1 이라 항상 1개)
출력: void
```

side-effect 로 동작한다. 구체적으로는 입력 `IntegrateQueue` 객체의 내부 상태 (`olds`, `temps` 리스트와 그 안의 `ApprovalHistory` 들) 를 **제자리에서** 수정하는 mutator.

- `integrateQueue.getOlds()` 의 요소를 **제거**
- `integrateQueue.getTemps()` 의 요소를 **추가/제거**
- 각 `ApprovalHistory` 의 `compareResult`, `approvalHistorySeq` 필드를 **변경**

---

## 3. 3개의 region — 전체 구조

```java
// region 신규, 중복 건 추출   ← Phase 1
for (temp : temps) { ... }
// endregion

// region 삭제된 건 추출        ← Phase 2
for (removed : olds) { ... }
// endregion

// region 신규 건과 삭제 건을 비교  ← Phase 3
for (newly : news) { ... }
// endregion
```

세 개의 for 루프가 순차 실행되는 단순 구조다. 그러나 중간에 상태 변경 (`olds.remove()`, `temps.add()`) 이 일어나서 각 루프의 입력이 달라진다. **이 순서 의존성** 이 핵심.

```
┌──────────────────────────────────────────────────────┐
│ Phase 1: temp 순회 → olds 와 자연 키 매칭                 │
│   ─ 매칭 안 됨 → NEW                                     │
│   ─ 매칭 됨 → olds 에서 제거 + seq 주입 + 5가지 세부 분류    │
│ 출력: temps 에 라벨 부착, olds 는 잔여분만 남음              │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ Phase 2: 잔여 olds → REMOVED 라벨 후 temps 에 합치기       │
│ 출력: temps 가 NEW + UPDATED + REMOVED 모두 담은 단일 리스트 │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ Phase 3: NEW × REMOVED cross-match                   │
│   같은 거래의 승인유형 전환 (NEW + REMOVED 쌍) 을         │
│   단일 UPDATE 로 병합 (seq 유지)                          │
└──────────────────────────────────────────────────────┘
```

---

## 4. Phase 1 — 자연 키 매칭과 5가지 세부 분류

### 바깥 루프와 매칭 키

```java
for (ApprovalHistory temp : integrateQueue.getTemps()) {
    ApprovalHistory matched = null;
    for (ApprovalHistory old : integrateQueue.getOlds()) {
        if (temp.equalsByApprovalNumAndDTAndAmountAndType(old)) {
            matched = old;
            break;
        }
    }
    ...
}
```

매칭 키 — `equalsByApprovalNumAndDTAndAmountAndType` 의 실제 구현:

```java
public boolean equalsByApprovalNumAndDTAndAmountAndType(ApprovalHistory that) {
    return this.approvalType == that.approvalType &&
        Objects.equals(this.approvalNum, that.approvalNum) &&
        Objects.equals(this.approvalDT.toLocalDate(), that.approvalDT.toLocalDate()) &&
        this.equalsBigDecimals(this.approvalAmount, that.approvalAmount);
}
```

자연 키는 4개 필드.

| 필드 | 비교 방법 | 함정 |
|------|-----------|------|
| `approvalType` | `==` (enum) | — |
| `approvalNum` | `Objects.equals` (null-safe) | — |
| `approvalDT` | **`.toLocalDate()` — 날짜만** | 시간은 무시! |
| `approvalAmount` | `equalsBigDecimals` (compareTo == 0) | `BigDecimal.equals` 는 scale 까지 비교해서 `10.00 ≠ 10.0` 의 함정이 있음 |

`approvalDT` 가 **날짜만** 비교된다는 점이 이후 (C-2) 분기의 복선이 된다. `equalsBigDecimals` 는 꼼꼼한 부분 — null 을 0 으로 변환 후 `compareTo == 0` 으로 비교하는 유틸이라 scale 함정을 피한다.

### 매칭 실패 분기 — NEW

```java
if (matched == null) {
    temp.setCompareResult(NEW);
}
```

단순. olds 에 없으면 신규. 단, 이게 "진짜 신규" 일 수도 있고, **Phase 3 에서 cross-match 로 흡수될 후보** 일 수도 있다 (같은 거래인데 승인유형이 바뀐 경우). 그 판정은 Phase 3 가 한다.

### 매칭 성공 분기 — Consumption + seq 주입 + 세부 분류

```java
} else {
    integrateQueue.getOlds().remove(matched);             // (A) consumption
    temp.setApprovalHistorySeq(matched.getApprovalHistorySeq()); // (B) seq 주입

    if (temp.equalsAll(matched)) {
        // C-1 ~ C-3 (전체 동일 분기)
    } else {
        // C-4 ~ C-5 (필드 차이 분기)
    }
}
```

**(A) `olds.remove(matched)` — Consumption 패턴.** 이게 Phase 2 의 복선이다. 매칭된 old 를 리스트에서 제거해야 Phase 2 에서 "남아있는 것 = REMOVED" 로 자연스럽게 판정할 수 있다.

> 성능 함정: `ArrayList.remove(Object)` 는 O(N). 데이터가 수천 건이면 전체 복잡도가 O(N × M × M) 까지 커질 수 있다. 현재 스케일 (수십~수백 건) 에선 문제 없지만 확장 시 고려사항.

**(B) seq 주입 — 이력 연속성의 핵심.** `temp` 는 외부 API 응답이라 seq 가 없다. 여기서 old 의 seq 를 주입해서 "이후 UPDATE 는 이 seq 를 타겟으로 하라" 라고 고정. 이게 없으면 Writer 6 의 `UPDATE ... WHERE approval_history_seq = ?` 이 어느 row 를 건드릴지 모른다.

이제 5가지 세부 분류로 들어간다.

### (C-1) `equalsAll == true` + 휴폐업 NULL → STORE_TAX_TYPE_IS_NULL

```java
if (temp.equalsAll(matched)) {
    if (matched.getStoreCompanyType() == null ||
        matched.getStoreCompanyTaxType() == null) {
        temp.setCompareResult(STORE_TAX_TYPE_IS_NULL);
    }
    ...
}
```

**`equalsAll` 의 비밀**: 22개 필드를 비교하지만 `storeCompanyType` / `storeCompanyTaxType` 은 **제외**한다. 이게 "전체 동일인데 휴폐업은 NULL 일 수 있다" 는 모순의 근원이자 이 분기의 존재 이유.

의미: **데이터는 어제와 같은데 과거 Writer 4 가 휴폐업 조회에 실패해서 NULL 로 남아있는 상태**. 다음 수집 주기에 자동 재조회로 복구하기 위한 분류.

### (C-2) `equalsAll == true` + 시간만 다름 → UPDATED (시간 보정)

```java
if (!temp.getApprovalDT().equals(matched.getApprovalDT())) {
    temp.setStoreCompanyType(matched.getStoreCompanyType());
    temp.setStoreCompanyTaxType(matched.getStoreCompanyTaxType());
    temp.setCompareResult(UPDATED);
}
```

**왜 `equalsAll` 이 true 인데 `approvalDT` 가 다를 수 있나?** `equalsAll` 은 `approvalDT.toLocalDate()` (날짜만) 을 비교한다. 이 추가 체크는 `getApprovalDT().equals()` 로 시간까지 포함한 전체 비교. 즉 **"날짜는 같은데 시간이 다른"** 케이스 — 외부 API 가 나중에 더 정확한 시간으로 갱신해주는 일이 있다.

여기서 가장 중요한 건 **3줄짜리 휴폐업 정보 복사** 다.

```java
temp.setStoreCompanyType(matched.getStoreCompanyType());
temp.setStoreCompanyTaxType(matched.getStoreCompanyTaxType());
```

`temp` 는 외부 API 응답이라 휴폐업 필드가 NULL. 이걸 그대로 UPDATE 하면 **본 테이블의 기존 휴폐업 정보가 NULL 로 덮어씌워져 사라진다**. 휴폐업 조회 API 는 비용이 비싸서 매번 재조회하면 외부 호출 폭주. 그래서 old 의 휴폐업 값을 temp 에 복사해서 UPDATE 후에도 유지되게 한다.

> 이 3줄 없으면 매 수집마다 휴폐업 정보가 사라지고 재조회되는 무한 루프가 생긴다. 조용하지만 결정적인 방어 코드.

### (C-3) 완전 동일 → DO_NOTHING

```java
} else {
    temp.setCompareResult(DO_NOTHING);
}
```

**가장 흔한 케이스.** 운영 데이터의 90% 이상이 여기 해당한다. 이 분류가 없으면 매 수집마다 수백~수천 건의 쓸모없는 UPDATE 가 발생해서 DB 부하 폭발.

### (C-4) 필드 차이 + storeBizId 변경 → UPDATED_STORE_BIZ_ID

```java
if (!Objects.equals(temp.getStoreBizId(), matched.getStoreBizId())) {
    temp.setCompareResult(UPDATED_STORE_BIZ_ID);
}
```

**특수 분기.** 사업자번호가 바뀌면 기존 휴폐업 정보가 "다른 가맹점의 것" 이 되어 무효. Writer 4 가 이 분류의 레코드만 추려서 배치로 휴폐업 재조회.

여기서는 **휴폐업 정보를 복사하지 않는다** — 어차피 Writer 4 가 재조회로 덮어쓸 거니까.

### (C-5) 필드 차이 + storeBizId 그대로 → UPDATED (일반)

```java
} else {
    temp.setStoreCompanyType(matched.getStoreCompanyType());
    temp.setStoreCompanyTaxType(matched.getStoreCompanyTaxType());
    temp.setCompareResult(UPDATED);
}
```

가장 흔한 변경 케이스 (금액 수정, 가맹점명 변경 등). 휴폐업 정보는 보존 (사업자번호가 안 바뀌었으니 유효).

---

## 5. Phase 2 — 잔여물 처리 (3줄짜리 다리)

```java
for (ApprovalHistory removed : integrateQueue.getOlds()) {
    removed.setCompareResult(REMOVED);
    integrateQueue.getTemps().add(removed);
}
```

극도로 단순하지만 설계 의도는 정교하다.

### 왜 olds 에 남은 것 = REMOVED 인가

Phase 1 에서 매칭된 old 는 consumption 으로 olds 리스트에서 빠져나갔다. 그래서 Phase 1 이 끝난 시점에 olds 에 남은 건:

> **"temp 에 대응이 없는 기존 건" = "이번 응답에 안 나타난 것" = "사라진 것"**

이 결론에 도달하기 위해 Phase 1 의 `olds.remove(matched)` 가 미리 준비되어 있던 것.

### "temps 에 합친다" 의 이유

왜 olds 를 그대로 두지 않고 temps 에 복사할까? **Phase 3 와 이후 Writer 들이 단일 리스트 (temps) 만 순회하도록 만들기 위해서**다. `IntegrateQueue` 의 getter 들 — `getRemovedApprovalHistories()`, `getUpdatedApprovalHistories()`, `getNewApprovalHistories()` — 이 모두 **temps 기반 필터**다. Phase 2 가 REMOVED 건을 temps 에 합쳐주지 않으면 이 getter 들이 빈 리스트를 돌려주고 Writer 5 가 아무것도 못 한다.

### 순회 중 수정의 함정 회피

```java
for (ApprovalHistory removed : integrateQueue.getOlds()) {
    ...
    integrateQueue.getTemps().add(removed);  // ← temps 에 추가 (olds 가 아님)
}
```

for-each 의 대상은 `olds`, 수정하는 대상은 `temps`. 순회 중인 리스트와 수정 대상이 달라서 `ConcurrentModificationException` 이 안 터진다. **의도적 분리.**

---

## 6. Phase 3 — Cross-match (가장 복잡한 부분)

같은 거래의 승인유형이 바뀐 경우 (예: 어제는 APPROVAL 이었는데 오늘 응답엔 CANCEL 로 옴) Phase 1 의 자연 키 매칭에 `approvalType` 이 포함되어 있어서 매칭이 실패한다. 그 결과:

- 새 응답 (CANCEL) 은 NEW 로 분류
- 기존 (APPROVAL) 은 Phase 2 에서 REMOVED 로 분류

**같은 거래가 NEW + REMOVED 로 중복 분류되는 모순 상태**가 만들어진다. Phase 3 는 이 모순을 해소한다 — DELETE + INSERT 가 아니라 **단일 UPDATE 로 병합** 해서 seq 와 이력 연속성을 보존한다.

### 스트림 필터로 news / deleted 생성

```java
List<ApprovalHistory> news = temps.stream()
    .filter(ah -> NEW.equals(ah.getCompareResult()))
    .collect(Collectors.toList());

List<ApprovalHistory> deleted = temps.stream()
    .filter(ah -> REMOVED.equals(ah.getCompareResult()))
    .collect(Collectors.toList());
```

**중요한 점**: `Collectors.toList()` 는 새 ArrayList 를 반환하지만, 안의 요소는 temps 의 객체와 **참조 공유**한다. 즉 `news` 와 `deleted` 는 컨테이너만 새롭고, 안의 `ApprovalHistory` 들은 원본 temps 의 것과 같은 객체. 이게 나중에 "두 번 remove" 가 의미를 갖는 이유.

### 바깥 for + switch + 2단계 break

```java
for (ApprovalHistory newly : news) {
    ApprovalHistory matched = null;

    for (ApprovalHistory deleting : deleted) {
        switch (newly.getApprovalType()) {
            case APPROVAL:
                if (...) { matched = deleting; break; }   // ← switch 탈출
                if (...) { matched = deleting; break; }
                break;
            case CANCEL: ...
            case PARTIAL_CANCEL: ...
            case REJECT: ...
        }

        if (matched != null) {
            break;   // ← 이제 inner for 탈출
        }
    }

    if (matched != null) { /* 매칭 처리 */ }
}
```

**Switch-Break 패턴의 미묘함.** Java 의 switch 안에서 `break` 는 switch 블록을 빠져나가는 것이지 for 를 빠져나가는 게 아니다. 그래서 switch 끝나고 나서 `if (matched != null) break;` 로 inner for 를 한 번 더 탈출시키는 2단계 구조가 필요하다.

읽기에는 약간 혼란스러운데, 더 깔끔한 리팩토링은 switch 부분을 `findCrossMatch(newly, deleted)` 같은 별도 메소드로 빼는 것이다.

---

## 7. Switch case 4종 — 정상 + 버그 수용

각 case 는 **"신규 거래의 승인유형"** 기준으로 **"기존 REMOVED 중 어떤 걸 매칭할지"** 결정한다. 정상 케이스 + "외부 API 변덕을 흡수하는 버그 수용" 케이스가 섞여 있다.

| newly | 정상 매칭 (deleting 의 기존 type) | 버그 수용 매칭 |
|-------|---------|--------------|
| **APPROVAL** | — | CANCEL, REJECT, PARTIAL_CANCEL |
| **CANCEL** | APPROVAL | REJECT, PARTIAL_CANCEL |
| **PARTIAL_CANCEL** | APPROVAL, PARTIAL_CANCEL | CANCEL, REJECT |
| **REJECT** | APPROVAL | CANCEL, PARTIAL_CANCEL |

가장 흔한 정상 케이스는 **`CANCEL` 의 조건 1** — "기존이 APPROVAL 이고 새 응답이 CANCEL" — "승인 → 취소 전환". `PARTIAL_CANCEL` 의 정상 케이스 두 개는 "승인 → 부분취소", "추가 부분취소".

### "버그 수용" 은 무슨 뜻인가

정상적 카드 거래에서는 취소된 건이 다시 승인으로 돌아오는 일이 없어야 한다. 그런데 외부 스크래핑 벤더가 **잘못된 상태 전환** 을 보내는 일이 가끔 있다 (벤더 측 데이터 꼬임, 카드사 응답 변동 등). 이때 시스템이 "이건 잘못된 응답이야!" 라고 거부하고 NEW + REMOVED 두 row 로 처리하면 이력이 끊기고 사용자 화면이 이상해진다. 그래서 **관대하게 수용** — 같은 거래로 인식해서 단일 UPDATE 로 흡수.

> 이게 **"외부 API 변덕을 시스템이 부드럽게 흡수"** 의 구체적 구현이다. 1편의 "빈 결과 에러를 성공으로 처리" 와 비슷한 정신 — 외부 세계의 불완전함을 내부에서 정합성으로 번역.

### 잠재 버그 1 — `equalsByApprovalNumAndDTAndDifferentAmount`

`PARTIAL_CANCEL` case 의 조건 3 에서 `equalsByApprovalNumAndDTAndDifferentAmount` 가 호출된다. 이름은 **"금액이 다른"** 을 뜻해야 할 것 같은데, 실제 구현:

```java
public boolean equalsByApprovalNumAndDTAndDifferentAmount(ApprovalHistory that) {
    return Objects.equals(this.approvalNum, that.approvalNum) &&
        Objects.equals(this.approvalDT.toLocalDate(), that.approvalDT.toLocalDate()) &&
        this.equalsBigDecimalsAbs(this.approvalAmount, that.approvalAmount);  // ← abs 같음
}
```

`equalsBigDecimalsAbs` 는 절대값이 같은지 비교 (`a.abs() == b.abs()`). 즉 **"부호만 다르고 절대값은 같음"** 을 판정. 이름은 "Different" 인데 구현은 "Absolute Equal".

게다가 같은 클래스의 `equalsByApprovalNumAndDTAndAmount` 도 내부 구현이 정확히 동일하다.

```java
public boolean equalsByApprovalNumAndDTAndAmount(ApprovalHistory that) {
    return Objects.equals(this.approvalNum, that.approvalNum) &&
        Objects.equals(this.approvalDT.toLocalDate(), that.approvalDT.toLocalDate()) &&
        this.equalsBigDecimalsAbs(this.approvalAmount, that.approvalAmount);  // ← 똑같이 abs
}
```

두 메소드가 같은 로직. **"DifferentAmount" 라는 이름은 구현과 어긋남.** 명백한 네이밍 버그 — 원래는 "금액이 다른 경우만 매칭" 하려고 했던 것 같지만 구현이 잘못 들어갔거나, 둘 다 abs 로 바꾸면서 네이밍은 안 고친 흔적.

### 잠재 버그 2 — `newly.equals(matched)` dead code

매칭 성공 후 처리 부분에 이런 코드가 있다.

```java
if (matched != null) {
    deleted.remove(matched);
    integrateQueue.getTemps().remove(matched);

    if (newly.equals(matched)) {
        newly.setCompareResult(DO_NOTHING);
    } else {
        ...
    }
}
```

**`newly.equals(matched)` 는 사실상 절대 true 가 될 수 없다.** 이유:

1. `ApprovalHistory` 클래스는 `equals()` 를 오버라이드하지 않음 (Lombok `@Getter` 만 있고 `@EqualsAndHashCode` 없음).
2. 그래서 `equals()` 는 `Object.equals()` = **참조 동일성** 검사.
3. `newly` 는 temps 에서 왔고 `matched` 는 deleted 에서 왔는데, 둘 다 다른 row 에서 만들어진 다른 객체.
4. 따라서 항상 false → DO_NOTHING 분기는 **dead code**.

아마 `equalsAll()` 을 부르려 했는데 `equals()` 를 잘못 호출한 흔적으로 보인다. 운영상 티는 안 나지만 코드 정확성 관점에서 개선 여지.

### 두 번 remove() 호출의 의미

```java
deleted.remove(matched);
integrateQueue.getTemps().remove(matched);
```

- `deleted` 는 스트림으로 만든 새 ArrayList (로컬 복사본). 다음 newly 의 inner for 에서 또 매칭되지 않도록 제거.
- `integrateQueue.getTemps()` 는 원본 리스트. 이후 Writer 5/6/7 이 `getRemovedApprovalHistories()` 등으로 조회할 때 이 REMOVED 항목이 안 나오도록 제거.

같은 객체를 양쪽에서 지워줘야 하는 이유는 두 리스트가 **참조를 공유**하고 있어서다.

---

## 8. 모든 분기를 한 번에 — 10건 종합 시나리오

여기서부터는 손으로 따라가는 학습용 케이스다. **A001~A010 거래 10건**이 의도적으로 모든 if 분기를 한 번씩 발동시키도록 설계되어 있다. 운영 데이터에서는 보통 DO_NOTHING 이 압도적이고 나머지는 가끔 발동되는데, 이 시나리오는 한 화면에 다 보이게 압축한 것.

### 시작 상태

**본 테이블 `approval_histories` — olds (8건):**

| seq | num | type | dt | amount | storeName | bizId | taxType |
|----|----|----|----|----|----|----|----|
| 7001 | A001 | APPROVAL | 04-10 12:30:45 | 15000 | 카페A | 1234567890 | GENERAL |
| 7002 | A002 | APPROVAL | 04-10 14:00:00 | 8000 | 식당B | 1111111111 | **NULL ⚠** |
| 7003 | A003 | APPROVAL | 04-11 09:15:30 | 22000 | 호프C | 2222222222 | GENERAL |
| 7004 | A004 | APPROVAL | 04-11 18:00:00 | 5500 | 편의점D | 3333333333 | GENERAL |
| 7005 | A005 | APPROVAL | 04-12 10:00:00 | 30000 | 옛이름 | 4444444444 | GENERAL |
| 7006 | A006 | APPROVAL | 04-12 12:00:00 | 10000 | 마트F | 5555555555 | GENERAL |
| 7007 | A007 | APPROVAL | 04-13 11:00:00 | 12000 | 카페G | 6666666666 | GENERAL |
| 7008 | A008 | APPROVAL | 04-13 14:00:00 | 50000 | 백화점H | 7777777777 | GENERAL |

**외부 API 응답 `approval_histories_temp` — temps (9건):**

| temp_seq | num | type | dt | amount | storeName | bizId | 변화 |
|----|----|----|----|----|----|----|----|
| 5001 | A001 | APPROVAL | 04-10 12:30:45 | 15000 | 카페A | 1234567890 | (그대로) |
| 5002 | A002 | APPROVAL | 04-10 14:00:00 | 8000 | 식당B | 1111111111 | (그대로) |
| 5003 | A003 | APPROVAL | **04-11 09:15:32** | 22000 | 호프C | 2222222222 | ⏰ 시간 2초 차이 |
| 5004 | A004 | APPROVAL | 04-11 18:00:00 | 5500 | 편의점D | **9999999999** | 🆔 사업자번호 변경 |
| 5005 | A005 | APPROVAL | 04-12 10:00:00 | 30000 | **새이름** | 4444444444 | 📝 이름 변경 |
| 5006 | A007 | **CANCEL** | 04-13 11:00:00 | 12000 | 카페G | 6666666666 | 🔄 승인→취소 |
| 5007 | A008 | **PARTIAL_CANCEL** | 04-13 14:00:00 | 50000 | 백화점H | 7777777777 | 🔄 승인→부분취소 |
| 5008 | A009 | APPROVAL | 04-13 16:00:00 | 7000 | 카페I | 8888888888 | ✨ 신규 |
| 5009 | A010 | APPROVAL | 04-13 17:00:00 | 25000 | 식당J | 0000000001 | ✨ 신규 |

> **⚠ A006 이 외부 응답에 없음** — Phase 2 에서 REMOVED 후보가 된다.

### Phase 1 — temp 9건 순회

| Step | temp | 매칭? | 분류 | 비고 |
|------|------|-------|------|------|
| 1 | A001 | ✅ olds.A001 | 🟢 DO_NOTHING (C-3) | 모든 필드 동일 |
| 2 | A002 | ✅ olds.A002 | 🟡 STORE_TAX_TYPE_IS_NULL (C-1) | equalsAll true 인데 taxType NULL |
| 3 | A003 | ✅ olds.A003 | 🟠 UPDATED (시간 보정) (C-2) | 자연 키는 날짜만 비교 → 매칭, equalsAll true (날짜만 봄), 그러나 시간 다름 → UPDATE + 휴폐업 복사 |
| 4 | A004 | ✅ olds.A004 | 🔵 UPDATED_STORE_BIZ_ID (C-4) | bizId 다름 → 휴폐업 재조회 트리거 |
| 5 | A005 | ✅ olds.A005 | 🟣 UPDATED 일반 (C-5) | storeName 다름 → 휴폐업 복사 |
| 6 | A007/CANCEL | ❌ (type 다름) | ⚪ NEW | Phase 3 후보 |
| 7 | A008/PARTIAL_CANCEL | ❌ (type 다름) | ⚪ NEW | Phase 3 후보 |
| 8 | A009 | ❌ | ⚪ NEW | 진짜 신규 |
| 9 | A010 | ❌ | ⚪ NEW | 진짜 신규 |

> Step 6/7 이 핵심 — **자연 키에 `approvalType` 이 포함돼 있어서** "같은 거래의 type 전환" 이 일부러 매칭에 실패하게 되어 있다. Phase 3 에서 다시 잡힐 것.

Phase 1 종료 시점, **olds 잔여 3건**:

| seq | num | 이유 |
|----|----|----|
| 7006 | A006 | 외부 응답에 A006 자체가 없음 |
| 7007 | A007 | A007/CANCEL 과 type 달라서 매칭 실패 |
| 7008 | A008 | A008/PARTIAL_CANCEL 과 type 달라서 매칭 실패 |

### Phase 2 — 잔여 olds 에 REMOVED 라벨

3건이 REMOVED 라벨을 달고 temps 에 합쳐진다. 이제 temps 는 12건.

```
A001 [DO_NOTHING]                    ← Phase 1
A002 [STORE_TAX_TYPE_IS_NULL]
A003 [UPDATED 시간]
A004 [UPDATED_STORE_BIZ_ID]
A005 [UPDATED 일반]
A007/CANCEL [NEW]                    ← Phase 1, Phase 3 후보
A008/PARTIAL_CANCEL [NEW]
A009 [NEW]                           ← 진짜 신규
A010 [NEW]
A006 [REMOVED]                       ← Phase 2 ⭐
A007/APPROVAL [REMOVED]              ← Phase 2 ⭐
A008/APPROVAL [REMOVED]              ← Phase 2 ⭐
```

**여기가 진짜 흥미로운 시점.** A007 과 A008 이 두 번씩 들어있다 — 같은 거래가 NEW + REMOVED 로 중복 분류된 모순 상태. Phase 3 가 이걸 풀어줘야 한다.

### Phase 3 — Cross-match

```
news    = [A007/CANCEL, A008/PARTIAL_CANCEL, A009, A010]
deleted = [A006, A007/APPROVAL, A008/APPROVAL]
```

**Step 1: newly = A007/CANCEL**

```
inner for deleted:
  A006/APPROVAL/10000 → num 다름 → false
  A007/APPROVAL/12000 → num/dt/amount 같음 + deleting.type == APPROVAL → ✅ 매칭!
```

처리:
- `deleted.remove(A007/APPROVAL)`
- `temps.remove(A007/APPROVAL)`  ← 두 번 remove
- `newly.seq = 7007` (기존 seq 주입!) ⭐
- bizId 같음 → UPDATED 분류
- 휴폐업 복사

**Step 2: newly = A008/PARTIAL_CANCEL** — A008/APPROVAL 과 매칭. 위와 동일 패턴, seq=7008 유지.

**Step 3: newly = A009** — deleted 에 A006 만 남았는데 num 이 다름 → 매칭 실패 → NEW 유지 (진짜 신규).

**Step 4: newly = A010** — 동일하게 NEW 유지.

### Phase 3 종료 시점 — 최종 분류

| temp | 최종 분류 | seq | 다음 처리 |
|------|----------|-----|----------|
| A001 | 🟢 DO_NOTHING | 7001 | 아무 작업 안 함 |
| A002 | 🟡 STORE_TAX_TYPE_IS_NULL | 7002 | Writer 4 휴폐업 재조회 |
| A003 | 🟠 UPDATED (시간) | 7003 | Writer 6 UPDATE + `_updated` |
| A004 | 🔵 UPDATED_STORE_BIZ_ID | 7004 | Writer 4 + Writer 6 + `_updated` |
| A005 | 🟣 UPDATED (일반) | 7005 | Writer 6 UPDATE + `_updated` |
| A007/CANCEL | 🟠 UPDATED ⭐ | 7007 | Writer 6 UPDATE (Phase 3 결과) |
| A008/PARTIAL_CANCEL | 🟠 UPDATED ⭐ | 7008 | Writer 6 UPDATE (Phase 3 결과) |
| A009 | ⚪ NEW | 신규 | Writer 4 + Writer 7 INSERT |
| A010 | ⚪ NEW | 신규 | Writer 4 + Writer 7 INSERT |
| A006 | 🔴 REMOVED | 7006 | Writer 5 DELETE + `_removed` |

A007/APPROVAL 과 A008/APPROVAL 은 Phase 3 cross-match 로 사라졌다. **DELETE + INSERT 2쌍 → UPDATE 1쌍씩으로 절약됨.**

### 최종 DB 변화

**`approval_histories` 본 테이블:**

| seq | num | 변화 |
|----|----|----|
| 7001 | A001 | 변화 없음 |
| 7002 | A002 | 변화 없음 + storeCompanyType 채워짐 (Writer 4) |
| 7003 | A003 | UPDATE 시간 → 09:15:32 |
| 7004 | A004 | UPDATE bizId → 9999999999 + 휴폐업 재조회 |
| 7005 | A005 | UPDATE storeName → "새이름" |
| 7006 | A006 | DELETE |
| 7007 | A007 | UPDATE type → CANCEL ⭐ (seq 유지!) |
| 7008 | A008 | UPDATE type → PARTIAL_CANCEL ⭐ (seq 유지!) |
| 7009 | A009 | INSERT |
| 7010 | A010 | INSERT |

**`approval_histories_updated` — 변경 전 박제:** 5건 (A003, A004, A005, A007, A008 의 변경 전 모습)

**`approval_histories_removed` — 삭제 전 박제:** 1건 (A006)

### 모든 분기 발동 확인

| 분기 | 트리거 | 발동? |
|------|--------|------|
| (C-1) STORE_TAX_TYPE_IS_NULL | A002 | ✅ |
| (C-2) UPDATED 시간 보정 | A003 | ✅ |
| (C-3) DO_NOTHING | A001 | ✅ |
| (C-4) UPDATED_STORE_BIZ_ID | A004 | ✅ |
| (C-5) UPDATED 일반 | A005 | ✅ |
| NEW (Phase 1, 진짜 신규) | A009, A010 | ✅ |
| NEW (Phase 1, Phase 3 후보) | A007/CANCEL, A008/PARTIAL_CANCEL | ✅ |
| REMOVED (Phase 2) | A006 | ✅ |
| REMOVED (Phase 2, Phase 3 흡수) | A007/APPROVAL, A008/APPROVAL | ✅ |
| Phase 3 cross-match (CANCEL) | A007 | ✅ |
| Phase 3 cross-match (PARTIAL_CANCEL) | A008 | ✅ |
| Phase 3 cross-match 실패 (NEW 유지) | A009, A010 | ✅ |

**모든 분기가 한 번씩 발동.** 이 시나리오를 손으로 한 번 따라가 보면 Compare 로직의 모든 미궁이 한 화면에 정리된다.

---

## 9. 핵심 교훈

1. **Writer 3 은 DB 에 아무것도 쓰지 않는다.** 순수 메모리 연산. 그런데 이 분류 결과가 이후 모든 Writer 의 행동을 결정한다. **분류와 실행의 분리** 가 깔끔.

2. **Consumption 패턴이 Phase 1 → Phase 2 의 다리 역할.** Phase 1 에서 매칭되면 olds 에서 제거, 그 결과 잔여분이 자연스럽게 REMOVED 가 된다. 한 줄짜리 `olds.remove(matched)` 가 Phase 2 의 단순함을 받쳐준다.

3. **Phase 3 cross-match 가 이 메소드의 존재 이유.** 자연 키에 `approvalType` 을 포함시킨 의미가 여기서 살아난다. cross-match 가 없으면 승인유형 전환이 매번 DELETE + INSERT 로 처리되어 seq 가 끊기고 이력 연속성이 깨진다.

4. **Switch case 의 "버그 수용" = 외부 API 변덕 흡수.** 정상적이지 않은 상태 전환을 거부하지 않고 단일 UPDATE 로 흡수한다. 1편의 "빈 결과 에러를 성공으로 처리" 와 같은 정신.

5. **3줄짜리 휴폐업 복사 코드가 무한 루프를 막는다.** equalsAll 시점에 휴폐업 정보를 복사하지 않으면 매 수집마다 본 테이블의 휴폐업이 NULL 로 덮여서 재조회 폭주.

6. **잠재 버그 2개는 운영에는 티 안 남.** `equalsByApprovalNumAndDTAndDifferentAmount` 의 네이밍/구현 불일치, `newly.equals(matched)` dead code. 코드 리뷰 시점에 정리하면 좋은 정도.

---

## 10. 두 심장의 분업 — 1편과 2편을 잇는 한 줄

| | `collectStepWriterCollect` (1편) | `integrateStepWriterCompare` (2편) |
|---|---|---|
| **위치** | CollectJob Writer 2 | IntegrateJob Writer 3 |
| **하는 일** | 외부 HTTP 호출, 응답 받기 | 받은 응답을 본 테이블 정합성으로 번역 |
| **외부 의존** | 4개 (HTTP 클라이언트 포함) | **0개** (순수 메모리 연산) |
| **결정하는 것** | `CollectResult.status` (3종) | 각 ApprovalHistory 의 `CompareResult` (6종) |
| **이후 영향** | Writer 3~10 (9개) 의 실행 여부 | Writer 4~12 (9개) 의 실행 여부 |
| **핵심 정신** | 외부 변덕을 yml 설정으로 흡수 | 외부 변덕을 분기 로직으로 흡수 |

> CollectJob 의 `collectStepWriterCollect` 가 **"외부와 접촉하는 문"** 이라면,
> IntegrateJob 의 `integrateStepWriterCompare` 는 **"외부의 혼돈을 내부의 질서로 번역하는 지점"** 이다.
>
> 두 메소드 모두 자기 Job 의 다른 모든 Writer 들에게 **지시서 (status / compareResult) 를 발행하는 지휘관** 역할을 한다. 그 덕분에 나머지 Writer 들은 단순 실행자로 남을 수 있고, 각자의 책임이 명료해진다.

---

## 11. 한 문장 요약

> `integrateStepWriterCompare` 는 IntegrateJob 의 심장이자 뇌로,
> Phase 1 에서 temp 를 olds 와 자연 키로 매칭하며 5가지 세부 분류를 찍고 매칭된 old 를 consumption 으로 소진한 뒤,
> Phase 2 에서 잔여 olds 를 REMOVED 로 합치고,
> Phase 3 에서 같은 거래의 승인유형 전환 (NEW + REMOVED) 을 switch-case 4종 매칭으로 단일 UPDATE 로 병합하는 **작업 디스패처**다.

이 메소드를 이해하고 나면 `approval_histories_updated` 와 `approval_histories_removed` 두 감사 로그 테이블이 왜 존재하는지, 왜 `cards.latest_*` 의 건수 보정이 IntegrateJob 의 마지막 단계에 들어가는지, 왜 외부 스크래핑 시스템이 "한 번 받은 데이터를 본 테이블에 곧바로 쓰지 않고" 굳이 `_temp` 라는 우회로를 거치는지 — 모든 게 한 줄로 이어진다.
