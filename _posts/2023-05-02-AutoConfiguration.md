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




