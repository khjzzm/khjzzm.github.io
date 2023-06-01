---
layout: post
title: Spring Boot Externalized Configuration
---

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