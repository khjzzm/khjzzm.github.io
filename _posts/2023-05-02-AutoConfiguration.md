---
layout: post
title: Spring Boot Auto Configuration
---


## 스프링 부트의 자동 구성
스프링 부트는 자동 구성(Auto Configuration)이라는 기능을 제공하는데, 일반적으로 자주 사용하는 수 많은 빈들을 자동으로 등록해주는 기능이다.
앞서 우리가 살펴보았던 JdbcTemplate , DataSource , TransactionManager 모두 스프링 부트가 자동 구성을 제공해서 자동으로 스프링 빈으로 등록된다.

이러한 자동 구성 덕분에 개발자는 반복적이고 복잡한 빈 등록과 설정을 최소화 하고 애플리케이션 개발을 빠르게 시작할 수 있다.


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


