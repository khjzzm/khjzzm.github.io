---
layout: post
title: java annotation 은 어떻게 동작 하는가
---

자바 어노테이션은 어떻게 동작하는지 알아보기 위해서 
custom annotation 을 작성함

~~~
package annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(value = RetentionPolicy.RUNTIME)
@Target(value = ElementType.METHOD)
public @interface Woker {
    public String name();
}
~~~

위 파일을 바이트코드로 변환후에 역어셈블 해보자.
~~~
➜ javac Woker.java
➜ javap -c Woker  
~~~

결과값 : 
~~~
Compiled from "Woker.java"
public interface annotation.Woker extends java.lang.annotation.Annotation {
  public abstract java.lang.String name();
}
~~~


## java.lang.annotation.Annotation 을 상속 받는다.

- [Annotation JavaDoc](https://docs.oracle.com/javase/7/docs/api/java/lang/annotation/Annotation.html)
- '어노테이션 타입(annotation type)' 선언은 특별한 종류의 인터페이스이다. 어노테이션 타입 선언을 일반적인 인터페이스 선언과 구분하려면 예약어 interface 앞에 기호 @을 붙인다.
  - `기호 @`와 `예약어 interface`는 별개의 토큰이다. 이 두개는 공백으로 분리가능하다, 관례상 `@interface` 로 작성 한다.


참고 어노테이션 타입 선언은 문맥 자유 구문(Context-free grammar, CFG)으로부터 다음과 같은 제한을 갖는다.
- 어노테이션 타입 선언은 제네릭일 수 없다.
- extends 절을 가질 수 없다 (어노테이션 타입은 암묵적으로 java.lang.annotation.Annotation을 확장한다.)
- 메소드는 매개변수를 가질 수 없다.
- 메소드는 타입 매개변수를 가질 수 없다.
- 메소드 선언은 throws 절을 가질 수 없다.



## 런타임시 어노테이션 정보 획득

~~~java
package annotation;

import java.lang.reflect.Method;

public class SayHelloBean {
    private static final String HELLO_MSG = "Hello ";

    @Woker(name = "kimzzang~")
    public String sayHelloTo(String name) {
        return HELLO_MSG + name;
    }

    public static void main(String[] args) {
        try {
            SayHelloBean simpleBean = new SayHelloBean();
            Method helloMessageMethod = simpleBean.getClass().getDeclaredMethod("sayHelloTo", String.class);
            Woker mySimpleAnnotation = (Woker) helloMessageMethod.getAnnotation(Woker.class);
            System.out.println(simpleBean.sayHelloTo(mySimpleAnnotation.name()));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
~~~

1. SayHelloBean 객체 생성
2. getClass()를 통해서 java.lang.Class 인스턴스 획득
3. getDeclaredMethod("sayHelloTo", String.class); 를 통해서 sayHelloTo(String) 시그니처를 가지는 `java.lang.reflect.Method`인스턴스 획득
4. getAnnotation(Woker.class) 을 통해 해당 메소드에 붙어있는 Woker 타입의 어노테이션 획득
5. Worker 타입의 name()을 호출하여 name value 획득

--------

# Spring framework 에서 annotation

~~~java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Indexed
public @interface Component {
    String value() default "";
}
~~~
스프링 프레임워크에서 @Component 어노테이션을 붙인 클래스를 만들면 스프링은 구동 단계에서
`ClassPathBeanDefinitionScanner.java` 의 `protected Set<BeanDefinitionHolder> doScan(String... basePackages){...}` 메소드를
사용해서 ClassPath 내에 있는 패키지의 모든 클래스를 읽어서 어노테이션이 붙은 클래스에 대해 컨테이너에 빈 등록 작업을 수행한다.

~~~java
public class ClassPathBeanDefinitionScanner extends ClassPathScanningCandidateComponentProvider {
  ...
  protected Set<BeanDefinitionHolder> doScan(String... basePackages) {
    Assert.notEmpty(basePackages, "At least one base package must be specified");
    Set<BeanDefinitionHolder> beanDefinitions = new LinkedHashSet<>();
    for (String basePackage : basePackages) {
      Set<BeanDefinition> candidates = findCandidateComponents(basePackage);
      for (BeanDefinition candidate : candidates) {
        ScopeMetadata scopeMetadata = this.scopeMetadataResolver.resolveScopeMetadata(candidate);
        candidate.setScope(scopeMetadata.getScopeName());
        String beanName = this.beanNameGenerator.generateBeanName(candidate, this.registry);
        if (candidate instanceof AbstractBeanDefinition) {
          postProcessBeanDefinition((AbstractBeanDefinition) candidate, beanName);
        }
        if (candidate instanceof AnnotatedBeanDefinition) {
          AnnotationConfigUtils.processCommonDefinitionAnnotations((AnnotatedBeanDefinition) candidate);
        }
        if (checkCandidate(beanName, candidate)) {
          BeanDefinitionHolder definitionHolder = new BeanDefinitionHolder(candidate, beanName);
          definitionHolder =
                  AnnotationConfigUtils.applyScopedProxyMode(scopeMetadata, definitionHolder, this.registry);
          beanDefinitions.add(definitionHolder);
          registerBeanDefinition(definitionHolder, this.registry);
        }
      }
    }
    return beanDefinitions;
  }
  ...
}
~~~


