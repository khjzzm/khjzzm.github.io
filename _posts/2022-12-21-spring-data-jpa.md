---
layout: post
title: 스프링 데이터 JPA
---

~~~
./gradlew dependencies --configuration compileClasspath
~~~

## 스프링 부트 라이브러리 살펴보기

- spring-boot-starter-web
    - spring-boot-starter-tomcat: 톰캣 (웹서버)
    - spring-webmvc: 스프링 웹 MVC

- spring-boot-starter-data-jpa
    - spring-boot-starter-aop
    - spring-boot-starter-jdbc
        - HikariCP 커넥션 풀 (부트 2.0 기본)
    - hibernate + JPA: 하이버네이트 + JPA
    - spring-data-jpa: 스프링 데이터 JPA

- spring-boot-starter(공통): 스프링 부트 + 스프링 코어 + 로깅
    - spring-boot
        - spring-core
    - spring-boot-starter-logging
        - logback, slf4j

## 테스트 라이브러리

- spring-boot-starter-test
    - junit: 테스트 프레임워크, 스프링 부트 2.2부터 junit5( jupiter ) 사용
        - 과거 버전은 vintage
    - mockito: 목 라이브러리
    - assertj: 테스트 코드를 좀 더 편하게 작성하게 도와주는 라이브러리
        - https://joel-costigliola.github.io/assertj/index.html
    - spring-test: 스프링 통합 테스트 지원
- 핵심 라이브러리
    - 스프링 MVC
    - 스프링 ORM
    - JPA, 하이버네이트
    - 스프링 데이터 JPA
- 기타 라이브러리
    - H2 데이터베이스 클라이언트
    - 커넥션 풀: 부트 기본은 HikariCP
    - 로깅 SLF4J & LogBack
    - 테스트

참고:스프링부트를 통해 복잡한 설정이 다 자동화 되었다. `persistence.xml` 도 없고 `LocalContainerEntityManagerFactoryBean` 도 없다.
스프링 부트를 통한 추가 설정은 스프링 부트 메뉴얼을 참고하고, 스프링 부트를 사용하지 않고 순수 스프링과 JPA 설정 방법은 자바 ORM 표준 JPA 프로그래밍 책을 참고하자.

## JavaConfig 설정- 스프링 부트 사용시 생략 가능

~~~java

@Configuration
@EnableJpaRepositories(basePackages = "jpabook.jpashop.repository")
public class AppConfig {
}
~~~

- 스프링부트사용시 `@SpringBootApplication` 위치를 지정(해당패키지와 하위패키지인식)
- 만약 위치가 달라지면 `@EnableJpaRepositories` 필요

**스프링 데이터 JPA가 구현 클래스 대신 생성**

- org.springframework.data.repository.Repository 를 구현한 클래스는 스캔 대상
    - MemberRepository 인터페이스가 동작한 이유
    - 실제 출력해보기(Proxy)
    - memberRepository.getClass() class com.sun.proxy.$ProxyXXX
- @Repository 애노테이션 생략 가능
    - 컴포넌트 스캔을 스프링 데이터 JPA가 자동으로 처리
    - JPA 예외를 스프링 예외로 변환하는 과정도 자동으로 처리

## 공통 인터페이스 분석

- JpaRepository 인터페이스: 공통 CRUD 제공
- 제네릭은 <엔티티 타입, 식별자 타입> 설정

~~~java
public interface JpaRepository<T, ID extends Serializable> extends PagingAndSortingRepository<T, ID> {

}
~~~

**주요 메서드**

- save(S) : 새로운 엔티티는 저장하고 이미 있는 엔티티는 병합한다.
- delete(T) : 엔티티 하나를 삭제한다. 내부에서 EntityManager.remove() 호출
- findById(ID) : 엔티티 하나를 조회한다. 내부에서 EntityManager.find() 호출
- getOne(ID) : 엔티티를 프록시로 조회한다. 내부에서 EntityManager.getReference() 호출
- findAll(...) : 모든 엔티티를 조회한다. 정렬( Sort )이나 페이징( Pageable ) 조건을 파라미터로 제공할 수 있다.

## 쿼리 메소드 기능

**스프링 데이터 JPA가 제공하는 마법 같은 기능**

### 메소드 이름으로 쿼리 생성

- 조회: find...By ,read...By ,query...By get...By,
    - [https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.query-methods.query-creation](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.query-methods.query-creation)
    - 예:) findHelloBy 처럼 ...에 식별하기 위한 내용(설명)이 들어가도 된다.
- COUNT: count...By 반환타입 long
- EXISTS: exists...By 반환타입 boolean
- 삭제: delete...By, remove...By 반환타입 long
- DISTINCT: findDistinct, findMemberDistinctBy
- LIMIT: findFirst3, findFirst, findTop, findTop3
    - [https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.limit-query-result](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.limit-query-result)

참고: 이 기능은 엔티티의 필드명이 변경되면 인터페이스에 정의한 메서드 이름도 꼭 함께 변경해야 한다. 그렇지 않으면 애플리케이션을 시작하는 시점에 오류가 발생한다. 이렇게 애플리케이션 로딩 시점에 오류를 인지할 수
있는 것이 스프링 데이터 JPA의 매우 큰 장점이다.

### NamedQuery

- 스프링 데이터 JPA는 선언한 "도메인 클래스 + .(점) + 메서드 이름"으로 Named 쿼리를 찾아서 실행
- 만약 실행할 Named 쿼리가 없으면 메서드 이름으로 쿼리 생성 전략을 사용한다.
- 필요하면 전략을 변경할 수 있지만 권장하지 않는다.
    - 참고: [https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.query-methods.query-lookup-strategies](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.query-methods.query-lookup-strategies)

참고: 스프링 데이터 JPA를 사용하면 실무에서 Named Query를 직접 등록해서 사용하는 일은 드물다. 대신 @Query 를 사용해서 리파지토리 메소드에 쿼리를 직접 정의한다.

### @Query - 리파지토리 메소드에 쿼리 정의 파라미터 바인딩

- @org.springframework.data.jpa.repository.Query 어노테이션을 사용
- 실행할 메서드에 정적 쿼리를 직접 작성하므로 이름 없는 Named 쿼리라 할 수 있음
- JPA Named 쿼리처럼 애플리케이션 실행 시점에 문법 오류를 발견할 수 있음(매우 큰 장점!)

참고: 실무에서는 메소드 이름으로 쿼리 생성 기능은 파라미터가 증가하면 메서드 이름이 매우 지저분해진다. 따라서 @Query 기능을 자주 사용하게 된다.

**@Query, 값, DTO 조회하기**

~~~java
@Query("select m.username from Member m")
List<String> findUsernameList();

@Query("select new study.datajpa.dto.MemberDto(m.id, m.username, t.name) " +
        "from Member m join m.team t")
List<MemberDto> findMemberDto();
~~~

**파라미터 바인딩**

- 위치 기반
- 이름 기반

~~~java
select m from Member m where m.username=?0 //위치 기반 
        select m from Member m where m.username=:name //이름 기반
~~~

**컬렉션 파라미터 바인딩**   
Collection 타입으로 in절 지원

~~~java
@Query("select m from Member m where m.username in :names")
List<Member> findByNames(@Param("names") List<String> names);
~~~

### 반환 타입

스프링 데이터 JPA는 유연한 반환 타입 지원

~~~java
List<Member> findByUsername(String name); //컬렉션
        Member findByUsername(String name); //단건
        Optional<Member> findByUsername(String name); //단건 Optional
~~~

조회 결과가 많거나 없으면?

- 컬렉션
    - 결과 없음: 빈 컬렉션 반환
- 단건 조회
    - 결과 없음: null 반환
    - 결과가 2건 이상: `javax.persistence.NonUniqueResultException` 예외 발생

참고: 단건으로 지정한 메서드를 호출하면 스프링 데이터 JPA는 내부에서 JPQL의 `Query.getSingleResult()` 메서드를 호출한다.
이 메서드를 호출했을 때 조회 결과가 없으면 `javax.persistence.NoResultException` 예외가 발생하는데 개발자 입장에서 다루기가 상당히 불편하다.
스프링 데이터 JPA는 단건을 조회할 때 이 예외가 발생하면 예외를 무시하고 대신에 null 을 반환한다.

### 페이징과 정렬

- 검색 조건: 나이가 10살
- 정렬 조건: 이름으로 내림차순
- 페이징 조건: 첫 번째 페이지, 페이지당 보여줄 데이터는 3건

**순수 JPA 페이징과 정렬**
~~~java

public List<Member> findByPage(int age,int offset,int limit){
    return em.createQuery("select m from Member m where m.age = :age order by m.username desc")
        .setParameter("age",age)
        .setFirstResult(offset)
        .setMaxResults(limit)
        .getResultList();
}

public long totalCount(int age){
    return em.createQuery("select count(m) from Member m where m.age = :age", Long.class)
        .setParameter("age",age)
        .getSingleResult();
}
~~~

**스프링 데이터 JPA 페이징과 정렬**
페이징과 정렬 파라미터
- org.springframework.data.domain.Sort : 정렬 기능 
- org.springframework.data.domain.Pageable : 페이징 기능 (내부에 Sort 포함)

특별한 반환 타입
- org.springframework.data.domain.Page : 추가 count 쿼리 결과를 포함하는 페이징
- org.springframework.data.domain.Slice : 추가 count 쿼리 없이 다음 페이지만 확인 가능 (내부적으로 limit + 1조회)
- List (자바 컬렉션): 추가 count 쿼리 없이 결과만 반환

~~~java
Page<Member> findByUsername(String name, Pageable pageable); //count 쿼리 사용 
Slice<Member> findByUsername(String name, Pageable pageable); //count 쿼리 사용 안함
List<Member> findByUsername(String name, Pageable pageable); //count 쿼리 사용 안함
List<Member> findByUsername(String name, Sort sort);
~~~

~~~java
public interface MemberRepository extends Repository<Member, Long> { 
    Page<Member> findByAge(int age, Pageable pageable);
}
~~~

### 벌크성 수정 쿼리
- 벌크성 수정, 삭제 쿼리는 @Modifying 어노테이션을 
  - 사용 사용하지 않으면 다음 예외 발생
  - org.hibernate.hql.internal.QueryExecutionRequestException: Not supported for DML operation
- 벌크성 쿼리를 실행하고 나서 영속성 컨텍스트 초기화: @Modifying(clearAutomatically = true) (이 옵션의 기본값은 false )
  - 이 옵션 없이 회원을 findById로 다시 조회하면 영속성 컨텍스트에 과거 값이 남아서 문제가 될 수 있다. 만약 다시 조회해야 하면 꼭 영속성 컨텍스트를 초기화 하자.

참고: 벌크 연산은 영속성 컨텍스트를 무시하고 실행하기 때문에, 영속성 컨텍스트에 있는 엔티티의 상태와 DB에 엔티티 상태가 달라질 수 있다.
1. 영속성 컨텍스트에 엔티티가 없는 상태에서 벌크 연산을 먼저 실행한다.
2. 부득이하게 영속성 컨텍스트에 엔티티가 있으면 벌크 연산 직후 영속성 컨텍스트를 초기화 한다.

### @EntityGraph
연관된 엔티티들을 SQL 한번에 조회하는 방법

member team은 지연로딩 관계이다. 따라서 다음과 같이 team의 데이터를 조회할 때 마다 쿼리가 실행된다. (N+1 문제 발생)

참고: 다음과 같이 지연 로딩 여부를 확인할 수 있다.
~~~java
//Hibernate 기능으로 확인
Hibernate.isInitialized(member.getTeam())
//JPA 표준 방법으로 확인
PersistenceUnitUtil util = em.getEntityManagerFactory().getPersistenceUnitUtil();
util.isLoaded(member.getTeam());
~~~

**JPQL 페치 조인**

**EntityGraph**
~~~java
//공통 메서드 오버라이드
@Override
@EntityGraph(attributePaths = {"team"})
List<Member> findAll();

//JPQL + 엔티티 그래프 
@EntityGraph(attributePaths = {"team"})
@Query("select m from Member m")
List<Member> findMemberEntityGraph();

//메서드 이름으로 쿼리에서 특히 편리하다.
@EntityGraph(attributePaths = {"team"})
List<Member> findByUsername(String username)
~~~

### JPA Hint & Lock JPA Hint
JPA 쿼리 힌트(SQL 힌트가 아니라 JPA 구현체에게 제공하는 힌트)

~~~java
@QueryHints(value = @QueryHint(name = "org.hibernate.readOnly", value = "true"))
Member findReadOnlyByUsername(String username);
~~~
 

**Lock**
~~~java
@Lock(LockModeType.PESSIMISTIC_WRITE)
List<Member> findByUsername(String name);
~~~
- org.springframework.data.jpa.repository.Lock 어노테이션을 사용 
- JPA가 제공하는 락은 JPA 책 16.1 트랜잭션과 락 절을 참고


## 확장기능

### 사용자 정의 리포지토리 구현

- 스프링 데이터 JPA 리포지토리는 인터페이스만 정의하고 구현체는 스프링이 자동 생성
- 스프링 데이터 JPA가 제공하는 인터페이스를 직접 구현하면 구현해야 하는 기능이 너무 많음 
- 다양한 이유로 인터페이스의 메서드를 직접 구현하고 싶다면?
  - JPA 직접 사용( EntityManager )
  - 스프링 JDBC Template 사용
  - MyBatis 사용
  - 데이터베이스 커넥션 직접 사용 등등...
  - Querydsl 사용


사용자 정의 구현 클래스
- 규칙: 리포지토리 인터페이스 이름 + Impl
- 스프링 데이터 JPA가 인식해서 스프링 빈으로 등록

참고: 실무에서는 주로 QueryDSL이나 SpringJdbcTemplate을 함께 사용할 때 사용자 정의 리포지토리 기능 자주 사용

참고: 항상 사용자 정의 리포지토리가 필요한 것은 아니다. 그냥 임의의 리포지토리를 만들어도 된다. 
예를들어 MemberQueryRepository를 인터페이스가 아닌 클래스로 만들고 스프링 빈으로 등록해서 그냥 직접 사용해도 된다.
물론 이 경우 스프링 데이터 JPA와는 아무런 관계 없이 별도로 동작한다.

스프링 데이터 2.x 부터는 사용자 정의 구현 클래스에 리포지토리 인터페이스 이름 + Impl 을 적용하는 대신에 사용자 정의 인터페이스 명 + Impl 방식도 지원한다.
예를 들어서 위 예제의 MemberRepositoryImpl 대신에 MemberRepositoryCustomImpl 같이 구현해도 된다.


### Auditing

엔티티를 생성, 변경할 때 변경한 사람과 시간을 추적하고 싶으면? 
- 등록일, 수정일, 등록자, 수정자

**스프링 데이터 JPA 사용**   
설정 `@EnableJpaAuditing` 스프링 부트 설정 클래스에 적용해야함
`@EntityListeners(AuditingEntityListener.class)` 엔티티에 적용

사용 어노테이션
- @CreatedDate
- @LastModifiedDate
- @CreatedBy
- @LastModifiedBy
~~~java
public class BaseTimeEntity {
  @CreatedDate
  @Column(updatable = false)
  private LocalDateTime createdDate;
  @LastModifiedDate
  private LocalDateTime lastModifiedDate;
}
public class BaseEntity extends BaseTimeEntity {
  @CreatedBy
  @Column(updatable = false)
  private String createdBy;
  @LastModifiedBy
  private String lastModifiedBy;
}
~~~


### 도메인 클래스 컨버터
HTTP 파라미터로 넘어온 엔티티의 아이디로 엔티티 객체를 찾아서 바인딩
~~~java
@RestController
@RequiredArgsConstructor
public class MemberController {
    private final MemberRepository memberRepository;
    @GetMapping("/members/{id}")
    public String findMember(@PathVariable("id") Member member) {
        return member.getUsername();
    }
}
~~~

- HTTP 요청은 회원 id를 받지만 도메인 클래스 컨버터가 중간에 동작해서 회원 엔티티 객체를 반환
- 도메인 클래스 컨버터도 리파지토리를 사용해서 엔티티를 찾음 

주의: 도메인 클래스 컨버터로 엔티티를 파라미터로 받으면, 이 엔티티는 단순 조회용으로만 사용해야 한다. (트랜잭션이 없는 범위에서 엔티티를 조회했으므로, 엔티티를 변경해도 DB에 반영되지 않는다.)


### 페이징과 정렬
스프링 데이터가 제공하는 페이징과 정렬 기능을 스프링 MVC에서 편리하게 사용할 수 있다.

~~~java
@GetMapping("/members")
public Page<Member> list(Pageable pageable) {
    Page<Member> page = memberRepository.findAll(pageable);
    return page;
}
~~~

- 파라미터로 Pageable 을 받을 수 있다.
- Pageable 은 인터페이스, 실제는 org.springframework.data.domain.PageRequest 객체 생성

**요청 파라미터**
- 예) /members?page=0&size=3&sort=id,desc&sort=username,desc
- page: 현재 페이지, 0부터 시작한다.
- size: 한 페이지에 노출할 데이터 건수
- sort: 정렬 조건을 정의한다. 예) 정렬 속성,정렬 속성...(ASC | DESC), 정렬 방향을 변경하고 싶으면 sort 파라미터 추가 ( asc 생략 가능)


**기본값**
~~~properties
spring.data.web.pageable.default-page-size=20 /# 기본 페이지 사이즈/
spring.data.web.pageable.max-page-size=2000 /# 최대 페이지 사이즈/
~~~

**개별설정**
~~~java
@RequestMapping(value = "/members_page", method = RequestMethod.GET)
  public String list(@PageableDefault(size = 12, sort = “username”, direction = Sort.Direction.DESC) Pageable pageable) {
    ... 
}
~~~

**접두사**
- 페이징 정보가 둘 이상이면 접두사로 구분 
- @Qualifier 에 접두사명 추가 "{접두사명}_xxx”
- 예제: /members?member_page=0&order_page=1
~~~java
public String list(
      @Qualifier("member") Pageable memberPageable,
      @Qualifier("order") Pageable orderPageable, ...
~~~

**Page를 1부터 시작하기**

스프링 데이터는 Page를 0부터 시작한다. 만약 1부터 시작하려면?
1. Pageable, Page를 파리미터와 응답 값으로 사용히지 않고, 직접 클래스를 만들어서 처리한다. 그리고 직접 PageRequest(Pageable 구현체)를 생성해서 리포지토리에 넘긴다. 물론 응답값도 Page 대신에 직접 만들어서 제공해야 한다.
2. spring.data.web.pageable.one-indexed-parameters 를 true 로 설정한다. 그런데 이 방법은 web에서 page 파라미터를 -1 처리 할 뿐이다. 따라서 응답값인 Page 에 모두 0 페이지 인덱스를 사용하는 한계가 있다.


`one-indexed-parameters` Page 1요청 ( http://localhost:8080/members?page=1 )
~~~json
{
"content": [
      ...
    ],
    "pageable": {
    "offset": 0,
    "pageSize": 10, "pageNumber": 0 //0 인덱스
    },
    "number": 0, //0 인덱스
    "empty": false
}
~~~

## 스프링 데이터 JPA 분석

### 스프링 데이터 JPA 구현체 분석

- 스프링 데이터 JPA가 제공하는 공통 인터페이스의 구현체
- org.springframework.data.jpa.repository.support.SimpleJpaRepository

- @Repository 적용: JPA 예외를 스프링이 추상화한 예외로 변환 
- @Transactional 트랜잭션 적용
  - JPA의 모든 변경은 트랜잭션 안에서 동작
  - 스프링 데이터 JPA는 변경(등록, 수정, 삭제) 메서드를 트랜잭션 처리
  - 서비스 계층에서 트랜잭션을 시작하지 않으면 리파지토리에서 트랜잭션 시작
  - 서비스 계층에서 트랜잭션을 시작하면 리파지토리는 해당 트랜잭션을 전파 받아서 사용
  - 그래서 스프링 데이터 JPA를 사용할 때 트랜잭션이 없어도 데이터 등록, 변경이 가능했음(사실은 트랜잭션이 리포지토리 계층에 걸려있는 것임)
- @Transactional(readOnly = true)
  - 데이터를 단순히 조회만 하고 변경하지 않는 트랜잭션에서 readOnly = true 옵션을 사용하면 플러시를 생략해서 약간의 성능 향상을 얻을 수 있음
  - 자세한 내용은 JPA 책 15.4.2 읽기 전용 쿼리의 성능 최적화 참고


**매우 중요!!!** 
- save() 메서드
  - 새로운 엔티티면 저장( persist ) 새로운 엔티티가 아니면 병합( merge )

**새로운 엔티티를 판단하는 기본 전략**
  - 식별자가 객체일 때 null 로 판단 
  - 식별자가 자바 기본 타입일 때 0 으로 판단
  - Persistable 인터페이스를 구현해서 판단 로직 변경 가능

~~~java
package org.springframework.data.domain;
public interface Persistable<ID> {
    ID getId();
    boolean isNew();
}
~~~

JPA 식별자 생성 전략이 `@GenerateValue` 면 `save()` 호출 시점에 식별자가 없으므로 새로운 엔티티로 인식해서 정상 동작한다.
그런데 JPA 식별자 생성 전략이 @Id 만 사용해서 직접 할당이면 이미 식별자 값이 있는 상태로 save() 를 호출한다. 따라서 이 경우 merge() 가 호출된다.
merge() 는 우선 DB를 호출해서 값을 확인하고, DB에 값이 없으면 새로운 엔티티로 인지하므로 매우 비효율 적이다. 
따라서 Persistable 를 사용해서 새로운 엔티티 확인 여부를 직접 구현하게는 효과적이다. 
참고로 등록시간( @CreatedDate )을 조합해서 사용하면 이 필드로 새로운 엔티티 여부를 편리하게 확인할 수 있다. (@CreatedDate에 값이 없으면 새로운 엔티티로 판단)


## 나머지 기능들

### Specifications (명세)
책 도메인 주도 설계(Domain Driven Design)는 SPECIFICATION(명세)라는 개념을 소개 스프링 데이터 JPA는 JPA Criteria를 활용해서 이 개념을 사용할 수 있도록 지원

**술어(predicate)**
- 참 또는 거짓으로 평가
- AND OR 같은 연산자로 조합해서 다양한 검색조건을 쉽게 생성(컴포지트 패턴)
- 예) 검색 조건 하나하나
- 스프링 데이터 JPA는 org.springframework.data.jpa.domain.Specification 클래스로 정의


