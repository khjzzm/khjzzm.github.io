---
layout: post
title: Spring Boot Externalized Configuration
---

# 외부설정과 프로필1
## OS 환경 변수

OS 환경 변수(OS environment variables)는 해당 OS를 사용하는 모든 프로그램에서 읽을 수 있는
설정값이다. 한마디로 다른 외부 설정과 비교해서 사용 범위가 가장 넓다.

조회 방법

- 윈도우 OS: set
- MAC, 리눅스 OS: printenv

~~~java
package hello.external;

import lombok.extern.slf4j.Slf4j;

import java.util.Map;

@Slf4j
public class OsEnv {
    public static void main(String[] args) {
        Map<String, String> envMap = System.getenv();
        for (String key : envMap.keySet()) {
            log.info("env {}={}", key, System.getenv(key));
        }
    }
    //DBURL = dev.db.com    //개발서버
    //DBURL = prod.db.com   //운영서버
}
~~~

하지만 OS 환경 변수는 이 프로그램 뿐만 아니라 다른 프로그램에서도 사용할 수 있다. 쉽게 이야기해서 전역 변수 같은 효과가 있다. 여러 프로그램에서 사용하는 것이 맞을 때도 있지만,
해당 애플리케이션을 사용하는 자바 프로그램 안에서만 사용되는 외부 설정값을 사용하고 싶을 때도 있다. 다음에는 특정 자바 프로그램안에서 사용하는 외부 설정을 알아보자.

## 자바 시스템 속성

자바 시스템 속성(Java System properties)은 실행한 JVM 안에서 접근 가능한 외부 설정이다. 추가로
자바가 내부에서 미리 설정해두고 사용하는 속성들도 있다.

자바 시스템 속성은 다음과 같이 자바 프로그램을 실행할 때 사용한다.

- 예) java -Durl=dev -jar app.jar
- -D VM 옵션을 통해서 key=value 형식을 주면 된다.
- 이 예제는 url=dev 속성이 추가된다. 순서에 주의해야 한다. -D 옵션이 -jar 보다 앞에 있다.

~~~java
package hello.external;

import lombok.extern.slf4j.Slf4j;

import java.util.Properties;

@Slf4j
public class JavaSystemProperties {
    public static void main(String[] args) {
        Properties properties = System.getProperties();
        for (Object key : properties.keySet()) {
            log.info("prop {}={}", key, System.getProperty(String.valueOf(key)));
        }
    }
}
~~~

JavaSystemProperties - 추가

~~~java
package hello.external;

import lombok.extern.slf4j.Slf4j;

import java.util.Properties;

@Slf4j
public class JavaSystemProperties {
    public static void main(String[] args) {
        Properties properties = System.getProperties();
        for (Object key : properties.keySet()) {
            log.info("prop {}={}", key,
                    System.getProperty(String.valueOf(key)));
        }
        String url = System.getProperty("url");
        String username = System.getProperty("username");
        String password = System.getProperty("password");
        log.info("url={}", url);
        log.info("username={}", username);
        log.info("password={}", password);
    }
}
~~~

-Durl=devdb -Dusername=dev_user -Dpassword=dev_pw

- Jar 실행
  jar로 빌드되어 있다면 실행시 다음과 같이 자바 시스템 속성을 추가할 수 있다.
  `java -Durl=devdb -Dusername=dev_user -Dpassword=dev_pw -jar app.jar`

## 커맨드 라인 인수

커맨드 라인 인수(Command line arguments)는 애플리케이션 실행 시점에 외부 설정값을 main(args) 메서드의 args 파라미터로 전달하는 방법이다.

다음과 같이 사용한다.

- 예) java -jar app.jar dataA dataB
- 필요한 데이터를 마지막 위치에 스페이스로 구분해서 전달하면 된다. 이 경우 dataA , dataB 2개의 문자가 args 에 전달된다.

## 커맨드 라인 옵션 인수

일반적인 커맨드 라인 인수
커맨드 라인에 전달하는 값은 형식이 없고, 단순히 띄어쓰기로 구분한다.

- aaa bbb [aaa, bbb] 값 2개
- hello world [hello, world] 값 2개
- "hello world" [hello world] (공백을 연결하려면 " 를 사용하면 된다.) 값 1개
- key=value [key=value] 값 1개

**커맨드 라인 옵션 인수(command line option arguments)**
커맨드 라인 인수를 key=value 형식으로 구분하는 방법이 필요하다. 그래서 스프링에서는 커맨드 라인 인수를 key=value 형식으로 편리하게 사용할 수 있도록 스프링 만의 표준 방식을 정의했는데, 그것이 바로
커맨드 라인 옵션 인수이다.

스프링은 커맨드 라인에 -(dash) 2개( -- )를 연결해서 시작하면 key=value 형식으로 정하고 이것을 커맨드 라인 옵션 인수라 한다.

- --key=value 형식으로 사용한다.
- --username=userA --username=userB 하나의 키에 여러 값도 지정할 수 있다

~~~java
package hello.external;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.DefaultApplicationArguments;

import java.util.List;
import java.util.Set;

@Slf4j
public class CommandLineV2 {
    public static void main(String[] args) {
        for (String arg : args) {
            log.info("arg {}", arg);
        }
        ApplicationArguments appArgs = new DefaultApplicationArguments(args);
        log.info("SourceArgs = {}", List.of(appArgs.getSourceArgs()));
        log.info("NonOptionArgs = {}", appArgs.getNonOptionArgs());
        log.info("OptionNames = {}", appArgs.getOptionNames());
        Set<String> optionNames = appArgs.getOptionNames();
        for (String optionName : optionNames) {
            log.info("option args {}={}", optionName,
                    appArgs.getOptionValues(optionName));
        }
        List<String> url = appArgs.getOptionValues("url");
        List<String> username = appArgs.getOptionValues("username");
        List<String> password = appArgs.getOptionValues("password");
        List<String> mode = appArgs.getOptionValues("mode");
        log.info("url={}", url);
        log.info("username={}", username);
        log.info("password={}", password);
        log.info("mode={}", mode);
    }
}
~~~

**실행**
커맨드 라인 인수를 다음과 같이 입력하고 실행해보자
`--url=devdb --username=dev_user --password=dev_pw mode=on`
이해를 돕기 위해 -- (dash)가 없는 mode=on 이라는 옵션도 마지막에 추가했다.

여기서 커맨드 라인 옵션 인수와, 옵션 인수가 아닌 것을 구분할 수 있다.

**옵션 인수**

- -- 로 시작한다.
- --url=devdb
- --username=dev_user
- --password=dev_pw

**옵션 인수가 아님**

- -- 로 시작하지 않는다. mode=on

**실행결과**

~~~
arg --url=devdb
arg --username=dev_user
arg --password=dev_pw
arg mode=on
SourceArgs = [--url=devdb, --username=dev_user, --password=dev_pw, mode=on]
NonOptionArgs = [mode=on]
OptionNames = [password, url, username]
option args password=[dev_pw]
option args url=[devdb]
option args username=[dev_user]
url=[devdb]
username=[dev_user]
password=[dev_pw]
mode=null
~~~

참고

- 참고로 옵션 인수는 --username=userA --username=userB 처럼 하나의 키에 여러 값을 포함할 수 있기 때문에 appArgs.getOptionValues(key) 의 결과는 리스트(
  List )를 반환한다.
- 커맨드 라인 옵션 인수는 자바 언어의 표준 기능이 아니다. 스프링이 편리함을 위해 제공하는 기능이다.

## 커맨드 라인 옵션 인수와 스프링 부트

스프링 부트는 커맨드 라인을 포함해서 커맨드 라인 옵션 인수를 활용할 수 있는 ApplicationArguments 를 스프링 빈으로 등록해둔다.
그리고 그 안에 입력한 커맨드 라인을 저장해둔다. 그래서 해당 빈을 주입 받으면 커맨드 라인으로 입력한 값을 어디서든 사용할 수 있다.

~~~java
package hello;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

@Slf4j
@Component
public class CommandLineBean {
    private final ApplicationArguments arguments;

    public CommandLineBean(ApplicationArguments arguments) {
        this.arguments = arguments;
    }

    @PostConstruct
    public void init() {
        log.info("source {}", List.of(arguments.getSourceArgs()));
        log.info("optionNames {}", arguments.getOptionNames());
        Set<String> optionNames = arguments.getOptionNames();
        for (String optionName : optionNames) {
            log.info("option args {}={}", optionName, arguments.getOptionValues(optionName));
        }
    }
}
~~~

## 외부 설정 - 스프링 통합

외부 설정값이 어디에 위치하든 상관없이 일관성 있고, 편리하게 key=value 형식의 외부 설정값을 읽을 수 있으면 사용하는 개발자 입장에서 더 편리하고
또 외부 설정값을 설정하는 방법도 더 유연해질 수 있다. 예를 들어서 외부 설정값을 OS 환경변수를 사용하다가 자바 시스템 속성으로 변경하는 경우에
소스코드를 다시 빌드하지 않고 그대로 사용할 수 있다.

스프링은 이 문제를 `Environment` 와 `PropertySource` 라는 추상화를 통해서 해결한다.

**PropertySource**

- org.springframework.core.env.PropertySource
- 스프링은 PropertySource 라는 추상 클래스를 제공하고, 각각의 외부 설정를 조회하는 XxxPropertySource 구현체를 만들어두었다.
    - CommandLinePropertySource
    - SystemEnvironmentPropertySource
- 스프링은 로딩 시점에 필요한 PropertySource 들을 생성하고, Environment 에서 사용할 수 있게 연결해둔다.

**Environment**

- org.springframework.core.env.Environment
- Environment 를 통해서 특정 외부 설정에 종속되지 않고, 일관성 있게 key=value 형식의 외부 설정에 접근할 수 있다.
    - environment.getProperty(key) 를 통해서 값을 조회할 수 있다.
    - Environment 는 내부에서 여러 과정을 거쳐서 PropertySource 들에 접근한다.
    - 같은 값이 있을 경우를 대비해서 스프링은 미리 우선순위를 정해두었다. (뒤에서 설명한다.)
- 모든 외부 설정은 이제 `Environment` 를 통해서 조회하면 된다.

**설정 데이터(파일)**
여기에 우리가 잘 아는 application.properties, application.yml 도 PropertySource에 추가된다.
따라서 Environment 를 통해서 접근할 수 있다.

~~~java
package hello;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class EnvironmentCheck {
    private final Environment env;

    public EnvironmentCheck(Environment env) {
        this.env = env;
    }

    @PostConstruct
    public void init() {
        String url = env.getProperty("url");
        String username = env.getProperty("username");
        String password = env.getProperty("password");
        log.info("env url={}", url);
        log.info("env username={}", username);
        log.info("env password={}", password);
    }
}
~~~
**커맨드 라인 옵션 인수 실행**
  - --url=devdb --username=dev_user --password=dev_pw

**자바 시스템 속성 실행**
  - -Durl=devdb -Dusername=dev_user -Dpassword=dev_pw

**정리**
커맨드라인옵션인수,자바시스템속성모두 Environment 를 통해서 동일한방법 으로 읽을 수 있는 것을 확인했다.
스프링은 Environment 를 통해서 외부 설정을 읽는 방법을 추상화했다. 덕분에 자바 시스템 속성을 사용하다가 만약 커맨드 라인 옵션 인수를 사용하도록 읽는 방법이 변경되어도, 개발 소스 코드는 전혀 변경하지 않아도 된다.

**우선순위**
예를 들어서 커맨드 라인 옵션 인수와 자바 시스템 속성을 다음과 같이 중복해서 설정하면 어떻게 될까?

우선순위는 상식 선에서 딱 2가지만 기억하면 된다.
더 유연한 것이 우선권을 가진다. (변경하기 어려운 파일 보다 실행시 원하는 값을 줄 수 있는 자바 시스템 속성이 더 우선권을 가진다.)
범위가 넒은 것 보다 좁은 것이 우선권을 가진다. (자바 시스템 속성은 해당 JVM 안에서 모두 접근할 수있다. 반면에 커맨드라인 옵션인수는 main의 arg를 통해서 들어오기 때문에 접근범위가 더 좁다.)
자바 시스템 속성과 커맨드 라인 옵션 인수의 경우 커맨드 라인 옵션 인수의 범위가 더 좁기 때문에 커맨드 라인 옵션 인수가 우선권을 가진다.
우선순위는 뒤에서 더 자세히 다루겠다.


## 설정 데이터1 - 외부파일
지금까지 학습한 OS 환경 변수, 자바 시스템 속성, 커맨드 라인 옵션 인수는 사용해야 하는 값이 늘어날 수 록 사용하기가 불편해진다. 실무에서는 수십개의 설정값을 사용하기도 하므로 이런 값들을 프로그램을 실행할 때 마다 입력하게 되면 번거롭고, 관리도 어렵다.

그래서 등장하는 대안으로는 설정값을 파일에 넣어서 관리하는 방법이다. 그리고 애플리케이션 로딩 시점에 해당 파일을 읽어들이면 된다. 그 중에서도 .properties 라는 파일은 key=value 형식을 사용해서 설정값을 관리하기에 아주 적합하다.

예를 들면 개발 서버와 운영 서버 각각에 application.properties 라는 같은 이름의 파일을 준비해둔다.
그리고 애플리케이션 로딩 시점에 해당 파일을 읽어서 그 속에 있는 값들을 외부 설정값으로 사용하면 된다.
참고로 파일 이름이 같으므로 애플리케이션 코드는 그대로 유지할 수 있다.

**스프링과 설정 데이터**
개발자가 파일을 읽어서 설정값으로 사용할 수 있도록 개발을 해야겠지만, 스프링 부트는 이미 이런 부분을 다 구현해두었다.
개발자는 `application.properties` 라는 이름의 파일을 자바를 실행하는 위치에 만들어 두기만 하면 된다.
그러면 스프링이 해당 파일을 읽어서 사용할 수 있는 PropertySource 의 구현체를 제공한다. 
스프링에서는 이러한 application.properties 파일을 설정 데이터(Config data) 라 한다.
당연히 설정 데이터도 Environment 를 통해서 조회할 수 있다.


남은 문제
- 외부 설정을 별도의 파일로 관리하게 되면 설정 파일 자체를 관리하기 번거로운 문제가 발생한다.
- 서버가 10대면 변경사항이 있을 때 10대 서버의 설정 파일을 모두 각각 변경해야 하는 불편함이 있다. 
- 설정 파일이 별도로 관리되기 때문에 설정값의 변경 이력을 확인하기 어렵다. 특히 설정값의 변경 이력이 프로젝트 코드들과 어떻게 영향을 주고 받는지 그 이력을 같이 확인하기 어렵다.

## 설정 데이터2 - 내부 파일 분리
설정 파일을 외부에 관리하는 것은 상당히 번거로운 일이다. 설정을 변경할 때 마다 서버에 들어가서 각각의
변경 사항을 수정해두어야 한다.(물론 이것을 자동화 하기 위해 노력할 수는 있다)

이 문제를 해결하는 간단한 방법은 설정 파일을 프로젝트 내부에 포함해서 관리하는 것이다. 그리고 빌드 시점에 함께 빌드되게 하는 것이다.
이렇게 하면 애플리케이션을 배포할 때 설정 파일의 변경 사항도 함께 배포할 수 있다. 쉽게 이야기해서 jar 하나로 설정 데이터까지 포함해서 관리하는 것이다.

1. 프로젝트 안에 소스 코드 뿐만 아니라 각 환경에 필요한 설정 데이터도 함께 포함해서 관리한다.
  - 개발용 설정 파일: application-dev.properties
  - 운영용 설정 파일: application-prod.properties
2. 빌드 시점에 개발, 운영 설정 파일을 모두 포함해서 빌드한다.
3. app.jar 는 개발, 운영 두 설정 파일을 모두 가지고 배포된다.
4. 실행할 때 어떤 설정 데이터를 읽어야 할지 최소한의 구분은 필요하다.
   - 개발 환경이라면 application-dev.properties 를 읽어야 하고,
   - 운영 환경이라면 application-prod.properties 를 읽어야 한다.
   - 실행할 때 외부 설정을 사용해서 개발서버는 dev 라는 값을 제공하고, 운영서버는 prod 라는값을 제공하자. 편의상 이 값을 프로필이라 하자.
     - dev 프로필이 넘어오면 application-dev.properties 를 읽어서 사용한다.
     - prod 프로필이 넘어오면 application-prod.properties 를 읽어서 사용한다.

외부 설정으로 넘어온 프로필 값이 dev 라면 application-dev.properties 를 읽고 prod 라면 application-prod.properties 를 읽어서 사용하면 된다.
스프링은 이미 설정 데이터를 내부에 파일로 분리해두고 외부 설정값(프로필)에 따라 각각 다른 파일을 읽는 방법을 다 구현해두었다.


실행
- IDE에서 커맨드 라인 옵션 인수 실행 `--spring.profiles.active=dev`
- IDE에서 자바 시스템 속성 실행 `-Dspring.profiles.active=dev`

Jar 실행
- ./gradlew clean build
- build/libs 로 이동
- java -Dspring.profiles.active=dev -jar external-0.0.1-SNAPSHOT.jar
- java -jar external-0.0.1-SNAPSHOT.jar --spring.profiles.active=dev

**남은 문제**
설정 파일을 각각 분리해서 관리하면 한눈에 전체가 들어오지 않는 단점이 있다.


## 설정 데이터3 - 내부 파일 합체
설정 파일을 각각 분리해서 관리하면 한눈에 전체가 들어오지 않는 단점이 있다.
스프링은 이런 단점을 보완하기 위해 물리적인 하나의 파일 안에서 논리적으로 영역을 구분하는 방법을 제공한다.

~~~properties
spring.config.activate.on-profile=dev
url=dev.db.com
username=dev_user
password=dev_pw
#---
spring.config.activate.on-profile=prod
url=prod.db.com
username=prod_user
password=prod_pw
~~~

- 기존에는 dev 환경은 application-dev.properties , prod 환경은 application-prod.properties 파일이 필요했다.
- 스프링은 하나의 application.properties 파일 안에서 논리적으로 영역을 구분하는 방법을 제공한다.
- application.properties 라는 하나의 파일 안에서 논리적으로 영역을 나눌 수 있다.
    - application.properties 구분 방법 #--- 또는 !--- (dash 3)
    - application.yml 구분 방법 --- (dash 3) 
- 프로필에 따라 논리적으로 구분된 설정 데이터를 활성화 하는 방법
  - spring.config.activate.on-profile 에 프로필 값 지정
  

## 우선순위 - 설정 데이터
프로필을 적용하지 않고 실행하면 해당하는 프로필이 없으므로 키를 각각 조회하면 값은 null 이 된다.

**실행 결과**
~~~
No active profile set, falling back to 1 default profile: "default"
...
env url=null
env username=null
env password=null
~~~
실행 결과를 보면 첫줄에 활성 프로필이 없어서 default 라는 이름의 프로필이 활성화 되는 것을 확인할 수 있다.
프로필을 지정하지 않고 실행하면 스프링은 기본으로 default 라는 이름의 프로필을 사용한다.

단순하게 문서를 위에서 아래로 순서대로 읽으면서 값을 설정한다. 이때 기존 데이터가 있으면 덮어쓴다.
논리 문서에 spring.config.activate.on-profile 옵션이 있으면 해당 프로필을 사용할 때만 논리 문서를 적용한다.

## 우선순위 - 전체
스프링 부트는 같은 애플리케이션 코드를 유지하면서 다양한 외부 설정을 사용할 수 있도록 지원한다.
[외부 설정에 대한 우선순위 - 스프링 공식 문서](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.external-config)

자주 사용하는 우선순위 (우선순위는 위에서 아래로 적용된다. 아래가 더 우선순위가 높다.)
- 설정 데이터( application.properties )
- OS 환경변수
- 자바 시스템 속성
- 커맨드 라인 옵션 인수
- @TestPropertySource (테스트에서 사용)

설정 데이터 우선순위
- jar 내부 application.properties
- jar 내부 프로필 적용 파일 application-{profile}.properties 
- jar 외부 application.properties
- jar 외부 프로필 적용 파일 application-{profile}.properties

**우선순위 이해 방법**
우선순위는 상식 선에서 딱 2가지만 생각하면 된다.
- 더 유연한 것이 우선권을 가진다. (변경하기 어려운 파일 보다 실행시 원하는 값을 줄 수 있는 자바 시스템 속성이 더 우선권을 가진다.)
- 범위가 넒은 것 보다 좁은 것이 우선권을 가진다.
  - OS 환경변수 보다 자바 시스템 속성이 우선권이 있다.
  - 자바 시스템 속성 보다 커맨드 라인 옵션 인수가 우선권이 있다.


**정리**
이렇게 우선순위에 따라서 설정을 추가하거나 변경하는 방식은 상당히 편리하면서도 유연한 구조를 만들어준다.
실무에서 대부분의 개발자들은 applicaiton.properties 에 외부 설정값들을 보관한다. 
이렇게 설정 데이터를 기본으로 사용하다가 일부 속성을 변경할 필요가 있다면 더 높은 우선순위를 가지는 자바 시스템 속성이나 커맨드 라인 옵션 인수를 사용하면 되는 것이다.
또는 기본적으로 application.properties 를 jar 내부에 내장하고 있다가, 
특별한 환경에서는 application.properties 를 외부 파일로 새로 만들고 변경하고 싶은 일부 속성만 입력해서 변경하는 것도 가능하다.

# 외부설정과 프로필2
## 외부 설정 사용 - Environment
다음과 같은 외부 설정들은 스프링이 제공하는 Environment 를 통해서 일관된 방식으로 조회할 수 있다.
**다양한 외부 설정 읽기** 스프링은 `Environment` 는 물론이고 Environment 를 활용해서 더 편리하게 외부 설정을 읽는 방법들을 제공한다.

스프링이 지원하는 다양한 외부 설정 조회 방법
- Environment
- @Value - 값 주입
- @ConfigurationProperties - 타입 안전한 설정 속성

**참고 - properties 캐밥 표기법**
properties 는 자바의 낙타 표기법( maxConnection )이 아니라 소문자와 - (dash)를 사용하는 캐밥 표기법( max-connection )을 주로 사용한다.
참고로 이곳에 자바의 낙타 표기법을 사용한다고 해서 문제가 되는 것은 아니다. 스프링은 properties 에 캐밥 표기법을 권장한다.


Environment.getProperty(key, Type) 를 호출할 때 타입 정보를 주면 해당 타입으로 변환해준다. (스프링 내부 변환기가 작동한다.)
- `env.getProperty("my.datasource.etc.max-connection", Integer.class)` : 문자 숫자로 변환
- `env.getProperty("my.datasource.etc.timeout", Duration.class)` : 문자 Duration (기간) 변환
- `env.getProperty("my.datasource.etc.options", List.class)` : 문자 [A,B] )


**정리**
application.properties 에 필요한 외부 설정을 추가하고, Environment 를 통해서 해당 값들을 읽어서, MyDataSource 를 만들었다. 향후 외부 설정 방식이 달라져도, 예를 들어서 설정 데이터
(application.properties)를 사용하다가 커맨드 라인 옵션 인수나 자바 시스템 속성으로 변경해도 애플리케이션 코드를 그대로 유지할 수 있다.

**단점**
이 방식의 단점은 Environment 를 직접 주입받고, env.getProperty(key) 를 통해서 값을 꺼내는 과정을 반복해야 한다는 점이다. 스프링은 @Value 를 통해서 외부 설정값을 주입 받는 더욱 편리한 기능을 제공한다.


## 외부설정 사용 - @Value
`@Value` 를 사용하면 외부 설정값을 편리하게 주입받을 수 있다.
참고로 `@Value` 도 내부에서는 `Environment` 를 사용한다.

기본값
만약키를 찾지못할 경우코드 에서 기본값을 사용하려면 다음과같이 : 뒤에 기본값을 적어주면 된다.
예) `@Value("${my.datasource.etc.max-connection:1}")` : key 가 없는 경우 1 을 사용한다.

**정리**
application.properties 에 필요한 외부 설정을 추가하고, @Value 를 통해서 해당 값들을 읽어서, MyDataSource 를 만들었다.

**단점**
@Value 를 사용하는 방식도 좋지만, @Value 로 하나하나 외부 설정 정보의 키 값을 입력받고, 주입 받아와야 하는 부분이 번거롭다. 
그리고 설정 데이터를 보면 하나하나 분리되어 있는 것이 아니라 정보의 묶음으로 되어 있다. 여기서는 my.datasource 부분으로 묶여있다. 
이런 부분을 객체로 변환해서 사용할 수 있다면 더 편리하고 더 좋을 것이다.

## 외부설정 사용 - @ConfigurationProperties 시작
Type-safe Configuration Properties
스프링은 외부 설정의 묶음 정보를 객체로 변환하는 기능을 제공한다. 이것을 타입 안전한 설정 속성이라 한다.
객체를 사용하면 타입을 사용할 수 있다. 따라서 실수로 잘못된 타입이 들어오는 문제도 방지할 수 있고, 객체를 통해서 활용할 수 있는 부분들이 많아진다. 쉽게 이야기해서 외부 설정을 자바 코드로 관리할 수 있는 것이다. 그리고 설정 정보 그 자체도 타입을 가지게 된다.

~~~java
package hello.datasource;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties("my.datasource")
public class MyDataSourcePropertiesV1 {
  private String url;
  private String username;
  private String password;
  private Etc etc = new Etc();

  @Data
  public static class Etc {
    private int maxConnection;
    private Duration timeout;
    private List<String> options = new ArrayList<>();
  }
}
~~~
- 외부 설정을 주입 받을 객체를 생성한다. 그리고 각 필드를 외부 설정의 키 값에 맞추어 준비한다.
- @ConfigurationProperties 이 있으면 외부 설정을 주입 받는 객체라는 뜻이다. 여기에 외부 설정 KEY 의 묶음 시작점인 my.datasource 를 적어준다.
- 기본 주입 방식은 자바빈 프로퍼티 방식이다. Getter , Setter 가 필요하다. (롬복의 @Data 에 의해 자동 생성된다.)

**@ConfigurationPropertiesScan**
@ConfigurationProperties 를 하나하나 직접 등록할 때는 @EnableConfigurationProperties 를 사용한다.
@EnableConfigurationProperties(MyDataSourcePropertiesV1.class) @ConfigurationProperties 를 특정 범위로 자동 등록할 때는
@ConfigurationPropertiesScan 을 사용하면 된다.

**문제**
MyDataSourcePropertiesV1 은 스프링 빈으로 등록된다. 그런데 Setter 를 가지고 있기 때문에 누군가 실수로 값을 변경하는 문제가 발생할 수 있다.
여기에 있는 값들은 외부 설정값을 사용해서 초기에만 설정되고, 이후에는 변경하면 안된다. 
이럴 때 Setter 를 제거하고 대신에 생성자를 사용하면 중간에 데이터를 변경하는 실수를 근본적으로 방지할 수 있다.
이런 문제가 없을 것 같지만, 한번 발생하면 정말 잡기 어려운 버그가 만들어진다. 대부분의 개발자가 MyDataSourcePropertiesV1 의 값은 변경하면 안된다고
인지하고 있지만, 어떤 개발자가 자신의 문제를 해결하기 위해 setter 를 통해서 값을 변경하게 되면, 애플리케이션 전체에 심각한 버그를 유발할 수 있다.
좋은 프로그램은 제약이 있는 프로그램이다.

## 외부설정 사용 - @ConfigurationProperties 생성자
@ConfigurationProperties 는 Getter, Setter를 사용하는 자바빈 프로퍼티 방식이 아니라 생성자를
통해서 객체를 만드는 기능도 지원한다. 다음 코드를 통해서 확인해보자.

**참고 @ConstructorBinding**
스프링 부트 3.0 이전에는 생성자 바인딩 시에 @ConstructorBinding 애노테이션을 필수로 사용해야 했다.
스프링 부트 3.0 부터는 생성자가 하나일 때는 생략할 수 있다. 생성자가 둘 이상인 경우에는 사용할 생성자에 @ConstructorBinding 애노테이션을 적용하면 된다.

**정리**
application.properties 에 필요한 외부 설정을 추가하고, @ConfigurationProperties 의 생성자 주입을 통해서 값을 읽어들였다. 
Setter 가 없으므로 개발자가 중간에 실수로 값을 변경하는 문제가 발생하지 않는다.

**문제**
타입과 객체를 통해서 숫자에 문자가 들어오는 것 같은 기본적인 타입 문제들은 해결이 되었다. 
그런데 타입은 맞는데 숫자의 범위가 기대하는 것과 다르면 어떻게 될까? 예를 들어서 max-conneciton 의 값을 0 으로 설정하면 커넥션이 
하나도 만들어지지 않는 심각한 문제가 발생한다고 가정해보자.
max-conneciton 은 최소 1 이상으로 설정하지 않으면 애플리케이션 로딩 시점에 예외를 발생시켜서 빠르게 문제를 인지할 수 있도록 하고 싶다.


## 외부설정 사용 - @ConfigurationProperties 검증
@ConfigurationProperties 를 통해서 숫자가 들어가야 하는 부분에 문자가 입력되는 문제와 같은 타입이 맞지 않는 데이터를 입력하는 문제는 예방할 수 있다. 
그런데 문제는 숫자의 범위라던가, 문자의 길이 같은 부분은 검증이 어렵다.
예를 들어서 최대 커넥션 숫자는 최소1 최대 999라는 범위를 가져야 한다면 어떻게 검증할 수 있을까? 이메일을 외부 설정에 입력했는데, 만약 이메일 형식에 맞지 않는다면 어떻게 검증할 수 있을까?

개발자가 직접 하나하나 검증 코드를 작성해도 되지만, 자바에는 `자바 빈 검증기(java bean validation)` 이라는 훌륭한 표준 검증기가 제공된다.
@ConfigurationProperties 은 자바 객체이기 때문에 스프링이 자바 빈 검증기를 사용할 수 있도록 지원한다.
자바 빈 검증기를 사용하려면 `spring-boot-starter-validation` 이 필요하다. 

`jakarta.validation.constraints.Max` 패키지 이름에 jakarta.validation 으로 시작하는 것은 자바 표준 검증기에서 지원하는 기능이다.
`org.hibernate.validator.constraints.time.DurationMax` 패키지 이름에 org.hibernate.validator 로 시작하는 것은 자바 표준 검증기에서 아직 표준화 된
기능은 아니고, 하이버네이트 검증기라는 표준 검증기의 구현체에서 직접 제공하는 기능이다. 대부분 하이버네이트 검증기를 사용하므로 이 부분이 크게 문제가 되지는 않는다.

**정리**
`ConfigurationProperties` 덕분에 타입 안전하고, 또 매우 편리하게 외부 설정을 사용할 수 있다. 그리고 검증기 덕분에 쉽고 편리하게 설정 정보를 검증할 수 있다.
가장 좋은 예외는 컴파일 예외, 그리고 애플리케이션 로딩 시점에 발생하는 예외이다. 가장 나쁜 예외는 고객 서비스 중에 발생하는 런타임 예외이다.


ConfigurationProperties 장점
- 외부 설정을 객체로 편리하게 변환해서 사용할 수 있다. 
- 외부 설정의 계층을 객체로 편리하게 표현할 수 있다.
- 외부 설정을 타입 안전하게 사용할 수 있다.
- 검증기를 적용할 수 있다.
  
## YAML
스프링은 설정 데이터를 사용할 때 application.properties 뿐만 아니라 application.yml 이라는 형식도 지원한다.
`YAML(YAML Ain't Markup Language)`은 사람이 읽기 좋은 데이터 구조를 목표로 한다. 확장자는 yaml , yml 이다. 주로 yml 을 사용한다.

**주의**
`application.properties`, `application.yml` 을 같이 사용하면 `application.properties` 가 우선권을 가진다.
이것을 둘이 함께 사용하는 것은 일관성이 없으므로 권장하지 않는다. 참고로 실무에서는 설정 정보가 많아서 보기 편한 yml 을 선호한다.