---
layout: post
title: 데이터 분석 SQL Fundamentals
---

## 강의 소개 및 실습 환경 구축하기.

### 강의 소개
다양한 유형의 조인 및 Group by와 집계 함수 그리고 Analytic SQL 이 동작하는 메커니즘을 이해하면서 SQL을 작성하는 능력을 키워야한다.

분석을 위한 SQL 핵심 무기
 - Analytic SQL (Window Function)

### 실습 환경 구축 - PostgreSQL 다운로드 및 설치
[https://www.postgresql.org/download/](https://www.postgresql.org/download/)

port : 5432
password : postgres

### DBeaver 설치하고 DB 접속하기
[https://dbeaver.io/download/](https://dbeaver.io/download/)

### 실습용
데이터베이스-도구-백업-Backup file

### 조인 개요 및 조인 시  데이터 집합 레벨의 변화 이해 - 01
- 관계형 DB에서 가장 기본이자 중요한 기능
- 두개 이상의 테이블을 서로 연결하여 데이터를 서로 연결하여 데이터를 추출
- 관계형 DB에서는 조인을 통해 서로 다른 테이블간의 정보를 원하는 대로 가져올 수 있음.


**조인 시 데이터 집합 레벨의 변화**   
일:M 조인 시 결과 집합은 M집합의 레벨을 그대로 유지

### 조인 시 데이터 집합 레벨의 변화 이해 - 02
- 1:1 -> 1
- 1:M -> M
- M:N -> 추후 

### 조인실습 01
### 조인실습 02
~~~
-- 부서명 SALES와 RESEARCH 소속 직원별로 과거부터 현재까지 모든 급여를 취합한 평균 급여
with 
temp_01 as 
(
select a.dname, b.empno, b.ename, b.job, c.fromdate, c.todate, c.sal 
from hr.dept a
	join hr.emp b on a.deptno = b.deptno
	join hr.emp_salary_hist c on b.empno = c.empno
where  a.dname in('SALES', 'RESEARCH')
order by a.dname, b.empno, c.fromdate
)
select empno, max(ename) as ename, avg(sal) as avg_sal
from temp_01
group by empno; 
~~~

### 데이터 연결 관계 이해
### 조인실습 03
### 조인실습 03
### Inner 조인, Left/Right Outer 조인, Full Outer 조인의 이해
### Outer 조인 실습 01
### Outer 조인 실습 02
~~~
select a.customer_id, a.contact_name, coalesce(b.order_id, 0) as order_id, b.order_date
	, c.first_name||' '||c.last_name as employee_name, d.company_name as shipper_name  
from nw.customers a
	left join nw.orders b on a.customer_id = b.customer_id
	left join nw.employees c on b.employee_id = c.employee_id
	left join nw.shippers d on b.ship_via = d.shipper_id
where a.city = 'Madrid';
~~~
5,6 **left join** 안적어주면 inner join 으로 바뀜.  
coalesce(a, b, ..., n) a, b... 가 null이면 n로 대체 한다.

### Full Outer 조인 실습
### Non Equi 조인과 Cross 조인의 이해
- Equi 조인 : 조인 시 연결하는 키값이 서로 같은 경우(즉=로 연결)
- Non Equi 조인 : 키 값으로 연결시 = 이 아닌 다른 연산자(between, >, >=, <, <=)를 사용하는 조인
- Cross 조인(Cartesian Product 조인): 조인 컬럼없이 두 테이블 간 가능한 모든 연결을 결합하는 조인 방식
### Non Equi 조인과 Cross 조인 실습
~~~
-- cross 조인
with
temp_01 as (
select 1 as rnum 
union all
select 2 as rnum
)
select a.*, b.*
from hr.dept a 
	cross join temp_01 b;
~~~

## Date, Timestamp, Interval 다루기

### Date, Timestamp, Interval 타입 개요 및 형변환과 포맷팅 이해
- Date 일자로서 년,월,일 정보를 가짐. YYYY-MM-DD
- Timestamp 일자를 시간 정보만 가짐.  YYYY-MM-DD HH24:MI:SS
- Time 오직 시간 정조만 가짐. HH24:MI:SS
- Interval N days HH24:MI_SS

1. to_xxx('변환할 문자열', 포맷팅) 
2. to_char('Data 컬럼', 문자열의 년,월,일 출력 포맷팅)


### to_date, to_timestamp, to_char 함수를 이용한 형변환 실습
~~~
select pg_typeof(to_timestamp('2022-01-01', 'yyyy-mm-dd'));
~~~
pg_typeof : 타입 확인


### extract와 date_part 함수를 이용하여 년/월/일/시/분/초 추출하기
~~~
-- extract와 date_part를 이용하여 년, 월, 일 추출
select a.* 
	, extract(year from hiredate) as year
	, extract(month from hiredate) as month
	, extract(day from hiredate) as day
from hr.emp a;

select a.*
	, date_part('year', hiredate) as year
	, date_part('month', hiredate) as month
	, date_part('day', hiredate) as day
from hr.emp a;
~~~

### 날짜와 시간 연산 - Interval의 활용 이해와 실습
### date_trunc 함수 활용 실습

## Group by 와 집계 함수(Aggregate Function)
### Group By의 이해
- Group by 절에 기술된 컬럼 값(또는 가공 컬럼값)으로 그룹화 된 집계(Aggregation)함수와 함께 사용되어 그룹화된 집계 정보를 제공
- Group by 절에 기술된 컬럼 값으로 **반드시 1의 집합을** 가지게 됨.
- Select 절에는 Group by 절에 기술된 컬럼(또는 가공 컬럼)과 집계 함수만 사용 될 수 있음.

~~~sql
select <coulumn(s)>
from <table> 
where <condition>
group by <coulumn(s)>
having <condition>
order by <coulumn(s)>
~~~

### Group By 실습 - 01
### 집계 함수(Aggregate Function)과 count(distinct)의 이해
- Count
- Sum
- Min
- Max
- Avg

집계 함수는 Null을 계산하지 않음   
Min, Max 함수의 경우 숫자값 뿐만 아니라 문자열, 날짜/시간형도 가능   
Count(distinct)


### 집계 함수와 count(distinct) 
### 집계 함수와 count(distinct) 실습
### Group By 절에 가공 컬럼 및 case when 적용 실습

### Group By와 집계 함수의 case when을 이용한 피봇팅 이해
**Pivoting**
Group by 시 행 레벨로 만들어진 데이터를 열 레벨로 전환할 때 Aggregate와 case when을 결합하여 사용

~~~
select job, sum(sal) as sales_sum
from hr.emp a
group by job;

-- deptno로 group by하고 job으로 pivoting
select sum(case when job = 'SALESMAN' then sal end) as sales_sum
, sum(case when job = 'MANAGER' then sal end) as manager_sum
, sum(case when job = 'ANALYST' then sal end) as analyst_sum
, sum(case when job = 'CLERK' then sal end) as clerk_sum
, sum(case when job = 'PRESIDENT' then sal end) as president_sum
from emp;
~~~

### Group By와 집계 함수의 case when을 이용한 피봇팅 실습
~~~
-- deptno + job 별로 group by 		     
select deptno, job, sum(sal) as sal_sum
from hr.emp
group by deptno, job;

-- deptno로 group by하고 job으로 pivoting 
select deptno, sum(sal) as sal_sum
	, sum(case when job = 'SALESMAN' then sal end) as sales_sum
	, sum(case when job = 'MANAGER' then sal end) as manager_sum
	, sum(case when job = 'ANALYST' then sal end) as analyst_sum
	, sum(case when job = 'CLERK' then sal end) as clerk_sum
	, sum(case when job = 'PRESIDENT' then sal end) as president_sum
from emp
group by deptno;

-- group by Pivoting시 조건에 따른 건수 계산 시 잘못된 사례(count case when then 1 else null end)
select deptno, count(*) as cnt
     , count(case when job = 'SALESMAN' then 1 else 0 end) as sales_cnt
     , count(case when job = 'MANAGER' then 1 else 0 end) as manager_cnt
     , count(case when job = 'ANALYST' then 1 else 0 end) as analyst_cnt
     , count(case when job = 'CLERK' then 1 else 0 end) as clerk_cnt
     , count(case when job = 'PRESIDENT' then 1 else 0 end) as president_cnt
from emp
group by deptno
order by 1,2

-- group by Pivoting시 조건에 따른 건수 계산 시 sum()을 이용
select deptno, count(*) as cnt
     , sum(case when job = 'SALESMAN' then 1 else 0 end) as sales_cnt
     , sum(case when job = 'MANAGER' then 1 else 0 end) as manager_cnt
     , sum(case when job = 'ANALYST' then 1 else 0 end) as analyst_cnt
     , sum(case when job = 'CLERK' then 1 else 0 end) as clerk_cnt
     , sum(case when job = 'PRESIDENT' then 1 else 0 end) as president_cnt
from emp
group by deptno;
~~~

### Group By Rollup과 Cube의 이해
- Rollup과 Cube는 Group by와 함께 사용되어 Group by 절에 사용되는 컬럼들에 대해서 추가적인 Group by를 수행
- Rollup은 계층적인 방식으로 Group by 추가 수행
- Cube는 Group by 절에 기재된 컬럼들의 가능한 combination 으로 Group by 수행

~~~
--deptno + job레벨 외에 dept내의 전체 job 레벨(결국 dept레벨), 전체 Aggregation 수행. 
select deptno, job, sum(sal)
from hr.emp
group by rollup(deptno, job)
order by 1, 2;
~~~
- (dept, job) -> (dept) -> ()  -- rollup
- (dept, job) -> (dept) -> (job) -> ()  -- cube


**Rollup(YEAR, MONTH, DAY)**
1. YEAR, MONTH, DAY
2. YEAR, MONTH
3. YEAR
4. ()   

Group by 절의 나열된 컬럼수가 N개이면 Group by는 N+1 수행

**Cube(YEAR, MONTH, DAY)**
1. YEAR, MONTH, DAY
2. YEAR, MONTH
3. YEAR, DAY -- ?
4. YEAR
5. MONTH, DAY
6. MONTH
7. DAY
8. ()

Group by 절의 나열된 컬럼수가 N개이면 Group by는 2<sup>n</sup> 수행

### Group By Rollup 실습
~~~
-- 년+월+일별 매출합 구하되, 월별 소계 매출합, 년별 매출합, 전체 매출합을 함께 구하기
with 
temp_01 as (
select to_char(b.order_date, 'yyyy') as year
	, to_char(b.order_date, 'mm') as month
	, to_char(b.order_date, 'dd') as day
	, sum(a.amount) as sum_amount
from nw.order_items a
	join nw.orders b on a.order_id = b.order_id
group by rollup(to_char(b.order_date, 'yyyy'), to_char(b.order_date, 'mm'), to_char(b.order_date, 'dd'))
)
select case when year is null then '총매출' else year end as year
	, case when year is null then null
		else case when month is null then '년 총매출' else month end
	  end as month
	, case when year is null or month is null then null
		else case when day is null then '월 총매출' else day end
	  end as day
	, sum_amount
from temp_01
order by year, month, day
;
~~~

### Group By Cube 실습

## Analytic SQL - 개요와 순위 Analytic
### Analytic SQL 개요
- 순위/비율 함수
- 집계함수
- Lead/Lag
- First_value/Last_value
- Inverse Percentile

~~~
<Analytic function>(인자1, ...)
OVER (
    [Partioon 절]    --그룹화 컬럼명
    [Sorting 절]     --정렬 컬럼명(Window 이동 방향 기준 컬럼명)
    [window 절]      --Window 범위(Row,Range)
)
~~~
원본 데이터의 레벨을 그대로 유지하면서, 그룹핑 레벨에서 자유롭게 Window의 이동과 크기를 조절하면서 Analytic 을 수행.


### 순위 Analytic SQL 개요 및 유형
- 일반적인 순위 : rank, dense_rank, row_number
- 0~1 사이 정규화 순위 :  cume_dist, percent_rank
- 분위 : ntile

### 순위 Analytic SQL의 이해 - rank, dense_rank, row_number
- 전체 데이터/특정 그룹핑 내에서 특정 기준으로 순위를 매기는 함수

1. rank 공동 순위가 있을 경우 다음 순위는 공동 순위 개수만큼 밀려서 정함 (1,2,2,4 or 1,2,2,2,5)
2. dense_rank 공동 순위가 있더라도 다음 순위는 바로 이어서 정함 (1,2,2,3 or 1,2,2,2,3)
3. row_number 공동 순위가 있더라도 반드시 unique한 순위를 정함 (1,2,3,4,5)

### 순위 Analytic SQL 실습 - 01
### 순위 Analytic SQL 실습 - 02

### 순위 Analytic SQL에서 Null 처리하기
~~~
rank() OVER (
    <Partion 절>
    oreder by column [nulls first/last]
)
~~~

~~~
select a.*
	, rank() over (order by comm desc) as comm_rank
	, row_number() over (order by comm desc) as comm_rnum
from hr.emp a;

-- null을 가장 선두 순위로 처리
select a.*
     , rank() over (order by comm desc nulls first ) as comm_rank
     , row_number() over (order by comm desc nulls first) as comm_rnum
from hr.emp a;

-- null을 가장 마지막 순위로 처리
select a.*
     , rank() over (order by comm desc nulls last ) as comm_rank
     , row_number() over (order by comm desc nulls last) as comm_rnum
from hr.emp a;

-- null을 전처리하여 순위 정함. 
select a.*
     , rank() over (order by COALESCE(comm, 0) desc ) as comm_rank
     , row_number() over (order by COALESCE(comm, 0) desc) as comm_rnum
from hr.emp a;
~~~

## Analytic SQL - 집계(Aggregate) Analytic과 Window 상세
### 집계(Aggregate) Analytic SQL 개요와 Sum Analytic SQL의 이해
sum(), max(), min(), avg(), acount()와 같은 집계함수를 window를 이용하여 로우 레벨로 자유 자재로 집계할 수 있는 기능제공

- 집계(aggreagate)계열 analytic 함수는 order by 절이 있을 경우 window 절은 기본적으로 range unbounded preceding and current row
- 만약 order by 절이 없다면 window는 해당 partition 의 모든 row를 대상
- 만약 partition 절도 없다면 window는 전체 데이터의 row를 대상

### max, min, avg, count Analytic SQL 이해

### 집계(Aggregate) Analytic SQL 실습 - 01
### 집계(Aggregate) Analytic SQL 실습 - 02
### 집계(Aggregate) Analytic SQL 실습 - 04

### 다양한 window 절의 이해 - 01
~~~
windowing_clause = 
    { ROWS | RANGE }
    { BETWEEN 
        { UNBOUNDED PRECEDING | CURRENT ROW | value_expr {PRECEDING | FOLLOWING }
    }
    AND
    { UNBOUNDED FOLLOWING | CURRENT ROW | value_expr {PRECEDING | FOLLOWING }
    }
   | {UNBOUNDED PRECEDING | CURRENT ROW | value_expr PRECEDING}
   }
~~~

- ROWS , RANGE
  - Window의 개별 row를 정의함. Rows는 물리적인 row를, Range는 논리적인 row를 의미. Order by 절이 없으면 해당 구문은 기술할 수 없음.

- BETWEEN ... AND
  - Window의 시작과 종료 지점을 기술. Between 다음이 시작 지점, ANd 다음이 종료 지점
  - Between이 없다면 Row , Range 다음이 시작점, (기본 설정으로) 현재 Row(Current row)가 종료점으로 설정.

- UNBOUNDED PRECEDING 
  - Window의 시작이 Partition의 첫번쨰 row부터 시작함을 기술. Window의 종료점으로는 사용될 수 없음.

- UNBOUNDED FOLLOWING
  - Window의 종료가 Partition의 마지막 row에서 종료됨을 기술. Window의 시작점으로는 사용될 수 없음.

- CURRENT ROW
  - Window의 시작점 또는 종료점으로 사용될 수 있으나, 보통은 종료점으로 사용.
  - 시작점으로 사용시 window의 종료가 현재 row에서 종료됨을 기술
  - 시작점으로 사용시 window의 시작이 현재 row에서 시작됨을 기술

### 다양한 window 절의 이해 - 02
default : range(rows) between unbounded preceding and current row


### 이동 평균(Moving Average)
### 이동평균 Analytic SQL 실습
### 집계 Analytic SQL에서 불연속 일자 데이터 처리 시 유의 사항
### window절에 range 사용 시 유의 사항.
- range는 논리적인 row 위치를 지정하므로 보통은 숫자값과 interval값으로 window의 크기를 설정함.
- 또한 range는 rows와 동일한 window크기 systax도 사용 가능함
- 집계계열 analytic 함수는 order by절이 있을 경우 window 절은 기본적으로 range between unbounded precding and current row임.
- 하지만 range를 적용할 경우는 order by에서 동일 값이 있을 경우 current row를 자신의 row가 아닌 동일 값이 있는 전체 row를 동일 그룹으로 간주하여 집계 analytic을 적용하므로 rows를 명시적으오 사용하는 경우와 값이 달라질 수 있음

~~~
select empno, deptno, sal
, sum(sal) over (partition by deptno order by sal) as sum_default
, sum(sal) over (partition by deptno order by sal range between unbounded preceding and current row) as sum_range
, sum(sal) over (partition by deptno order by sal rows between unbounded preceding and current row) as sum_rows
from hr.emp;

select empno, deptno, sal, date_trunc('month', hiredate)::date as hiremonth
     , sum(sal) over (partition by deptno order by date_trunc('month', hiredate)) as sum_default
     , sum(sal) over (partition by deptno order by date_trunc('month', hiredate) rows between unbounded preceding and current row) as sum_rows
from hr.emp;
~~~
