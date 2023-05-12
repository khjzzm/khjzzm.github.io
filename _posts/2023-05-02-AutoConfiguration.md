---
layout: post
title: Spring Boot Auto Configuration
---


## 스프링 부트의 자동 구성
스프링 부트는 자동 구성(Auto Configuration)이라는 기능을 제공하는데, 일반적으로 자주 사용하는 수 많은 빈들을 자동으로 등록해주는 기능이다.
앞서 우리가 살펴보았던 JdbcTemplate , DataSource , TransactionManager 모두 스프링 부트가 자동 구성을 제공해서 자동으로 스프링 빈으로 등록된다.

이러한 자동 구성 덕분에 개발자는 반복적이고 복잡한 빈 등록과 설정을 최소화 하고 애플리케이션 개발을 빠르게 시작할 수 있다.

스프링 부트는 `spring-boot-autoconfigure` 라는 프로젝트 안에서 수 많은 자동 구성을 제공한다. JdbcTemplate 을 설정하고 빈으로 등록해주는 자동 구성을 확인해보자.

### JdbcTemplateAutoConfiguration
~~~java
package org.springframework.boot.autoconfigure.jdbc;
  import javax.sql.DataSource;
  import org.springframework.boot.autoconfigure.AutoConfiguration;
  import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
  import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
  import org.springframework.boot.autoconfigure.condition.ConditionalOnSingleCandidate;
  import org.springframework.boot.context.properties.EnableConfigurationProperties;
  import org.springframework.boot.sql.init.dependency.DatabaseInitializationDependencyConfigurer;
  import org.springframework.context.annotation.Import;
  import org.springframework.jdbc.core.JdbcTemplate;
  import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
  @AutoConfiguration(after = DataSourceAutoConfiguration.class)
  @ConditionalOnClass({ DataSource.class, JdbcTemplate.class })
  @ConditionalOnSingleCandidate(DataSource.class)
  @EnableConfigurationProperties(JdbcProperties.class)
  @Import({ DatabaseInitializationDependencyConfigurer.class,
  JdbcTemplateConfiguration.class,
        NamedParameterJdbcTemplateConfiguration.class })
  public class JdbcTemplateAutoConfiguration {
}
~~~

- @AutoConfiguration : 자동 구성을 사용하려면 이 애노테이션을 등록해야 한다.
  - 자동 구성도 내부에 @Configuration 이 있어서 빈을 등록하는 자바 설정 파일로 사용할 수 있다.
  - after = DataSourceAutoConfiguration.class
    - 자동 구성이 실행되는 순서를 지정할 수 있다. JdbcTemplate 은 DataSource 가 필요하기 때문에 DataSource 를 자동으로 등록해주는 DataSourceAutoConfiguration 다음에 실행하도록 설정되어 있다.
  - @ConditionalOnClass({ DataSource.class, JdbcTemplate.class })
    - IF문과 유사한 기능을 제공한다. 이런 클래스가 있는 경우에만 설정이 동작한다. 만약 없으면 여기 있는 설정들이 모두 무효화 되고, 빈도 등록되지 않는다.
    - @ConditionalXxx 시리즈가 있다. 자동 구성의 핵심이므로 뒤에서 자세히 알아본다.
    - JdbcTemplate 은 DataSource , JdbcTemplate 라는 클래스가 있어야 동작할 수 있다.
  - @Import : 스프링에서 자바 설정을 추가할 때 사용한다.


### JdbcTemplateConfiguration
~~~java
 @Configuration(proxyBeanMethods = false)
  @ConditionalOnMissingBean(JdbcOperations.class)
  class JdbcTemplateConfiguration {
    @Bean
    @Primary
    JdbcTemplate jdbcTemplate(DataSource dataSource, JdbcProperties properties) {
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        JdbcProperties.Template template = properties.getTemplate();
        jdbcTemplate.setFetchSize(template.getFetchSize());
        jdbcTemplate.setMaxRows(template.getMaxRows());
        if (template.getQueryTimeout() != null) {
            jdbcTemplate.setQueryTimeout((int)
                    template.getQueryTimeout().getSeconds());
        }
        return jdbcTemplate;
    }
}
~~~
- @Configuration : 자바 설정 파일로 사용된다. @ConditionalOnMissingBean(JdbcOperations.class)
- JdbcOperations 빈이 없을 때 동작한다.
  - JdbcTemplate 의 부모 인터페이스가 바로 JdbcOperations 이다.
  - 쉽게 이야기해서 JdbcTemplate 이 빈으로 등록되어 있지 않은 경우에만 동작한다.
  - 만약 이런 기능이 없으면 내가 등록한 JdbcTemplate 과 자동 구성이 등록하는 JdbcTemplate 이 중복 등록되는 문제가 발생할 수 있다.
  - 보통 개발자가 직접 빈을 등록하면 개발자가 등록한 빈을 사용하고, 자동 구성은 동작하지 않는다.
- JdbcTemplate 이 몇가지 설정을 거쳐서 빈으로 등록되는 것을 확인할 수 있다.

자동 등록 설정
다음과 같은 자동 구성 기능들이 다음 빈들을 등록해준다.
- JdbcTemplateAutoConfiguration : JdbcTemplate
- DataSourceAutoConfiguration : DataSource 
- DataSourceTransactionManagerAutoConfiguration : TransactionManager   
그래서 개발자가 직접 빈을 등록하지 않아도 JdbcTemplate , DataSource , TransactionManager 가 스프링 빈으로 등록된 것이다.

[스프링 부트가 제공하는 자동 구성(AutoConfiguration)](https://docs.spring.io/spring-boot/docs/current/reference/html/auto-configuration-classes.html)


**자동 설정**
Configuration 이라는 단어가 컴퓨터 용어에서는 환경 설정, 설정이라는 뜻으로 자주 사용된다. Auto Configuration은 크게 보면 빈들을 자동으로 등록해서 스프링이 동작하는 환경을 자동으로 설정해주기 때문에 자동 설정이라는 용어도 맞다.

**자동 구성**
Configuration 이라는 단어는 구성, 배치라는 뜻도 있다.
예를 들어서 컴퓨터라고 하면 CPU, 메모리등을 배치해야 컴퓨터가 동작한다. 이렇게 배치하는 것을 구성이라 한다.
스프링도 스프링 실행에 필요한 빈들을 적절하게 배치해야 한다. 자동 구성은 스프링 실행에 필요한 빈들을 자동으로 배치해주는 것이다.

자동 설정, 자동 구성 두 용어 모두 맞는 말이다. 자동 설정은 넓게 사용되는 의미이고, 자동 구성은 실행에 필요한 컴포넌트 조각을 자동으로 배치한다는 더 좁은 의미에 가깝다.

- Auto Configuration은 자동 구성이라는 단어를 주로 사용하고, 문맥에 따라서 자동 설정이라는 단어도 사용하겠다.
- Configuration이 단독으로 사용될 때는 설정이라는 단어를 사용하겠다.

**정리**
스프링 부트가 제공하는 자동 구성 기능을 이해하려면 다음 두 가지 개념을 이해해야 한다.
- `@Conditional` : 특정 조건에 맞을 때 설정이 동작하도록 한다.
- `@AutoConfiguration` : 자동 구성이 어떻게 동작하는지 내부 원리 이해

[@자동구성 직접만들기 github](https://github.com/khjzzm/yeoboya-lunch/tree/45bda96ab2e421921fe2c3ecf8ede8efe3a280c6)


## 순수 라이브러리 만들기

`@AutoConfiguration` 을 이해하기 위해서는 그 전에 먼저 라이브러리가 어떻게 사용되는지 이해하는 것이 필요하다.
여러분이 만든 실시간 자바 Memory 조회 기능이 좋다고 소문이 나서, 여러 프로젝트에서 사용하고 싶어한다. 이 기능을 여러곳에서 사용할 수 있도록 라이브러리로 만들어보자.
참고로 라이브러리를 만들 때는 스프링 부트 플러그인 기능을 사용하지 않고 진행한다.


**빌드하기**
- 다음 명령어로 빌드하자. 
  - ./gradlew clean build
- 빌드 결과
  - build/libs/memory-v1.jar
- 다음 명령어를 사용해서 압축을 풀어서 내용을 확인해보자. 
  - jar -xvf memory-v1.jar

**JAR를 푼 결과**
META-INF
- MANIFEST.MF
memory
- MemoryFinder.class
- MemoryController.class
- Memory.class

memory-v1.jar 는 스스로 동작하지는 못하고 다른 곳에 포함되어서 동작하는 라이브러리이다. 이제 이 라이브러리를 다른 곳에서 사용해보자.

~~~gradle
dependencies {
      implementation files('libs/memory-v1.jar') //추가
      implementation 'org.springframework.boot:spring-boot-starter-web'
      compileOnly 'org.projectlombok:lombok'
      annotationProcessor 'org.projectlombok:lombok'
      testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
~~~

**정리** ㅡ
- 외부 라이브러리를 직접 만들고 또 그것을 프로젝트에 라이브러리로 불러서 적용해보았다.
- 그런데 라이브러리를 사용하는 클라이언트 개발자 입장을 생각해보면, 라이브러리 내부에 있는 어떤 빈을 등록해야하는지 알아야 하고, 그것을 또 하나하나 빈으로 등록해야 한다. 지금처럼 간단한 라이브러리가 아니라 초기 설정이 복잡하다면 사용자 입장에서는 상당히 귀찮은 작업이 될 수 있다.
- 이런 부분을 자동으로 처리해주는 것이 바로 스프링 부트 자동 구성(Auto Configuration)이다.


## 자동 구성 라이브러리 만들기


## 자동 구성 이해 1 - 스프링 부트의 동작
스프링 부트는 다음 경로에 있는 파일을 읽어서 스프링 부트 자동 구성으로 사용한다.
```
resources/META-INF/spring/ org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

spring-boot-autoconfigure - org.springframework.boot.autoconfigure.AutoConfiguration.imports
```
org.springframework.boot.autoconfigure.aop.AopAutoConfiguration
org.springframework.boot.autoconfigure.cache.CacheAutoConfiguration
org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration
org.springframework.boot.autoconfigure.context.MessageSourceAutoConfiguration
org.springframework.boot.autoconfigure.context.PropertyPlaceholderAutoConfiguration
org.springframework.boot.autoconfigure.dao.PersistenceExceptionTranslationAutoConfiguration
org.springframework.boot.autoconfigure.data.jdbc.JdbcRepositoriesAutoConfiguration
org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration
org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration
org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
org.springframework.boot.autoconfigure.http.HttpMessageConvertersAutoConfiguration
org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration
org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration
org.springframework.boot.autoconfigure.thymeleaf.ThymeleafAutoConfiguration
org.springframework.boot.autoconfigure.transaction.TransactionAutoConfiguration
org.springframework.boot.autoconfigure.validation.ValidationAutoConfiguration
org.springframework.boot.autoconfigure.web.servlet.error.ErrorMvcAutoConfiguration
org.springframework.boot.autoconfigure.web.servlet.HttpEncodingAutoConfiguration
org.springframework.boot.autoconfigure.web.servlet.MultipartAutoConfiguration
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration
...
```

스프링 부트 자동 구성이 동작하는 원리는 다음 순서로 확인할 수 있다. 
`@SpringBootApplication` -> `@EnableAutoConfiguration` -> `@Import(AutoConfigurationImportSelector.class)`


**@SpringBootApplication**
~~~java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = { @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class), @Filter(type = FilterType.CUSTOM, classes =
AutoConfigurationExcludeFilter.class) })
public @interface SpringBootApplication {...}
~~~

여기서 우리가 주목할 애노테이션은 @EnableAutoConfiguration 이다. 이름 그대로 자동 구성을 활성화 하는 기능을 제공한다.


**@EnableAutoConfiguration**
~~~java
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {...}
~~~
@Import 는 주로 스프링 설정 정보( @Configuration )를 포함할 때 사용한다.
그런데 AutoConfigurationImportSelector 를 열어보면 @Configuration 이 아니다.

## 자동 구성 이해2 - ImportSelector
@Import 에 설정 정보를 추가하는 방법은 2가지가 있다.
- 정적인 방법: @Import (클래스) 이것은 정적이다. 코드에 대상이 딱 박혀 있다. 설정으로 사용할 대상을 동적으로 변경할 수 없다.
- 동적인 방법: @Import ( ImportSelector ) 코드로 프로그래밍해서 설정으로 사용할 대상을 동적으로 선택할 수 있다.

**정적인 방법**
스프링에서 다른 설정 정보를 추가하고 싶으면 다음과 같이 @Import 를 사용하면 된다.
~~~java
  @Configuration
  @Import({AConfig.class, BConfig.class})
  public class AppConfig {...}
~~~
그런데 예제처럼 AConfig , BConfig 가 코드에 딱 정해진 것이 아니라, 특정 조건에 따라서 설정 정보를 선택해야 하는 경우에는 어떻게 해야할까?


**동적인 방법**
스프링은 설정 정보 대상을 동적으로 선택할 수 있는 ImportSelector 인터페이스를 제공한다.

~~~java
package org.springframework.context.annotation;
public interface ImportSelector {
  String[] selectImports(AnnotationMetadata importingClassMetadata);
//...
}
~~~

스프링 부트 자동 구성이 동작하는 원리는 다음 순서로 확인할 수 있다.
`@SpringBootApplication` -> `@EnableAutoConfiguration` -> `@Import(AutoConfigurationImportSelector.class)`
-> `resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 파일을 열어서 설정 정보 선택 해당 파일의 설정 정보가 스프링 컨테이너에 등록되고 사용


## 정리
스프링 부트의 자동 구성을 직접 만들어서 사용할 때는 다음을 참고하자.
- @AutoConfiguration 에 자동 구성의 순서를 지정할 수 있다.
- @AutoConfiguration 도 설정 파일이다. 내부에 @Configuration 이 있는 것을 확인할 수 있다. 하지만 일반 스프링 설정과 라이프사이클이 다르기 때문에 컴포넌트 스캔의 대상이 되면 안된다.
- 파일에 지정해서 사용해야 한다.
- 그래서 스프링 부트가 제공하는 컴포넌트 스캔에서는 @AutoConfiguration 을 제외하는 AutoConfigurationExcludeFilter 필터가 포함되어 있다.

## 자동 구성을 언제 사용하는가?
- AutoConfiguration 은 라이브러리를 만들어서 제공할 때 사용하고, 그 외에는 사용하는 일이 거의 없다. 왜냐하면 보통 필요한 빈들을 컴포넌트 스캔하거나 직접 등록하기 때문이다. 하지만 라이브러리를 만들어서 제공할 때는 자동 구성이 유용하다. 실제로 다양한 외부 라이브러리들이 자동 구성을 함께 제공한다.
- 보통 이미 만들어진 라이브러리를 가져다 사용하지, 반대로 라이브러리를 만들어서 제공하는 경우는 매우 드물다. 그럼 자동 구성은 왜 알아두어야 할까?
- 자동 구성을 알아야 하는 진짜 이유는 개발을 진행 하다보면 사용하는 특정 빈들이 어떻게 등록된 것인지 확인이 필요할 때가 있다. 이럴 때 스프링 부트의 자동 구성 코드를 읽을 수 있어야 한다. 그래야 문제가 발생했을 때 대처가 가능하다. 자동화는 매우 편리한 기능이지만 자동화만 믿고 있다가 실무에서 문제가 발생했을 때는 파고 들어가서 문제를 확인하는 정도는 이해해야 한다. 이번에 학습한 정도면 자동 구성 코드를 읽는데 큰 어려움은 없을 것이다.
 