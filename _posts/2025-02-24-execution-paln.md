---
layout: post
title: MySQL RDS 실행 계획(Execution Plan)
---
MySQL에서 실행 계획을 분석하는 것은 **쿼리 성능을 최적화하는 핵심 과정**입니다. RDS 환경에서도 실행 계획을 활용하면 **인덱스 활용 여부, 조인 방식, 풀 테이블 스캔 발생 여부** 등을 확인하고 성능을 개선할 수 있습니다.

---

## 1. 실행 계획 확인 방법

### 1) 기본 실행 계획 조회
```sql
EXPLAIN SELECT * FROM your_table WHERE some_column = 'some_value';
```
- `EXPLAIN`은 **쿼리가 어떻게 실행될지** 보여줍니다.
- **인덱스 사용 여부, 테이블 스캔 방식, 조인 방식** 등을 확인할 수 있습니다.

### 2) 실제 실행 후 실행 계획 조회
```sql
EXPLAIN ANALYZE SELECT * FROM your_table WHERE some_column = 'some_value';
```
- `EXPLAIN ANALYZE`는 **쿼리를 실제 실행한 후 성능 데이터를 출력**합니다.
- 예상과 실제 실행 시간 차이, 반복 횟수 등을 확인할 수 있습니다.

---

## 2. 실행 계획 주요 컬럼 설명

`EXPLAIN` 실행 결과 예제:

| id | select_type | table      | type  | possible_keys | key  | key_len | ref  | rows | filtered | Extra               |
|----|------------|-----------|-------|--------------|------|---------|------|------|----------|----------------------|
| 1  | SIMPLE     | my_table  | ref   | idx_column   | idx_column | 4     | const | 10   | 100.0     | Using index          |

### 주요 컬럼 설명

#### 1) `id`
- 실행 순서를 나타냅니다. 큰 숫자가 먼저 실행됩니다.

#### 2) `select_type`
- 쿼리의 유형
    - `SIMPLE`: 단순 SELECT (JOIN 없음)
    - `PRIMARY`: 메인 쿼리
    - `SUBQUERY`: 서브쿼리
    - `DERIVED`: 파생 테이블 (임시 테이블)
    - `UNION`: `UNION` 포함 쿼리

#### 3) `table`
- 조회되는 테이블 이름

#### 4) `type` (가장 중요한 컬럼!)
- 테이블 조회 방식 (우선순위: **좋음 → 나쁨**)
    - `system` → `const` → `eq_ref` → `ref` → `range` → `index` → `ALL`
    - `ALL`: **풀 테이블 스캔 (성능 저하 가능성 큼)**

#### 5) `possible_keys`
- 사용 가능한 인덱스 목록 (NULL이면 인덱스 미사용 가능성 있음)

#### 6) `key`
- 실제 사용된 인덱스

#### 7) `rows`
- MySQL이 예상하는 **스캔해야 할 행 개수** (값이 크면 최적화 필요!)

#### 8) `filtered`
- `WHERE` 조건을 만족하는 **비율(%)** (100%에 가까울수록 좋음)

#### 9) `Extra` (쿼리 최적화의 핵심!)
- `Using index`: **커버링 인덱스 사용 (효율적)**
- `Using where`: WHERE 조건 사용 (인덱스 미사용 가능성 있음)
- `Using temporary`: **임시 테이블 사용 (최적화 필요)**
- `Using filesort`: **ORDER BY 정렬이 필요하여 성능 저하 가능**
- `Using join buffer`: **조인 시 임시 버퍼 사용 (최적화 필요)**

---

## 3. 실행 계획을 활용한 최적화 방법

### 1) `ALL` (풀 테이블 스캔) 발생 시 해결 방법
- 원인: **WHERE 절에 인덱스를 사용할 수 없음**
- 해결책:
    - `WHERE` 조건에 **적절한 인덱스 추가**
    - **커버링 인덱스** 활용
    - `EXPLAIN`으로 인덱스가 사용되는지 확인

### 2) `Using temporary`, `Using filesort` 해결 방법
- 원인: **ORDER BY, GROUP BY 등으로 정렬 필요**
- 해결책:
    - **ORDER BY 컬럼에 맞는 인덱스 추가**
    - `CREATE INDEX idx ON table (col1, col2);`

### 3) `Using join buffer` 문제 해결
- 원인: **조인 시 인덱스 미사용**
- 해결책:
    - **조인 컬럼에 인덱스 추가**
    - `EXPLAIN`으로 `ref` 또는 `eq_ref`인지 확인

### 4) `filtered` 값이 너무 낮을 때
- 원인: **WHERE 조건이 너무 많은 데이터를 조회**
- 해결책:
    - **불필요한 데이터 필터링**
    - **SELECT 절에서 필요한 컬럼만 가져오기**

---

## 4. 실행 계획 분석 예제

### 성능이 느린 쿼리 예제
```sql
SELECT * FROM orders WHERE order_date > '2024-01-01' ORDER BY customer_id;
```

`EXPLAIN` 결과:

| id | select_type | table  | type | possible_keys | key  | key_len | ref  | rows  | Extra              |
|----|------------|--------|------|--------------|------|---------|------|------|--------------------|
| 1  | SIMPLE     | orders | ALL  | NULL         | NULL | NULL    | NULL | 100000 | Using filesort     |

#### 문제점
- **`ALL` (풀 테이블 스캔) 발생** → 인덱스 없음
- **`Using filesort` 발생** → 정렬 시 성능 저하

#### 해결 방법
1. `order_date` 컬럼에 **인덱스 추가**:
   ```sql
   CREATE INDEX idx_order_date ON orders (order_date);
   ```
2. **정렬 키(customer_id) 포함 인덱스 추가**:
   ```sql
   CREATE INDEX idx_customer_order ON orders (customer_id, order_date);
   ```

이후 `EXPLAIN`을 다시 실행하면 `type`이 `range` 또는 `index`로 변경되면서 성능이 향상됩니다.

---

## 5. 결론
1. **`EXPLAIN`을 사용하여 실행 계획을 분석**
2. **풀 테이블 스캔(`ALL`)을 피하고 인덱스를 활용**
3. **조인(`JOIN`) 시 적절한 인덱스를 설정**
4. **ORDER BY, GROUP BY 최적화 (filesort, temporary 테이블 피하기)**
5. **쿼리 튜닝 후 `EXPLAIN ANALYZE`로 실제 성능 확인**

이제 `EXPLAIN`을 활용해 RDS MySQL 쿼리 성능을 최적화해보세요! 🚀
