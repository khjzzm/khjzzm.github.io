---
layout: post
title: 함수형 인터페이스(Functional Interface)
---

함수형 인터페이스는 1개의 추상 메소드를 갖고 있는 인터페이스 이다.  
Single Abstract Method(SAM) 라고 불리기도 한다.  
*default method, static method 는 존해도 상관없음*

~~~java
public interface Sam(){
    public abstract void Patisserie(String wheat);
}
~~~

A functional interface is an interface that has just one abstract method (aside from the methods of Object), and thus represents a single function contract.


## 함수형 인터페이스를 사용하는 이유
함수형 인터페이스란 함수를 **일급객체**로 사용할 수 없는 자바 언어의 단점을 보완하기 위해 도입 됐다.
덕분에 자바는 전보다 간결한 표현이 가능하며, 가독성이 높아지게 됐다(?)

함수형 인터페이스를 사용하는 이유는 자바의 '람다식'은 함수형 인터페이스로만 접근이 가능하기 때문이다.
~~~java
public interface Sam(){
    public abstract void patisserie(String wheat); 
}

Sam func = text -> System.out.println(text);
func.patisserie("프랑스");
//프랑스
~~~

익명클래스를 이용한 방법
~~~java
Sam func = new Sam(){
    @Override    
    public void patisserie(String text){
        System.out.println(text);
    }
};
func.patisserie("프랑스");
~~~
정리하면, 함수형 인터페이스를 사용하는 것은 람다식으로 만든 객체에 접근하기 위해서 입니다.
위의 예제처럼 람다식을 사용할 때마다 함수형 인터페이스를 매번 정의하기에는 불편하기 때문에 자바에서 라이브러리로 제공하는 것들이 있습니다.

## [Package java.util.function](https://docs.oracle.com/javase/8/docs/api/java/util/function/package-summary.html)

| Functional Interface | Descriptor | Method | 
|--------------|------------|------------|
| Predicate | T -> boolean | boolean test(T t) | 
| Consumer | T -> void | void accept(T t) | 
| Supplier | () -> T | T get() | 
| Function<T,R> | T -> r | R apply(T t) | 
| Comparator | (T, T) -> int | int compare(T o1, T o2) | 
| Runnable | () -> void | void run() | 
| Callable | () -> T | V call() |

각 함수형 인터페이스는 별도로 post 할 예정.