---
layout: post
title: MySQL RDS 실행 계획(Execution Plan)
---
MySQL에서 실행 계획을 분석하는 것은 **쿼리 성능을 최적화하는 핵심 과정**입니다. RDS 환경에서도 실행 계획을 활용하면 **인덱스 활용 여부, 조인 방식, 풀 테이블 스캔 발생 여부** 등을 확인하고 성능을 개선할 수 있습니다.

옵티마이저가 SQL문을 어떤 방식으로 어떻게 처리할 지를 계획한 걸 의미한다. 이 실행 계획을 보고 비효율적으로 처리하는 방식이 있는 지 점검하고, 비효율적인 부분이 있다면 더 효율적인 방법으로 SQL문을 실행하게끔 튜닝을 하는 게 목표다.

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
- 
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
      - ALL : 풀 테이블 스캔
        - **풀 테이블 스캔(Full Table Scan)** 이란 **인덱스를 활용하지 않고 테이블을 처음부터 끝까지 전부 다 뒤져서 데이터를 찾는 방식**이다. 처음부터 끝까지 전부 다 뒤져서 필요한 데이터를 찾는 방식이다보니 **비효율적이다.**
      - index : 풀 인덱스 스캔
        - **풀 인덱스 스캔(Full Index Scan)** 이란 인덱스 테이블을 처음부터 끝까지 다 뒤져서 데이터를 찾는 방식이다. 인덱스의 테이블은 실제 테이블보다 크기가 작기 때문에, **풀 테이블 스캔(Full Table Scan)보다 효율적**이다. 하지만 인덱스 테이블 전체를 읽어야 하기 때문에 **아주 효율적이라고 볼 수는 없다.**
      - range : 인덱스 레인지 스캔 (Index Range Scan)
        - **인덱스 레인지 스캔(Index Range Scan)** 은 인덱스를 활용해 범위 형태의 데이터를 조회한 경우를 의미한다. 범위 형태란 `BETWEEN`, `부등호(<, >, ≤, ≥)`, `IN`, `LIKE`를 활용한 데이터 조회를 뜻한다. 이 방식은 인덱스를 활용하기 때문에 **효율적인 방식**이다. 하지만 인덱스를 사용하더라도 데이터를 조회하는 범위가 클 경우 성능 저하의 원인이 되기도 한다.
        - WHERE문의 부등호(>, <, ≤, ≥, =), IN, BETWEEN, LIKE와 같은 곳에서 사용되는 컬럼은 인덱스를 사용했을 때 성능이 향상될 가능성이 높다
      - ref : 비고유 인덱스를 활용하는 경우
        - 비고유 인덱스를 사용한 경우 (= UNIQUE가 아닌 컬럼의 인덱스를 사용한 경우) `type`에 `ref`가 출력된다.
      - const :  1건의 데이터를 바로 찾을 수 있는 경우
        - 고유하다면(UNIQUE) 1건의 데이터를 찾는 순간, 나머지 데이터는 아예 볼 필요가 없어진다. 왜냐하면 찾고자 하는 데이터가 유일한 데이터이기 때문이다. → 고유 인덱스와 기본 키는 전부 UNIQUE한 특성을 가지고 있다.


#### 5) `possible_keys`
- 사용 가능한 인덱스 목록 (NULL이면 인덱스 미사용 가능성 있음)

#### 6) `key`
- 실제 사용된 인덱스

#### 7) `rows` (중요)
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
1. `EXPLAIN`을 사용하여 실행 계획을 분석
2. 풀 테이블 스캔(`ALL`)을 피하고 인덱스를 활용
3. 조인(`JOIN`) 시 적절한 인덱스를 설정
4. ORDER BY, GROUP BY 최적화 (filesort, temporary 테이블 피하기)
5. 쿼리 튜닝 후 `EXPLAIN ANALYZE`로 실제 성능 확인

