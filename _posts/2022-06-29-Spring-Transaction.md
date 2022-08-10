---
layout: post
title: 스프링 트랜잭션
---

## 스프링 트랜잭션 이해

### 스프링 트랜잭션 소개
#### 스프링 트랜잭션 추상화
각각의 데이터 접근 기술들은 트랜잭션을 처리하는 방식에 차이가 있다. 예를 들어 JDBC 기술과 JPA
기술은 트랜잭션을 사용하는 코드 자체가 다르다.

**JDBC 트랜잭션 코드 예시**
~~~java
public void accountTransfer(String fromId, String toId, int money) throws SQLException {
    Connection con = dataSource.getConnection();
    try {
        con.setAutoCommit(false); //트랜잭션 시작
        //비즈니스 로직
        bizLogic(con, fromId, toId, money);
        con.commit(); //성공시 커밋
    } catch (Exception e) {
        con.rollback(); //실패시 롤백
        throw new IllegalStateException(e);
    } finally {
        release(con);
    }
}


~~~

**JPA 트랜잭션 코드 예시**
~~~java
public static void main(String[] args) {
    //엔티티 매니저 팩토리 생성
    EntityManagerFactory emf = Persistence.createEntityManagerFactory("jpabook");
    EntityManager em = emf.createEntityManager(); //엔티티 매니저 생성
    EntityTransaction tx = em.getTransaction(); //트랜잭션 기능 획득
    try {
        tx.begin(); //트랜잭션 시작
        logic(em); //비즈니스 로직
        tx.commit();//트랜잭션 커밋
    } catch (Exception e) {
        tx.rollback(); //트랜잭션 롤백
    } finally {
        em.close(); //엔티티 매니저 종료
    }
    emf.close(); //엔티티 매니저 팩토리 종료
}
~~~

따라서 JDBC 기술을 사용하다가 JPA 기술로 변경하게 되면 트랜잭션을 사용하는 코드도 모두 함께 변경해야 한다.
스프링은 이런 문제를 해결하기 위해 트랜잭션 추상화를 제공한다. 트랜잭션을 사용하는 입장에서는 스프링
트랜잭션 추상화를 통해 둘을 동일한 방식으로 사용할 수 있게 되는 것이다.

스프링은 PlatformTransactionManager 라는 인터페이스를 통해 트랜잭션을 추상화한다.

**PlatformTransactionManager 인터페이스**
~~~java
package org.springframework.transaction;

public interface PlatformTransactionManager extends TransactionManager {
    TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
            throws TransactionException;

    void commit(TransactionStatus status) throws TransactionException;

    void rollback(TransactionStatus status) throws TransactionException;
}
~~~
스프링은 트랜잭션을 추상화해서 제공할 뿐만 아니라, 실무에서 주로 사용하는 데이터 접근 기술에 대한
트랜잭션 매니저의 구현체도 제공한다. 우리는 필요한 구현체를 스프링 빈으로 등록하고 주입 받아서
사용하기만 하면 된다.

여기에 더해서 스프링 부트는 어떤 데이터 접근 기술을 사용하는지를 자동으로 인식해서 적절한 트랜잭션
매니저를 선택해서 스프링 빈으로 등록해주기 때문에 트랜잭션 매니저를 선택하고 등락하는 과정도 생략할
수 있다. 예를 들어서 JdbcTemplate , MyBatis 를 사용하면
DataSourceTransactionManager(JdbcTransactionManager) 를 스프링 빈으로 등록하고, JPA를
사용하면 JpaTransactionManager 를 스프링 빈으로 등록해준다.

스프링 트랜잭션 사용 방식   
`PlatformTransactionManager` 를 사용하는 방법은 크게 2가지가 있다.

**선언적 트랜잭션 관리 vs 프로그래밍 방식 트랜잭션 관리**  
선언적 트랜잭션 관리(Declarative Transaction Management)
- @Transactional 애노테이션 하나만 선언해서 매우 편리하게 트랜잭션을 적용하는 것을 선언적 트랜잭션 관리라 한다.
- 선언적 트랜잭션 관리는 과거 XML에 설정하기도 했다.
- 이름 그대로 해당 로직에 트랜잭션을 적용하겠다 라고 어딘가에 선언하기만 하면 트랜잭션이 적용되는 방식이다.

프로그래밍 방식의 트랜잭션 관리(programmatic transaction management)
- 트랜잭션 매니저 또는 트랜잭션 템플릿 등을 사용해서 트랜잭션 관련 코드를 직접 작성하는 것을 프로그래밍 방식의 트랜잭션 관리라 한다.

프로그래밍 방식의 트랜잭션 관리를 사용하게 되면, 애플리케이션 코드가 트랜잭션이라는 기술 코드와 강하게 결합된다.
선언적 트랜잭션 관리가 프로그래밍 방식에 비해서 훨씬 간편하고 실용적이기 때문에 실무에서는 대부분 선언적 트랜잭션 관리를 사용한다.

선언적 트랜잭션과 AOP   
@Transactional 을 통한 선언적 트랜잭션 관리 방식을 사용하게 되면 기본적으로 프록시 방식의 AOP가 적용된다.


#### 스프링이 제공하는 트랜잭션 AOP
스프링의 트랜잭션은 매우 중요한 기능이고, 전세계 누구나 다 사용하는 기능이다. 스프링은 트랜잭션 AOP
를 처리하기 위한 모든 기능을 제공한다. 스프링 부트를 사용하면 트랜잭션 AOP를 처리하기 위해 필요한
스프링 빈들도 자동으로 등록해준다.

개발자는 트랜잭션 처리가 필요한 곳에 @Transactional 애노테이션만 붙여주면 된다. 스프링의
트랜잭션 AOP는 이 애노테이션을 인식해서 트랜잭션을 처리하는 프록시를 적용해준다.

**@Transactional**
~~~
org.springframework.transaction.annotation.Transactional
~~~

### [프로젝트 생성](https://github.com/khjzzm/springtx/commit/247b3dec7d41fff837b4940c93231d387283d12f)
### [트랜잭션 적용 확인](https://github.com/khjzzm/springtx/commit/82fe9f14b3cb79fd54aae8c2e515098d5223470a)
@Transactional 을 통해 선언적 트랜잭션 방식을 사용하면 단순히 애노테이션 하나로 트랜잭션을 적용할
수 있다. 그런데 이 기능은 트랜잭션 관련 코드가 눈에 보이지 않고, AOP를 기반으로 동작하기 때문에, 실제
트랜잭션이 적용되고 있는지 아닌지를 확인하기가 어렵다.

TransactionSynchronizationManager.isActualTransactionActive()
현재 쓰레드에 트랜잭션이 적용되어 있는지 확인할 수 있는 기능이다. 결과가 true 면 트랜잭션이 적용되어
있는 것이다. 트랜잭션의 적용 여부를 가장 확실하게 확인할 수 있다.

### 트랜잭션 적용 위치
### 트랜잭션 AOP 주의 사항 - 프록시 내부 호출1
### 트랜잭션 AOP 주의 사항 - 프록시 내부 호출2
### 트랜잭션 AOP 주의 사항 - 초기화 시점
### 트랜잭션 옵션 소개
### 예외와 트랜잭션 커밋, 롤백 - 기본
### 예외와 트랜잭션 커밋, 롤백 - 활용

## 스프링 트랜잭션 전파1 - 기본
### 스프링 트랜잭션 전파1 - 커밋, 롤백
### 스프링 트랜잭션 전파2 - 트랜잭션 두 번 사용
### 스프링 트랜잭션 전파3 - 전파 기본
### 스프링 트랜잭션 전파4 - 전파 예제
### 스프링 트랜잭션 전파5 - 외부 롤백
### 스프링 트랜잭션 전파6 - 내부 롤백
### 스프링 트랜잭션 전파7 - REQUIRES_NEW
### 스프링 트랜잭션 전파8 - 다양한 전파 옵션

## 스프링 트랜잭션 전파2 - 활용
### 트랜잭션 전파 활용1 - 예제 프로젝트 시작
### 트랜잭션 전파 활용2 - 커밋, 롤백
### 트랜잭션 전파 활용3 - 단일 트랜잭션
### 트랜잭션 전파 활용4 - 전파 커밋
### 트랜잭션 전파 활용5 - 전파 롤백
### 트랜잭션 전파 활용6 - 복구 REQUIRED
### 트랜잭션 전파 활용7 - 복구 REQUIRES_NEW