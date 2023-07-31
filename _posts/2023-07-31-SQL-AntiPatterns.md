---
layout: post
category: book
title: SQL AntiPatterns
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

# 무단횡단
프로그래머들은 보통 다대다 관계를 위한 교차테이블 생성을 피하기 위해 쉼표로 구분된 목록(comma-separated list)을 사용한다.
나는 이 안티패턴을 무단횡단이라 부른다. 무단횡단 또한 교차로를 피하는 행위이기 때문이다.

## 목표: 다중 값 속성 저장

테이블의 칼럼이 하나의 값을 가질 땐 설계가 쉽다.

~~~sql
CREATE TABLE Products
(
    product_id   SERIAL PRIMARY KEY,
    product_name VARCHAR(1000),
    account_id   BIGINT UNSIGNED,
    ...
    FOREIGN KEY(account_id) REFERENCES Accounts (account_id)
);
INSERT INTO Products (product_id, product_name, account_id)
VALUES (DEFAULT, ‘Visual TurboBuilder‘, 12);
~~~
각 계정은 많은 제품에 대응되고, 각 프 로젝트는 담당자를 하나만 참조하므로, 제품과 계정은 다대일 관계다.
프로젝트가 성숙해가면서, 제품의 담당자가 여러 명일 수도 있다는 사실을 깨닫는다.

## 안티패턴: 쉼표로 구분된 목록에 저장
데이터베이스 구조의 변경을 최소화하기 위해, account_id 칼럼을 VARCHAR
로 바꾸고 여기에 여러 개의 계정 아이디를 쉼표로 구분해 나열하기로 했다.

~~~sql
CREATE TABLE Products (
    product_id SERIAL PRIMARY KEY, product_name VARCHAR(1000),
    account_id VARCHAR(100), -- 쉼표로구분된목록 ... 
);
INSERT INTO Products (product_id, product_name, account_id) VALUES (DEFAULT, ‘Visual TurboBuilder‘, ‘12,34‘);

~~~

성공한 것 같다. 테이블을 새로 만들지도 않았고, 칼럼을 추가하지도 않았 기 때문이다. 단지 칼럼 하나의 데이터 타입만 바꿨을 뿐이다. 
그러나 이 테이 블 설계로부터 겪어야 할 성능 문제와 데이터 정합성 문제를 살펴보자.

### 특정 계정에 대한 제품 조회
모든 FK가 하나의 필드에 결합되어 있으면 쿼리가 어려워진다. 더 이상 같은 지를 비교할 수 없다. 대신 어떤 패턴에 맞는지를 검사해야 한다.

~~~sql
SELECT * FROM Products WHERE account_id REGEXP ‘[[:<:]]12[[:>:]]‘;
~~~

패턴 매칭을 사용하면 잘못 된 결과가 리턴 될 수 있고 인덱스도 활용하지 못 한다. 패턴 매칭 문법은 데이터베이스 제품에 따라 다르기 때문에 이렇게 작 성한 SQL은 벤더 중립적이지도 않다.

### 주어진 제품에 대한 계정 정보 조회
마찬가지로, 쉼표로 구분된 목록을 참조하는 테이블의 대응되는 행과 조인하 기도 불편해지고 비용이 많이 든다.
~~~sql
SELECT * FROM Products AS p JOIN Accounts AS a
    ON p.account_id REGEXP ‘[[:<:]]‘ || a.account_id || ‘[[:>:]]‘
WHERE p.product_id = 123;
~~~

### 집계 쿼리 만들기
집계 쿼리는 COUNT(), SUM(), AVG()와 같은 함수를 사용한다. 그러나 이 런 함수는 행의 그룹에 대해 사용하도록 설계되었지,
 쉼표로 구분된 목록에 대해 사용하도록 설계된 것이 아니다. 따라서 다음과 같은 기교에 의지해야 한다.
 
~~~sql
SELECT product_id, LENGTH(account_id) - LENGTH(REPLACE(account_id, ‘,‘, ‘‘)) + 1
    AS contacts_per_product
FROM Products;
~~~

### 특정 제품에 대한 계정 갱신
목록의 마지막에 문자열 연결을 통해 새로운 아이디를 추가할 수 있지만, 이 렇게 하면 목록이 정렬된 상태로 유지되지 않는다.

~~~ sql
UPDATE Products
SET account_id = account_id || ‘,‘ || 56 WHERE product_id = 123;
~~~

### 제품 아이디 유효성 검증
사용자가 banana와 같은 유효하지 않은 항목을 입력하는 것을 어떻게 방지할 수 있을까?

~~~sql
INSERT INTO Products (product_id, product_name, account_id) VALUES (DEFAULT, ‘Visual TurboBuilder‘, ‘12,34,banana‘);
~~~

사용자들은 유효하지 않은 값을 입력하는 방법을 찾아낼 것이고, 데이터베 이스는 쓰레기 더미가 될 것이다.

### 구분자 문자 선택
정수 목록 대신 문자열 목록을 저장하는 경우 목록의 일부 항목이 구분자 문 자를 포함할 수 있다.항목 간의 구분자로 쉼표를 사용하면 모호해질 수 있다.

### 목록 길이 제한
VARCHAR(30) 칼럼에 얼마나 많은 목록 항목을 저장할 수 있을까? 각 항목의 길이에 따라 다르다. 
각 항목의 길이가 2라면 (쉼표를 포함해서) 항목을 열 개 저장할 수 있다. 그러나 각 항목의 길이가 6이라면 항목을 네 개 저장할 수 있 을 뿐이다.

## 안티패턴 인식 방법
프로젝트 팀에서 다음과 같은 말이 나온다면, 무단횡단 안티패턴이 사용되고 있음을 나타내는 단서로 간주할 수 있다.
- “이 목록이 지원해야 하는 최대 항목 수는 얼마나 될까?” VARCHAR 칼럼의 최대 길이를 선정하려 할 때 이런 질문이 나온다.
- “SQL에서 단어의 경계를 어떻게 알아내는지 알아?” 문자열의 일부를 찾아내기 위해 정규 표현식을 사용한다면, 이런 부분을 별도로 저장해야 함을 뜻하는 단서일 수 있다.
- “이 목록에서 절대 나오지 않을 문자가 어떤 게 있을까?” 모호하지 않은 문자를 구분자로 사용하고 싶겠지만, 어떤 구분자를 쓰든 언젠가는 그 문자가 목록의 값에 나타날 것이라 예상해야 한다.

## 안티패턴 사용이 합당한 경우
데이터베이스에 반정규화(denormalization)를 적용해 성 능을 향상시킬 수 있다. 목록을 쉼표로 구분된 문자열로 저장하는 것도 반정 규화의 예다.
- 애플리케이션에서 쉼표로 구분된 형식의 데이터를 필요로 하고, 목록 안의 개별 항목에는 접근할 필요가 없을 수 있다.
- 플리케이션이 다른 출처에서 쉼표로 구분된 형식으로 데이터를 받아 데이터베이스에 그대로 저 장하고 나중에 동일한 형식으로 불러내야 하며, 목록 안의 개별 값을 분리할 필요가 없다면 안티패턴을 사용할 수 있다.

## 해법: 교차 테이블 생성
account_id를 Products 테이블에 저장하는 대신, 별도의 테이블에 저장해 account_id가 별도의 행을 차지하도록 하는 것이 좋다. 
이 새로 만든 Contacts 테이블은 Products와 Accounts 사이의 다대다 관계를 구현한다.

~~~sql
CREATE TABLE Contacts (
    product_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (product_id, account_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id), FOREIGN KEY (account_id) REFERENCES Accounts(account_id)
);

INSERT INTO Contacts (product_id, account_id)
VALUES (123, 12), (123, 34), (345, 23), (567, 12), (567, 34);
~~~

어떤 테이블이 FK로 두 테이블을 참조  때 이를 교차 테이블이라 한다.교 차 테이블은 참조되는 두 테이블 사이의 다대다 관계를 구현한다. 
즉 각 제품 은 교차 테이블을 통해 여러 개의 계정과 연관되며, 마찬가지로 각 계정은 여 러 개의 제품과 연관된다. 

### 계정으로 제품 조회하기와 제품으로 계정 조회하기
~~~sql
SELECT p.*
FROM Products AS p JOIN Contacts AS c
    ON (p.product_id = c.product_id)
WHERE c.account_id = 34;
~~~

### 집계 쿼리 만들기
~~~sql
SELECT product_id, COUNT(*) AS accounts_per_product FROM Contacts
GROUP BY product_id;

SELECT account_id, COUNT(*) AS products_per_account FROM Contacts
GROUP BY account_id;

SELECT c.product_id, c.contacts_per_product
FROM (
    SELECT product_id, COUNT(*) AS accounts_per_product FROM Contacts
    GROUP BY product_id
) AS c
ORDER BY c.contacts_per_product DESC LIMIT 1
~~~

### 특정 제품에 대한 계정 갱신
~~~sql
INSERT INTO Contacts (product_id, account_id) VALUES (456, 34);

DELETE FROM Contacts WHERE product_id = 456 AND account_id = 34;
~~~

### 제품 아이디 유효성 검증
어떤 항목이 다른 테이블에 있는 합당한 값에 대해 유효한지를 확인하기 위 해 FK를 사용할 수 있다.
Contacts.account_id가 Accounts.account_id를 참조 하도록 선언해, 참조 정합성을 데이터베이스가 강제하도록 할 수 있다. 
항목을 제한하는 데 SQL 데이터 타입을 사용할 수도 있다.

### 구분자 문자 선택
각 항목을 별도의 행으로 저장하므로 구분자를 사용하지 않는다. 쉼표나 구분 자로 사용하는 다른 문자가 항목에 포함되어 있을지 걱정할 필요가 없다.


### 목록 길이 제한
각 항목이 교차 테이블에 별도 행으로 존재하기 때문에, 한 테이블에 물리적 으로저장할수있는행수에만제한을받는다.





