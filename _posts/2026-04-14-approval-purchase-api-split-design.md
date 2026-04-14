---
layout: post
title: 승인 / 매입 API 분리 설계 기록 — 카드사 기반 하드코딩을 사용자 선택 구조로
tags: [ architecture, api-design, refactoring, postgresql ]
---

외부 스크래핑 API 에는 **"승인내역 조회"** 와 **"매입내역 조회"** 두 엔드포인트가 있다. 우리 서비스는 그동안 **특정 카드사만 매입** 을 쓰고 나머지는 전부 승인을 쓰는 형태로 yml 설정에 하드코딩되어 있었는데, 이걸 **카드 등록 시점에 사용자가 수집 타입을 선택** 하는 구조로 전환한다. 이 글은 그 과정에서 내린 설계 결정의 기록이다.

> 설계 초기에 잡힌 요구사항은 두 줄짜리지만, 이걸 파이프라인 전 구간에 반영하려면 의외로 고민할 게 많았다. 테이블 전략, 레거시 데이터 호환, API 네이밍, 미결 질문 등을 시간 순으로 정리한다.

---

## 1. 배경

외부 스크래핑 API 는 **승인내역 조회** / **매입내역 조회** 2개의 엔드포인트를 제공한다. 요청 스펙은 완전히 동일하고 응답 필드도 약 95% 공용 (매입 전용 3필드만 추가). 두 API 는 URL 만 다르고 내부적으로는 거의 같은 메커니즘.

우리 서비스는 현재 `application.yml` 의 카드사-타입 매핑 설정으로 **특정 카드사 한 곳만 매입 API 를 쓰고**, 나머지는 전부 승인 API 를 쓰도록 분기되어 있다. (이 특정 카드사 예외는 이전 API 시절의 데이터 연속성 유지 때문에 유지되어 온 역사적 케이스.)

이 "카드사 기반 자동 분기" 를 걷어내고, **카드 등록 시점에 사용자가 `collectType` 을 직접 선택** 하는 구조로 전환한다.

## 2. 요구사항

출발점이 된 두 줄짜리 요구사항.

1. 카드 등록 시 사용자가 `collectType` (`APPROVAL` / `PURCHASE`) 을 택1. 한 카드 = 1개 타입.
2. 기존의 `ApprovalHistoryApiController` 를 **`CollectHistoryApiController`** 로 리네이밍하고, 내부에 승인 조회 / 매입 조회 메소드 2개를 둔다.

한 카드에 승인·매입 모두 동시 수집하는 케이스는 지원하지 않는다. 단순성을 우선.

---

## 3. 결정 사항

요구사항 2줄에서 출발했지만 실제로 결정해야 할 게 10가지였다. 정리하면

| # | 항목 | 결정 |
|---|------|------|
| 1 | 수집 단위 | 카드 1장 = 승인 OR 매입 택1 (1:1) |
| 2 | `cards` 테이블 | `collect_type TEXT NOT NULL` 컬럼 추가 |
| 3 | 등록 API | `POST /api/cards` body 에 `collectType` **optional**. 생략 시 기본값으로 카드사별 자동 매핑 (레거시 호환) |
| 4 | 히스토리 테이블 | `approval_histories` 계열 + archive 에 `collect_type` 컬럼 추가 (**단일 테이블 유지**, 테이블 분리 안 함) |
| 5 | yml 카드사 매핑 | **완전 삭제**. 승인 URL / 매입 URL 2개만 남김 |
| 6 | `getCardApiUrl` 메소드 | 시그니처 `(CardCompanyCode, CardType)` → **`(CollectType)`** 로 단순화. 15줄 로직 → 3줄 삼항 |
| 7 | 컨트롤러 | `ApprovalHistoryApiController` → **`CollectHistoryApiController`** 로 리네이밍 + 메소드 2개 분리 |
| 8 | URL | `/api/approval-histories` (기존 유지), `/api/purchase-histories` (신설) |
| 9 | `checkValidity` (계정 검증) | 등록하려는 `collectType` 기준 URL 호출 |
| 10 | 기존 데이터 | 카드사 기반으로 일괄 백필 (과거 매입 쓰던 카드사 → PURCHASE, 나머지 → APPROVAL) |

### 3.1 몇 가지 주목할 결정

**① 히스토리 테이블을 분리하지 않은 이유**

처음엔 `approval_histories` 와 별도로 `purchase_histories` 테이블을 두는 안도 검토했다. 근데 외부 API 의 실제 응답 스펙을 비교해보니

- 공통 필드: **23개**
- 매입 전용 필드: **3개** (`USEDATE`, `BUYYN`, `APPVIEWCARDNUM`)
- 승인 전용 필드: **0개**

즉 매입 응답은 승인 응답의 거의 완전한 상위집합 (superset) 이다. 테이블을 분리하면

- 같은 구조를 가진 테이블이 **본/`_temp`/`_updated`/`_removed` + archive 까지 총 8종 이상** 이 생김
- 매퍼/서비스/컨트롤러를 대부분 2벌로 복제해야 함
- 승인·매입 공통 조회 로직이 필요해지면 UNION 으로 복잡해짐

이걸 피하기 위해 **`collect_type` discriminator 컬럼 + 매입 전용 nullable 3컬럼** 조합으로 단일 테이블 전략을 택했다.

**② 등록 API 의 `collectType` 을 optional 로**

엄격하게 하자면 등록 body 에 `collectType` 이 반드시 있어야 한다. 근데 그러면 기존 클라이언트들이 전부 수정되기 전에는 등록 자체가 실패한다. 그래서

- 명시되면 → 그대로 저장
- 생략되면 → 카드사별 기본값 자동 매핑 (과거 매입 쓰던 카드사는 PURCHASE, 나머지는 APPROVAL)

이렇게 하면 기존 클라이언트가 한 줄도 수정 안 하고도 동작이 유지된다. 기본값 로직은 **등록 API 레이어에만** 존재하고, 파이프라인 (`EnqueueJob`/`CollectJob`/`IntegrateJob`) 은 **오로지 `cards.collect_type` 만 읽는다**. 카드사별 분기의 마지막 흔적을 등록 레이어 안에 가두는 전략.

**③ 컨트롤러 네이밍을 중립적으로**

- 기존: `ApprovalHistoryApiController` (승인 편향 이름)
- 신규: **`CollectHistoryApiController`** (중립 이름)

안에 `searchApprovalHistories()` / `searchPurchaseHistories()` 두 메소드를 둔다. URL 은 `/api/approval-histories` 를 유지하면서 `/api/purchase-histories` 를 신설. **"API 는 분리하되 내부 서비스/매퍼는 공유"** 가 핵심 원칙.

---

## 4. 미결 / 열린 질문

### 4.1 등록 후 `collectType` 변경을 허용할 것인가

아직 결정 안 된 부분. 둘 다 일장일단이 있다.

**허용 시**
- 장점: 운영 유연성 — 정책 변경을 데이터 수정만으로 대응. 외부 API 스펙 변경 (매입 API 폐기 등) 대응 경로 확보.
- 단점:
  - **정합성 딜레마** — 한 카드에 "과거 매입 이력 + 전환 이후 승인 이력" 이 공존하면서 조회 UI 에서 "이 카드의 과거 매입 데이터가 왜 승인 탭에 안 보이지?" 혼란 발생.
  - 전환 시점 경계 처리 필요 (쿼리 복잡도 상승).
  - 수집 중 (`in_progress=TRUE`) 카드의 타입 변경을 막는 락/검증 필요.

**불허 시**
- 장점: 데이터 일관성 단순. 수정 API 코드 단순, 엣지케이스 없음.
- 단점: 운영 변경 시 카드 삭제 후 재등록 우회 경로 강제.

**잠정 방향**: **초기엔 불허**. 실제 변경 요구 발생 시 재설계. 지금 허용하면 위의 정합성 이슈를 해결하는 코드/쿼리 복잡도가 프로젝트 초기 스코프를 넘어선다.

---

## 5. 영향 범위

설계는 간단해 보이지만, `collect_type` 컬럼이 파이프라인 전 구간을 **릴레이** 하도록 만들어야 한다. 건드려야 할 지점을 빠짐없이 정리한다.

### 5.1 스키마 변경 — 9개 테이블

**`cards`**
- `collect_type TEXT NOT NULL` 추가

**`approval_histories` 계열 4개** (본 + `_temp` + `_updated` + `_removed`)
- `collect_type TEXT NOT NULL` 추가

**archive 템플릿** (`archive.approval_histories_YYYY`, `_updated_YYYY`, `_removed_YYYY`)
- 동일하게 `collect_type` 추가

**수집 파이프라인 큐·로그**
- `collect_queues.collect_type TEXT NOT NULL`
- `integrate_queues.collect_type TEXT NOT NULL`
- `collect_logs.collect_type TEXT NOT NULL`

→ 총 **9개 테이블에 컬럼 추가**. "한 컬럼 추가" 처럼 보여도 실제로는 이 정도 범위라는 걸 미리 인지해야 스코프 예측이 맞는다.

### 5.2 공통 모듈

- **신설**: `CollectType { APPROVAL, PURCHASE }` enum
  - ⚠ 기존 `ApprovalType` (승인/취소/부분취소/거절/환급 — 거래 상태) 와 **이름 혼동 주의**. 주석 필수. 도메인 의미가 완전히 달라서 이 혼동은 코드리뷰에서 반드시 걸린다.
- **설정 파일**
  - 카드사-타입 매핑 리스트 삭제
  - 승인 URL / 매입 URL 2개만 남김
- **URL 결정 메소드 `getCardApiUrl`**
  - 기존: `(CardCompanyCode, CardType)` → yml 순회로 매핑 조회 (약 15줄)
  - 변경: `(CollectType)` → 3줄 삼항 (`collectType == PURCHASE ? purchaseUrl : approvalUrl`)
- **외부 API 호출 서비스 메소드 4개** (`checkValidity` x2, `getApprovalHistories` x2)
  - `collectType` 파라미터 추가
- **응답 VO** — 변경 없음 (승인/매입 응답 공용 확인됨)

### 5.3 `card-api` (등록/조회)

**등록**
- 등록 DTO 에 `collectType` 필드 추가 (optional)
- `CollectTypeDefaults.resolve(cardCompanyCode)` 유틸 신설 — 카드사별 기본값 반환
- `CardApiServiceImpl.registerCard` — 등록 시 `collectType` 저장 (생략 시 기본값 적용)
- `registerCardBulk` 동일 처리

**조회**
- **`ApprovalHistoryApiController` → `CollectHistoryApiController` 리네이밍**
  - `searchApprovalHistories` — `GET /api/approval-histories`, 내부 쿼리 `WHERE collect_type='APPROVAL'`
  - `searchPurchaseHistories` — `GET /api/purchase-histories`, `WHERE collect_type='PURCHASE'`
  - 단건 조회 (`/{seq}`) 및 메모 API 는 구현 시 공통 유지 or 타입별 분리 결정
- 서비스 / 매퍼도 같이 리네이밍

### 5.4 `card-scheduler`

`collect_type` 을 파이프라인 전 구간에 릴레이해야 한다.

- **`CollectQueue` VO** — `collectType` 필드 추가
- **`IntegrateQueue` VO** — `collectType` 필드 추가
- **`ApprovalHistory` 도메인 객체** — `collectType` 필드 추가
- **`EnqueueJobMapper.xml`** — 수집 대상 SELECT 에 `cards.collect_type` 포함
- **`CollectJobMapper.xml`**
  - `getCollectQueues` — `collect_type` SELECT
  - `insertApprovalHistoryTemps` — `collect_type` 세팅
  - `insertIntegrateQueue` — `collect_type` 세팅
  - `registerCollectLog` — `collect_type` 세팅
- **`IntegrateJobMapper.xml`** — temp → 본/`_updated`/`_removed` 이관 쿼리에 `collect_type` 매핑 추가
- **외부 API 호출 writer** — 외부 API 서비스 호출 시 `collectType` 전달

### 5.5 데이터 마이그레이션

단계별 SQL (카드사 코드는 실제 값으로 치환 필요).

```sql
-- cards 백필
UPDATE cards SET collect_type = 'PURCHASE' WHERE card_company_code = '과거_매입_카드사_코드';
UPDATE cards SET collect_type = 'APPROVAL' WHERE card_company_code <> '과거_매입_카드사_코드';

-- approval_histories 계열 백필 (본, _temp, _updated, _removed, archive 동일 처리)
UPDATE approval_histories ah
   SET collect_type = CASE
       WHEN c.card_company_code = '과거_매입_카드사_코드' THEN 'PURCHASE'
       ELSE 'APPROVAL'
   END
  FROM cards c
 WHERE ah.card_seq = c.card_seq;

-- 진행 중 큐/로그
UPDATE collect_queues   cq SET collect_type = c.collect_type FROM cards c WHERE cq.card_seq = c.card_seq;
UPDATE integrate_queues iq SET collect_type = c.collect_type FROM cards c WHERE iq.card_seq = c.card_seq;
UPDATE collect_logs     cl SET collect_type = c.collect_type FROM cards c WHERE cl.card_seq = c.card_seq;
```

**한계**: 매입 전용 3필드 (`USEDATE`, `BUYYN`, `APPVIEWCARDNUM`) 는 **백필 불가**. 과거 수집 시점에 이 필드들이 버려졌기 때문. 기존 데이터는 NULL 유지, 앞으로 새로 수집되는 매입 레코드부터 채워진다.

### 5.6 테스트

- `CollectType` enum 단위 테스트
- `CollectTypeDefaults.resolve` — 각 케이스
- `CardApiController.registerCard` — `collectType` 명시 / 생략 케이스
- `CollectHistoryApiController` — 승인/매입 메소드 각각, 필터 검증
- `EnqueueJob` / `CollectJob` / `IntegrateJob` — `collect_type` 포함 전체 플로우
- 마이그레이션 SQL 리허설 (스테이징 환경)

---

## 마치며 — 설계 과정에서 배운 것

### 1. 요구사항 2줄이 결정 10개로 번지는 과정

처음에는 "API 2개로 나누면 되지" 라고 생각했다. 실제로는

- 수집 단위가 뭐냐?
- 저장 위치가 뭐냐?
- 기존 데이터는 어떻게 처리?
- 테이블은 분리할지?
- 클라이언트 호환은?
- 네이밍 컨벤션?
- 검증 로직의 동작?

이 질문들이 줄줄이 딸려 나온다. 특히 **"기존 데이터와의 호환" 과 "레거시 클라이언트의 호환"** 은 간과하면 설계를 다시 해야 한다. 이번에는 `collectType` optional + 자동 기본값으로 이 두 가지를 동시에 커버했다.

### 2. 테이블 분리 vs discriminator — 공통 필드 비율이 답을 준다

외부 API 응답 스펙을 비교해서 **공통 23 / 전용 3 / 순수 전용 0** 임을 확인한 게 결정적이었다. 응답이 거의 상위집합 관계라면 테이블 분리의 이점이 거의 없고, 관리 비용만 두 배가 된다. **"도메인이 다르니까 테이블도 분리하자"** 는 휴리스틱은 실제 데이터 스펙을 보지 않으면 과한 결론이 될 수 있다.

### 3. 파이프라인 릴레이 — "한 컬럼 추가" 의 진짜 비용

`cards.collect_type` 이라는 **한 컬럼** 을 추가하는 결정이었지만, 실제로는 **9개 테이블 + 6개 매퍼 + 3개 VO + 4개 서비스 메소드** 가 영향받는다. 파이프라인을 통과하는 값은 시작 지점에만 추가하면 끝이 아니라 **전 구간을 릴레이** 해야 한다. 이 비용을 미리 예측하지 못하면 일정을 크게 초과한다.

### 4. "파이프라인은 카드사를 모른다" 는 대칭성 원칙

설계에서 지키고 싶었던 원칙 하나는 **"등록 이후의 코드는 카드사를 몰라야 한다"** 는 것. 등록 레이어에서만 카드사 → `collectType` 기본값 매핑이 존재하고, 그 이후 모든 파이프라인 코드는 `collect_type` 만 보고 동작한다. 이 대칭성을 지키면

- 나중에 새 카드사가 추가되어도 파이프라인 코드 변경 0
- 새로운 수집 타입 (예: 결제예정내역) 이 추가될 때도 최소 변경
- 테스트 케이스가 단순해짐

"비즈니스 룰은 경계에만 둔다" 는 원칙의 구체적 적용 사례였다.

### 5. 결정 못 한 건 그대로 열어두라

**§4.1 "등록 후 `collectType` 변경 허용 여부"** 는 아직 확정하지 않았다. 설계 문서에서는 이걸 억지로 결정하기보다 **장단점을 정리해두고 "초기엔 불허"** 로 잠정 방향을 기록했다. 운영하면서 실제 요구가 나올 때 다시 꺼내보면 된다.

설계 문서는 "모든 것을 결정한 문서" 가 아니라 **"결정한 것과 아직 안 한 것을 구분한 문서"** 여야 한다는 걸 이번 과정에서 체감했다.

---

결국 이 설계의 본질은 **"설정 (yml) 에 묻혀 있던 정책을 데이터 (DB 컬럼) 로 끌어올리는 것"** 이다. 정책이 설정 파일에 있으면 배포해야 바뀌고 카드사별 override 가 어렵다. 데이터에 있으면 운영에서 즉시 조정 가능하고 카드별 유연성이 생긴다. 이 리팩토링은 단순히 "API 하나 추가" 가 아니라 "정책을 코드 바깥에서 데이터 안으로 옮기는 작업" 으로 바라보는 게 맞다.
