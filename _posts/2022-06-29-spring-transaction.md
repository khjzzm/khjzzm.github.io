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

### [트랜잭션 적용 위치]()
스프링에서 우선순위는 항상 더 구체적이고 자세한 것이 높은 우선순위를 가진다. 이것만 기억하면
스프링에서 발생하는 대부분의 우선순위를 쉽게 기억할 수 있다. 그리고 더 구체적인 것이 더 높은
우선순위를 가지는 것은 상식적으로 자연스럽다.
예를 들어서 메서드와 클래스에 애노테이션을 붙일 수 있다면 더 구체적인 메서드가 더 높은 우선순위를
가진다.
인터페이스와 해당 인터페이스를 구현한 클래스에 애노테이션을 붙일 수 있다면 더 구체적인 클래스가 더
높은 우선순위를 가진다.

### [트랜잭션 AOP 주의 사항 - 프록시 내부 호출1]()
`@Transactional` 을 사용하면 스프링의 트랜잭션 AOP가 적용된다.
트랜잭션 AOP는 기본적으로 프록시 방식의 AOP를 사용한다.
앞서 배운 것 처럼 `@Transactional` 을 적용하면 프록시 객체가 요청을 먼저 받아서 트랜잭션을 처리하고, 
실제 객체를 호출해준다.

따라서 트랜잭션을 적용하려면 항상 프록시를 통해서 대상 객체(Target)을 호출해야 한다.
이렇게 해야 프록시에서 먼저 트랜잭션을 적용하고, 이후에 대상 객체를 호출하게 된다.
만약 프록시를 거치지 않고 대상 객체를 직접 호출하게 되면 AOP가 적용되지 않고, 트랜잭션도 적용되지
않는다.

AOP를 적용하면 스프링은 대상 객체 대신에 프록시를 스프링 빈으로 등록한다. 따라서 스프링은 의존관계
주입시에 항상 실제 객체 대신에 프록시 객체를 주입한다. 프록시 객체가 주입되기 때문에 대상 객체를 직접
호출하는 문제는 일반적으로 발생하지 않는다. **하지만 대상 객체의 내부에서 메서드 호출이 발생하면
프록시를 거치지 않고 대상 객체를 직접 호출하는 문제가 발생한다.** 이렇게 되면 @Transactional 이
있어도 트랜잭션이 적용되지 않는다. 실무에서 반드시 한번은 만나서 고생하는 문제이기 때문에 꼭
이해하고 넘어가자.

#### 문제 원인
자바 언어에서 메서드 앞에 별도의 참조가 없으면 this 라는 뜻으로 자기 자신의 인스턴스를 가리킨다.
결과적으로 자기 자신의 내부 메서드를 호출하는 this.internal() 이 되는데, 여기서 this 는 자기
자신을 가리키므로, 실제 대상 객체( target )의 인스턴스를 뜻한다. 결과적으로 이러한 내부 호출은
프록시를 거치지 않는다. 따라서 트랜잭션을 적용할 수 없다. 결과적으로 target 에 있는 internal() 을
직접 호출하게 된 것이다.

### [트랜잭션 AOP 주의 사항 - 프록시 내부 호출2]()
public 메서드만 트랜잭션 적용  
스프링의 트랜잭션 AOP 기능은 public 메서드에만 트랜잭션을 적용하도록 기본 설정이 되어있다.
그래서 protected , private , package-visible 에는 트랜잭션이 적용되지 않는다. 생각해보면
protected , package-visible 도 외부에서 호출이 가능하다. 따라서 부분은 앞서 설명한 프록시의 내부
호출과는 무관하고, 스프링이 막아둔 것이다.

스프링이 public 에만 트랜잭션을 적용하는 이유는 다음과 같다.
~~~java
@Transactional
public class Hello {
    public method1();
    method2();
    protected method3();
    private method4();
}
~~~
이렇게 클래스 레벨에 트랜잭션을 적용하면 모든 메서드에 트랜잭션이 걸릴 수 있다. 그러면 트랜잭션을
의도하지 않는 곳 까지 트랜잭션이 과도하게 적용된다. 트랜잭션은 주로 비즈니스 로직의 시작점에 걸기
때문에 대부분 외부에 열어준 곳을 시작점으로 사용한다. 이런 이유로 public 메서드에만 트랜잭션을
적용하도록 설정되어 있다.

참고로 public 이 아닌곳에 @Transactional 이 붙어 있으면 예외가 발생하지는 않고, 트랜잭션 적용만
무시된다

### [트랜잭션 AOP 주의 사항 - 초기화 시점]()
초기화 코드(예: @PostConstruct )와 @Transactional 을 함께 사용하면 트랜잭션이 적용되지 않는다.  

왜냐하면 초기화 코드가 먼저 호출되고, 그 다음에 트랜잭션 AOP가 적용되기 때문이다. 따라서 초기화
시점에는 해당 메서드에서 트랜잭션을 획득할 수 없다.   

가장 확실한 대안은 ApplicationReadyEvent 이벤트를 사용하는 것이다.
이 이벤트는 트랜잭션 AOP를 포함한 스프링이 컨테이너가 완전히 생성되고 난 다음에 이벤트가 붙은
메서드를 호출해준다. 따라서 init2() 는 트랜잭션이 적용된 것을 확인할 수 있다.

### 트랜잭션 옵션 소개
~~~java
public @interface Transactional {
    String value() default "";
    String transactionManager() default "";

    Class<? extends Throwable>[] rollbackFor() default {};
    Class<? extends Throwable>[] noRollbackFor() default {};

    Propagation propagation() default Propagation.REQUIRED;
    Isolation isolation() default Isolation.DEFAULT;
    int timeout() default TransactionDefinition.TIMEOUT_DEFAULT;
    boolean readOnly() default false;
    String[] label() default {};
}
~~~

### [예외와 트랜잭션 커밋, 롤백 - 기본]()
실행하기 전에 다음을 추가하자. 이렇게 하면 트랜잭션이 커밋되었는지 롤백 되었는지 로그로 확인할 수 있다.   
application.properties
~~~
logging.level.org.springframework.transaction.interceptor=TRACE
logging.level.org.springframework.jdbc.datasource.DataSourceTransactionManager=
DEBUG
#JPA log
logging.level.org.springframework.orm.jpa.JpaTransactionManager=DEBUG
logging.level.org.hibernate.resource.transaction=DEBUG
~~~
참고로 지금은 JPA를 사용하므로 트랜잭션 매니저로 JpaTransactionManager 가 실행되고, 여기의 로그를 출력하게 된다.

### 예외와 트랜잭션 커밋, 롤백 - 활용
스프링은 왜 체크 예외는 커밋하고, 언체크(런타임) 예외는 롤백할까?
스프링 기본적으로 체크 예외는 비즈니스 의미가 있을 때 사용하고, 런타임(언체크) 예외는 복구 불가능한 예외로 가정한다.

- 체크 예외: 비즈니스 의미가 있을 때 사용
- 언체크 예외: 복구 불가능한 예외

참고로 꼭 이런 정책을 따를 필요는 없다. 그때는 앞서 배운 rollbackFor 라는 옵션을 사용해서 체크 예외도 롤백하면 된다.
그런데 비즈니스 의미가 있는 비즈니스 예외라는 것이 무슨 뜻일까? 간단한 예제로 알아보자.

참고로 테이블 자동 생성은 `application.properties` 에 `spring.jpa.hibernate.ddl-auto` 옵션을 조정할 수 있다.
- none : 테이블을 생성하지 않는다.
- create : 애플리케이션 시작 시점에 테이블을 생성한다.

## 스프링 트랜잭션 전파1 - 기본
### [스프링 트랜잭션 전파1 - 커밋, 롤백]()
### 스프링 트랜잭션 전파2 - 트랜잭션 두 번 사용
주의!  
로그를 보면 트랜잭션1과 트랜잭션2가 같은 conn0 커넥션을 사용중이다. 이것은 중간에 커넥션 풀 때문에
그런 것이다. 트랜잭션1은 conn0 커넥션을 모두 사용하고 커넥션 풀에 반납까지 완료했다. 이후에 이후에
트랜잭션2가 conn0 를 커넥션 풀에서 획득한 것이다. 따라서 둘은 완전히 다른 커넥션으로 인지하는 것이
맞다.

그렇다면 둘을 구분할 수 있는 다른 방법은 없을까?
히카리 커넥션 풀에서 커넥션을 획득하면 실제 커넥션을 그대로 반환하는 것이 아니라 내부 관리를 위해
히카리 프록시 커넥션이라는 객체를 생성해서 반환한다. 물론 내부에는 실제 커넥션이 포함되어 있다. 이
객체의 주소를 확인하면 커넥션 풀에서 획득한 커넥션을 구분할 수 있다.

- 트랜잭션1: Acquired Connection [HikariProxyConnection@1000000 wrapping conn0]
- 트랜잭션2: Acquired Connection [HikariProxyConnection@2000000 wrapping conn0]

히카리 커넥션풀이 반환해주는 커넥션을 다루는 프록시 객체의 주소가 트랜잭션1은
HikariProxyConnection@1000000 이고, 트랜잭션2는 HikariProxyConnection@2000000 으로 서로
다른 것을 확인할 수 있다.
결과적으로 conn0 을 통해 커넥션이 재사용 된 것을 확인할 수 있고,
HikariProxyConnection@1000000 , HikariProxyConnection@2000000 을 통해 각각 커넥션 풀에서
커넥션을 조회한 것을 확인할 수 있다.

### [스프링 트랜잭션 전파3 - 전파 기본]()
지금부터 설명하는 내용은 트랜잭션 전파의 기본 옵션인 REQUIRED 를 기준으로 설명한다.

**원칙**
- 모든 논리 트랜잭션이 커밋되어야 물리 트랜잭션이 커밋된다.
- 하나의 논리 트랜잭션이라도 롤백되면 물리 트랜잭션은 롤백된다.

풀어서 설명하면 이렇게 된다. 모든 트랜잭션 매니저를 커밋해야 물리 트랜잭션이 커밋된다. 하나의
트랜잭션 매니저라도 롤백하면 물리 트랜잭션은 롤백된다.

### [스프링 트랜잭션 전파4 - 전파 예제]()


### [스프링 트랜잭션 전파5 - 외부 롤백]()

### [스프링 트랜잭션 전파6 - 내부 롤백]()

### [스프링 트랜잭션 전파7 - REQUIRES_NEW]()

### 스프링 트랜잭션 전파8 - 다양한 전파 옵션

## 스프링 트랜잭션 전파2 - 활용
### 트랜잭션 전파 활용1 - 예제 프로젝트 시작

### 트랜잭션 전파 활용2 - 커밋, 롤백

### 트랜잭션 전파 활용3 - 단일 트랜잭션
### 트랜잭션 전파 활용4 - 전파 커밋
### 트랜잭션 전파 활용5 - 전파 롤백
### 트랜잭션 전파 활용6 - 복구 REQUIRED
### 트랜잭션 전파 활용7 - 복구 REQUIRES_NEW