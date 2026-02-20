---
layout: post
title: Spring Boot Starter와 Auto-Configuration의 동작 원리
tags: [ spring ]
---

## Starter란

Spring Boot Starter는 **코드가 아니라 의존성 묶음**이다. Starter 자체에는 비즈니스 로직이 없다. 관련 라이브러리들을 하나의 의존성으로 묶어서 편리하게 가져올 수 있게 해주는 역할만 한다.

`spring-boot-starter-data-jpa`의 실체를 보면 명확하다. 이 Starter의 `build.gradle`은 사실상 의존성 선언뿐이다.

```groovy
dependencies {
    api(project(":spring-boot-project:spring-boot-starters:spring-boot-starter-aop"))
    api(project(":spring-boot-project:spring-boot-starters:spring-boot-starter-jdbc"))
    api("jakarta.transaction:jakarta.transaction-api")
    api("jakarta.persistence:jakarta.persistence-api")
    api("org.hibernate.orm:hibernate-core")
    api("org.springframework.data:spring-data-jpa")
    api("org.springframework:spring-aspects")
}
```

의존성 트리로 보면 하나의 Starter가 어떤 라이브러리들을 가져오는지 알 수 있다.

```
spring-boot-starter-data-jpa
├── spring-boot-starter-aop
│   ├── spring-boot-starter          ← 핵심 (spring-boot, spring-boot-autoconfigure, logging, yaml)
│   ├── spring-aop
│   └── aspectjweaver
├── spring-boot-starter-jdbc
│   ├── spring-boot-starter
│   ├── spring-jdbc
│   └── HikariCP                     ← 커넥션 풀
├── hibernate-core                   ← JPA 구현체
├── spring-data-jpa                  ← Repository 추상화
├── jakarta.persistence-api          ← JPA 표준 API
├── jakarta.transaction-api          ← 트랜잭션 표준 API
└── spring-aspects
```

`implementation("org.springframework.boot:spring-boot-starter-data-jpa")` 한 줄이면 Hibernate, HikariCP, Spring Data JPA, Spring AOP 등이 전부 클래스패스에 올라온다.

---

## Gradle 의존성 해석

`build.gradle.kts`에 의존성을 선언하면 Gradle이 전이 의존성(transitive dependency)을 재귀적으로 해석한다.

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
}
```

이 한 줄이 실행되면:

```
1. Gradle이 Maven Central에서 spring-boot-starter-data-jpa의 POM을 다운로드
2. POM에 선언된 의존성들을 재귀적으로 해석 (전이 의존성)
3. 버전 충돌이 있으면 해결 (기본: 최신 버전 선택)
4. 해석된 모든 JAR를 클래스패스에 배치
```

실제로 어떤 의존성이 포함되는지 확인하려면:

```bash
# 전체 의존성 트리 확인
./gradlew dependencies --configuration runtimeClasspath

# 특정 라이브러리가 어디서 오는지 추적
./gradlew dependencyInsight --dependency hibernate-core --configuration runtimeClasspath
```

핵심은 이것이다. Starter를 추가하면 Gradle이 전이 의존성을 해석하여 관련 라이브러리들이 클래스패스에 배치되고, Spring Boot는 이 **클래스패스에 존재하는 클래스들을 기반으로** Auto-Configuration을 수행한다.

### 여러 Starter의 중복 의존성

실제 프로젝트에서는 Starter를 여러 개 함께 사용한다.

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-web")
}
```

이 둘의 전이 의존성을 펼쳐보면 겹치는 부분이 상당하다.

```
spring-boot-starter-data-jpa
├── spring-boot-starter          ← 공통
│   ├── spring-boot
│   ├── spring-boot-autoconfigure
│   ├── spring-core
│   ├── spring-context
│   └── ...
├── spring-boot-starter-jdbc
│   └── spring-boot-starter      ← 또 공통
├── spring-boot-starter-aop
│   └── spring-boot-starter      ← 또 공통
└── ...

spring-boot-starter-web
├── spring-boot-starter          ← 공통
│   ├── spring-boot
│   ├── spring-boot-autoconfigure
│   ├── spring-core
│   ├── spring-context
│   └── ...
├── spring-webmvc
│   ├── spring-core              ← 공통
│   ├── spring-context           ← 공통
│   └── spring-aop               ← 공통
└── ...
```

`spring-boot-starter`, `spring-core`, `spring-context` 같은 모듈이 여러 경로에서 반복 등장한다. 하지만 **Gradle은 동일한 라이브러리를 중복으로 가져오지 않는다**.

Gradle의 의존성 해석 과정:

```
1. 모든 전이 의존성을 재귀적으로 펼친다
2. 동일한 group:artifact가 여러 경로에서 등장하면 → 하나만 선택
3. 버전이 다르면 → 기본적으로 가장 높은 버전을 선택 (conflict resolution)
4. 최종적으로 각 라이브러리는 클래스패스에 단 하나의 JAR만 배치
```

Spring Boot는 여기에 **BOM(Bill of Materials)** 을 추가로 사용한다. `spring-boot-dependencies` BOM이 수백 개 라이브러리의 호환 버전을 미리 정의해두기 때문에, 어떤 경로로 가져오든 버전이 일치한다.

```kotlin
// Spring Boot 플러그인이 자동으로 BOM을 적용한다
plugins {
    id("org.springframework.boot") version "3.4.3"
}

// 덕분에 버전을 명시하지 않아도 된다
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")  // 버전 생략
    implementation("org.springframework.boot:spring-boot-starter-web")       // 버전 생략
}
```

결국 Starter를 아무리 많이 추가해도 중복 JAR가 클래스패스에 올라오는 일은 없다. Gradle이 해석하고, BOM이 버전을 맞춰준다.

### 의존성 트리에 보이지 않는 의존성: Shaded JAR

`gradle dependencies`에 모든 의존성이 나타나는 것은 아니다. 일부 라이브러리는 내부적으로 사용하는 라이브러리를 자신의 JAR 안에 **번들링(shade/relocate)** 해서 배포한다.

예를 들어 Develocity Gradle Plugin의 NOTICE 파일을 보면:

```text
Apache HttpClient - Apache-2.0 (see META-INF/licenses/httpclient-4.5.14/LICENSE.txt)
Jackson-core      - Apache-2.0 (see META-INF/licenses/jackson-core-2.20.0/LICENSE.txt)
Netty/Common      - Apache-2.0 (see META-INF/licenses/netty-common-4.2.6.Final/LICENSE.txt)
Guava             - Apache-2.0 (see META-INF/licenses/failureaccess-1.0.3/LICENSE.txt)
...
```

이 라이브러리들은 Develocity Plugin JAR 내부에 포함되어 있어서 `gradle dependencies` 트리에는 나타나지 않는다. JAR 안의 `META-INF/NOTICE` 또는 `META-INF/LICENSE` 파일만이 실제로 뭐가 들어있는지 알려준다.

왜 이렇게 하는가? 플러그인이 사용하는 Jackson 버전과 프로젝트가 사용하는 Jackson 버전이 충돌하는 것을 방지하기 위해서다. shade 처리하면 패키지 경로가 변경되어(`com.fasterxml.jackson` → `com.gradle.internal.jackson`) 같은 클래스패스에 공존할 수 있다.

| 구분                        | 전이 의존성 (Transitive)   | 번들링 의존성 (Shaded)          |
|---------------------------|-----------------------|---------------------------|
| 배치 방식                     | 별도 JAR로 클래스패스에 배치     | 하나의 JAR 안에 포함             |
| 확인 방법                     | `gradle dependencies` | JAR 내부의 NOTICE/LICENSE 파일 |
| 버전 충돌                     | Gradle이 해결 (최신 버전 선택) | 충돌 없음 (패키지 경로가 다름)        |
| `gradle dependencies`에 표시 | 표시됨                   | 표시되지 않음                   |

대부분의 오픈소스 라이선스(Apache-2.0, MIT, BSD 등)는 재배포 시 원저작자 표기 의무가 있기 때문에, shaded JAR에는 이런 NOTICE 파일이 반드시 포함된다.

---

## Auto-Configuration 동작 원리

클래스패스에 라이브러리가 올라온 것만으로는 아무 일도 일어나지 않는다. Spring Boot의 Auto-Configuration이 이 라이브러리들을 감지하고 필요한 빈을 자동 등록한다.

### spring-boot-autoconfigure 모듈

모든 Starter에 공통으로 포함되는 `spring-boot-starter`에는 `spring-boot-autoconfigure` 모듈이 들어있다. 이 모듈 안에 수백 개의 Auto-Configuration 클래스가 미리 작성되어 있다.

```
spring-boot-autoconfigure
├── org.springframework.boot.autoconfigure.data.jpa
│   ├── JpaRepositoriesAutoConfiguration
│   └── HibernateJpaAutoConfiguration
├── org.springframework.boot.autoconfigure.jdbc
│   ├── DataSourceAutoConfiguration
│   └── DataSourceTransactionManagerAutoConfiguration
├── org.springframework.boot.autoconfigure.data.redis
│   └── RedisAutoConfiguration
├── org.springframework.boot.autoconfigure.data.mongo
│   └── MongoDataAutoConfiguration
└── ... (수백 개)
```

이 클래스들은 항상 존재하지만, **조건이 맞을 때만** 활성화된다.

### AutoConfiguration.imports 등록

Spring Boot 3부터 Auto-Configuration 클래스의 등록 방식이 변경되었다.

```
# Spring Boot 2 (레거시)
META-INF/spring.factories

# Spring Boot 3 (현재)
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

이 파일은 단순한 텍스트 파일이다. 한 줄에 하나씩 Auto-Configuration 클래스의 FQCN이 나열되어 있다.

```text
org.springframework.boot.autoconfigure.admin.SpringApplicationAdminJmxAutoConfiguration
org.springframework.boot.autoconfigure.aop.AopAutoConfiguration
org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration
...
```

### 동작 흐름

```
1. @SpringBootApplication
   └── @EnableAutoConfiguration
       └── AutoConfigurationImportSelector 실행

2. AutoConfigurationImportSelector가
   META-INF/spring/AutoConfiguration.imports 파일을 읽어
   모든 Auto-Configuration 클래스 후보를 로드

3. 각 클래스의 @Conditional 조건을 평가
   - @ConditionalOnClass: 클래스패스에 특정 클래스가 있는가?
   - @ConditionalOnMissingBean: 사용자가 직접 등록한 빈이 없는가?
   - @ConditionalOnProperty: 특정 프로퍼티가 설정되어 있는가?

4. 조건을 통과한 Auto-Configuration만 활성화 → 빈 등록
```

`@SpringBootApplication`은 `@EnableAutoConfiguration`을 포함하고, 이것이 `AutoConfigurationImportSelector`를 트리거한다. 이 Selector가 imports 파일을 읽어서 후보 클래스를 로드한 뒤, 각 클래스의 조건을 평가한다.

---

## @Conditional 조건부 설정

Auto-Configuration의 핵심은 `@Conditional` 계열 어노테이션이다. "클래스패스에 Hibernate가 있으면 JPA 설정을 활성화하라"는 식의 조건부 로직을 담당한다.

### 주요 어노테이션

| 어노테이션                          | 조건                               |
|--------------------------------|----------------------------------|
| `@ConditionalOnClass`          | 클래스패스에 지정한 클래스가 존재할 때            |
| `@ConditionalOnMissingClass`   | 클래스패스에 지정한 클래스가 없을 때             |
| `@ConditionalOnBean`           | 컨테이너에 지정한 빈이 이미 존재할 때            |
| `@ConditionalOnMissingBean`    | 컨테이너에 지정한 빈이 없을 때                |
| `@ConditionalOnProperty`       | 지정한 프로퍼티가 특정 값일 때                |
| `@ConditionalOnResource`       | 클래스패스에 지정한 리소스 파일이 존재할 때         |
| `@ConditionalOnWebApplication` | 웹 애플리케이션(Servlet 또는 Reactive)일 때 |

### 실제 DataSourceAutoConfiguration 코드

```java

@AutoConfiguration(before = SqlInitializationAutoConfiguration.class)
@ConditionalOnClass({DataSource.class, EmbeddedDatabaseType.class})
@ConditionalOnMissingBean(type = "io.r2dbc.spi.ConnectionFactory")
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

	@Configuration(proxyBeanMethods = false)
	@Conditional(PooledDataSourceCondition.class)
	@ConditionalOnMissingBean({DataSource.class, XADataSource.class})
	static class PooledDataSourceConfiguration {

		@Bean
		@ConditionalOnMissingBean
		DataSourceConfiguration.Hikari dataSource(DataSourceProperties properties) {
			// HikariCP DataSource 생성
		}
	}
}
```

이 코드를 읽으면:

1. `@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })` - JDBC 관련 클래스가 클래스패스에 있을 때만 이 설정이 활성화된다
2. `@ConditionalOnMissingBean(type = "io.r2dbc.spi.ConnectionFactory")` - R2DBC ConnectionFactory가 없을 때만 (R2DBC 환경이면 비활성화)
3. `@ConditionalOnMissingBean({ DataSource.class, XADataSource.class })` - 사용자가 직접 DataSource 빈을 등록하지 않았을 때만 기본 HikariCP DataSource를 생성한다

### @ConditionalOnMissingBean의 의미

이 어노테이션이 Auto-Configuration의 핵심 철학을 드러낸다. **"기본값을 제공하되, 사용자가 직접 정의하면 비켜준다."**

```kotlin
// 기본 동작: Auto-Configuration이 HikariCP DataSource를 만들어준다
// application.yml에 url, username, password만 적으면 끝

// 커스텀: 사용자가 직접 DataSource를 빈으로 등록하면
@Configuration
class CustomDataSourceConfig {

    @Bean
    fun dataSource(): DataSource {
        // 직접 구성한 DataSource (예: 멀티 DataSource, 커스텀 풀 설정 등)
        return HikariDataSource().apply {
            jdbcUrl = "jdbc:mysql://primary:3306/mydb"
            maximumPoolSize = 50
            connectionTimeout = 3000
        }
    }
}
// → Auto-Configuration의 DataSource는 @ConditionalOnMissingBean에 의해 비활성화
// → 사용자가 등록한 DataSource가 사용된다
```

이 패턴 덕분에 "기본값으로 빠르게 시작하고, 필요할 때 커스텀"하는 Spring Boot의 철학이 가능해진다.

### 실제 JPA Auto-Configuration 연쇄

하나의 Starter가 여러 Auto-Configuration을 연쇄적으로 트리거한다.

```
spring-boot-starter-data-jpa 추가
    ↓
1. DataSourceAutoConfiguration
   @ConditionalOnClass(DataSource.class)
   → HikariCP DataSource 빈 생성

2. HibernateJpaAutoConfiguration
   @ConditionalOnClass(EntityManager.class)
   → EntityManagerFactory 빈 생성

3. DataSourceTransactionManagerAutoConfiguration
   @ConditionalOnClass(JdbcTemplate.class)
   → PlatformTransactionManager 빈 생성

4. JpaRepositoriesAutoConfiguration
   @ConditionalOnClass(JpaRepository.class)
   @ConditionalOnBean(DataSource.class)
   → @EnableJpaRepositories 활성화 → Repository 프록시 생성
```

과거에는 이 네 가지를 모두 수동으로 설정해야 했다. Auto-Configuration은 이 순서를 `@AutoConfiguration(before/after)` 어노테이션으로 보장한다.

---

## 커스텀 Starter 만들기

사내 공통 라이브러리나 특정 인프라 설정을 Starter로 만들면, 의존성 하나로 일관된 설정을 제공할 수 있다.

### 구조

Spring Boot 공식 컨벤션은 두 모듈로 분리하는 것이다.

```
my-spring-boot-starter/
├── my-spring-boot-starter-autoconfigure/   ← Auto-Configuration 로직
│   ├── src/main/java/
│   │   └── com/example/autoconfigure/
│   │       ├── MyServiceAutoConfiguration.java
│   │       └── MyServiceProperties.java
│   └── src/main/resources/
│       └── META-INF/spring/
│           └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
│
└── my-spring-boot-starter/                 ← 의존성 묶음 (빈 프로젝트)
    └── build.gradle.kts                    ← autoconfigure 모듈 + 필요한 라이브러리 의존성
```

- **autoconfigure 모듈**: 실제 Auto-Configuration 코드
- **starter 모듈**: 코드 없이 의존성만 선언 (autoconfigure 모듈 + 필요한 라이브러리)

### 간단한 예제

알림 서비스를 자동 구성하는 Starter를 만든다고 가정하자.

**Properties 클래스:**

```java

@ConfigurationProperties(prefix = "my.notification")
public class NotificationProperties {
	private boolean enabled = true;
	private String defaultChannel = "email";

	// getter, setter
}
```

**Auto-Configuration 클래스:**

```java

@AutoConfiguration
@ConditionalOnClass(NotificationService.class)
@EnableConfigurationProperties(NotificationProperties.class)
public class NotificationAutoConfiguration {

	@Bean
	@ConditionalOnMissingBean
	public NotificationService notificationService(NotificationProperties properties) {
		return new NotificationService(properties.getDefaultChannel());
	}

	@Bean
	@ConditionalOnMissingBean
	@ConditionalOnProperty(prefix = "my.notification", name = "enabled", havingValue = "true", matchIfMissing = true)
	public NotificationEventListener notificationEventListener(NotificationService service) {
		return new NotificationEventListener(service);
	}
}
```

**AutoConfiguration.imports 파일:**

```text
com.example.autoconfigure.NotificationAutoConfiguration
```

사용하는 쪽에서는:

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.example:my-spring-boot-starter:1.0.0")
}
```

```yaml
# application.yml
my:
  notification:
    enabled: true
    default-channel: slack
```

이것만으로 `NotificationService`와 `NotificationEventListener`가 자동으로 빈에 등록된다. 직접 빈을 등록하면 `@ConditionalOnMissingBean`에 의해 기본 설정이 비활성화된다.

---

## 디버깅

### --debug 플래그

어떤 Auto-Configuration이 적용되고 제외되었는지 확인하려면 `--debug` 플래그를 사용한다.

```bash
java -jar myapp.jar --debug
```

또는 `application.yml`에서:

```yaml
debug: true
```

출력에서 **CONDITIONS EVALUATION REPORT**를 확인한다.

```
============================
CONDITIONS EVALUATION REPORT
============================

Positive matches:
-----------------
   DataSourceAutoConfiguration matched:
      - @ConditionalOnClass found required classes 'javax.sql.DataSource',
        'org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType' (OnClassCondition)

   HibernateJpaAutoConfiguration matched:
      - @ConditionalOnClass found required classes 'jakarta.persistence.EntityManager',
        'org.hibernate.engine.spi.SessionImplementor',
        'org.springframework.orm.jpa.JpaTransactionManager' (OnClassCondition)

Negative matches:
-----------------
   MongoAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class
           'com.mongodb.client.MongoClient' (OnClassCondition)

   RedisAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class
           'org.springframework.data.redis.core.RedisOperations' (OnClassCondition)
```

- **Positive matches**: 조건을 만족하여 활성화된 설정
- **Negative matches**: 조건을 만족하지 못해 비활성화된 설정

MongoDB나 Redis Starter를 추가하지 않았으므로 해당 Auto-Configuration은 `@ConditionalOnClass` 조건에서 탈락한다. 이 보고서를 통해 "왜 이 빈이 생성되지 않았는가"를 정확히 추적할 수 있다.

### Actuator 엔드포인트

Spring Boot Actuator를 사용 중이라면 `/actuator/conditions` 엔드포인트에서도 동일한 정보를 JSON으로 확인할 수 있다.

```bash
curl http://localhost:8080/actuator/conditions | jq .
```

---

## 정리

```
Starter = 의존성 묶음 (코드 없음)
    ↓ Gradle 전이 의존성 해석
클래스패스에 라이브러리 배치
    ↓ Spring Boot 시작
AutoConfigurationImportSelector가 AutoConfiguration.imports 로드
    ↓
@Conditional 조건 평가
    ↓ 조건 통과
Auto-Configuration 활성화 → 빈 자동 등록
    ↓ 사용자가 직접 빈 등록 시
@ConditionalOnMissingBean → 기본 설정 비활성화 → 사용자 설정 우선
```

| 구성 요소                     | 역할                                           |
|---------------------------|----------------------------------------------|
| Starter                   | 관련 의존성을 하나로 묶은 편의 모듈                         |
| spring-boot-autoconfigure | 수백 개의 Auto-Configuration 클래스가 미리 작성되어 있는 모듈  |
| AutoConfiguration.imports | Auto-Configuration 클래스 후보 목록 (Spring Boot 3) |
| @ConditionalOnClass       | 클래스패스에 특정 클래스가 있을 때만 활성화                     |
| @ConditionalOnMissingBean | 사용자가 직접 등록한 빈이 없을 때만 기본값 제공                  |
| --debug                   | 어떤 Auto-Configuration이 적용/제외되었는지 확인          |
