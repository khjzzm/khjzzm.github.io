---
layout: post
title: Spring Boot 4 + Java 21 + Kotlin 2 마이그레이션 및 도입 가이드
tags: [ spring, java, gradle, kotlin, jackson ]
---

Spring Boot 2.x에서 4.x로, Java 8에서 21로 업그레이드하면서 겪은 마이그레이션 경험을 정리했다.

## 개요

| 항목              | 변경 전          | 변경 후  |
|-----------------|---------------|-------|
| **Java**        | 8             | 21    |
| **Spring Boot** | 2.3.0.RELEASE | 4.0.1 |
| **Gradle**      | 6.9.4         | 9.1.0 |
| **Kotlin**      | 미사용           | 2.2.0 |
| **Jackson**     | 2.x           | 3.0.0 |

---

## Part 1: Gradle 업그레이드 (6.9.4 → 9.1.0)

### gradle-wrapper.properties

```properties
# 변경 전
distributionUrl=https\://services.gradle.org/distributions/gradle-6.9.4-all.zip
# 변경 후
distributionUrl=https\://services.gradle.org/distributions/gradle-9.1.0-all.zip
```

### Deprecated API 수정

#### compile → implementation/api

```groovy
# 변경 전
compile 'org.example:library:1.0'

# 변경 후
implementation 'org.example:library:1.0'  // 내부 사용
api 'org.example:library:1.0'             // 외부 노출
```

#### classifier → archiveClassifier

```groovy
# 변경 전
classifier = 'sources'

# 변경 후
archiveClassifier = 'sources'
```

#### layout.buildDirectory 사용

```groovy
# 변경 전
outputDir = file("$buildDir/classes/main")

# 변경 후
outputDir = layout.buildDirectory.dir("classes/main").get().asFile
```

---

## Part 2: Java 업그레이드 (8 → 21)

### build.gradle 설정

```groovy
java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}
```

### Javadoc 링크 업데이트

```groovy
javadoc {
    options {
        // 변경 전
        links "https://docs.oracle.com/javase/8/docs/api/"

        // 변경 후
        links "https://docs.oracle.com/en/java/javase/21/docs/api/"
    }
}
```

### Javadoc 헤딩 규칙 (Java 21)

Java 21에서는 Javadoc 헤딩 계층 구조가 엄격해졌다.

```java
// 변경 전 (오류 발생)
/**
 * <h1>클래스 설명</h1>
 */

// 변경 후
/**
 * <h2>클래스 설명</h2>
 */
```

> `<h1>`은 클래스/메서드 이름에 예약되어 있으므로 `<h2>` 이하를 사용해야 한다.

### 의존성 업데이트

#### BouncyCastle

```groovy
// 변경 전
implementation 'org.bouncycastle:bcpkix-jdk15on:1.70'

// 변경 후
implementation 'org.bouncycastle:bcpkix-jdk18on:1.83'
```

#### MSSQL JDBC

```groovy
// 변경 전
implementation 'com.microsoft.sqlserver:mssql-jdbc:9.4.0.jre8'

// 변경 후
implementation 'com.microsoft.sqlserver:mssql-jdbc:12.6.1.jre11'
```

---

## Part 3: Spring Boot 업그레이드 (2.3.0 → 4.0.1)

### 루트 build.gradle

```groovy
plugins {
    // 변경 전
    id 'org.springframework.boot' version '2.3.0.RELEASE'
    id 'io.spring.dependency-management' version '1.0.9.RELEASE'

    // 변경 후
    id 'org.springframework.boot' version '4.0.1'
    id 'io.spring.dependency-management' version '1.1.7'
}
```

### javax → jakarta 마이그레이션

Spring Boot 3.0+에서는 Java EE (javax)가 Jakarta EE (jakarta)로 변경되었다.

#### 패키지 변경

| 변경 전                  | 변경 후                    |
|-----------------------|-------------------------|
| `javax.servlet.*`     | `jakarta.servlet.*`     |
| `javax.validation.*`  | `jakarta.validation.*`  |
| `javax.persistence.*` | `jakarta.persistence.*` |
| `javax.mail.*`        | `jakarta.mail.*`        |

#### 의존성 변경

```groovy
// 변경 전
compileOnly 'javax.servlet:javax.servlet-api'

// 변경 후
compileOnly 'jakarta.servlet:jakarta.servlet-api'
```

```groovy
// 변경 전
implementation 'com.sun.mail:javax.mail:1.6.2'

// 변경 후
implementation 'org.eclipse.angus:angus-mail:2.0.2'
```

#### Java 파일 수정

```java
// 변경 전

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.Cookie;

// 변경 후
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Cookie;
```

### MyBatis 업그레이드

```groovy
// 변경 전
implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.2.0'

// 변경 후
implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:4.0.1'
```

### HTTP Message Converter

Spring Boot 4에서는 Jackson 3 기반 메시지 컨버터가 자동 설정된다.

```java
// 변경 전 - 수동 Bean 등록
@Bean
public MappingJackson2HttpMessageConverter mappingJackson2HttpMessageConverter() {
	MappingJackson2HttpMessageConverter jsonConverter = new MappingJackson2HttpMessageConverter();
	jsonConverter.setDefaultCharset(StandardCharsets.UTF_8);
	return jsonConverter;
}

// 변경 후 - Bean 제거 (Spring Boot 자동 설정 사용)
// MappingJackson2HttpMessageConverter는 deprecated
```

---

## Part 4: Spring Batch 6 마이그레이션

Spring Boot 4.0은 Spring Batch 6.0을 사용한다.

### Deprecated 클래스 제거

| Deprecated (Batch 5)                    | 대체 (Batch 6)                    |
|-----------------------------------------|---------------------------------|
| `JobRepositoryFactoryBean`              | `JdbcDefaultBatchConfiguration` |
| `TaskExecutorJobLauncher`               | 자동 구성                           |
| `JobRegistrySmartInitializingSingleton` | 자동 구성                           |
| `JobRegistryBeanPostProcessor`          | 자동 구성                           |

### JdbcDefaultBatchConfiguration 사용

```java
// 변경 전 (Spring Batch 5)
@Configuration
public class BatchConfig {

	@Bean
	public JobRepository jobRepository(DataSource dataSource,
									   PlatformTransactionManager transactionManager) throws Exception {
		JobRepositoryFactoryBean factory = new JobRepositoryFactoryBean();
		factory.setDataSource(dataSource);
		factory.setTransactionManager(transactionManager);
		factory.setIsolationLevelForCreate("ISOLATION_SERIALIZABLE");
		factory.setMaxVarCharLength(2500);
		factory.afterPropertiesSet();
		return factory.getObject();
	}

	@Bean
	public JobLauncher jobLauncher(JobRepository jobRepository) throws Exception {
		TaskExecutorJobLauncher launcher = new TaskExecutorJobLauncher();
		launcher.setJobRepository(jobRepository);
		launcher.afterPropertiesSet();
		return launcher;
	}
}

// 변경 후 (Spring Batch 6)
@Configuration
public class BatchConfig extends JdbcDefaultBatchConfiguration {

	private final DataSource batchDataSource;
	private final PlatformTransactionManager batchTransactionManager;

	public BatchConfig(@Qualifier("batchDataSource") DataSource batchDataSource,
					   @Qualifier("batchTransactionManager") PlatformTransactionManager batchTransactionManager) {
		this.batchDataSource = batchDataSource;
		this.batchTransactionManager = batchTransactionManager;
	}

	@Override
	@Bean
	public DataSource getDataSource() {
		return this.batchDataSource;
	}

	@Override
	@Bean
	public PlatformTransactionManager getTransactionManager() {
		return this.batchTransactionManager;
	}
}
```

### Isolation Level 설정 변경

```java
// 변경 전 (Spring Batch 5)

import org.springframework.transaction.TransactionDefinition;

@Override
protected int getIsolationLevel() {
	return TransactionDefinition.ISOLATION_REPEATABLE_READ;
}

// 변경 후 (Spring Batch 6)
import org.springframework.transaction.annotation.Isolation;

@Override
protected Isolation getIsolationLevelForCreate() {
	return Isolation.REPEATABLE_READ;
}
```

### Isolation 값 매핑

| TransactionDefinition (int)  | Isolation (enum)             |
|------------------------------|------------------------------|
| `ISOLATION_DEFAULT`          | `Isolation.DEFAULT`          |
| `ISOLATION_READ_UNCOMMITTED` | `Isolation.READ_UNCOMMITTED` |
| `ISOLATION_READ_COMMITTED`   | `Isolation.READ_COMMITTED`   |
| `ISOLATION_REPEATABLE_READ`  | `Isolation.REPEATABLE_READ`  |
| `ISOLATION_SERIALIZABLE`     | `Isolation.SERIALIZABLE`     |

### 데이터베이스별 권장 설정

```java

@Override
protected Isolation getIsolationLevelForCreate() {
	String dbName = getDatabaseProductName();
	if (dbName != null) {
		if (dbName.toLowerCase().contains("microsoft sql server")) {
			return Isolation.REPEATABLE_READ;  // MSSQL
		} else if (dbName.toLowerCase().contains("postgresql")) {
			return Isolation.READ_COMMITTED;   // PostgreSQL
		}
	}
	return Isolation.SERIALIZABLE;  // 기본값
}

@Override
protected int getMaxVarCharLength() {
	String dbName = getDatabaseProductName();
	if (dbName != null && dbName.toLowerCase().contains("microsoft sql server")) {
		return 1250;  // MSSQL은 2500 초과 시 오류 발생 가능
	}
	return super.getMaxVarCharLength();  // 기본값 2500
}
```

---

## Part 5: Kotlin 추가 (2.2.0)

### 루트 build.gradle

```groovy
plugins {
    id 'org.jetbrains.kotlin.jvm' version '2.2.0' apply false
    id 'org.jetbrains.kotlin.plugin.spring' version '2.2.0' apply false
}

ext {
    set('kotlinVersion', "2.2.0")
}

subprojects {
    pluginManager.withPlugin('org.jetbrains.kotlin.jvm') {
        dependencies {
            implementation "org.jetbrains.kotlin:kotlin-stdlib:${kotlinVersion}"
            implementation "org.jetbrains.kotlin:kotlin-reflect:${kotlinVersion}"
        }

        compileKotlin {
            compilerOptions {
                freeCompilerArgs.add("-Xjsr305=strict")
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
            }
        }

        compileTestKotlin {
            compilerOptions {
                freeCompilerArgs.add("-Xjsr305=strict")
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
            }
        }
    }
}
```

### 서브모듈 build.gradle (Kotlin 사용 시)

```groovy
plugins {
    id 'org.jetbrains.kotlin.jvm'
    id 'org.jetbrains.kotlin.plugin.spring'
}
```

---

## Part 6: Jackson 3 마이그레이션 (2.x → 3.0.0)

### 의존성

```groovy
dependencies {
    // Jackson 3 databind
    implementation 'tools.jackson.core:jackson-databind:3.0.0'

    // Jackson annotations (2.20 버전 유지)
    implementation 'com.fasterxml.jackson.core:jackson-annotations:2.20'

    // 테스트용 Jackson 2 datetime 지원
    testImplementation 'com.fasterxml.jackson.datatype:jackson-datatype-jsr310'
}
```

### 패키지 변경

| 변경 전                                 | 변경 후                                      |
|--------------------------------------|-------------------------------------------|
| `com.fasterxml.jackson.core.*`       | `tools.jackson.core.*`                    |
| `com.fasterxml.jackson.databind.*`   | `tools.jackson.databind.*`                |
| `com.fasterxml.jackson.annotation.*` | `com.fasterxml.jackson.annotation.*` (유지) |

### 클래스명 변경

| 변경 전                     | 변경 후                   |
|--------------------------|------------------------|
| `JsonSerializer<T>`      | `ValueSerializer<T>`   |
| `JsonDeserializer<T>`    | `ValueDeserializer<T>` |
| `SerializerProvider`     | `SerializationContext` |
| `ObjectMapper.builder()` | `JsonMapper.builder()` |

### 메서드 시그니처 변경

```java
// 변경 전
@Override
public void serialize(T value, JsonGenerator gen, SerializerProvider provider) throws IOException {
}

// 변경 후 (throws IOException 제거 - unchecked exception 사용)
@Override
public void serialize(T value, JsonGenerator gen, SerializationContext ctxt) {
}
```

### JsonNode API 변경

```java
// 변경 전
root.fieldNames().

forEachRemaining(fieldName ->{
JsonNode node = root.get(fieldName);
    if(node instanceof ArrayNode){}
	if(node instanceof TextNode){}
	});

// 변경 후
	root.

properties().

forEach(entry ->{
String fieldName = entry.getKey();
JsonNode node = entry.getValue();
    if(node.

isArray()){}
	if(node.

isTextual()){}
	});
```

### 기본값 변경

| 설정          | Jackson 2  | Jackson 3    |
|-------------|------------|--------------|
| 날짜 직렬화      | 타임스탬프 (숫자) | ISO-8601 문자열 |
| 속성 정렬       | 선언 순서      | 알파벳 순서       |
| Java 8 Time | 모듈 필요      | 기본 내장        |

#### 속성 순서 유지

```java

@JsonPropertyOrder({"id", "name", "createdAt", "updatedAt"})
public class User {
}
```

---

## Part 7: 검증

### 빌드 확인

```bash
JAVA_HOME="/path/to/jdk21" ./gradlew clean build
```

### 테스트 실행

```bash
JAVA_HOME="/path/to/jdk21" ./gradlew test
```

### javax 잔여 확인

```bash
./gradlew dependencies | grep javax
```

---

## 참고 자료

- [Spring Boot 3.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide)
- [Spring Boot 4.0 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Release-Notes)
- [Spring Batch 6 Migration Guide](https://docs.spring.io/spring-batch/reference/whatsnew.html)
- [Spring Batch JobRepository Configuration](https://docs.spring.io/spring-batch/reference/job/configuring-repository.html)
- [Jackson 3 Migration Guide](https://github.com/FasterXML/jackson/blob/main/jackson3/MIGRATING_TO_JACKSON_3.md)
- [Gradle 9 Upgrade Guide](https://docs.gradle.org/current/userguide/upgrading_version_8.html)
- [Kotlin 2.0 Migration Guide](https://kotlinlang.org/docs/k2-compiler-migration-guide.html)
