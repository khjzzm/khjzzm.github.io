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
각 항목이 교차 테이블에 별도 행으로 존재하기 때문에, 한 테이블에 물리적 으로 저장 할 수 있는 행 수에만 제한을 받는다.

**SQL Antipatterns Tip 각 값은 자신의 칼럼과 행에 저장하라.** 

---------

# 순진한 트리
독자들이 답글을 달 수 있고 심지어 답글에 대한 답글도 달 수 있기 때문에, 가지를 뻗어 깊게 확장하는 글타래를 형성할 수 있다.
각 답글은 답글을 다는 대상 글 에대한 참조를 가지도록 하는 단순한 해법을 선택했다.

~~~sql
CREATE TABLE Comments (
    comment_id
    parent_id
    comment
    FOREIGN KEY (parent_id) REFERENCES Comments(comment_id)
);
~~~
그러나 곧 답글의 긴 타래를 하나의 SQL 쿼리로 불러오기가 어렵다는 점이 명확해진다. 단지 고정된 깊이까지만,
즉 바로 아래 자식 또는 그 아래 손자뻘 되는 글까지 얻어낼 수 있다. 그렇지만 글타래는 깊이가 무제한이다.

생각할 수 있는 다른 방법은 모든 글을 불러온 다음, 학교에서 배운 전통적 인 트리 알고리즘을 사용해 애플리케이션 메모리 안에서 트리 구조를 구성하 는 것이다. 


## 목표: 계층구조 저장 및 조회하기
데이터는 트리나 계층적 구조가될수있다. 트리 데이터 구조에서 각 항목은 노드라 불린다.
노드는 여러개의 자식을 가질수 있고 부모를 하나 가진다. 부모가 없는 최상위노드를 `뿌리(root)`라 한다. 
가장 아래에 있는 자식이 없는 노드를 `종말노드(leaf)`라 부 른다. 중간에 있는 노드는 간단히 `노드(non-leaf)`라 한다.

## 안티패턴: 항상 부모에 의존하기
책과 글에서 흔히 설명하는 초보적 방법은 parent_id 칼럼을 추가하는 것이다. 이 칼럼은 같은 테이블 안의 다른 글을 참조하며, 이 관계를 강제하기 위해 FK 제약조건을 걸 수 있다.

~~~sql
CREATE TABLE Comments (
    comment_id,
    parent_id,
    bug_id,
    author,
    comment_date,
    comment,
    FOREIGN KEY (parent_id) REFERENCES Comments(comment_id), 
    FOREIGN KEY (bug_id) REFERENCES Bugs(bug_id),
    FOREIGN KEY (author) REFERENCES Accounts(account_id) 
);
~~~
이 설계는 인접 목록(Adjacency List)이라 불린다. 소프트웨어 개발자가 계 층적 데이터를 저장하는 데 사용하는 가장 흔한 설계일 것이다.

### 인접 목록에서 트리 조회하기
답글과 그 답글의 바로 아래 자식은 비교적 간단한 쿼리로 얻을 수 있다.

~~~sql
SELECT c1.*, c2.*
FROM Comments c1 LEFT OUTER JOIN Comments c2
    ON c2.parent_id = c1.comment_id;
~~~
그러나 이 쿼리는 단지 트리의 두 단계만 조회한다. 단계에 상관없이 후손들을 조회 할 수 있어야 한다. 예를 들어, COUNT()로 글타래의 답글 수를 계산하거나,
SUM()을 이용해 기계 조립에서 부품의 비용 합계를 구할 수 있어야 한다.
 
인접 목록을 사용하면 이런 종류의 쿼리가 이상해진다. 트리의 각 단계를 조인으로 구해야 하는데, SQL 쿼리에서 조인 회수는 미리 고정되어야 하기 때 문이다.  
다음 쿼리는 트리에서 4단계까지 가져오지만 그 이상의 깊이에 있는 데이터는 가져오지 못한다.

~~~sql
SELECT c1.*, c2.*, c3.*, c4.*
FROM Comments c1 -- 1단계
    LEFT OUTER JOIN Comments c2
        ON c2.parent_id = c1.comment_id -- 2단계
    LEFT OUTER JOIN Comments c3
        ON c3.parent_id = c2.comment_id -- 3단계
    LEFT OUTER JOIN Comments c4
        ON c4.parent_id = c3.comment_id; -- 4단계
~~~
또한 이 쿼리는 단계가 깊어질수록 칼럼을 추가하는 방식으로 후손을 포함 시키기 때문에 주의를 요한다.
이렇게 하면 COUNT()와 같은 집계 수치를 계 산하기가 어려워진다.

데이터베이스에서 애플리케이션으로 대량의 데이터를 가져오는 방법은 엄 청나게 비효율적이다. 
꼭대기로부터 전체 트리가 필요한 게 아니라 단지 서브 트리만 필요할 수도 있다. 또는 답글의 COUNT()와 같은 데이터의 집계 정보 만필요할수도있다.

### 인접 목록에서 트리 유지하기
인접 목록에서 새로운 노드를 추가하는 것과 같은 일부 연산은 간단해진다는 점을 인정해야겠다.
또한 노드 하나 또는 서브트리를 이동하는 것 또한 쉽다.
~~~sql
INSERT INTO Comments (bug_id, parent_id, author, comment) VALUES (1234, 7, ‘Kukla‘, ‘Thanks!‘);
UPDATE Comments SET parent_id = 3 WHERE comment_id = 6;
~~~

그러나 트리에서 노드를 삭제하는 것은 좀더 복잡하다.
서브트리 전체를 삭 제하려면 FK 제약조건을 만족하기 위해 여러 번 쿼리를 날려 모든 자손을 찾 은 다음, 가장 아래 단계부터 차례로 삭제하면서 올라가야 한다.

~~~sql
SELECT comment_id FROM Comments WHERE parent_id = 4;
SELECT comment_id FROM Comments WHERE parent_id = 5;
SELECT comment_id FROM Comments WHERE parent_id = 6;
SELECT comment_id FROM Comments WHERE parent_id = 7;

DELETE FROM Comments WHERE comment_id IN (7);
DELETE FROM Comments WHERE comment_id IN (5, 6);
DELETE FROM Comments WHERE comment_id = 4;
~~~

삭제할 노드의 자손을 현재 노드의 부모로 이어 붙인다거나 이동하지 않고 항상 함께 삭제한다면, FK에 ON DELETE CASCADE 옵션을 주어 이를 자동화 할수있다.
그러나 자식이 있는 노드를 삭제하면서 그 자식을 자신의 부모에 이어 붙인 다거나 또는 트리의 다른 곳으로 이동하고 싶은 경우에는, 먼저 자식들의 parent_id를 변경한 다음 원하는 노드를 삭제해야 한다.

~~~sql
SELECT parent_id FROM Comments WHERE comment_id = 6; -- 4 리턴 
UPDATE Comments SET parent_id = 4 WHERE parent_id = 6;
DELETE FROM Comments WHERE comment_id = 6;
~~~

## 안티패턴 인식 방법
다음과 같은 말을 듣는다면, 순진한 트리 안티패턴이 사용되고 있음을 눈치챌 수 있다.
- “트리에서 얼마나 깊은 단계를 지원해야 하지? ”
- “트리 데이터 구조를 관리하는 코드는 건드리는 게 겁나.”
- “트리에서 고아 노드를 정리하기 위해 주기적으로 스크립트를 돌려야 해.”

## 안티패턴 사용이 합당한 경우
인접 목록이 애플리케이션에서 필요한 작업을 지원하는 데 적당할 수도 있다. 
인접 목록의 강점은 주어진 노드의 부모나 자식을 바로 얻을 수 있다는 것이 다. 또한 새로운 노드를 추가하기도 쉽다. 

## 해법: 대안 트리 모델 사용
계층적 데이터를 저장하는 데는 인접 목록 모델 외에도 `경로 열거(Path Enumeration)`, `중첩 집합(Nested Sets)`, `클로저 테이블(Closure Table)`
과 같은 몇 가지 대안이 있다.

### 경로 열거
경로 열거 방법에서는 일련의 조상을 각 노드의 속성 으로 저장해 이를 해결한다.
Comments 테이블에 parent_id 칼럼 대신, 긴 VARCHAR 타입의 path란 칼럼 을 정의한다.
이 칼럼에 저장되는 문자열은 트리의 꼭대기부터 현재 행까지 내려오는 조상의 나열로, UNIX 경로와 비슷하다. 심지어‘/ ’를 구분자로 사용 해도 된다.

~~~sql
CREATE TABLE Comments (
    comment_id,
    path,   --1/4/67
    bug_id,
    author,
    comment_date,
    comment,
    FOREIGN KEY (bug_id) REFERENCES Bugs(bug_id),
    FOREIGN KEY (author) REFERENCES Accounts(account_id)
);
~~~

조상은 현재 행의 경로와 다른 행의 경로 패턴을 비교해 조회할 수 있다. 예 를 들어 경로가 1/4/6/7/인 답글 #7의 조상을 찾으려면 다음과 같이 한다.
~~~sql
SELECT *
FROM Comments AS c
WHERE ‘1/4/6/7/‘ LIKE c.path || ‘%‘;
~~~
이렇게 하면 조상의 경로로 만든 패턴 1/4/6/%, 1/4/%, 1/%가 매치된다.

LIKE의 인수를 반대로 하면 후손을 구할 수 있다. 경로가 1/4/인 답글 #4의 후손을 찾으려면 다음과 같이 하면 된다.

~~~sql
SELECT *
FROM Comments AS c
WHERE c.path LIKE ‘1/4/‘ || ‘%‘;
~~~
패턴 1/4/%는 후손의 경로 1/4/5/, 1/4/6/, 1/4/6/7/과 매치된다.

트리의 일부나 트리의 꼭대기까지 조상의 연결을 쉽게 조회할 수 있다면, 서브트리에서 노드의 비용 SUM()을 계산한다든가 또는 단순히 노드의 
수를 세는 것과 같은 다른 쿼리도 쉽게 할 수 있다. 
~~~sql
SELECT COUNT(*)
FROM Comments AS c
WHERE c.path LIKE ‘1/4/‘ || ‘%‘ GROUP BY c.author;
~~~

새 노드의 부모 경로를 복사한 다음 여기에 새 노드의 아이디를 덧붙이면 된다. 삽입할 때 PK(Primary Key) 값이 자동으로 생성되는 경우라면 먼저 행을 삽입한 다 음, 삽입한 새로운 행의 아이디를 이용해 경로를 갱신해야 한다.
~~~sql
INSERT INTO Comments (author, comment) VALUES (‘Ollie‘, ‘Good job!‘);

UPDATE Comments
    SET path = (SELECT path FROM Comments WHERE comment_id = 7)
        || LAST_INSERT_ID() || ‘/‘
WHERE comment_id = LAST_INSERT_ID();
~~~

경로 열거는 2장「무단횡단」에서 설명했던 것과 비슷한 단점이 있다. 데이 터베이스는 경로가 올바르게 형성되도록 하거나 경로 값이 실제 노드에 대응 
되도록 강제할 수 없다. 경로 문자열을 유지하는 것은 애플리케이션 코드에 종속되며, 이를 검증하는 데는 비용이 많이 든다. VARCHAR 칼럼의 길이를 
아무리 길게 잡아도 결국 제한이 있기 때문에, 엄격히 말하면 지원할 수 있는 트 리의 깊이 또한 제한된다.


### 중첩집합
중첩 집합은 각 노드가 자신의 부모를 저장하는 대신 자기 자손의 집합에 대 한 정보를 저장한다. 
이 정보는 트리의 각 노드를 두 개의 수로 부호화 (encode)해 나타낼 수 있는데, 여기서는 nsleft와 nsright로 부르겠다.

todo

### 클로저 테이블

todo

### 어떤 모델을 사용해야 하는가?

todo

---------

# 아이디가 필요해
중복 행을 방지하려고 노력하 는 소프트웨어 개발자의 질문이었는데, 처음에는 PK(primary key)를 잡지 않 았기 때문이라 생각했다.
컨텐트 관리 데이터베이스에, 웹 사이트에 공개할 기사를 저장했다. 기사 테이블과 태그 테이블 사이의 다대다 관계를 위해 교차 테이블을 사용했다.
~~~sql
CREATE TABLE ArticleTags (
id article_id tag_id FOREIGN KEY FOREIGN KEY
);
SERIAL PRIMARY KEY,
BIGINT UNSIGNED NOT NULL,
BIGINT UNSIGNED NOT NULL,
(article_id) REFERENCES Articles (id), (tag_id) REFERENCES Tags (id)
~~~
그러나 특정 태그가 달린 기사 수를 세는 쿼리에서 잘못된 결과가 나오고 있었다. 그는“경제”태그가 달린 기사가 다섯 개라는 것을 알고 있었지만, 쿼 리를 실행하면 일곱 개로 나왔다.

~~~sql
SELECT tag_id, COUNT(*) AS articles_per_tag FROM ArticleTags
WHERE tag_id = 327;
~~~

## 목표: PK 관례 확립
목표는 모든 테이블이 PK를 갖도록 하는 것이지만, PK의 본질을 혼동하면 안티패턴을 초래할 수 있다.
PK는 좋은 데이터베이스 설계에 정말 중요하다. PK는 테이블 내의 모든 행이 유일함을 보장하기 때문에,
각 행에 접근 하는 논리적 메커니즘이 되고 중복 행이 저장되는 것을 방지한다. 또한 PK는 관계를 생성할 때 FK로부터 참조되기도 한다.
까다로운 부분은 PK로 사용할 칼럼을 선정하는 일이다. 대부분의 테이블에서 어느 속성의 값이든 하나 이상의 행에서 나타날 잠재적 가능성이 있다.

테이블로 모델링한 영역에서는 아무런 의미도 가지지 않 는 인위적인 값을 저장할 새로운 칼럼이 필요하다. 
이 칼럼을 PK로 사용하면 (만약 이것이 적절하다면), 다른 속성 칼럼에는 중복 값이 들어가는 것을 허용 하는 반면 특정 행에 유일하게 접근할 수 있게 된다.
이런 형태의 PK를 `가상키(pseudokey)` 또는 `대체키(surrogate key)`라 한다.


## 안티패턴 : 만능키
책이나 기사, 프로그래밍 프레임워크는 데이터베이스 내 모든 테이블이 다음 과 같은 특성을 가지는 PK 칼럼을 가지도록 하는 문화적 관례를 만들었다.
- PK 칼럼 이름은 id다.
- PK 칼럼의 데이터 타입은 32비트 또는 64비트 정수다.
- 유일한 값은 자동 생성된다.

모든 테이블에 id란 이름의 칼럼이 있는 것은 너무도 흔해져 이게 PK와 동 의어가 되어 버렸다. 
SQL을 배우는 프로그래머들은 PK가 항상 다음과 같은 식으로 정의되는 칼럼이라는 잘못된 생각을 갖게 된다.

### 중복 키 생성
테이블 안의 다른 칼럼이 자연키로 사용될 수 있는 상황에서조차 단지 통념에 따라 id 칼럼을 PK로 정의한 것을 봤을 것이다.
그 다른 칼럼에 UNIQUE 제약 조건이 설정되어 있는 경우도 있다. 예를 들어, Bugs 테이블에서는 프로젝트 코드를 앞에 붙여 bug_id를 만들 수 있을 것이다.

~~~sql
CREATE TABLE Bugs (
    id SERIAL PRIMARY KEY, bug_id VARCHAR(10) UNIQUE, description VARCHAR(1000),
    ...
);
INSERT INTO Bugs (bug_id, description, ...) VALUES (‘VIS-078‘, ‘crashes on save‘, ...);

~~~

### 중복 행 허용
복합키는 여러 칼럼을 포함한다. 복합키가 사용되는 전형적인 예는 Bugs Products와 같은 교차 테이블 안에서다. 
PK는 특정한 bug_id와 product_id 값의 조합이 테이블 안에서 한 번만 나타난다는 것을 보장해야 한다. 
각 값이 다른 쌍으로 여러 번 나타날 수 있을지라도 말이다.
그러나 id 칼럼을 PK로 사용하는 경우에는 유일해야 하는 두 칼럼에 제약조 건이 적용되지 않는다.
~~~sql
CREATE TABLE BugsProducts (
    id,
    bug_id product_id FOREIGN KEY FOREIGN KEY,
    SERIAL PRIMARY KEY,
    BIGINT UNSIGNED NOT,
    BIGINT UNSIGNED NOT,
    (bug_id) REFERENCES,
    (product_id) REFERENCES Products(product_id),
);
INSERT INTO BugsProducts (bug_id, product_id)
VALUES (1234, 1), (1234, 1), (1234, 1); -- 중복이 허용됨
~~~

Bugs와 Products를 연결하기 위해 이 교차 테이블을 사용할 때, 중복 때문에 의도하지 않은 결과가 발생한다. 
중복을 방지하기 위해서는 id뿐 아니라 다른 두 칼럼에 UNIQUE 제약조건을 걸어줘야 한다.

~~~sql
CREATE TABLE BugsProducts (
    id SERIAL PRIMARY KEY,
    bug_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY (bug_id, product_id),
    FOREIGN KEY (bug_id) REFERENCES Bugs(bug_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);
~~~
그러나 이 두 칼럼에 UNIQUE 제약조건을 걸어야 한다면, id 칼럼은 불필요 한 것이다.

### 모호한 키의 의미
코드란 단어는 여러 가지 정의를 가지는데, 그 중 하나는‘간결하거나 비밀스 럽게 메시지를 주고받는 방법’이란 정의다. 프로그래밍에서 코드는‘의미를 명확하게 한다’는 반대 목표를 가져야 한다.
id란 이름은 너무 일반적이기 때문에 아무런 의미도 갖지 못한다. 이는 PK 칼럼 이름이 동일한 두 테이블을 조인할 때 특히 문제가 된다.

~~~sql
SELECT b.id, a.id
FROM Bugs b
JOIN Accounts a ON (b.assigned_to = a.id) WHERE b.status = ‘OPEN‘;
~~~

원래의 위치 대신 이름만으로 칼럼을 참조한다면 애플리케이션 코드에서 버그의 id와 계정의 id를 어떻게 구분할 것인가? 
이는 PHP와 같은 동적 언어에 서는 특히 문제가 된다. 쿼리 결과가 연관 배열에 담겨 반환되는데, 쿼리에 칼 럼 별명(alias)를 지정하지 않으면 한 칼럼이 다른 칼럼을 덮어써버리기 때문 이다.
id 칼럼의 이름은 쿼리의 의미를 명확하게 하는 데도 도움이 되지 않는다. 그러나 칼럼 이름이 bug_id와 account_id로 되어 있다면 쿼리 결과를 읽기도 훨씬 쉬울 것이다. 
우리는 테이블의 개별 행에 접근할 때 PK를 사용하기 때문 에, PK의 칼럼 이름이 테이블의 엔터티 타입에 대한 실마리를 줘야 한다.

### USING 사용

양쪽 테이블에서 칼럼 이름이 같다면 SQL은 두 테이블의 조인을 표현하는 좀더 간략한 문법도 지원한다.
~~~sql
SELECT * FROM Bugs JOIN BugsProducts USING (bug_id);
~~~

### 어려운 복합키
어떤 개발자는 사용하기 어렵다는 이유로 복합키를 거부한다. 키를 비교할 때 모든 칼럼을 비교해야 한다. 
복합 PK를 참조하는 FK는 자신도 복합 FK가 되 어야 한다. 복합키를 사용하려면 타이핑을 더 해야 한다.


## 안티패턴 인식 방법
이 안티패턴의 징후는 쉽게 인식할 수 있다. 테이블에서 PK 칼럼 이름으로 id(지나치게 일반적인 이름)가 사용되고 있으면 이 안티패턴의 징후로 볼 수 있다.

- 이 테이블에는 PK가 없어도 될 것 같은데.
- 다대다 연결에서 왜 중복이 발생했지?
  - 다대다 관계를 위한 교차 테이블에는 FK 칼럼을 묶어 PK 제약조건을 걸 거나 최소한 UNIQUE 제약조건이라도 걸어줘야 한다.


### 안티패턴 사용이 합당한 경우
일부 객체-관계 프레임워크에서는 CoC(Convention over Configuration)를 통 해 개발을 단순화한다. 
이런 프레임워크에서는 모든 테이블이 동일한 방식(칼 럼 이름은 id고 데이터 타입은 정수인 가상키)으로 PK를 정의한다고 가정한다. 
이런 프레임워크를 사용한다면 그 관례를 따르고 싶을 것이다. 그렇게 해 야 프레임워크의 다른 원하는 기능을 사용할 수 있기 때문이다.

가상키는 지나치게 긴 자연키를 대체하기 위해 사용한다면 적절한 선택이 다. 예를 들어, 파일 시스템의 파일 속성을 저장하는 테이블에서, 
파일 경로는 좋은 자연키가 될 수 있지만, 이렇게 긴 문자열을 키로 하면 인덱스를 만들고 유지하는 데 많은 비용이 들 것이다.


### 해법: 상황에 맞추기
PK는 제약조건이지 데이터 타입이 아니다. 데이터 타입이 인덱스를 지원하기 만 하면, 어느 칼럼 또는 칼럼의 묶음에 대해서도 PK를 선언할 수 있다.
또한 테이블의 특정 칼럼을 PK로 잡지 않고도 자동 증가하는 정수값을 가지도록 정의할수있다.
**좋은 설계 방법에 경직된 관례가 끼어드는 것을 허용하지 말기 바란다.**
 

### 있는 그래로 말하기
PK에 의미 있는 이름을 선택 해야 한다. 이 이름은 PK가 식별하는 엔터티의 타입을 나타내야 한다. 예를 들어, Bugs 테이블의 PK는 bug_id가 되어야 한다.
FK에서도 가능하다면 같은 칼럼 이름을 사용해야 한다. 이는 종종 PK 이름 이 스키마 내에서 유일해야 함을 뜻한다. 하나가 다른 쪽의 FK가 아닌 한,
동일한 PK 이름이 다른 테이블에 나오면 안 된다. 그러나 예외가 있다. 연결의 본질을 더 잘 표현하는 경우라면,FK를 자신이 참조하는 PK이름과 다르게 하는 것도 괜찮다.

### 관례에서 벗어나기
객체-관계 프레임워크는 id란 이름의 가상키가 사용될 것을 기대하지만, 다른 이름을 사용하도록 재설정하는 것도 허용한다. 다음은 Roby on Rails4에서의 예다.
~~~rb
class Bug < ActiveRecord::Base 
    set_primary_key ”bug_id”
end
~~~

### 자연키와 복합키 포용


**SQL Antipatterns Tip 관례는 도움이 될 때만 좋은 것이다..** 

---

# 키가 없는 엔트리
정말 필요했던 것은 사용자가 유효하지 않은 데이터를 입력하려 할 때 애플리케이션이 즉시 에러를 내보내도록 하는 것이었다. FK 제약조건이 뭘 하는지 생각해보기 바란다.

## 목표: 데이터베이스 아키텍처 단순화
관계형 데이터베이스 설계는 각 테이블 자체에 대한 것이기도 하고 테이블간 의 관계에 대한 것이기도 하다.
`참조 정합성(Referential Integrity)`은 데이터베이스를 적절히 설계하고 운영하는 데 있어 중요한 부분이다.

어떤 칼럼 또는 칼럼 묶음에 FK 제약조건을 선언하면, 그 칼럼에 들어가는 값은 부모 테이블 의 PK 또는 유일키(unique key)에 존재해야 한다. 충분히 간단해 보인다.
그러나 어떤 소프트웨어 개발자는 참조 정합성 제약조건을 사용하지 말라 고 권고한다. FK를 무시하라는 이유에는 다음과 같은 것들이 포함되어 있는 데 한 번씩은 들어봤을 것이다.

- 데이터 업데이트 시 제약조건과 충돌할 수 있다.
- 참조 정합성 제약조건을 지원할 수 없는 매우 융통성 있는 데이터베이스 설계를 사용하고 있다.
- FK에 데이터베이스가 자동 생성하는 인덱스 때문에 성능에 영향을 받는 다고 믿는다.
- FK를 지원하지 않는 데이터베이스를 사용하고 있다.
- FK 선언을 위해 문법을 찾아봐야 한다.

## 안티패턴: 제약조건 무시
FK 제약조건을 생략하는 것이 처음에는 데이터베이스 설계를 단순하고 유연 하고 빠르게 하는 것처럼 보이겠지만,
다른 방식으로 대가를 치러야 한다. 참조 정합성을 보장하기 위한 코드를 직접 작성해야 하는 책임을 떠안아야 하기 때문이다.

### 무결점 코드
많은 사람들이 참조 정합성을 위해 애플리케이션 코드를 작성해 데이터 관계 를 만족시키려 한다. 행을 삽입할 때마다,
FK 칼럼의 값이 참조하는 테이블에 존재하는 값인지를 확인해야 한다. 
행을 삭제할 때마다, 자식 테이블이 적절 히 업데이트되는지 확인해야 한다. 쉽게 말하면, 실수를 하지 않아야 한다는 것이다.

### 오류확인
버그 데이터베이스에서 Bugs.status 칼럼은 BugsStatus 색인 테이 블을 참조한다.유효하지 않은 상태를 가진 버그를 찾기 위해 다음과 같은 쿼리를 사용할 수 있다.
~~~sql
SELECT b.bug_id, b.status
FROM Bugs b LEFT OUTER JOIN BugStatus s
ON (b.status = s.status) WHERE s.status IS NULL;
~~~
매일 수백번 또는 그 이상으로 자주 확인한다면 이보다 더한 잡일도 없을 것이다

### "내 잘못이 아냐!"
데이터베이스는 일관성 있게 유지해야 한다. 즉, 데이터베이스 내 참조가 항상 유효해야 한다. 
그러나 데이터베이스에 접근하는 모든 애플리케이션과 스크립트가 올바르게 변경을 가하는지는 확신할 수 없다.

### 진퇴양난 업데이트
많은 개발자가 여러 테이블의 관련된 칼럼을 업데이트할 때 불편해지기 때문 에 FK제약조건 사용을 꺼린다.

해결할 수 없는 문제는 자식 행이 참조하고 있는 칼럼을 UPDATE하려 할 때 발생한다. 
부모를 업데이트하기 전에는 자식 행을 업데이트할 수 없고, 자신 을 참조하는 자식 행을 업데이트하기 전에는 부모를 업데이트할 수 없다. 
둘 을 동시에 변경해야 하지만, 두 개의 분리된 업데이트 문으로는 이렇게 하기가 불가능하다. 이러지도 저리지도 못하는 상황이다.

~~~sql
UPDATE BugStatus SET status = ‘INVALID‘ WHERE status = ‘BOGUS‘; -- 에러!
UPDATE Bugs SET status = ‘INVALID‘ WHERE status = ‘BOGUS‘; -- 에러!
~~~
일부 개발자들은 이런 상황을 처리하는 게 어렵다고 생각해 아예 FK를 사용 하지 않기로 결정해버린다.
이 장의 뒷부분에서, FK를 사용했을 때 여러 테이 블을 업데이트하거나 삭제하는 간단하고 효율적인 방법을 살펴볼 것이다.

## 안티패턴 인식 방법
사람들이 다음과 같은 말을 하는 걸 들으면, 아마도 키가 없는 엔트리 안티패턴을 사용하고 있을 것이다.
- "어떤 값이 한 테이블에는 있고 다른 테이블에는 없는지 확인하려면 쿼리를 어떻게 작성해야 하지?” 이는 보통 부모가 업데이트되거나 삭제되어 고아가 된 자식 행을 찾으려 는 것이다.
- "테이블에 삽입하면서 다른 테이블에 어떤 값이 있는지를 확인하는 빠른 방법이 없을까?" 이는 부모행이 존재하는지를 확인하려는 것이다. FK가 이를 자동으로 확 인해주며, 효율적으로 확인하기 위해 부모 테이블의 인덱스를 활용한다.
- "FK라고? FK는 데이터베이스를 느리게 만들기 때문에 사용하지 말라고 들었는데?" FK를 사용하지 않는 것을 간단하게 합리화하기 위해 성능 문제를 말하지 만, FK를 사용하지 않으면 성능 문제를 포함해 문제가 해결되기보다는 늘어 난다.

## 안티패턴 사용이 합당한 경우
FK 제약조건을 지원하지 않는 데이터베이스(예를 들어, MySQL의 MyISAM 스토리지 엔진 또는 버전 3.6.19 이전의 SQLite)를 사용할 수밖에 없는 경우도 있
다.이런 경우라면 이 장의 앞부분에서 설명했던 품질 제어 스크립트 같은 것 으로 보완하는 수밖에 없다.
관계를 모델링하는 데 FK를 사용할 수 없는 극단적으로 유연한 데이터베이스 설계도 있다. 전통적인 참조 정합성 제약조건을 사용할 수 없다면, 이는 다른 SQL 안티패턴이 사용되고 있음을 나타내는 강력한 징후다. 

## 해법: 제약조건 선언하기
일본어에 `포카요케(poka-yoke)`란 표현이 있는데, `오류 검증(mistake proofing)`이란 뜻이다.
이 용어는 오류를 방지하거나 바로잡거나 또는 발생 하는 즉시 관심을 가져 제품의 결함을 제거하는 데 도움이 되는 생산 공정을 뜻한다. 
이런 실행방안은 품질을 향상시키고 정정 요구를 감소시켜, 추가비용 을 상쇄하고도 남는다.

데이터베이스 설계에서도 참조 정합성을 강제하기 위해 FK를 사용하는 방 법으로 포카요케 원리를 적용할 수 있다. 
데이터 정합성 오류를 찾아내 정정 하는 대신, 처음부터 잘못된 데이터가 입력되지 않도록 할 수 있는 것이다.

~~~sql
CREATE TABLE Bugs (
    ...
    reported_by BIGINT UNSIGNED NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT ‘NEW‘, 
    FOREIGN KEY (reported_by) REFERENCES Accounts(account_id),
    FOREIGN KEY (status) REFERENCES BugStatus(status)
);
~~~
FK를 사용하면 불필요한 코드를 작성하지 않아도 되고, 데이터베이스를 변경할 때도 모든 코드가 동일한 제약조건을 따른다는 것을 확신할 수 있다.

### 여러 테이블 변경 지원
FK는 애플리케이션 코드로 흉내 낼 수 없는 다른 기능이 있다.단계적 업데이트(cascading update)다
~~~sql
CREATE TABLE Bugs
(
    reported_by BIGINT UNSIGNED NOT NULL,
    status      VARCHAR(20)     NOT NULL DEFAULT ‘NEW‘,
    FOREIGN KEY (reported_by) REFERENCES Accounts (account_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (status) REFERENCES BugStatus (status)
        ON UPDATE CASCADE
        ON DELETE SET DEFAULT
);
~~~
이 방법을 사용하면 부모 행을 업데이트 또는 삭제할 경우 데이터베이스가 해당 부모를 참조하는 자식 행을 알아서 처리해준다.

### 오버헤드? 그닥~
FK 제약조건이 약간의 오버헤드가 있는 것은 사실이다. 그러나 다른 대안과 비교했을 때, FK가 훨씬 효율적이라고 입증되었다.
- INSERT, UPDATE, DELETE 전에 데이터를 확인하기 위해 SELECT 쿼리를 실행할 필요가 없다.
- 여러 테이블을 변경하기 위해 테이블 잠금을 사용할 필요가 없다. 
- 불가피하게 생기는 고아 데이터를 정정하기 위해 품질 제어 스크립트를 주기적으로 돌릴 필요가 없다.

**SQL Antipatterns Tip 제약조건을 사용해 데이터베이스에서 실수를 방지하라.**
