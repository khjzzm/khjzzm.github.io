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
~~~postgresql
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
~~~postgresql
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
~~~postgresql
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
~~~postgresql
select pg_typeof(to_timestamp('2022-01-01', 'yyyy-mm-dd'));
~~~
pg_typeof : 타입 확인


### extract와 date_part 함수를 이용하여 년/월/일/시/분/초 추출하기
~~~postgresql
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
## Group By의 이해
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

## Group By 실습 - 01