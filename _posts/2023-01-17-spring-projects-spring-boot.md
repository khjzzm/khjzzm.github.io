---
layout: post
title: spring-projects/spring-boot v3.0.1
---

## https://github.com/spring-projects/spring-boot/releases/tag/v3.0.1

스프링 부트의 목적
- 모든 Spring 개발을 위해 근본적으로 더 빠르고 광범위하게 액세스할 수 있는 시작 경험을 제공합니다.
- 의견이 분분하지만 요구 사항이 기본값에서 벗어나기 시작하면 빨리 비켜야 합니다. (Be opinionated, but get out of the way quickly as requirements start to diverge from the defaults.)
- 대규모 프로젝트 클래스에 공통적인 다양한 비기능 기능을 제공합니다(예: 임베디드 서버, 보안, 메트릭, 상태 확인, 외부화된 구성).
- 코드 생성 및 XML 구성에 대한 요구 사항이 전혀 없습니다.


Here is a quick teaser of a complete Spring Boot application in Java:
~~~java
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.*;
import org.springframework.web.bind.annotation.*;

@RestController
@SpringBootApplication
public class Example {

    @RequestMapping("/")
    String home() {
        return "Hello World!";
    }

    public static void main(String[] args) {
        SpringApplication.run(Example.class, args);
    }

}
~~~

```bash
├── spring-boot-project
│   ├── spring-boot
│   ├── ...
│   ├── ....
├── spring-boot-system-tests
│   ├── spring-boot-deployment-tests
│   ├── spring-boot-image-tests
├── spring-boot-tests
│   ├── spring-boot-deployment-tests
│   ├── spring-boot-integration-tests
│   └── spring-boot-smoke-tests
└── 
``` 

### spring-boot
`src/main/java/org/springframework/boot`

Spring Boot의 다른 부분을 지원하는 기능을 제공하는 기본 라이브러리입니다. 여기에는 다음이 포함됩니다.

- `SpringApplication` 독립 실행형 Spring 애플리케이션을 작성하는 데 사용할 수 있는 정적 편의 메서드를 제공하는 클래스입니다 . 그것의 유일한 임무는 적절한 Spring을 생성하고 새로 고치는 것 `ApplicationContext`입니다.
- 컨테이너(Tomcat, Jetty 또는 Undertow)를 선택할 수 있는 임베디드 웹 애플리케이션.
- 일류 외부화된 구성 지원. (First-class externalized configuration support.)
- 합리적인 로깅 기본값에 대한 지원을 포함한 편리한 `ApplicationContext` 이니셜라이저.



### Common
`package-info.java` 패키지에 관한 설명 파일 작성되어있음.
~~~java
package org.springframework.boot.abc;
~~~