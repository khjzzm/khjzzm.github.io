---
layout: post
title: Java 메소드::레퍼런스
---

java8에 도입됨. class::methodName 구문을 사용해서 클래스,객체에서 메소드를 참조 할수 있다.

~~~java
// 람다식
str -> str.toString()
// 메서드 참조
String::toString

// 람다식
str -> str.length()
// 메서드 참조
String::length

// 람다식
(int x, int y) -> x.compareTo(y)
// 메서드 참조
Integer::compareTo
~~~

### 메소드 참조 유형 4가지
1. 정적 메서드에 대한 메서드 참조(Class::StaticMethodName)
2. Object 인스턴스 메서드에 대한 참조(Object::instanceMethodName)
3. 특정 타입(또는 클래스)에 대한 인스턴스 메서드에 대한 메서드 참조(Class::instanceMethodName)
4. 생성자에 대한 메서드 참조(Class::new)


### 정적 메소드 참조
