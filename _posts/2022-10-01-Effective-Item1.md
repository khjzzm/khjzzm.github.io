---
layout: post
title: 정적 팩터리 메서드
---


## 생성자 대신 정적 팩터리 메서드를 '고려'하라

클라이언트가 클래스의 인스턴스를 얻는 전통적인 수단은 public 생성자이다.   
생성자와 별도인 정적 팩터리 메서드(static factory method) 기법의 장단점을 알아보자.

### 장점
1. 이름을 가질 수 있다. 또한 기존 생성자를 통한 방법은 동일한 시그니처의 생성자를 두개 가질 수 없다.
2. 호출될 때마다 인스턴스를 새로 생성하지 않아도 된다. 대표적으로 Boolean.valueOf(boolean)
   - 플라이웨이트 패턴(Flyweight pattern)
3. 반환 타입의 하위 타입 객체를 반환 할 수 있는 능력이 있다.
   - 인터페이스 기반 프레임워크, 인터페이스에 정적 메소드(java 8)
4. 입력 매개변수에 따라 매번 다른 클래스의 객체를 반환할 수 있다.
   - EnumSet
5. 정적 팩터리 메서드를 작성하는 시점에는 반환할 객체의 클래스가 존재하지 않아도 된다.
   - 서비스 제공자 프레임워크를 만드는 근간이 된다. 대표적으로 JDBC

#### 장점 5 부연설명
서비스 제공자 프레임워크는 3개의 핵심 컴포넌트로 이뤄진다.
1. 구현체의 동작을 정의하는 서비스 인터페이스 (service inferface)
2. 제공자가 구현체를 등록 할 때 사용하는 제공자 등록API (provider registraion API)
3. 클라이언트가 서비스의 인스턴스를 얻을 때 사용하는 서비스 접근 API (service access API)
4. 위 3개의 핵심 컴포넌트와 더불어 종종 서비스 제공자 인터페이스(service provider inferface) 라는 네 번째 컴포넌트가 쓰이기도 한다.

서비스 제공자 인터페이스가 없다면 각 구현체를 인스턴스로 만들 때 '리플렉션'을 사용해야한다.     
JDBC에서는 Connection이 서비스 인터페이스 역할을, DriverManager.registerDriver가 제공자 등록 APi 역할을, 
DriverManager.getConection이 서비스 접근 APㅇ 역할을, Driver가 서비스 제공자 인터페이스 역할을 수행한다.

### 단점
1. 상속을 할려면 public이나 protected 생성자가 필요하니, 정적 팩터리 메서드만 제공하면 하위 클래스를 만들 수 없다.
2. 정적 팩터리 메서드는 프로그래머가 찾기 어렵다.
   - Java Doc

#### 단점 2 부연설명
메서드 이름을 널리 알려진 규약을 따라 짓는 식으로 문제를 완화해줘야 한다.

- from : 매개변수를 하나 받아서 해당 타입의 인스턴스를 반환하는 형변환 메서드 'Date d = Date.from(instant)'
- of : 여러 매개변수를 받아 적합한 타입의 인스턴스를 반환하는 집계 메서드 'Set<Rank> faceCards = EnumSet.of(JACK, QUEEN, KING'
- valueOf, instance, getInstance, create, newInstance, getType, newType, type 등등


정적 팩터리 메서드와 public 생성자는 각자의 쓰임새가 있으니 상대적인 장단점을 이해하고 사용하는 것이 좋다.
그렇다고 하더라도 정적 팩터리를 사용하는게 유리한 경우가 더 많으므로 무작정 public 생성자를 제공하던 습관이 있다면 고치자.


