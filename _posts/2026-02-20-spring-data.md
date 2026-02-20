---
layout: post
title: Spring Data - 일관된 데이터 접근 추상화
tags: [spring, database]
---

## Spring Data란

Spring Data는 다양한 데이터 저장소에 대해 **일관된 프로그래밍 모델**을 제공하는 Spring 공식 상위 프로젝트다.

핵심 철학은 공식 문서에서 명확히 밝히고 있다.

> "Provide a familiar and consistent, Spring-based programming model for data access while still retaining the special traits of the underlying data store."

관계형 DB든 MongoDB든 Redis든, `Repository` 인터페이스 하나로 데이터에 접근하되, 각 저장소 고유의 특성은 그대로 유지한다는 것이다.

### Spring Data가 해결하는 문제

```kotlin
// Spring Data 없이 - 반복되는 보일러플레이트
class UserDao(private val entityManager: EntityManager) {
    fun save(user: User): User {
        entityManager.persist(user)
        return user
    }
    fun findById(id: Long): User? = entityManager.find(User::class.java, id)
    fun findAll(): List<User> = entityManager.createQuery("SELECT u FROM User u", User::class.java).resultList
    fun delete(user: User) = entityManager.remove(user)
    fun count(): Long = entityManager.createQuery("SELECT COUNT(u) FROM User u", Long::class.java).singleResult
}
```

```kotlin
// Spring Data - 인터페이스 선언만으로 끝
interface UserRepository : JpaRepository<User, Long>
```

구현체는 Spring Data가 프록시로 자동 생성한다.

---

## Spring Data Commons

모든 Spring Data 모듈이 공유하는 핵심 모듈이다. Repository 인터페이스, 쿼리 파생 메커니즘, 페이징/정렬 API, Auditing 등 공통 인프라를 제공한다.

### Repository 인터페이스 계층 (Spring Data 3 기준)

```
Repository<T, ID>                              ← 최상위 마커 인터페이스
├── CrudRepository<T, ID>                      ← CRUD (Iterable 반환)
├── ListCrudRepository<T, ID>                  ← CRUD (List 반환)
├── PagingAndSortingRepository<T, ID>          ← 페이징/정렬
├── ListPagingAndSortingRepository<T, ID>      ← 페이징/정렬 (List 반환)
│
└── (저장소별 확장)
    ├── JpaRepository                          ← JPA 전용 (flush, batch)
    ├── MongoRepository                        ← MongoDB 전용 (insert)
    ├── ReactiveCrudRepository                 ← 리액티브 CRUD (Mono/Flux)
    └── ...
```

Spring Data 3에서 `PagingAndSortingRepository`가 더 이상 `CrudRepository`를 확장하지 않는다. CRUD + 페이징이 모두 필요하면 두 인터페이스를 명시적으로 확장해야 한다.

### 각 인터페이스의 역할

```kotlin
// 1. Repository - 마커 인터페이스 (타입 발견용)
interface Repository<T, ID>

// 2. CrudRepository - 기본 CRUD
interface CrudRepository<T, ID> : Repository<T, ID> {
    fun <S : T> save(entity: S): S
    fun findById(id: ID): Optional<T>
    fun findAll(): Iterable<T>
    fun count(): Long
    fun delete(entity: T)
    fun existsById(id: ID): Boolean
}

// 3. PagingAndSortingRepository - 페이징/정렬
interface PagingAndSortingRepository<T, ID> {
    fun findAll(sort: Sort): Iterable<T>
    fun findAll(pageable: Pageable): Page<T>
}

// 4. ListCrudRepository - List 반환 버전 (Spring Data 3에서 추가)
interface ListCrudRepository<T, ID> : CrudRepository<T, ID> {
    override fun findAll(): List<T>
}
```

---

## 일관된 프로그래밍 모델

저장소가 다르더라도 코드 패턴이 동일하다.

```kotlin
// JPA (관계형 DB)
interface UserRepository : JpaRepository<User, Long> {
    fun findByLastname(lastname: String): List<User>
}

// MongoDB (문서 DB)
interface UserRepository : MongoRepository<User, String> {
    fun findByLastname(lastname: String): List<User>
}

// Elasticsearch (검색 엔진)
interface UserRepository : ElasticsearchRepository<User, String> {
    fun findByLastname(lastname: String): List<User>
}
```

인터페이스 선언, 메서드 이름 기반 쿼리, CRUD 메서드 모두 동일하다. 차이점은 엔티티 어노테이션(`@Entity` vs `@Document` vs `@RedisHash`)과 저장소별 전용 기능뿐이다.

Spring Data는 모든 저장소를 **하나의 API로 억지 추상화하지 않는다**. 대신 "익숙한 Spring 패턴"을 각 저장소에 맞게 적용하는 전략을 취한다.

---

## 핵심 기능

### Query Derivation (메서드 이름 기반 쿼리)

메서드 이름을 파싱하여 쿼리를 자동 생성한다. `find...By`를 구분자로 Subject와 Predicate를 나눈다.

```kotlin
interface PersonRepository : Repository<Person, Long> {
    // AND 조건
    fun findByEmailAndLastname(email: String, lastname: String): List<Person>

    // OR 조건
    fun findDistinctByLastnameOrFirstname(lastname: String, firstname: String): List<Person>

    // 대소문자 무시
    fun findByLastnameIgnoreCase(lastname: String): List<Person>

    // 정렬
    fun findByLastnameOrderByFirstnameAsc(lastname: String): List<Person>

    // 중첩 속성 탐색
    fun findByAddressZipCode(zipCode: ZipCode): List<Person>

    // 결과 제한
    fun findFirstByOrderByLastnameAsc(): Person?
    fun findFirst10ByLastname(lastname: String, sort: Sort): List<Person>

    // count / exists / delete 파생
    fun countByLastname(lastname: String): Long
    fun existsByEmail(email: String): Boolean
    fun deleteByLastname(lastname: String): Long
}
```

**Subject 키워드**: `find`, `read`, `query`, `count`, `get`, `exists`, `delete`, `remove`

**Predicate 키워드**: `And`, `Or`, `Between`, `LessThan`, `GreaterThan`, `Like`, `IgnoreCase`, `OrderBy`, `Not`, `In`, `True`, `False`, `StartingWith`, `EndingWith`, `Containing` 등

파라미터가 2개 이하이면 메서드 이름 쿼리가 적합하고, 3개 이상이면 `@Query`가 가독성에 유리하다.

### @Query 어노테이션

```kotlin
// JPQL
@Query("SELECT u FROM User u WHERE u.status = :status AND u.age > :age")
fun findByStatusAndAge(@Param("status") status: Int, @Param("age") age: Int): List<User>

// Native SQL
@Query(value = "SELECT * FROM users WHERE status = ?1", nativeQuery = true)
fun findByStatusNative(status: Int): List<User>
```

### Pageable과 Sort

```kotlin
// 페이징 (전체 count 쿼리 포함)
fun findByLastname(lastname: String, pageable: Pageable): Page<User>

// Slice (전체 count 없이, 다음 페이지 존재 여부만)
fun findByLastname(lastname: String, pageable: Pageable): Slice<User>

// 정렬만
fun findByLastname(lastname: String, sort: Sort): List<User>

// 사용
val users: Page<User> = repository.findAll(PageRequest.of(1, 20))  // 2페이지, 20개씩
```

### Auditing (감사)

엔티티의 생성/수정 시간과 사용자를 자동으로 기록한다. Spring Data Commons에 정의되어 있어 JPA, MongoDB, JDBC 등 여러 모듈에서 공통으로 사용 가능하다.

```kotlin
@Entity
@EntityListeners(AuditingEntityListener::class)
class User(
    @CreatedDate
    var createdDate: LocalDateTime? = null,

    @LastModifiedDate
    var lastModifiedDate: LocalDateTime? = null,

    @CreatedBy
    var createdBy: String? = null,

    @LastModifiedBy
    var lastModifiedBy: String? = null
)
```

---

## Spring Data JDBC vs Spring Data JPA

둘 다 관계형 DB를 대상으로 하지만, 철학이 완전히 다르다.

### Spring Data JDBC의 설계 원칙

공식 문서에서 **"급진적 단순함(Radical Simplicity)"** 을 명시한다.

> 1. 엔티티를 로드하면 SQL이 실행된다. 완료되면 완전히 로드된 엔티티를 얻는다. **지연 로딩도 캐싱도 없다.**
> 2. 엔티티를 저장하면 저장된다. 저장하지 않으면 저장되지 않는다. **더티 트래킹도 세션도 없다.**
> 3. 엔티티를 테이블에 매핑하는 **단순한 모델**이 있다.

### 상세 비교

| 항목          | Spring Data JPA              | Spring Data JDBC |
|-------------|------------------------------|------------------|
| 지연 로딩       | 지원 (프록시 기반)                  | 없음 (전체 로드)       |
| 더티 체킹       | 자동 변경 감지                     | 없음 (명시적 save 필요) |
| 세션/영속성 컨텍스트 | EntityManager 세션 존재          | 없음               |
| 1차 캐시       | 영속성 컨텍스트 내 캐싱                | 없음               |
| 프록시         | 지연 로딩용 프록시 생성                | 순수 POJO          |
| 관계 매핑       | `@OneToMany`, `@ManyToOne` 등 | Aggregate 내부만    |
| 복잡도         | 높음 (내부 동작 이해 필요)             | 낮음 (WYSIWYG)     |
| SQL 예측      | 어려움                          | 쉬움               |
| 적합한 경우      | 복잡한 도메인 모델, 풍부한 관계           | 단순한 스키마, 명확한 제어  |

### DDD Aggregate 관점

Spring Data JDBC는 DDD의 Aggregate 개념을 엄격히 따른다.

```kotlin
// Spring Data JDBC - Aggregate Root
class Order(
    @Id val id: Long? = null,
    val items: List<LineItem> = emptyList()  // Aggregate 내부 엔티티
)

// Order를 로드하면 items도 전부 로드된다 (지연 로딩 없음)
// save(order)하면 Order + items 전체가 저장된다
// Aggregate 경계를 넘는 참조는 ID로만
```

- Aggregate Root를 통해서만 내부 엔티티에 접근
- Aggregate 단위로 로드/저장 (부분 로드 없음)
- Aggregate 경계를 넘는 참조는 ID로만 (객체 참조 불가)

---

## Spring Data R2DBC

관계형 DB에 대한 **리액티브(논블로킹)** 접근을 제공한다.

### 블로킹 vs 논블로킹

```kotlin
// Spring Data JPA - 블로킹
interface UserRepository : JpaRepository<User, Long> {
    fun findByLastname(lastname: String): List<User>     // 결과 올 때까지 스레드 대기
}

// Spring Data R2DBC - 논블로킹
interface UserRepository : ReactiveCrudRepository<User, Long> {
    fun findByLastname(lastname: String): Flux<User>     // 스레드 반납, 결과 오면 콜백
}
```

### 리액티브 Repository 인터페이스

```kotlin
interface ReactiveCrudRepository<T, ID> : Repository<T, ID> {
    fun <S : T> save(entity: S): Mono<S>
    fun findById(id: ID): Mono<T>
    fun findAll(): Flux<T>
    fun deleteById(id: ID): Mono<Void>
    fun count(): Mono<Long>
}
```

### 기술 스택 조합

```
블로킹:   Spring MVC    + Spring Data JPA/JDBC     (전통적)
리액티브:  Spring WebFlux + Spring Data R2DBC        (논블로킹)
```

R2DBC는 WebFlux와 함께 사용해야 논블로킹의 이점이 극대화된다.

### 제한사항

- 관계 매핑 미지원 (`@OneToMany` 등 없음)
- 스키마 자동 생성 없음
- Spring Data JDBC와 유사한 철학 (단순함, 명시적 제어)이지만 논블로킹에 최적화

---

## Spring Boot와의 통합

Spring Boot는 클래스패스에 있는 의존성을 감지하여 **자동 설정(Auto-Configuration)** 한다.

### spring-boot-starter-data-jpa 추가 시 동작

```
의존성 추가
    ↓ Spring Boot 감지
Hibernate 자동 설정
    ↓
DataSource → EntityManagerFactory → TransactionManager 자동 생성
    ↓
HikariCP 커넥션 풀 기본 적용
    ↓
Repository 인터페이스 자동 스캔 → 프록시 구현체 생성
```

과거에는 이 모든 것을 직접 설정해야 했다.

#### 과거: XML + Java Config 수동 설정

```xml
<!-- persistence.xml - JPA 설정 -->
<persistence xmlns="http://xmlns.jcp.org/xml/ns/persistence" version="2.1">
    <persistence-unit name="myPU" transaction-type="RESOURCE_LOCAL">
        <provider>org.hibernate.jpa.HibernatePersistenceProvider</provider>
        <class>com.example.domain.User</class>
        <class>com.example.domain.Order</class>
        <properties>
            <property name="javax.persistence.jdbc.url" value="jdbc:mysql://localhost:3306/mydb"/>
            <property name="javax.persistence.jdbc.user" value="root"/>
            <property name="javax.persistence.jdbc.password" value="password"/>
            <property name="hibernate.dialect" value="org.hibernate.dialect.MySQLDialect"/>
            <property name="hibernate.hbm2ddl.auto" value="update"/>
            <property name="hibernate.show_sql" value="true"/>
        </properties>
    </persistence-unit>
</persistence>
```

```java
// Java Config - DataSource, EntityManager, TransactionManager 수동 빈 등록
@Configuration
@EnableJpaRepositories(basePackages = "com.example.repository")
@EnableTransactionManagement
public class JpaConfig {

	@Bean
	public DataSource dataSource() {
		HikariDataSource ds = new HikariDataSource();
		ds.setJdbcUrl("jdbc:mysql://localhost:3306/mydb");
		ds.setUsername("root");
		ds.setPassword("password");
		return ds;
	}

	@Bean
	public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
		LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
		em.setDataSource(dataSource);
		em.setPackagesToScan("com.example.domain");
		em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
		return em;
	}

	@Bean
	public PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
		return new JpaTransactionManager(emf);
	}
}
```

#### 현재: Spring Boot Auto-Configuration

```yaml
# application.yml - 이것만으로 위의 모든 설정이 자동으로 완료된다
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mydb
    username: root
    password: password
  jpa:
    hibernate:
      ddl-auto: update
```

`persistence.xml` 불필요, `@EnableJpaRepositories` 불필요, DataSource/EntityManagerFactory/TransactionManager 빈 등록 불필요. Spring Boot가 클래스패스에서 Hibernate를 감지하면 전부 자동으로 구성한다.

### 주요 Starter

| Starter                                  | 포함 내용                                          |
|------------------------------------------|------------------------------------------------|
| `spring-boot-starter-data-jpa`           | Hibernate, Spring Data JPA, HikariCP           |
| `spring-boot-starter-data-mongodb`       | MongoDB 드라이버, Spring Data MongoDB              |
| `spring-boot-starter-data-redis`         | Lettuce, Spring Data Redis                     |
| `spring-boot-starter-data-elasticsearch` | Elasticsearch 클라이언트, Spring Data Elasticsearch |
| `spring-boot-starter-data-r2dbc`         | R2DBC 드라이버, Spring Data R2DBC                  |
| `spring-boot-starter-data-jdbc`          | Spring Data JDBC                               |
| `spring-boot-starter-data-rest`          | Repository를 REST API로 자동 노출                    |

---

## 정리

Spring Data Commons가 제공하는 공통 인프라:

| 공통 인프라              | 설명                                                                   |
|---------------------|----------------------------------------------------------------------|
| Repository 인터페이스 계층 | `Repository`, `CrudRepository`, `PagingAndSortingRepository`         |
| 쿼리 메서드 파생           | 메서드 이름 파싱 → 쿼리 자동 생성                                                 |
| 페이징/정렬 API          | `Pageable`, `Sort`, `Page`, `Slice`                                  |
| Auditing            | `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy`, `@LastModifiedBy` |
| Object Mapping      | 도메인 객체 ↔ 저장소 데이터 변환                                                  |
| 커스텀 Repository      | 인터페이스 + 구현 클래스 조합                                                    |

각 모듈은 이 Commons 위에 저장소 고유의 기능을 추가한다. `JpaRepository`는 `flush()`, `saveAndFlush()`를, `MongoRepository`는 `insert()`를, `ReactiveCrudRepository`는 `Mono`/`Flux` 반환을 추가하는 식이다.
