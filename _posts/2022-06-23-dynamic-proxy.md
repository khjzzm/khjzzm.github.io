---
layout: post
title: 동적 프록시 기술
tags: [java]
---

## 리플렉션
프록시를 사용해서 기존 코드를 변경하지 않고, 부가기능을 적용할 수 있었다. 그런데 문제는 대상 클래스 수 만큼 프록시 클래스를 만들어야 한다는 점이다.
자바가 기본으로 제공하는 JDK 동적 프록시 기술이나 CGLIB 같은 프록시 생성 오픈소스 기술을 활용하면 프록시 객체를 동적으로 만들어낼 수 있다.
쉽게 이야기해서 프록시 클래스를 계속 만들지 않아도 된다는 것이다. 프록시를 적용할 코드를 하나만 만들어두고 `동적 프록시 기술`을 사용해서
프록시 객체를 찍어내면 된다.

JDK 동적 프록시를 이해하기 위해서는 먼저 자바의 리플렉션 기술을 이해해야 한다.
리플렉션 기술을 사용하면 클래스나 메서드의 메타정보를 동적으로 획득하고, 코드도 동적으로 호출할 수 있다.

~~~java
    log.info("start");
    String result = target.callA();
    log.info("result={}", result);
    
    log.info("start");
    String result = target.callB();
    log.info("result={}", result);
~~~
호출하는 메서드인 target.callA() , target.callB() 이 부분만 동적으로 처리할 수 있다면 문제를 해결할 수 있을 듯 하다.

>람다를 사용해서 공통화 하는 것도 가능하다. 여기서는 람다를 사용하기 어려운 상황이라 가정하자. 그리고 리플렉션 학습이 목적이니 리플렉션에 집중하자.

~~~java
@Test
void reflection1() throws Exception {
    //클래스 정보
    Class classHello =Class.forName("hello.proxy.jdkdynamic.ReflectionTest$Hello");
    Hello target = new Hello();
    
    //callA 메서드 정보
    Method methodCallA = classHello.getMethod("callA");
    Object result1 = methodCallA.invoke(target);
    log.info("result1={}", result1);
    
    //callB 메서드 정보
    Method methodCallB = classHello.getMethod("callB");
    Object result2 = methodCallB.invoke(target);
    log.info("result2={}", result2);
}
~~~

- Class.forName("hello.proxy.jdkdynamic.ReflectionTest$Hello") : 클래스 메타정보를
획득한다. 참고로 내부 클래스는 구분을 위해 $ 를 사용한다.
- classHello.getMethod("call") : 해당 클래스의 call 메서드 메타정보를 획득한다.
- methodCallA.invoke(target) : 획득한 메서드 메타정보로 실제 인스턴스의 메서드를 호출한다. 여기서
methodCallA 는 Hello 클래스의 callA() 이라는 메서드 메타정보이다.
methodCallA.invoke(인스턴스) 를 호출하면서 인스턴스를 넘겨주면 해당 인스턴스의 callA() 메서드를
찾아서 실행한다. 여기서는 target 의 callA() 메서드를 호출한다.

그런데 target.callA() 나 target.callB() 메서드를 직접 호출하면 되지 이렇게 메서드 정보를
획득해서 메서드를 호출하면 어떤 효과가 있을까? 여기서 중요한 핵심은 클래스나 메서드 정보를 동적으로
변경할 수 있다는 점이다.

기존의 callA() , callB() 메서드를 직접 호출하는 부분이 Method 로 대체되었다. 덕분에 이제 공통
로직을 만들 수 있게 되었다.

~~~java
@Test
void reflection2() throws Exception {
    Class classHello =Class.forName("hello.proxy.jdkdynamic.ReflectionTest$Hello");
    Hello target = new Hello();
    
    Method methodCallA = classHello.getMethod("callA");
    dynamicCall(methodCallA, target);
    
    Method methodCallB = classHello.getMethod("callB");
    dynamicCall(methodCallB, target);
}

private void dynamicCall(Method method, Object target) throws Exception {
    log.info("start");
    Object result = method.invoke(target);
    log.info("result={}", result);
}
~~~
정적인 target.callA() , target.callB() 코드를 리플렉션을 사용해서 Method 라는 메타정보로
추상화했다. 덕분에 공통 로직을 만들 수 있게 되었다.

리플렉션을 사용하면 클래스와 메서드의 메타정보를 사용해서 애플리케이션을 동적으로 유연하게 만들 수
있다. 하지만 리플렉션 기술은 런타임에 동작하기 때문에, 컴파일 시점에 오류를 잡을 수 없다.
예를 들어서 지금까지 살펴본 코드에서 getMethod("callA") 안에 들어가는 문자를 실수로
getMethod("callZ") 로 작성해도 컴파일 오류가 발생하지 않는다. 그러나 해당 코드를 직접 실행하는
시점에 발생하는 오류인 런타임 오류가 발생한다.
가장 좋은 오류는 개발자가 즉시 확인할 수 있는 컴파일 오류이고, 가장 무서운 오류는 사용자가 직접 실행할
때 발생하는 런타임 오류다.

따라서 리플렉션은 일반적으로 사용하면 안된다. 지금까지 프로그래밍 언어가 발달하면서 타입 정보를
기반으로 컴파일 시점에 오류를 잡아준 덕분에 개발자가 편하게 살았는데, 리플렉션은 그것에 역행하는
방식이다.

리플렉션은 프레임워크 개발이나 또는 매우 일반적인 공통 처리가 필요할 때 부분적으로 주의해서 사용해야
한다.


## JDK 동적 프록시
동적 프록시 기술을 사용하면 개발자가 직접 프록시 클래스를 만들지 않아도 된다. 이름 그대로 프록시
객체를 동적으로 런타임에 개발자 대신 만들어준다. 그리고 동적 프록시에 원하는 실행 로직을 지정할 수 있다.

**JDK 동적 프록시는 인터페이스를 기반으로 프록시를 동적으로 만들어준다. 따라서 인터페이스가 필수이다.**

~~~java
package hello.proxy.jdkdynamic.code;

public interface AInterface {
    String call();
}
~~~

~~~java
package hello.proxy.jdkdynamic.code;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class AImpl implements AInterface {
    @Override
    public String call() {
        log.info("A 호출");
        return "a";
    }
}
~~~

JDK 동적 프록시에 적용할 로직은 `InvocationHandler` 인터페이스를 구현해서 작성하면 된다.

~~~java
package java.lang.reflect;

public interface InvocationHandler {
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable;
}
~~~
제공되는 파라미터는 다음과 같다.
- Object proxy : 프록시 자신
- Method method : 호출한 메서드
- Object[] args : 메서드를 호출할 때 전달한 인수

~~~java
package hello.proxy.jdkdynamic.code;

import lombok.extern.slf4j.Slf4j;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

@Slf4j
public class TimeInvocationHandler implements InvocationHandler {
    private final Object target;

    public TimeInvocationHandler(Object target) {
        this.target = target;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        log.info("TimeProxy 실행");
        long startTime = System.currentTimeMillis();
        Object result = method.invoke(target, args);
        long endTime = System.currentTimeMillis();
        long resultTime = endTime - startTime;
        log.info("TimeProxy 종료 resultTime={}", resultTime);
        return result;
    }
}
~~~
- TimeInvocationHandler 은 InvocationHandler 인터페이스를 구현한다. 이렇게해서 JDK 동적 프록시에 적용할 공통 로직을 개발할 수 있다.
- Object target : 동적 프록시가 호출할 대상
- method.invoke(target, args) : 리플렉션을 사용해서 target 인스턴스의 메서드를 실행한다. args 는 메서드 호출시 넘겨줄 인수이다.

~~~java
package hello.proxy.jdkdynamic;

import hello.proxy.jdkdynamic.code.*;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;

@Slf4j
public class JdkDynamicProxyTest {
    @Test
    void dynamicA() {
        AInterface target = new AImpl();
        TimeInvocationHandler handler = new TimeInvocationHandler(target);
        AInterface proxy = (AInterface) Proxy.newProxyInstance(AInterface.class.getClassLoader(), new Class[]{AInterface.class}, handler);
        proxy.call();
        log.info("targetClass={}", target.getClass());
        log.info("proxyClass={}", proxy.getClass());
    }

}
~~~
- new TimeInvocationHandler(target) : 동적 프록시에 적용할 핸들러 로직이다.
- Proxy.newProxyInstance(AInterface.class.getClassLoader(), new Class[] {AInterface.class}, handler)
  - 동적 프록시는 java.lang.reflect.Proxy 를 통해서 생성할 수 있다.
  - 클래스 로더 정보, 인터페이스, 그리고 핸들러 로직을 넣어주면 된다. 그러면 해당 인터페이스를 기반으로 동적 프록시를 생성하고 그 결과를 반환한다.


~~~
TimeInvocationHandler - TimeProxy 실행
AImpl - A 호출
TimeInvocationHandler - TimeProxy 종료 resultTime=0
JdkDynamicProxyTest - targetClass=class hello.proxy.jdkdynamic.code.AImpl
JdkDynamicProxyTest - proxyClass=class com.sun.proxy.$Proxy1
~~~

실행 순서
1. 클라이언트는 JDK 동적 프록시의 call() 을 실행한다. 
2. JDK 동적 프록시는 InvocationHandler.invoke() 를 호출한다. TimeInvocationHandler 가 구현체로 있으로 TimeInvocationHandler.invoke() 가 호출된다.
3. TimeInvocationHandler 가 내부 로직을 수행하고, method.invoke(target, args) 를 호출해서 target 인 실제 객체( AImpl )를 호출한다.
4. AImpl 인스턴스의 call() 이 실행된다.
5. AImpl 인스턴스의 call() 의 실행이 끝나면 TimeInvocationHandler 로 응답이 돌아온다. 시간 로그를 출력하고 결과를 반환한다.


## CGLIB: Code Generator Library
- CGLIB는 바이트코드를 조작해서 동적으로 클래스를 생성하는 기술을 제공하는 라이브러리이다.
- CGLIB를 사용하면 인터페이스가 없어도 구체 클래스만 가지고 동적 프록시를 만들어낼 수 있다.
- CGLIB는 원래는 외부 라이브러리인데, 스프링 프레임워크가 스프링 내부 소스 코드에 포함했다. 따라서

스프링을 사용한다면 별도의 외부 라이브러리를 추가하지 않아도 사용할 수 있다.
참고로 우리가 CGLIB를 직접 사용하는 경우는 거의 없다. 이후에 설명할 스프링의 ProxyFactory 라는
것이 이 기술을 편리하게 사용하게 도와주기 때문에, 너무 깊이있게 파기 보다는 CGLIB가 무엇인지 대략
개념만 잡으면 된다