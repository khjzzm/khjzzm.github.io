---
layout: post
title: Spring 멀티 데이터소스 + MyBatis 설정 - 실무 패턴 완전 가이드
tags: [spring, java, database]
---

## 멀티 데이터소스가 필요한 상황

하나의 애플리케이션에서 여러 DB에 접속해야 하는 경우가 있다.

- MSA 환경에서 여러 도메인 DB 접근
- 레거시 DB와 신규 DB 동시 사용
- Read/Write 분리 (Read Replica)
- 외부 시스템 연동용 DB

이 글에서는 실무에서 사용하는 멀티 데이터소스 + MyBatis 설정 패턴을 설명한다.

---

## 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                      Spring Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   FaxSqlSessionConfig                  OtherSqlSessionConfig     │
│   ┌─────────────────────────┐         ┌─────────────────────────┐│
│   │ faxDataSource           │         │ otherDataSource         ││
│   │ faxTransactionManager   │         │ otherTransactionManager ││
│   │ faxSqlSessionFactory    │         │ otherSqlSessionFactory  ││
│   │ faxSqlSessionTemplate   │         │ otherSqlSessionTemplate ││
│   └─────────────────────────┘         └─────────────────────────┘│
│              │                                   │                │
│              ▼                                   ▼                │
│         ┌────────┐                         ┌────────┐            │
│         │ Fax DB │                         │Other DB│            │
│         └────────┘                         └────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

각 데이터소스별로 독립적인 설정 클래스를 만들고, Bean 이름으로 구분한다.

---

## 설정 클래스 분석

실제 운영 환경에서 사용하는 설정 클래스를 분석해본다.

```java
@Slf4j
public class FaxSqlSessionConfig {

    private static final String NAME = "fax";

    // Bean 이름 상수 정의
    public static final String DATA_SOURCE_NAME = NAME + "DataSource";
    public static final String TRANSACTION_MANAGER_NAME = NAME + "TransactionManager";
    public static final String JDBC_TEMPLATE_NAME = NAME + "JdbcTemplate";
    public static final String SQL_SESSION_FACTORY_NAME = NAME + "SqlSessionFactory";
    public static final String SQL_SESSION_TEMPLATE_NAME = NAME + "SqlSessionTemplate";
    public static final String EXECUTOR_TYPE_NAME = NAME + "ExecutorType";
    public static final String DATABASE_POPULATOR_NAME = NAME + "DatabasePopulator";
}
```

### 네이밍 컨벤션의 중요성

Bean 이름을 상수로 정의하면:

| 장점 | 설명 |
|------|------|
| 타입 안전성 | 문자열 오타 방지, IDE 자동완성 지원 |
| 일관성 | 모든 관련 Bean이 `fax` prefix로 통일 |
| 참조 용이 | 다른 클래스에서 `FaxSqlSessionConfig.TRANSACTION_MANAGER_NAME`으로 참조 |
| 유지보수 | 이름 변경 시 한 곳만 수정 |

---

## DataSource 설정

### Raw DataSource + LazyConnectionDataSourceProxy 패턴

```java
@Primary
@Bean(DATA_SOURCE_NAME + "Raw")
@ConfigurationProperties(prefix = "fax.datasource." + NAME)
public DataSource rawDataSource(
        @Value("${fax.datasource." + NAME + ".driver-class-name}") String driverClassName,
        @Value("${fax.datasource." + NAME + ".jdbc-url}") String jdbcUrl,
        @Value("${fax.datasource." + NAME + ".username}") String username,
        @Value("${fax.datasource." + NAME + ".password}") String password,
        @Value("${spring.datasource.initialization-mode}") DataSourceInitializationMode mode)
        throws SQLException {

    // DB 스키마 자동 생성 (개발 환경용)
    DatabaseInitializerUtil.createDatabase(mode, driverClassName, jdbcUrl, username, password);

    return DataSourceBuilder.create().build();
}

@Bean(DATA_SOURCE_NAME)
public DataSource dataSource(@Qualifier(DATA_SOURCE_NAME + "Raw") DataSource rawDataSource) {
    return new LazyConnectionDataSourceProxy(rawDataSource);
}
```

### LazyConnectionDataSourceProxy란?

```
일반 DataSource:
┌──────────────────────────────────────────────────────────┐
│ @Transactional 시작                                       │
│      │                                                    │
│      ▼                                                    │
│ Connection 획득 ◀── 여기서 바로 커넥션 풀에서 가져옴          │
│      │                                                    │
│      ▼                                                    │
│ (비즈니스 로직 - DB 사용 안 할 수도 있음)                    │
│      │                                                    │
│      ▼                                                    │
│ 실제 쿼리 실행                                            │
│      │                                                    │
│      ▼                                                    │
│ Connection 반환                                           │
└──────────────────────────────────────────────────────────┘

LazyConnectionDataSourceProxy:
┌──────────────────────────────────────────────────────────┐
│ @Transactional 시작                                       │
│      │                                                    │
│      ▼                                                    │
│ Proxy Connection 생성 (실제 커넥션 아직 없음)             │
│      │                                                    │
│      ▼                                                    │
│ (비즈니스 로직 - DB 안 쓰면 커넥션 안 잡음)               │
│      │                                                    │
│      ▼                                                    │
│ 실제 쿼리 실행 시점에 Connection 획득 ◀── 여기서 가져옴   │
│      │                                                    │
│      ▼                                                    │
│ Connection 반환                                           │
└──────────────────────────────────────────────────────────┘
```

LazyConnectionDataSourceProxy의 장점:

| 장점 | 설명 |
|------|------|
| 커넥션 절약 | 실제 DB 사용 시점까지 커넥션 획득 지연 |
| 리소스 효율 | 트랜잭션 내에서 DB 안 쓰는 경우 커넥션 불필요 |
| Read Replica 라우팅 | `AbstractRoutingDataSource`와 함께 사용 시 필수 |

### Read Replica 라우팅 시 LazyConnectionDataSourceProxy가 필수인 이유

```java
// LazyConnectionDataSourceProxy 없이
@Transactional(readOnly = true)
public User getUser() {
    // 1. 트랜잭션 시작 → readOnly 아직 설정 안 됨
    // 2. Connection 획득 → Primary로 연결됨 (잘못됨!)
    // 3. readOnly = true 설정
    // 4. 쿼리 실행 → Primary에서 실행됨
}

// LazyConnectionDataSourceProxy 사용
@Transactional(readOnly = true)
public User getUser() {
    // 1. 트랜잭션 시작
    // 2. readOnly = true 설정
    // 3. Proxy Connection 생성 (실제 커넥션 없음)
    // 4. 쿼리 실행 시점에 Connection 획득 → Replica로 연결됨 (정상!)
}
```

---

## TransactionManager 설정

```java
@Bean(TRANSACTION_MANAGER_NAME)
public PlatformTransactionManager transactionManager(
        @Qualifier(DATA_SOURCE_NAME) DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);
}
```

### 멀티 데이터소스에서 TransactionManager 지정

```java
// 잘못된 사용 - 어떤 TransactionManager인지 모름
@Transactional
public void updateFax() {
    faxMapper.update(...);  // faxDataSource 사용
}

// 올바른 사용 - 명시적으로 지정
@Transactional(transactionManager = FaxSqlSessionConfig.TRANSACTION_MANAGER_NAME)
public void updateFax() {
    faxMapper.update(...);  // 트랜잭션과 쿼리가 같은 DataSource 사용
}
```

TransactionManager와 실제 쿼리가 다른 DataSource를 사용하면:

```
┌─────────────────────────────────────────────────────────────────┐
│ @Transactional (기본 TransactionManager → otherDataSource)      │
│                                                                  │
│      faxMapper.update(...)  → faxDataSource 사용                │
│                                                                  │
│      트랜잭션: otherDataSource의 Connection                      │
│      쿼리:     faxDataSource의 Connection                        │
│                                                                  │
│      결과: 롤백해도 faxDataSource 변경사항은 롤백 안 됨!         │
└─────────────────────────────────────────────────────────────────┘
```

---

## MyBatis 설정

### SqlSessionFactory

```java
protected List<String> mapperLocations() {
    return Lists.newArrayList();
}

@Bean(SQL_SESSION_FACTORY_NAME)
public SqlSessionFactory sqlSessionFactory(
        @Qualifier(DATA_SOURCE_NAME) DataSource dataSource,
        ApplicationContext applicationContext) throws Exception {

    return MybatisSessionUtil.createSqlSessionFactory(
        applicationContext,
        dataSource,
        NAME,
        Lists.asList(
            "classpath*:mybatis/common/**/*.xml",      // 공통 매퍼
            "classpath*:mybatis/" + NAME + "/**/*.xml", // 도메인별 매퍼
            this.mapperLocations().toArray(new String[0])  // 확장 포인트
        ).toArray(new String[0])
    );
}
```

### 매퍼 위치 구조

```
resources/
├── mybatis/
│   ├── common/           # 모든 데이터소스가 공유하는 공통 매퍼
│   │   └── CommonMapper.xml
│   ├── fax/              # fax 데이터소스 전용
│   │   ├── FaxMapper.xml
│   │   └── FaxHistoryMapper.xml
│   └── other/            # other 데이터소스 전용
│       └── OtherMapper.xml
```

### SqlSessionTemplate

```java
@Bean(SQL_SESSION_TEMPLATE_NAME)
public SqlSessionTemplate sqlSessionTemplate(
        @Qualifier(SQL_SESSION_FACTORY_NAME) SqlSessionFactory sqlSessionFactory,
        @Qualifier(EXECUTOR_TYPE_NAME) @Nullable ExecutorType executorType) {

    return MybatisSessionUtil.createSqlSessionTemplate(sqlSessionFactory, executorType, NAME);
}
```

ExecutorType 옵션:

| ExecutorType | 설명 | 용도 |
|--------------|------|------|
| SIMPLE | 매 쿼리마다 PreparedStatement 생성 | 기본값 |
| REUSE | PreparedStatement 재사용 | 같은 쿼리 반복 시 |
| BATCH | 배치 처리용 | 대량 INSERT/UPDATE |

---

## 데이터베이스 초기화

### DatabasePopulator 설정

```java
@Bean(DATABASE_POPULATOR_NAME)
public DatabasePopulator databasePopulator(
        ApplicationContext applicationContext,
        @Value("${spring.datasource.initialization-mode}") DataSourceInitializationMode mode)
        throws IOException {

    return DataSourceInitializerUtil.createDatabasePopulator(
        applicationContext,
        mode,
        NAME,
        Lists.newArrayList("classpath*:database-" + NAME + "/**/*.sql")
    );
}

@Bean(NAME + "DataSourceInitializer")
public DataSourceInitializer dataSourceInitializer(
        @Qualifier(DATA_SOURCE_NAME) DataSource dataSource,
        @Qualifier(NAME + "DatabasePopulator") DatabasePopulator databasePopulator) {

    return DataSourceInitializerUtil.createDataSourceInitializer(dataSource, databasePopulator);
}
```

### 초기화 SQL 파일 구조

```
resources/
├── database-fax/
│   ├── 01_schema.sql      # 테이블 생성
│   ├── 02_index.sql       # 인덱스 생성
│   └── 03_data.sql        # 초기 데이터
└── database-other/
    └── 01_schema.sql
```

### DataSourceInitializationMode

| Mode | 설명 | 환경 |
|------|------|------|
| ALWAYS | 항상 초기화 스크립트 실행 | 개발/테스트 |
| EMBEDDED | 임베디드 DB일 때만 실행 | H2 등 인메모리 DB |
| NEVER | 실행 안 함 | 운영 환경 |

---

## Spring Boot 자동 설정과 멀티 데이터소스

Spring Boot는 JdbcTemplate과 TransactionManager를 자동으로 생성한다. 멀티 데이터소스 환경에서 이 동작을 이해하지 못하면 의도치 않은 DB에 쿼리가 실행될 수 있다.

### JdbcTemplate 자동 설정

Bean으로 등록하지 않으면 Spring Boot가 자동 생성한다.

```java
// JdbcTemplateAutoConfiguration.java (Spring Boot 내부)
@Bean
@Primary
public JdbcTemplate jdbcTemplate(DataSource dataSource) {
    return new JdbcTemplate(dataSource);  // 어떤 DataSource?
}
```

**DataSource 선택 우선순위:**

1. `@Primary`가 붙은 DataSource
2. 빈 이름이 `dataSource`인 것
3. DataSource 타입 빈이 하나뿐이면 그것

### TransactionManager 자동 설정

마찬가지로 Bean으로 등록하지 않으면 자동 생성된다.

```java
// DataSourceTransactionManagerAutoConfiguration.java (Spring Boot 내부)
@Bean
@Primary
public DataSourceTransactionManager transactionManager(DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);  // 어떤 DataSource?
}
```

**@Transactional에서 TransactionManager 선택 우선순위:**

1. `transactionManager` 속성에 명시된 것
2. `@Primary`가 붙은 TransactionManager
3. 빈 이름이 `transactionManager`인 것

### 멀티 데이터소스에서 문제 상황

```java
// 설정
@Primary
@Bean("faxDataSourceRaw")
public DataSource faxDataSource() { }  // @Primary

@Bean("otherDataSource")
public DataSource otherDataSource() { }
```

```java
// 서비스 - 의도와 다르게 동작!
@Service
public class OtherService {

    @Autowired
    private JdbcTemplate jdbcTemplate;  // faxDataSource 사용됨 (@Primary)

    @Transactional  // faxTransactionManager 사용됨 (@Primary)
    public void updateOther() {
        // otherDataSource에 쿼리하고 싶은데...
        jdbcTemplate.update(...);  // faxDataSource로 실행됨!
    }
}
```

### 올바른 사용법

각 데이터소스별로 JdbcTemplate을 명시적으로 등록하고 사용한다.

```java
// 설정
@Bean(JDBC_TEMPLATE_NAME)  // "faxJdbcTemplate"
public JdbcTemplate jdbcTemplate(@Qualifier(DATA_SOURCE_NAME) DataSource dataSource) {
    return new JdbcTemplate(dataSource);
}
```

```java
// 서비스
@Service
public class OtherService {

    @Autowired
    @Qualifier("otherJdbcTemplate")  // 명시적 지정
    private JdbcTemplate jdbcTemplate;

    @Transactional(transactionManager = "otherTransactionManager")  // 명시적 지정
    public void updateOther() {
        jdbcTemplate.update(...);  // otherDataSource로 실행됨
    }
}
```

### 자동 설정 vs 명시적 설정

| 항목 | 자동 설정 (단일 DB) | 멀티 데이터소스 |
|------|---------------------|-----------------|
| JdbcTemplate | 자동 생성, @Primary DataSource 사용 | 각 DataSource별로 Bean 등록 필요 |
| TransactionManager | 자동 생성, @Primary DataSource 사용 | 각 DataSource별로 Bean 등록 필요 |
| @Transactional | transactionManager 생략 가능 | transactionManager 명시 필수 |
| @Autowired DataSource | @Primary 자동 주입 | @Qualifier 명시 권장 |

---

## @Primary 어노테이션

```java
@Primary
@Bean(DATA_SOURCE_NAME + "Raw")
public DataSource rawDataSource(...) { }
```

여러 DataSource Bean 중 기본값을 지정한다.

```java
// @Primary가 지정된 DataSource 자동 주입
@Autowired
private DataSource dataSource;

// 특정 DataSource 지정
@Autowired
@Qualifier("faxDataSource")
private DataSource faxDataSource;
```

### @Primary 위치 주의 - 순환참조 문제

`@Primary`는 반드시 **rawDataSource**에 붙여야 한다. `LazyConnectionDataSourceProxy`를 반환하는 메소드에 붙이면 순환참조가 발생한다.

```java
// 올바른 위치
@Primary
@Bean(DATA_SOURCE_NAME + "Raw")
public DataSource rawDataSource(...) { }  // 여기에 @Primary

@Bean(DATA_SOURCE_NAME)
public DataSource dataSource(@Qualifier(DATA_SOURCE_NAME + "Raw") DataSource rawDataSource) {
    return new LazyConnectionDataSourceProxy(rawDataSource);
}
```

```java
// 잘못된 위치 - 순환참조 발생!
@Bean(DATA_SOURCE_NAME + "Raw")
public DataSource rawDataSource(...) { }

@Primary  // 여기에 붙이면 안 됨
@Bean(DATA_SOURCE_NAME)
public DataSource dataSource(@Qualifier(DATA_SOURCE_NAME + "Raw") DataSource rawDataSource) {
    return new LazyConnectionDataSourceProxy(rawDataSource);
}
```

순환참조가 발생하는 이유:

```
1. Spring이 DataSource 타입 빈 생성 시작
2. @Primary인 dataSource 빈을 먼저 생성하려고 함
3. dataSource 빈은 rawDataSource 빈이 필요
4. rawDataSource 빈 생성 중에 다른 의존성 해결
5. 그 의존성이 DataSource를 필요로 함
6. @Primary인 dataSource 빈을 찾음 → 아직 생성 중!
7. 순환참조 발생
```

### @Primary 사용 가이드

| 상황 | 권장 |
|------|------|
| 메인 DB가 명확한 경우 | 메인 DB의 rawDataSource에 @Primary 지정 |
| 모든 DB가 동등한 경우 | @Primary 사용 안 함, 항상 @Qualifier 명시 |
| 테스트 환경 | 테스트용 DataSource에 @Primary 지정하여 오버라이드 |

---

## 설정 클래스 상속 패턴

기본 설정 클래스를 상속받아 환경별로 확장할 수 있다.

```java
// 기본 설정 (추상 클래스처럼 사용)
public class FaxSqlSessionConfig {
    // 공통 설정
}

// 개발 환경
@Configuration
@Profile("dev")
public class DevFaxSqlSessionConfig extends FaxSqlSessionConfig {

    @Override
    protected List<String> mapperLocations() {
        return Lists.newArrayList(
            "classpath*:mybatis/fax-dev/**/*.xml"  // 개발용 추가 매퍼
        );
    }
}

// 운영 환경
@Configuration
@Profile("prod")
public class ProdFaxSqlSessionConfig extends FaxSqlSessionConfig {

    @Override
    @Bean(DATA_SOURCE_NAME)
    public DataSource dataSource(@Qualifier(DATA_SOURCE_NAME + "Raw") DataSource rawDataSource) {
        // 운영 환경에서 추가 설정 (커넥션 풀 튜닝 등)
        return new LazyConnectionDataSourceProxy(rawDataSource);
    }
}
```

---

## application.yml 설정 예시

```yaml
fax:
  datasource:
    fax:
      driver-class-name: com.mysql.cj.jdbc.Driver
      jdbc-url: jdbc:mysql://localhost:3306/fax_db
      username: fax_user
      password: ${FAX_DB_PASSWORD}
      # HikariCP 설정
      maximum-pool-size: 10
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000

spring:
  datasource:
    initialization-mode: never  # 운영 환경
```

---

## 커스텀 어노테이션으로 트랜잭션 관리

설정 클래스에서 정의한 상수를 활용하여 커스텀 어노테이션을 만들 수 있다.

```java
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Transactional(transactionManager = FaxSqlSessionConfig.TRANSACTION_MANAGER_NAME)
public @interface FaxTransactional {
    boolean readOnly() default false;
}
```

서비스에서 사용:

```java
@Service
@FaxTransactional  // 클래스 기본값: 쓰기
public class FaxServiceImpl {

    @FaxTransactional(readOnly = true)
    public Fax getFax(long faxSeq) { }

    // 쓰기는 클래스 설정 상속
    public void send(FaxSendDto dto) { }
}
```

---

## 체크리스트

멀티 데이터소스 설정 시 확인사항:

- [ ] Bean 이름이 데이터소스별로 고유한가?
- [ ] `@Qualifier`로 정확한 Bean을 주입받고 있는가?
- [ ] `@Transactional`에 올바른 `transactionManager`가 지정되어 있는가?
- [ ] 매퍼 XML 경로가 데이터소스별로 분리되어 있는가?
- [ ] `LazyConnectionDataSourceProxy`를 사용하고 있는가? (Read Replica 사용 시 필수)
- [ ] 테스트 환경에서 각 데이터소스가 정상 동작하는가?
