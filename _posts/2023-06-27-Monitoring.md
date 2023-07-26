---
layout: post
title: 마이크로미타, 프로메테우스, 그라파나
---

## 마이크로미터 소개
- 마이크로미터는 애플리케이션 메트릭 파사드라고 불리는데, 애플리케이션의 메트릭(측정 지표)을 마이크로미터가 정한 표준 방법으로 모아서 제공해준다.
- 쉽게 이야기해서 마이크로미터가 추상화를 통해서 구현체를 쉽게 갈아끼울 수 있도록 해두었다.
- 보통은 스프링이 이런 추상화를 직접 만들어서 제공하지만, 마이크로미터라는 이미 잘 만들어진 추상화가 있기 때문에 스프링은 이것을 활용한다. 스프링 부트 액츄에이터는 마이크로미터를 기본으로 내장해서 사용한다.
  - 로그를 추상화 하는 SLF4J 를 떠올려보면 쉽게 이해가 될 것이다.
- 개발자는 마이크로미터가 정한 표준 방법으로 메트릭(측정 지표)를 전달하면 된다. 그리고 사용하는 모니터링 툴에 맞는 구현체를 선택하면 된다. 이후에 모니터링 툴이 변경되어도 해당 구현체만 변경하면 된다. 애플리케이션 코드는 모니터링 툴이 변경되어도 그대로 유지할 수 있다.

[각 모니터링 툴에 대한 자세한 내용은 마이크로미터 공식 메뉴얼을 참고하자](https://micrometer.io/docs)


## 메트릭 확인하기
CPU, JVM, 커넥션 사용 등등 수 많은 지표들을 어떻게 수집해야 할까?
개발자가 각각의 지표를 직접 수집해서 그것을 마이크로미터가 제공하는 표준 방법에 따라 등록하면 된다. 다행히도 마이크로미터는 다양한 지표 수집 기능을 이미 만들어서 제공한다.
그리고 스프링 부트 액츄에이터는 마이크로미터가 제공하는 지표 수집을 @AutoConfiguration 을 통해 자동으로 등록해준다.

쉽게 이야기해서 스프링 부트 액츄에이터를 사용하면 수 많은 메트릭(지표)를 편리하게 사용할 수 있다. 이제 기본으로 제공하는 메트릭들을 확인해보자.
아직 모니터링 툴을 연결한 것은 아니고, 등록된 메트릭들을 확인해보는 단계이다.

~~~
http://localhost:9292/actuator/metrics
~~~

**자세히 확인하기**
metrics 엔드포인트는 다음과 같은 패턴을 사용해서 더 자세히 확인할 수 있다. http://localhost:8080/actuator/metrics/{name}

**Tag 필터**
availableTags 를 보면 다음과 같은 항목을 확인할 수 있다.
- tag:area , values[heap, nonheap]
- tag:id , values[G1 Survivor Space, ...]

해당 Tag를 기반으로 정보를 필터링해서 확인할 수 있다. tag=KEY:VALUE 과 같은 형식을 사용해야 한다.


**HTTP 요청수를 확인**
http://localhost:8080/actuator/metrics/http.server.requests   

HTTP 요청수에서 일부 내용을 필터링 해서 확인해보자. /log 요청만 필터 (사전에 /log 요청을 해야 확인할 수 있음)   
- http://localhost:8080/actuator/metrics/http.server.requests?tag=uri:/log
/log 요청 & HTTP Status = 200
- http://localhost:8080/actuator/metrics/http.server.requests?tag=uri:/log&tag=status:200


## 다양한 메트릭
마이크로미터와 액츄에이터가 기본으로 제공하는 다양한 메트릭을 확인해보자.

**JVM 메트릭**
- 시스템 메트릭
- 애플리케이션 시작 메트릭
- 스프링 MVC 메트릭
- 톰캣 메트릭
- 데이터 소스 메트릭
- 로그 메트릭
- 기타 수 많은 메트릭이 있다.
- 사용자가 메트릭을 직접 정의하는 것도 가능하다. 뒤에서 예제로 만들어본다.

**시스템 메트릭**
시스템 메트릭을 제공한다. system. , process. , disk. 으로 시작한다.
- CPU 지표
- 파일 디스크립터 메트릭 가동 시간 메트릭
- 사용 가능한 디스크 공간

**애플리케이션 시작 메트릭**
애플리케이션 시작 시간 메트릭을 제공한다.

- application.started.time : 애플리케이션을 시작하는데 걸리는 시간 (ApplicationStartedEvent 로 측정)
- application.ready.time : 애플리케이션이 요청을 처리할 준비가 되는데 걸리는 시간 (ApplicationReadyEvent 로 측정)

스프링은 내부에 여러 초기화 단계가 있고 각 단계별로 내부에서 애플리케이션 이벤트를 발행한다. 
- ApplicationStartedEvent : 스프링 컨테이너가 완전히 실행된 상태이다. 이후에 커맨드 라인 러너가 호출된다.
- ApplicationReadyEvent : 커맨드 라인 러너가 실행된 이후에 호출된다.

**스프링 MVC 메트릭**
스프링 MVC 컨트롤러가 처리하는 모든 요청을 다룬다. 메트릭 이름: http.server.requests

TAG 를 사용해서 다음 정보를 분류해서 확인할 수 있다.
- uri : 요청 URI
- method : GET , POST 같은 HTTP 메서드
- status : 200 , 400 , 500 같은 HTTP Status 코드
- exception : 예외
- outcome : 상태코드를 그룹으로 모아서 확인 1xx:INFORMATIONAL , 2xx:SUCCESS , 3xx:REDIRECTION , 4xx:CLIENT_ERROR , 5xx:SERVER_ERROR

**데이터소스 메트릭**
DataSource , 커넥션 풀에 관한 메트릭을 확인할 수 있다. jdbc.connections. 으로 시작한다.
최대 커넥션, 최소 커넥션, 활성 커넥션, 대기 커넥션 수 등을 확인할 수 있다.
히카리 커넥션 풀을 사용하면 hikaricp. 를 통해 히카리 커넥션 풀의 자세한 메트릭을 확인할 수 있다.

**로그 메트릭**
logback.events : logback 로그에 대한 메트릭을 확인할 수 있다.
trace, debug, info, warn, error 각각의 로그 레벨에 따른 로그 수를 확인할 수 있다. 예를 들어서 error 로그 수가 급격히 높아진다면 위험한 신호로 받아드릴 수 있다.

**톰캣 메트릭**
톰캣 메트릭은 tomcat. 으로 시작한다.
톰캣 메트릭을 모두 사용하려면 다음 옵션을 켜야한다. (옵션을 켜지 않으면 tomcat.session. 관련 정보만 노출된다.)

~~~
server:
  tomcat:
    mbeanregistry:
      enabled: true
~~~
톰캣의 최대 쓰레드, 사용 쓰레드 수를 포함한 다양한 메트릭을 확인할 수 있다.

**기타**
- HTTP 클라이언트 메트릭( RestTemplate , WebClient ) 캐시 메트릭
- 작업 실행과 스케줄 메트릭
- 스프링 데이터 리포지토리 메트릭
- 몽고DB 메트릭
- 레디스 메트릭

**사용자 정의 메트릭**
사용자가 직접 메트릭을 정의할 수도 있다. 예를 들어서 주문수, 취소수를 메트릭으로 만들 수 있다.
사용자 정의 메트릭을 만들기 위해서는 마이크로미터의 사용법을 먼저 이해해야 한다. 이 부분은 뒤에서 다룬다.

https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html#actuator.metrics.supported


## 프로메테우스
애플리케이션에서 발생한 메트릭을 그 순간만 확인하는 것이 아니라 과거 이력까지 함께 확인하려면 메트릭을 보관하는 DB가 필요하다. 
이렇게 하려면 어디선가 메트릭을 지속해서 수집하고 DB에 저장해야 한다. 프로메테우스가 바로 이런 역할을 담당한다.

### 그라파나
프로메테우스가 DB라고 하면, 이 DB에 있는 데이터를 불러서 사용자가 보기 편하게 보여주는 대시보드가 필요하다. 
그라파나는 매우 유연하고, 데이터를 그래프로 보여주는 툴이다. 수 많은 그래프를 제공하고, 프로메테우스를 포함한 다양한 데이터소스를 지원한다.

1. 스프링 부트 액츄에이터와 마이크로미터를 사용하면 수 많은 메트릭을 자동으로 생성한다. 
   - 마이크로미터 프로메테우스 구현체는 프로메테우스가 읽을 수 있는 포멧으로 메트릭을 생성한다.
2. 프로메테우스는 이렇게 만들어진 메트릭을 지속해서 수집한다.
3. 프로메테우스는 수집한 메트릭을 내부 DB에 저장한다.
4. 사용자는 그라파나 대시보드 툴을 통해 그래프로 편리하게 메트릭을 조회한다. 이때 필요한 데이터는 프로메테우스를 통해서 조회한다.


**포멧 차이**
- jvm.info -> jvm_info : 프로메테우스는 . 대신에 _ 포멧을 사용한다. . 대신에 _ 포멧으로 변환된 것을 확인할 수 있다.
- logback.events -> logback_events_total : 로그수 처럼 지속해서 숫자가 증가하는 메트릭을 카운터라 한다. 프로메테우스는 카운터 메트릭의 마지막에는 관례상 _total 을 붙인다.
- http.server.requests 이 메트릭은 내부에 요청수, 시간 합, 최대 시간 정보를 가지고 있었다. 프로메테우스에서는 다음 3가지로 분리된다.
  - http_server_requests_seconds_count : 요청 수 
  - http_server_requests_seconds_sum : 시간 합(요청수의 시간을 합함) 
  - http_server_requests_seconds_max : 최대 시간(가장 오래걸린 요청 수)
대략 이렇게 포멧들이 변경된다고 보면 된다. 포멧 변경에 대한 부분은 진행하면서 자연스럽게 알아보자.

### 프로메테우스 - 수집 설정
prometheus.yml
~~~yml
  - job_name: "spring-actuator"
    metrics_path: '/actuator/prometheus'
    scrape_interval: 1s
    static_configs:
      - targets: ['localhost:4463']
~~~

- job_name : 수집하는 이름이다. 임의의 이름을 사용하면 된다. 
- metrics_path : 수집할 경로를 지정한다.
- scrape_interval : 수집할 주기를 설정한다.
- targets : 수집할 서버의 IP, PORT를 지정한다.
