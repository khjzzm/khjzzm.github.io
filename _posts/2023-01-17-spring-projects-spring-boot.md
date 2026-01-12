---
layout: post
title: Spring Boot 완전 가이드
tags: [spring, java]
---

Spring Boot는 Spring 기반 애플리케이션을 빠르게 만들 수 있게 해주는 프레임워크다. 복잡한 설정 없이 독립 실행형 프로덕션급 애플리케이션을 만들 수 있다.

---

## Spring Boot란?

### Spring vs Spring Boot

```
Spring Framework:
- 강력하지만 설정이 복잡
- XML 또는 Java Config 필요
- 서버 별도 설치 및 배포
- 의존성 버전 관리 직접 수행

Spring Boot:
- 자동 설정 (Auto-configuration)
- 내장 서버 (Embedded Server)
- Starter 의존성으로 간편한 설정
- 프로덕션 준비 기능 (Actuator)
```

### Spring Boot의 목표

1. **빠른 시작**: 설정 없이 바로 개발 시작
2. **자동 설정**: 클래스패스 기반 자동 구성
3. **독립 실행형**: java -jar로 실행 가능
4. **프로덕션 준비**: 메트릭, 헬스체크, 외부 설정

### Hello World

```java
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@SpringBootApplication
public class Application {

    @GetMapping("/")
    String hello() {
        return "Hello, Spring Boot!";
    }

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

```bash
# 실행
./mvnw spring-boot:run
# 또는
./gradlew bootRun
```

---

## 프로젝트 생성

### Spring Initializr

```
https://start.spring.io

선택 항목:
- Project: Maven / Gradle
- Language: Java / Kotlin / Groovy
- Spring Boot: 버전 선택
- Project Metadata: Group, Artifact, Name 등
- Dependencies: 필요한 스타터 선택
```

### Gradle 프로젝트 구조

```
my-project/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/demo/
│   │   │       └── DemoApplication.java
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── static/
│   │       └── templates/
│   └── test/
│       └── java/
│           └── com/example/demo/
│               └── DemoApplicationTests.java
├── build.gradle
└── settings.gradle
```

### build.gradle (Gradle Kotlin DSL)

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.2.0"
    id("io.spring.dependency-management") version "1.1.4"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"

java {
    sourceCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("com.h2database:h2")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

### pom.xml (Maven)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

---

## @SpringBootApplication

### 구성 요소

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = {
    @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class),
    @Filter(type = FilterType.CUSTOM, classes = AutoConfigurationExcludeFilter.class)
})
public @interface SpringBootApplication {
    // ...
}
```

### 세 가지 핵심 어노테이션

| 어노테이션 | 역할 |
|-----------|------|
| `@SpringBootConfiguration` | `@Configuration`과 동일, 설정 클래스 지정 |
| `@EnableAutoConfiguration` | 자동 설정 활성화 |
| `@ComponentScan` | 컴포넌트 스캔 (현재 패키지 기준) |

### 분리해서 사용

```java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(basePackages = "com.example")
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### 자동 설정 제외

```java
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,
    SecurityAutoConfiguration.class
})
public class Application { }
```

---

## Starter 의존성

### 주요 Starter 목록

| Starter | 설명 |
|---------|------|
| `spring-boot-starter` | 핵심 스타터 (로깅, 자동설정 등) |
| `spring-boot-starter-web` | 웹 애플리케이션 (Spring MVC, 내장 톰캣) |
| `spring-boot-starter-webflux` | 리액티브 웹 애플리케이션 |
| `spring-boot-starter-data-jpa` | JPA + Hibernate |
| `spring-boot-starter-data-redis` | Redis |
| `spring-boot-starter-data-mongodb` | MongoDB |
| `spring-boot-starter-security` | Spring Security |
| `spring-boot-starter-validation` | Bean Validation |
| `spring-boot-starter-actuator` | 모니터링, 메트릭 |
| `spring-boot-starter-test` | 테스트 (JUnit, Mockito 등) |
| `spring-boot-starter-cache` | 캐시 추상화 |
| `spring-boot-starter-mail` | 이메일 발송 |
| `spring-boot-starter-batch` | Spring Batch |
| `spring-boot-starter-amqp` | RabbitMQ |

### Starter의 원리

```
spring-boot-starter-web 포함 내용:
├── spring-boot-starter
├── spring-boot-starter-json
├── spring-boot-starter-tomcat
├── spring-web
└── spring-webmvc
```

### 서드파티 Starter

```groovy
// MyBatis
implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.3'

// QueryDSL (비공식)
implementation 'com.querydsl:querydsl-jpa:5.0.0:jakarta'
annotationProcessor 'com.querydsl:querydsl-apt:5.0.0:jakarta'
```

---

## 자동 설정 (Auto-configuration)

### 동작 원리

```
1. @EnableAutoConfiguration 활성화
2. META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports 로드
3. 각 AutoConfiguration 클래스의 조건 평가
4. 조건 충족 시 Bean 등록
```

### 조건부 어노테이션

| 어노테이션 | 조건 |
|-----------|------|
| `@ConditionalOnClass` | 클래스패스에 특정 클래스 존재 |
| `@ConditionalOnMissingClass` | 클래스패스에 특정 클래스 없음 |
| `@ConditionalOnBean` | 특정 빈 존재 |
| `@ConditionalOnMissingBean` | 특정 빈 없음 |
| `@ConditionalOnProperty` | 특정 프로퍼티 값 |
| `@ConditionalOnResource` | 특정 리소스 존재 |
| `@ConditionalOnWebApplication` | 웹 애플리케이션 |
| `@ConditionalOnExpression` | SpEL 표현식 |

### DataSource 자동 설정 예시

```java
@AutoConfiguration(before = SqlInitializationAutoConfiguration.class)
@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })
@ConditionalOnMissingBean(type = "io.r2dbc.spi.ConnectionFactory")
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

    @Configuration(proxyBeanMethods = false)
    @Conditional(EmbeddedDatabaseCondition.class)
    @ConditionalOnMissingBean({ DataSource.class, XADataSource.class })
    @Import(EmbeddedDataSourceConfiguration.class)
    protected static class EmbeddedDatabaseConfiguration {
    }

    // H2가 클래스패스에 있으면 EmbeddedDatabase 생성
    // application.yml에 DataSource 설정이 있으면 해당 설정 사용
    // 직접 DataSource 빈을 정의하면 자동 설정 비활성화
}
```

### 자동 설정 확인

```bash
# 실행 시 --debug 옵션
java -jar app.jar --debug

# 또는 application.yml
debug: true
```

```
============================
CONDITIONS EVALUATION REPORT
============================

Positive matches:
-----------------
   DataSourceAutoConfiguration matched:
      - @ConditionalOnClass found required classes 'javax.sql.DataSource'

Negative matches:
-----------------
   ActiveMQAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class 'jakarta.jms.ConnectionFactory'
```

### 커스텀 자동 설정 만들기

```java
@AutoConfiguration
@ConditionalOnClass(MyService.class)
@EnableConfigurationProperties(MyProperties.class)
public class MyAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MyService myService(MyProperties properties) {
        return new MyService(properties.getName());
    }
}
```

```java
@ConfigurationProperties(prefix = "my.service")
public class MyProperties {
    private String name = "default";
    // getter, setter
}
```

```
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.MyAutoConfiguration
```

---

## 외부 설정

### application.properties vs application.yml

```properties
# application.properties
server.port=8080
spring.datasource.url=jdbc:mysql://localhost:3306/mydb
spring.datasource.username=root
spring.datasource.password=password
```

```yaml
# application.yml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mydb
    username: root
    password: password
```

### 설정 우선순위 (높은 순)

```
1. 명령줄 인자 (--server.port=9090)
2. SPRING_APPLICATION_JSON 환경 변수
3. ServletConfig/ServletContext 파라미터
4. JNDI 속성
5. Java 시스템 프로퍼티 (-Dserver.port=9090)
6. OS 환경 변수
7. RandomValuePropertySource (random.*)
8. 외부 application-{profile}.yml
9. 내부 application-{profile}.yml
10. 외부 application.yml
11. 내부 application.yml
12. @PropertySource
13. 기본 속성 (SpringApplication.setDefaultProperties)
```

### @ConfigurationProperties

```java
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String name;
    private int maxConnections = 100;
    private Duration timeout = Duration.ofSeconds(30);
    private List<String> servers = new ArrayList<>();
    private final Security security = new Security();

    // getter, setter

    public static class Security {
        private String username;
        private String password;
        // getter, setter
    }
}
```

```yaml
app:
  name: MyApp
  max-connections: 200
  timeout: 60s
  servers:
    - server1.example.com
    - server2.example.com
  security:
    username: admin
    password: secret
```

```java
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class AppConfig {

    @Bean
    public MyService myService(AppProperties properties) {
        return new MyService(properties.getName(), properties.getMaxConnections());
    }
}
```

### @Value 사용

```java
@Component
public class MyComponent {

    @Value("${app.name}")
    private String appName;

    @Value("${app.max-connections:100}")  // 기본값 지정
    private int maxConnections;

    @Value("${APP_SECRET:}")  // 환경 변수
    private String secret;

    @Value("#{${app.map}}")  // SpEL
    private Map<String, String> map;
}
```

### 타입 안전한 설정 바인딩

```java
@ConfigurationProperties(prefix = "mail")
@Validated
public class MailProperties {

    @NotNull
    private String host;

    @Min(1)
    @Max(65535)
    private int port = 25;

    @Valid
    private final Credentials credentials = new Credentials();

    public static class Credentials {
        @NotEmpty
        private String username;
        private String password;
    }
}
```

---

## 프로파일 (Profiles)

### 프로파일별 설정 파일

```
src/main/resources/
├── application.yml           # 공통 설정
├── application-dev.yml       # 개발 환경
├── application-prod.yml      # 운영 환경
├── application-test.yml      # 테스트 환경
└── application-local.yml     # 로컬 환경
```

### 프로파일 활성화

```yaml
# application.yml - 기본 프로파일 지정
spring:
  profiles:
    active: dev
```

```bash
# 명령줄로 활성화
java -jar app.jar --spring.profiles.active=prod

# 환경 변수로 활성화
export SPRING_PROFILES_ACTIVE=prod

# JVM 옵션으로 활성화
java -Dspring.profiles.active=prod -jar app.jar
```

### 프로파일별 Bean 등록

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Profile("dev")
    public DataSource devDataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .build();
    }

    @Bean
    @Profile("prod")
    public DataSource prodDataSource() {
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl("jdbc:mysql://prod-db:3306/mydb");
        return dataSource;
    }
}
```

### 프로파일 그룹

```yaml
spring:
  profiles:
    group:
      production:
        - proddb
        - prodmq
      development:
        - devdb
        - devmq
```

### 프로파일 조건

```java
@Component
@Profile("!prod")  // prod가 아닌 경우
public class DevOnlyComponent { }

@Component
@Profile({"dev", "test"})  // dev 또는 test
public class NonProdComponent { }
```

---

## 내장 서버

### 지원 서버

| 서버 | Starter | 특징 |
|------|---------|------|
| Tomcat | `spring-boot-starter-tomcat` | 기본 내장, 가장 널리 사용 |
| Jetty | `spring-boot-starter-jetty` | 경량, WebSocket 강점 |
| Undertow | `spring-boot-starter-undertow` | 고성능, 논블로킹 |
| Netty | `spring-boot-starter-reactor-netty` | WebFlux 기본 |

### 서버 변경

```groovy
// Tomcat 제외하고 Undertow 사용
implementation('org.springframework.boot:spring-boot-starter-web') {
    exclude group: 'org.springframework.boot', module: 'spring-boot-starter-tomcat'
}
implementation 'org.springframework.boot:spring-boot-starter-undertow'
```

### 서버 설정

```yaml
server:
  port: 8080
  address: 0.0.0.0

  # SSL 설정
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: secret
    key-store-type: PKCS12

  # 압축 설정
  compression:
    enabled: true
    mime-types: text/html,text/xml,text/plain,application/json
    min-response-size: 1024

  # 세션 설정
  servlet:
    session:
      timeout: 30m
      cookie:
        http-only: true
        secure: true

  # Tomcat 전용 설정
  tomcat:
    max-threads: 200
    min-spare-threads: 10
    max-connections: 10000
    accept-count: 100
    connection-timeout: 20000
    accesslog:
      enabled: true
      directory: logs
      pattern: "%h %l %u %t \"%r\" %s %b %D"
```

### 프로그래밍 방식 커스터마이징

```java
@Component
public class ServerCustomizer implements WebServerFactoryCustomizer<TomcatServletWebServerFactory> {

    @Override
    public void customize(TomcatServletWebServerFactory factory) {
        factory.setPort(9090);
        factory.addConnectorCustomizers(connector -> {
            connector.setProperty("maxThreads", "500");
        });
    }
}
```

---

## Spring Boot Actuator

### 의존성 추가

```groovy
implementation 'org.springframework.boot:spring-boot-starter-actuator'
```

### 주요 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `/actuator/health` | 애플리케이션 상태 |
| `/actuator/info` | 애플리케이션 정보 |
| `/actuator/metrics` | 메트릭 정보 |
| `/actuator/env` | 환경 변수 |
| `/actuator/beans` | 등록된 빈 목록 |
| `/actuator/mappings` | 요청 매핑 정보 |
| `/actuator/loggers` | 로거 설정 |
| `/actuator/threaddump` | 스레드 덤프 |
| `/actuator/heapdump` | 힙 덤프 |
| `/actuator/prometheus` | Prometheus 메트릭 |

### 설정

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
        # include: "*"  # 모든 엔드포인트 노출
      base-path: /actuator

  endpoint:
    health:
      show-details: always  # always, when-authorized, never
      show-components: always

  health:
    db:
      enabled: true
    redis:
      enabled: true
    diskspace:
      enabled: true
      threshold: 10MB

  info:
    env:
      enabled: true
    git:
      mode: full

  metrics:
    export:
      prometheus:
        enabled: true
```

### 커스텀 Health Indicator

```java
@Component
public class CustomHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        boolean isHealthy = checkExternalService();

        if (isHealthy) {
            return Health.up()
                .withDetail("service", "External API")
                .withDetail("status", "available")
                .build();
        }
        return Health.down()
            .withDetail("service", "External API")
            .withDetail("error", "Connection refused")
            .build();
    }

    private boolean checkExternalService() {
        // 외부 서비스 상태 확인
        return true;
    }
}
```

### 커스텀 Metrics

```java
@Component
public class OrderMetrics {

    private final Counter orderCounter;
    private final Timer orderTimer;

    public OrderMetrics(MeterRegistry registry) {
        this.orderCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .tag("type", "total")
            .register(registry);

        this.orderTimer = Timer.builder("orders.processing.time")
            .description("Time to process an order")
            .register(registry);
    }

    public void recordOrder() {
        orderCounter.increment();
    }

    public void recordProcessingTime(Duration duration) {
        orderTimer.record(duration);
    }
}
```

### Info 엔드포인트 커스터마이징

```yaml
info:
  app:
    name: ${spring.application.name}
    version: 1.0.0
    description: My Application
  build:
    artifact: "@project.artifactId@"
    version: "@project.version@"
```

---

## 로깅

### 기본 로깅 (Logback)

```yaml
logging:
  level:
    root: INFO
    com.example: DEBUG
    org.springframework.web: WARN
    org.hibernate.SQL: DEBUG

  file:
    name: logs/application.log
    max-size: 10MB
    max-history: 30

  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"

  logback:
    rollingpolicy:
      max-file-size: 10MB
      max-history: 30
      total-size-cap: 1GB
```

### logback-spring.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <springProfile name="dev">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%clr(%d{HH:mm:ss.SSS}){faint} %clr(%-5level) %clr([%15.15t]){faint} %clr(%-40.40logger{39}){cyan} %clr(:){faint} %m%n</pattern>
            </encoder>
        </appender>
        <root level="DEBUG">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
            <file>logs/app.log</file>
            <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
                <fileNamePattern>logs/app.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
                <maxFileSize>100MB</maxFileSize>
                <maxHistory>30</maxHistory>
                <totalSizeCap>3GB</totalSizeCap>
            </rollingPolicy>
            <encoder>
                <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="FILE"/>
        </root>
    </springProfile>
</configuration>
```

---

## 테스트

### 테스트 의존성

```groovy
testImplementation 'org.springframework.boot:spring-boot-starter-test'
// 포함: JUnit 5, Mockito, AssertJ, Hamcrest, JSONPath, Spring Test
```

### @SpringBootTest

```java
@SpringBootTest
class ApplicationTests {

    @Autowired
    private UserService userService;

    @Test
    void contextLoads() {
        assertThat(userService).isNotNull();
    }
}
```

### Web Layer 테스트

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void getUser_ShouldReturnUser() throws Exception {
        User user = new User(1L, "John");
        when(userService.findById(1L)).thenReturn(user);

        mockMvc.perform(get("/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("John"));
    }
}
```

### Data Layer 테스트

```java
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void findByEmail_ShouldReturnUser() {
        User user = new User("john@example.com", "John");
        entityManager.persistAndFlush(user);

        Optional<User> found = userRepository.findByEmail("john@example.com");

        assertThat(found).isPresent();
        assertThat(found.get().getName()).isEqualTo("John");
    }
}
```

### 슬라이스 테스트

| 어노테이션 | 테스트 대상 |
|-----------|------------|
| `@WebMvcTest` | Spring MVC (Controller) |
| `@WebFluxTest` | WebFlux (Controller) |
| `@DataJpaTest` | JPA Repository |
| `@DataMongoTest` | MongoDB |
| `@DataRedisTest` | Redis |
| `@JdbcTest` | JDBC |
| `@JsonTest` | JSON 직렬화 |
| `@RestClientTest` | REST Client |

### TestContainers 사용

```java
@SpringBootTest
@Testcontainers
class IntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Test
    void test() {
        // 실제 PostgreSQL로 테스트
    }
}
```

---

## 빌드 및 배포

### 실행 가능한 JAR 빌드

```bash
# Maven
./mvnw clean package
java -jar target/app-0.0.1-SNAPSHOT.jar

# Gradle
./gradlew clean build
java -jar build/libs/app-0.0.1-SNAPSHOT.jar
```

### JAR 구조

```
app.jar
├── BOOT-INF/
│   ├── classes/        # 애플리케이션 클래스
│   ├── lib/            # 의존성 JAR
│   └── classpath.idx   # 클래스패스 인덱스
├── META-INF/
│   └── MANIFEST.MF
└── org/springframework/boot/loader/  # Spring Boot Loader
```

### Docker 이미지

```dockerfile
# 멀티 스테이지 빌드
FROM eclipse-temurin:21-jdk as builder
WORKDIR /app
COPY . .
RUN ./gradlew build -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Layered JAR (최적화된 Docker)

```dockerfile
FROM eclipse-temurin:21-jre as builder
WORKDIR /app
ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/dependencies/ ./
COPY --from=builder /app/spring-boot-loader/ ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/ ./
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

### Native Image (GraalVM)

```groovy
plugins {
    id 'org.graalvm.buildtools.native' version '0.9.28'
}
```

```bash
./gradlew nativeCompile
./build/native/nativeCompile/app
```

---

## Spring Boot 3.x 주요 변경사항

### Java 17+ 필수

```java
// Java 17 기능 활용
public record UserDto(Long id, String name, String email) {}

var users = List.of(
    new UserDto(1L, "John", "john@example.com"),
    new UserDto(2L, "Jane", "jane@example.com")
);
```

### Jakarta EE 9+ 마이그레이션

```java
// Before (Spring Boot 2.x)
import javax.persistence.*;
import javax.validation.constraints.*;
import javax.servlet.*;

// After (Spring Boot 3.x)
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import jakarta.servlet.*;
```

### 자동 설정 파일 위치 변경

```
# Before (Spring Boot 2.x)
META-INF/spring.factories

# After (Spring Boot 3.x)
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

### Observability (관찰 가능성)

```groovy
implementation 'io.micrometer:micrometer-tracing-bridge-brave'
implementation 'io.zipkin.reporter2:zipkin-reporter-brave'
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans
```

### Problem Details (RFC 7807)

```yaml
spring:
  mvc:
    problemdetails:
      enabled: true
```

```json
{
    "type": "https://example.com/errors/not-found",
    "title": "Not Found",
    "status": 404,
    "detail": "User with id 123 not found",
    "instance": "/users/123"
}
```

### HTTP Interface Client

```java
public interface UserClient {

    @GetExchange("/users/{id}")
    User getUser(@PathVariable Long id);

    @PostExchange("/users")
    User createUser(@RequestBody User user);
}

@Configuration
public class ClientConfig {

    @Bean
    public UserClient userClient(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("https://api.example.com").build();
        HttpServiceProxyFactory factory = HttpServiceProxyFactory
            .builderFor(RestClientAdapter.create(restClient))
            .build();
        return factory.createClient(UserClient.class);
    }
}
```

---

## Best Practices

### 패키지 구조

```
com.example.app/
├── config/           # 설정 클래스
├── controller/       # REST Controller
├── service/          # 비즈니스 로직
├── repository/       # 데이터 접근
├── domain/           # 엔티티, VO
├── dto/              # DTO
├── exception/        # 예외 클래스
└── Application.java  # 메인 클래스 (최상위)
```

### 설정 분리

```yaml
# application.yml - 공통
spring:
  application:
    name: my-app

---
# application-dev.yml - 개발
spring:
  config:
    activate:
      on-profile: dev
  datasource:
    url: jdbc:h2:mem:testdb

---
# application-prod.yml - 운영
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:mysql://prod-db:3306/mydb
```

### 예외 처리

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(EntityNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse("NOT_FOUND", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        List<String> errors = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("VALIDATION_ERROR", errors.toString()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e) {
        log.error("Unexpected error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("INTERNAL_ERROR", "서버 오류가 발생했습니다."));
    }
}
```

### Graceful Shutdown

```yaml
server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

### 보안 설정

```yaml
# 민감 정보는 환경 변수로
spring:
  datasource:
    password: ${DB_PASSWORD}

# Actuator 보안
management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: when-authorized
```

---

## 정리

| 기능 | 설명 |
|------|------|
| 자동 설정 | 클래스패스 기반 자동 Bean 등록 |
| Starter | 관련 의존성 일괄 관리 |
| 외부 설정 | application.yml, 환경변수, 명령줄 |
| 프로파일 | 환경별 설정 분리 |
| 내장 서버 | Tomcat, Jetty, Undertow |
| Actuator | 모니터링, 헬스체크 |
| 테스트 | @SpringBootTest, 슬라이스 테스트 |

### Spring Boot 선택 기준

```
Spring Boot가 적합한 경우:
- 빠른 개발이 필요한 경우
- 마이크로서비스 아키텍처
- 컨테이너 기반 배포
- 표준적인 웹 애플리케이션

순수 Spring이 적합한 경우:
- 세밀한 제어가 필요한 경우
- 레거시 시스템 통합
- 특수한 서버 환경
```

> Spring Boot는 "Convention over Configuration" 철학을 따른다.
> 기본 설정으로 시작하고, 필요할 때만 커스터마이징하자.
