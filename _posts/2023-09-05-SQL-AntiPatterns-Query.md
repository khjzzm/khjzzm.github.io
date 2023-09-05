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
