---
layout: post
title: Java annotation
---


[Oracle Java Tutorial Annotations](https://docs.oracle.com/javase/tutorial/java/annotations/)

Annotations, a form of metadata, provide data about a program that is not part of the program itself. Annotations have no direct effect on the operation of the code they annotate.

Annotations have a number of uses, among them:

- Information for the compiler — Annotations can be used by the compiler to detect errors or suppress warnings음
- Compile-time and deployment-time processing — Software tools can process annotation information to generate code, XML files, and so forth.
- Runtime processing — Some annotations are available to be examined at runtime.

컴파일러에 대한 정보 — 컴파일러에서 주석을 사용하여 오류를 감지하거나 경고를 억제할 수 있습니다.   
컴파일 시간 및 배포 시간 처리 — 소프트웨어 도구는 주석 정보를 처리하여 코드, XML 파일 등을 생성할 수 있습니다   
런타임 처리 - 일부 주석은 런타임에 검사할 수 있습니다.   

~~~java
@Target({ElementType.[적용대상]})
@Retention(RetentionPolicy.[정보유지되는 대상])
public @interface [어노테이션 이름]{
   public 타입 elementName() [default 값]
   ...
}
~~~

1. Target(어노테이션 적용 대상)
2. Retention(어노테이션이 유지되는 대상)
3. Annotation Name

### Target
- ElementType.PACKAGE : 패키지 선언
- ElementType.TYPE : 타입 선언
- ElementType.ANNOTATION_TYPE : 어노테이션 타입 선언
- ElementType.CONSTRUCTOR : 생성자 선언
- ElementType.FIELD : 멤버 변수 선언
- ElementType.LOCAL_VARIABLE : 지역 변수 선언
- ElementType.METHOD : 메서드 선언
- ElementType.PARAMETER : 전달인자 선언
- ElementType.TYPE_PARAMETER : 전달인자 타입 선언
- ElementType.TYPE_USE : 타입 선언

### Retention
- SOURCE: 어노테이션이 소스파일에만 존재. 컴파일 후 클래스 파일에서는 사라짐
- CLASS: 어노테이션이 클래스 파일까지 존재. 런타임 시 사라짐. 디폴트 Retention 정책
- RUNTIME: 어노테이션이 런타임까지 존재. 리플렉션을 통해 어노테이션 정보를 사용 가능
