---
layout: post
title: 토비의 스프링부트 - 이해와 원리
---

## 스프링 부트 살펴보기

### 스프링 부트 소개

스프링 부트(Spring Boot)는 스프링을 기반으로 실무 환경에 사용가능한 수준의 독립실행형 애플리케이션을 복잡한 고민 없이 빠르게 작성할 수 있게 도와주는 여러가지 도구의 모음이다.

> 스프링!=스프링부트!!

스프링 부트의 핵심 목표

- 매우 빠르고 광범위한 영역의 스프링 개발 경험을 제공
- 강한 주장을 가지고 즉시 적용 가능한 기술 조합을 제공하면서, 필요에 따라 원하는 방식으로 손쉽게 변형 가능
- 프로젝트에서 필요로 하는 다양한 비기능적인 기술(내장형 서버, 보안, 메트릭, 상태 체크, 외부 설정 방식 등) 재공
- 코드 생성이나 XML 설정을 필요로 하지 않음

### 스프링 부트의 역사

2012년 스프링 프레임워크 프로젝트에 이슈로 등록된 "Containerless 웹 개발 아키텍쳐의 지원" 요청에서 논의와 개발 시작

[https://github.com/spring-projects/spring-framework/issues/14521](https://github.com/spring-projects/spring-framework/issues/14521)

- 2013년 0.5.0.M1 공개
- 2014년 1.0 GA 공개
- 2018년 2.0 GA 굥개 (support spring v5)
- 2022년 2.7.5 공개
- 아마 2023년 3.0 (support spring v6) 공개 될 거 같다.

### Containerless 컨테이너리스 웹 애플리케이션 아키텍처 (Serverless)

**Container?**
WebClient가 request를 요청하면 Web Container가 동적 페이지를 구성한 WEB COMPONENT를 response 해준다.

자바용어로 바꾸면 WEB COMPONENT가 Servlet 이고 Web Container는 Servlet Container (대표적으로 Tomcat) 이다.
그 뒤에 위치 하고있는 Spring Container 가 서블릿 컨테이너 뒤쪽에서 서블릿을 통해서 웹으로 들어온 요청을 받아서 응답을 보내준다.

서블릿 컨테이너를 띄우는 일은 쉽지않다. (web.xml, war, deploy, install, config, classloader, logging...) 하지만
실제로는 서블릿 컨테이너가 동작 하지만 개발자가 설정을 신경 쓰지 않고 개발 할 수 있도록 스프링 어플리케이션을 만들 수 있도록 스프링 부트가 도와준다.

### Opinionated

내가 다 정해줄게 일단 개발만 해

**스프링 프레임워크**의 설계 철학

- 극단적인 유연함 추구
- 다양한 관점을 수용
- Not opinionated
- 수많은 선택지를 다 포용
- 하지만 ...

스프링 프레임워크를 선택하는 개발자들은 꽤 많은 시간을 들여서 어떤 기술을 어떻게 사용해야할지 일일이 선택해야한다.

**스프링 부트**의 설계 철학

- Opionionated - 자기 주장이 강한, 자기 의견을 고집하는, 독선적인
- 일단 정해주는 대로 빠르게 개발하고 고민은 나중에
- 스프링을 잘 화용하는 뛰어난 방법을 제공

사용 기술과 의존 라이브러리 결정

- 업계에서 검증된 스프링 생태계 프로젝트, 표준 자바기술, 오픈소스 기술의 종류와 의존관계, 사용 버전을 정해줌
- 각 기술을 스프링에 적용하는 방식(DI구성)과 디폴트 설정값 제공

유연한 확장

- 스프링 부트에 내당된 디폴트 구성을 커스텀마이징 하는 매우 자연스럽고 유연한 방법 제공
- 수프링 부탁 스프링을 사용하는 방식을 이애한다면 언제라도 스프링 부트를 제거 하고 원하는 방식으로 재구성 가능
- 스프링 부트처럼 기술과 구성을 간편하게 저공하는 나만의 모듈 작성

### 스프링 부트의 이해

스프링 부트를 이용한 개발 방법

- 부트가 결정한 기술과 구성, 디폴트 설정을 수용
- 외부 설정 파일을 이용한 설정 변경 방법을 화용
- 아주 빠르게 개발을 시작할 수 있다
- 하지만 ...

스프링 부트를 이용한 개발의 오해와 한계

- 애플리케이션 기능 코드만 잘 작성하면 된다
- 스프링을 몰라도 개발을 잘 할 수 있다
- 스프링 부탁 직접적으로 보여주지 않는 것은 몰라 된다
- 뭔가 기술적인 필요가 생기면 검색을 해서 해결한다

스프링 부트를 이해하게 되면

- 스프링 부트가 스프링의 기술을 어떻게 활용하는지 배우고 응용할 수 있다
- 스프링 부트가 선택한 기술, 자동으로 만들어주는 구성, 디폴트 설정이 어떤 것인지 확인할 수 있다
- 필요할 때 부트의 기본 구성을 수정하거나, 확장할 수 있다
- 나만의 스프링 부트 모듈을 만들어 활용할 수 있다

> 프레임워크를 효과적으로 재사용하기 위해서는 프레임워크의 최종 모습뿐만 아니라 현재의 모습을 띠게 되기까지 진화한
> 과정을 살펴보는 것이 가장 효과적이다. 프레임워크의 진화 과정속에는 프레임워크의 구성 원리 및 설계 원칙, 재사용 가능한 컨텍스트와
> 변경 가능성에 관련된 다양한 정보가 들어 있기 때문이다. - 조영호(프레임워크 3부)

## 스프링 부트 시작하기

### 개발환경 준비

- SpringBoot 2.7.6 기준
- JDK 8,11,17
    - 공개 JDK
        - Eclipse Temurin
        - Microsoft OpenJDK
        - Amazon Corretto
        - Azul JDK
        - Oracle JDK
    - [https://sdkman.io](https://sdkman.io)
    - jabba github

### 프로젝트 생성

스프링 부트 프로젝트 생성

- 웹 Spring Initializr - [https://start.sprin.io](https://start.sprin.io)
- IDE 의 Spring Initializr 프로젝트 생성 메뉴
- Spring Boot CLI
    1. spring shell
    2. init -b 2.7.6 -d web -g hyunjinspring -j 11 -n helloboot -x helloboot
    3. ./gradlew bootRun

### Hello 컨트롤러

### Hello API 테스트

- 웹 브라우저 개발자 도구
- curl
- HTTPie
- Intellij IDEA Ultimate- http request
- Postman API Platform
- JUnit Test
- 각종 API 테스트 도구

### HTTP 요청과 응답

**HTTP** 웹 Request와 Response의 기본 구조를 이해하고 내용을 확인할 수 있어야 한다

Request

- Request Line : Method, Path, HTTP Version
- Headers
- Message Body

Response

- Status Line: HTTP Version, Status Code, Status Text
- Headers
- Message Body

## 독립 실행형 서블릿 애플리케이션

### Containerless 개발 준비

`@SPringBootApllication`

### 서블릿 컨테이너 띄우기

~~~java
public class BootApplication {
    public static void main(String[] args) {
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer();
        webServer.start();
    }
}
~~~

~~~
http -v :8080
~~~

### 서블릿 등록

~~~java
public class BootApplication {
    public static void main(String[] args) {
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("hello", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    resp.setStatus(200);
                    resp.setHeader("Content-Type", "text/plain");
                    resp.getWriter().println("Hello Servlet");
                }
            }).addMapping("/hello");
        });
        webServer.start();
    }
}
~~~

~~~
http -v :8080/hello
~~~

### 서블릿 요청 처리

~~~java
public class BootApplication {
    public static void main(String[] args) {
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("hello", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    String name = req.getParameter("name");
                    resp.setStatus(HttpStatus.OK.value());
                    resp.setHeader(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_PLAIN_VALUE);
                    resp.getWriter().println("Hello Servlet" + name);
                }
            }).addMapping("/hello");
        });
        webServer.start();
    }
}
~~~

~~~
http -v ":8080/hello?name=Spring"
~~~

### 프론트 컨트롤러

- 서블릿 코드마다 중복 되는 패턴이 나옴.
- 기본적인 서블릿 req, res는 한계가 있음
- Front Controller 등장 중앙화된 컨트롤러 오브젝트를 만들어서 앞단에서 미리 처리
- 공통적인 작업으로 인증, 보안, 다국어처리, 모든 웹 처리에 대한 return 해줘야하는 내용 등

### 프론트 컨트롤러 전환

~~~java
public class BootApplication {
    public static void main(String[] args) {
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("frontcontroller", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    //인증, 보안, 다국어, 공통 기능
                    if (req.getRequestURI().equals("/hello") && req.getMethod().equals(HttpMethod.GET.name())) {
                        String name = req.getParameter("name");
                        resp.setStatus(HttpStatus.OK.value());
                        resp.setHeader(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_PLAIN_VALUE);
                        resp.getWriter().println("Hello Servlet" + name);
                    } else if (req.getRequestURI().equals("/user")) {

                    } else {
                        resp.setStatus(HttpStatus.NOT_FOUND.value());
                    }
                }
            }).addMapping("/*");
        });
        webServer.start();
    }
}
~~~

~~~
http -v POST ":8080/hello?name=Spring"
~~~

### Hello 컨트롤러 매핑과 바인딩

~~~java
public class BootApplication {
    public static void main(String[] args) {
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            HelloController helloController = new HelloController();
            servletContext.addServlet("frontcontroller", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    //인증, 보안, 다국어, 공통 기능
                    if (req.getRequestURI().equals("/hello") && req.getMethod().equals(HttpMethod.GET.name())) {
                        String name = req.getParameter("name");

                        String ret = helloController.hello(name);

                        resp.setStatus(HttpStatus.OK.value());
                        resp.setHeader(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_PLAIN_VALUE);
                        resp.getWriter().println(ret);
                    } else if (req.getRequestURI().equals("/user")) {

                    } else {
                        resp.setStatus(HttpStatus.NOT_FOUND.value());
                    }
                }
            }).addMapping("/*");
        });
        webServer.start();
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

> 스프링 애플리케이션도 결국 서블릿을 사용합니다. 그러니까 독립실행형 스프링 애플리케이션이 됐다고 해서 서블릿이 안 쓰이는 건 아닙니다. 다만 스프링은 단순 HTTP 요청을 처리하는 서블릿만 관리하는 서블릿
> 컨테이너와 달리 애플리케이션에서 사용되는 다양한 종류의 오브젝트를 만들어 관리하는 기능을 가지고 있습니다. 그 중에서 컨트롤러라고 불리는 것은 서블릿이 하던 작업을 더 효과적으로 처리하는 오브젝트로 스프링에서
> 동작하는 것이지요.
> 이해하신 대로 스프링도 서블릿을 이용해서 요청을 받아옵니다. 이 때 좀 특별한 종류의 서블릿인 프론트 컨트롤러라고 불리는 것이 사용되어지고요. 여기서 웹 요청을 처리하기 위한 많은 부가적인 작업이 일어납니다.
> 스프링 애플리케이션으로 만들어서 가장 좋은 점은 더 이상 서블릿 기술을 신경 쓰지 않아도 된다가 아닐까 싶습니다. 서블릿이 내부적으로 동작은 하지만요.

## 독립 실행형 스프링 애플리케이션

### 스프링 컨테이너 사용

~~~java
public class BootApplication {
    public static void main(String[] args) {

        GenericApplicationContext applicationContext = new GenericApplicationContext();
        applicationContext.registerBean(HelloController.class);
        applicationContext.refresh();

        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("frontcontroller", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    //인증, 보안, 다국어, 공통 기능
                    if (req.getRequestURI().equals("/hello") && req.getMethod().equals(HttpMethod.GET.name())) {
                        String name = req.getParameter("name");

                        HelloController helloController = applicationContext.getBean(HelloController.class);
                        String ret = helloController.hello(name);

                        resp.setContentType(MediaType.TEXT_PLAIN_VALUE);
                        resp.getWriter().println(ret);
                    } else {
                        resp.setStatus(HttpStatus.NOT_FOUND.value());
                    }
                }
            }).addMapping("/*");
        });
        webServer.start();
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

### 의존 오브젝트 추가

~~~java
public class HelloController {
    public String hello(String name) {
        SimpleHelloService simpleHelloService = new SimpleHelloService();
        return simpleHelloService.sayHello(Objects.requireNonNull(name));
    }
}
~~~

~~~java
public class SimpleHelloService {
    String sayHello(String name) {
        return "Hello" + name;
    }
}
~~~

### Dependency Injection

**Spring IoC/DI Container**
Interface를 상속 받아 구현한 Service를 Assembler를 통해서 주입 받는다. Assembler를 Spring Container라고 한다.

### 의존 오브젝트 DI 적용

~~~java
public interface HelloService {
    String sayHello(String name);
}
~~~

~~~java
public class SimpleHelloService implements HelloService {
    @Override
    public String sayHello(String name) {
        return "Hello" + name;
    }
}
~~~

~~~java
public class BootApplication {
    public static void main(String[] args) {

        GenericApplicationContext applicationContext = new GenericApplicationContext();
        applicationContext.registerBean(HelloController.class);
        applicationContext.registerBean(SimpleHelloService.class);
        applicationContext.refresh();

        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("frontcontroller", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
                    //인증, 보안, 다국어, 공통 기능
                    if (req.getRequestURI().equals("/hello") && req.getMethod().equals(HttpMethod.GET.name())) {
                        String name = req.getParameter("name");

                        HelloController helloController = applicationContext.getBean(HelloController.class);
                        String ret = helloController.hello(name);

                        resp.setContentType(MediaType.TEXT_PLAIN_VALUE);
                        resp.getWriter().println(ret);
                    } else {
                        resp.setStatus(HttpStatus.NOT_FOUND.value());
                    }
                }
            }).addMapping("/*");
        });
        webServer.start();
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

### DispatcherServlet으로 전환

~~~java
public class BootApplication {
    public static void main(String[] args) {

        //스프링 컨테이너
        GenericWebApplicationContext applicationContext = new GenericWebApplicationContext();
        applicationContext.registerBean(HelloController.class);
        applicationContext.registerBean(SimpleHelloService.class);
        applicationContext.refresh();

        //서블릿 컨테이너
        ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
        WebServer webServer = serverFactory.getWebServer(servletContext -> {
            servletContext.addServlet("dispatcherServlet",
                    new DispatcherServlet(applicationContext)
            ).addMapping("/*");
        });
        webServer.start();
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

404

### 애노테이션 매핑 정보 사용

~~~java

@RequestMapping
public class HelloController {

    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(name = "/hello")
    @ResponseBody
    public String hello(String name) {
        return helloService.sayHello(Objects.requireNonNull(name));
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

### 스프링 컨테이너로 통합

~~~java
public class BootApplication {
    public static void main(String[] args) {

        GenericWebApplicationContext applicationContext = new GenericWebApplicationContext() {
            @Override
            protected void onRefresh() {
                super.onRefresh();

                ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
                WebServer webServer = serverFactory.getWebServer(servletContext -> {
                    servletContext.addServlet("dispatcherServlet",
                            new DispatcherServlet(this)
                    ).addMapping("/*");
                });
                webServer.start();
            }
        };
        applicationContext.registerBean(HelloController.class);
        applicationContext.registerBean(SimpleHelloService.class);
        applicationContext.refresh();

    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

### 자바코드 구성 정보 사용

~~~java

@Configuration
public class BootApplication {
    public HelloController helloController(HelloService helloService) {
        return new HelloController(helloService);
    }

    public HelloService helloService() {
        return new SimpleHelloService();
    }

    public static void main(String[] args) {
        AnnotationConfigWebApplicationContext applicationContext = new AnnotationConfigWebApplicationContext() {
            @Override
            protected void onRefresh() {
                super.onRefresh();

                ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
                WebServer webServer = serverFactory.getWebServer(servletContext -> {
                    servletContext.addServlet("dispatcherServlet",
                            new DispatcherServlet(this)
                    ).addMapping("/*");
                });
                webServer.start();
            }
        };
        applicationContext.register(BootApplication.class);
        applicationContext.refresh();
    }
}
~~~

### @Component 스캔

~~~java

@Configuration
@ComponentScan
public class BootApplication {

    public static void main(String[] args) {
        AnnotationConfigWebApplicationContext applicationContext = new AnnotationConfigWebApplicationContext() {
            @Override
            protected void onRefresh() {
                super.onRefresh();

                ServletWebServerFactory serverFactory = new TomcatServletWebServerFactory();
                WebServer webServer = serverFactory.getWebServer(servletContext -> {
                    servletContext.addServlet("dispatcherServlet",
                            new DispatcherServlet(this)
                    ).addMapping("/*");
                });
                webServer.start();
            }
        };
        applicationContext.register(BootApplication.class);
        applicationContext.refresh();

    }
}
~~~

~~~java

@RequestMapping
@Component
public class HelloController {

    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(name = "/hello")
    @ResponseBody
    public String hello(String name) {
        return helloService.sayHello(Objects.requireNonNull(name));
    }
}
~~~

~~~java

@Component
public class SimpleHelloService implements HelloService {
    @Override
    public String sayHello(String name) {
        return "Hello" + name;
    }
}
~~~

~~~
http -v GET ":8080/hello?name=Spring"
~~~

**Meta Annotation** 
~~~java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Component
public @interface MyComponent {
}
~~~
계층형 아키텍처를 위해서 만든 경우가 있다. (stereotype)   
ex) @Controller, @Service, @Repository

~~~java
@RestController
public class HelloController {

    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(name = "/hello")
    public String hello(String name) {
        return helloService.sayHello(Objects.requireNonNull(name));
    }
}
~~~


### Bean의 생명주기 메소드
~~~java
@Configuration
@ComponentScan
public class BootApplication {

    @Bean
    public ServletWebServerFactory servletWebServerFactory() {
        return new TomcatServletWebServerFactory();
    }

    @Bean
    DispatcherServlet dispatcherServlet() {
        return new DispatcherServlet();
    }

    public static void main(String[] args) {
        AnnotationConfigWebApplicationContext applicationContext = new AnnotationConfigWebApplicationContext() {
            @Override
            protected void onRefresh() {
                super.onRefresh();

                ServletWebServerFactory serverFactory = this.getBean(ServletWebServerFactory.class);
                DispatcherServlet dispatcherServlet = this.getBean(DispatcherServlet.class);

                //아래를 주석 처리해도 컨테이너에 주입이됨 (Hierarchy 참고)
                //dispatcherServlet.setApplicationContext(this);

                WebServer webServer = serverFactory.getWebServer(servletContext -> {
                    servletContext.addServlet("dispatcherServlet", dispatcherServlet
                    ).addMapping("/*");
                });
                webServer.start();
            }
        };
        applicationContext.register(BootApplication.class);
        applicationContext.refresh();

    }
}
~~~

### SpringBootApplication
~~~java
public class MySpringApplication {

    public static void run(Class<?> applicationClass, String... args) {
        AnnotationConfigWebApplicationContext applicationContext = new AnnotationConfigWebApplicationContext() {
            @Override
            protected void onRefresh() {
                super.onRefresh();

                ServletWebServerFactory serverFactory = this.getBean(ServletWebServerFactory.class);
                DispatcherServlet dispatcherServlet = this.getBean(DispatcherServlet.class);

                //아래를 주석 처리해도 컨테이너에 주입이됨 (Hierarchy 참고)
                //dispatcherServlet.setApplicationContext(this);

                WebServer webServer = serverFactory.getWebServer(servletContext -> {
                    servletContext.addServlet("dispatcherServlet", dispatcherServlet
                    ).addMapping("/*");
                });
                webServer.start();
            }
        };
        applicationContext.register(applicationClass);
        applicationContext.refresh();
    }
}
~~~

~~~java
@Configuration
@ComponentScan
public class BootApplication {

    @Bean
    public ServletWebServerFactory servletWebServerFactory() {
        return new TomcatServletWebServerFactory();
    }

    @Bean
    DispatcherServlet dispatcherServlet() {
        return new DispatcherServlet();
    }

    public static void main(String[] args) {
        MySpringApplication.run(BootApplication.class, args);
    }

}
~~~

~~~java
@Configuration
@ComponentScan
public class BootApplication {

    @Bean
    public ServletWebServerFactory servletWebServerFactory() {
        return new TomcatServletWebServerFactory();
    }

    @Bean
    DispatcherServlet dispatcherServlet() {
        return new DispatcherServlet();
    }

    public static void main(String[] args) {
        SpringApplication.run(BootApplication.class, args);
    }

}
~~~

## DI와 테스트, 디자인 패턴

### 테스트 코드를 이용한 테스트
~~~java
public class HelloApiTest {
    @Test
    void helloApi() {
        TestRestTemplate rest = new TestRestTemplate();

        ResponseEntity<String> res =
                rest.getForEntity("http://localhost:8080/hello?name={name}", String.class, "Spring");

        // status 200
        Assertions.assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);

        // header(content-type) text/plain
        Assertions.assertThat(res.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE)).startsWith(MediaType.TEXT_PLAIN_VALUE);

        // body Hello Spring
        Assertions.assertThat(res.getBody()).isEqualTo("Hello Spring");
    }
}
~~~

### DI와 단위테스트
~~~java
class HelloServiceTest {
    @Test
    void simpleHelloService() {
        SimpleHelloService helloService = new SimpleHelloService();

        String ret = helloService.sayHello("Test");

        assertThat(ret).isEqualTo("Hello Test");
    }
}
~~~

~~~java
@RestController
public class HelloController {
    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        this.helloService = helloService;   // 인터페이스지만 스프링이 알아서 컨테이너 뒤져서 알아서 구현체 찾아서 넣어줌.
    }

    @GetMapping("/hello")
    public String hello(String name) {
        if (name == null || name.trim().length() == 0) throw new IllegalArgumentException();

        return helloService.sayHello(name);
    }
}
~~~

~~~java
class HelloControllerTest {
    @Test
    void helloController() {
        HelloController helloController = new HelloController(name -> name); //Lambda

        String ret = helloController.hello("Test");

        assertThat(ret).isEqualTo("Test");
    }

    @Test
    void failsHelloController() {
        HelloController helloController = new HelloController(name -> name);

        assertThatThrownBy(() -> {
            String ret = helloController.hello(null);
        }).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> {
            String ret = helloController.hello("");
        }).isInstanceOf(IllegalArgumentException.class);

    }
}
~~~


### DI를 이용한 Decorator, Proxy 패턴
~~~java
package com.nahwasa.practice.tobyspringboot;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

@Service
@Primary
public class HelloDecorator implements HelloService {
    private final HelloService helloService;

    public HelloDecorator(HelloService helloService) {
        this.helloService = helloService;
    }

    @Override
    public String sayHello(String name) {
        return "*" + helloService.sayHello(name) + "*";
    }
}
~~~

~~~java
class HelloServiceTest {
    @Test
    void simpleHelloService() {
        SimpleHelloService helloService = new SimpleHelloService();

        String ret = helloService.sayHello("Test");

        assertThat(ret).isEqualTo("Hello Test");
    }

    @Test
    void helloDecorator() {
        HelloDecorator helloService = new HelloDecorator(name -> name);

        String ret = helloService.sayHello("Test");

        assertThat(ret).isEqualTo("*Test*");
    }
}
~~~