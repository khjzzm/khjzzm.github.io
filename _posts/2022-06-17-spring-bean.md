---
layout: post
title: required a single bean 빈 중복
---

스프링 컨테이너가 객체 의존성을 주입 할때 해당 타입의 빈이 여러개 인경우 아래와 같은 에러 메시지가 나온다.   
> Parameter 0 of constructor in ** required a single bean, but 3 were found:

위와 같이 같은 타입의 빈이 여러개인 경우 오류와 함께 해결을 위한 방법으로 3가지를 제시한다.
Consider marking one of the beans as @Primary, updating the consumer to accept multiple beans, or using @Qualifier to identify the bean that should be consumed

1. Consider making one of the beans as @Primary
2. updating the consumer to accept multiple beans
3. using @Qualifier to identify the bean that should be consumed

### @Primary Annotation 화용
@Primary Annotation 을 활용하면 BookRepository 를 상속받은 class 들 중, 최우선으로 의존성을 부여받게 된다.

### List
해당 빈객체를 리스트 타입으로 받아서 get(index)으로 가져오는 방법이다. 리스트에 들어가는 순서는 클래스 이름순이다.

### @Qualifier
인스턴스에 Bean id를 직접 선택하여 의존성 주입을 강제한다. default Bean id는 클래스의 첫 글자를 소문자로 한 문자열이다.
