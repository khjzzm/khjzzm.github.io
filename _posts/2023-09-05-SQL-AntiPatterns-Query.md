---
layout: post
category: book
title: SQL AntiPatterns (쿼리 안티패턴)
---

## 논리적 데이터베이스 설계 안티패턴

코딩을 시작하기 전에 데이터베이스에 어떤 정보를 저장할지, 데이터를 어떻 게 정리하고 서로 연결시키는 것이 좋을지를 결정해야 한다.
여기에는 데이터 베이스 테이블과 칼럼, 관계를 계획하는 것이 포함된다.

## 물리적 데이터베이스 설계 안티패턴

어떤 데이터를 저장할지 결정한 다음에는 DBMS 기술을 활용해 데이터를 가 능한 효율적으로 관리해야 한다.
여기에는 테이블과 인덱스를 정의하고 데이터 타입을 정하는 것이 포함된다.
이때 CREATE TABLE과 같은 SQL의 데이터 정의 언어(DDL, Data Definition Language)를 사용한다.

## 쿼리 안티패턴

데이터베이스에 데이터를 입력하고 조회해야 한다. SQL 쿼리는 SELECT, UPDATE, DELETE 같은 데이터 조작 언어(DML, Data Manipulation Language) 로 구성된다.

## 애플리케이션 개발 안티패턴

SQL은 C++, Java, PHP, Python 또는 Ruby와 같은 다른 언어로 작성되는 애플 리케이션 안에서 사용된다.
애플리케이션에서 SQL을 사용하는 데는 올바른 방법과 잘못된 방법이 있는데, 여기서는 흔히 발생하는 실수를 다룬다.


> 보통은 SELECT를 쿼리라 하고, INSERT, UPDATE, DELETE, MERGE를 DML(Data Manipulation Language)이라 한다.
> CREATE, ALTER, DROP, TRUNCATE 등은 DDL(Data Definition Language),
> GRANT, REVOKE 등은 DCL(Data Control Language), COMMIT, ROLLBACK 등은 TCL(Transaction Control Language) 이라 한다.

---


# 모르는 것에 대한 두려움

버그 데이터베이스에서, Accounts 테이블은 first_name과 last_name 칼럼을 가진다. 
사용자의 전체 이름을 하나의 칼럼처럼 포매팅하는 데 문자열 연결 연 산자를 사용할 수 있다.

~~~sql
SELECT first_name || ‘ ‘ || last_name AS full_name FROM Accounts;
~~~

중간 이름의 첫 글자를 테이블에 저장하도록 데이터베이 스를 수정해달라는 요청을 했다고 생각해보자

~~~sql
ALTER TABLE Accounts ADD COLUMN middle_initial CHAR(2);

UPDATE Accounts SET middle_initial = ‘J.‘ WHERE account_id = 123;
UPDATE Accounts SET middle_initial = ‘C.‘ WHERE account_id = 321;

SELECT first_name || ‘ ‘ || middle_initial || ‘ ‘ || last_name AS full_name
FROM Accounts;
~~~
중간 이름 첫 자를 지정한 사용자의 이름은 정상적으로 표시되지만, 다른 사용자의 이름은 빈칸으로 표시된다.

## 목표: 누락된 값을 구분하기
데이터베이스의 어떤 데이터에 값이 없는 것은 피할 수 없다.
- 여전히 일하고 있는 직원의 퇴사일과 같이, 행을 생성할 때 값을 알 수 없는 곳에 NULL을 사용할 수 있다.
- 전기만 사용하는 자동차에 대한 연료 효율과 같이, 주어진 칼럼이 주어진 행에서 적용 가능한 값이 없는 경우에 NULL값을 사용할 수 있다.
- 함수에 인수로 DAY('2009-12-32')와 같이 유효하지 않은 값이 입력되는 경우 NULL을 리턴할 수 있다.
- 외부 조인에서 매치되지 않는 행의 칼럼 값의 자리를 채우는 데 NULL 값 을 사용한다.

목표는 NULL을 포함하는 칼럼에 대한 쿼리를 작성하는 것이다.

## 안티패턴: NULL을 일반 값처럼 사용
SQL에서는 NULL을 0이나 false 또는 빈 문자 열과 다른 특별한 값으로 취급한다. 
표준 SQL과 대부분의 데이터베이스 제품 에서는 그렇다. 그러나 Oracle과 Sybase에서는 NULL이 길이가 0인 문자열과 동일하다.
NULL 값은 특별한 규칙을 따른다.

### 수식에서 NULL 사용
~~~sql
SELECT hours + 10 FROM Bugs;
~~~
NULL은 0과 같지 않다. 알지 못하는 값에 10을 더한다 해도 여전히 알지 못 하는 값이다.
NULL은 길이가 0인 문자열과도 같지 않다. 표준 SQL에서는 어떤 문자열도 NULL과 연결하면 NULL이 된다. (Oracle과 Sybase는 예외)
NULL은 false와도 같지 않다. NULL이 들어간 불리언 수식은 AND, OR, NOT 을 사용하더라도 항상 NULL이 되는데 이 또한 일부 사람들에게는 혼동되는 것이다.

### NULL을 가질 수 있는 칼럼 검색
다음 쿼리는 assigned_to의 값이 123인 행만을 리턴하고, 다른 값을 가지거나 칼럼이 NULL인 행은 리턴하지 않는다.
~~~sql
SELECT * FROM Bugs WHERE assigned_to = 123;
SELECT * FROM Bugs WHERE NOT (assigned_to = 123);
~~~
두 쿼리 모두 assigned_to 칼럼의 값이 NULL인 행은 리턴하지 않는 다. NULL과는 어떤 비교를 하든 그 결과는 NULL이다. 
true 또는 false가 아니 다. 심지어 NULL에 NOT을 해도 여전히 NULL이다.

흔히 NULL인 행 또는 NULL이 아닌 행을 찾을 때 다음과 같은 실수를 한다.
~~~sql
SELECT * FROM Bugs WHERE assigned_to = NULL;
SELECT * FROM Bugs WHERE assigned_to <> NULL;
~~~
여전히 NULL이고 true가 아니다. 위 쿼리는 둘 다 assigned_to가 NULL인 행을 리턴하지 않는다.


### 쿼리 파라미터로 NULL 사용
~~~sql
SELECT * FROM Bugs WHERE assigned_to = ?;
~~~
위 쿼리는 파라미터로 일반 정수를 넣어주면 예측 가능한 결과를 리턴하지 만, NULL을 파라미터로 사용할 수 없다.
