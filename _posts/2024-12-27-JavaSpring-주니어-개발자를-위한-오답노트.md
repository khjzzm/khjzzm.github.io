---
layout: post
title: Java/Spring 주니어 개발자를 위한 오답노트
---

순차 지향 프로그래밍과 절차 지향 프로그래밍의 차으를 설명하실 수 있나요?

- 순차 지향 프로그래밍 Sequential oriented programming
- 절차 지향 프로그래밍 Procedure oriented programming

Procedure "In different programming languages, a subroutine may be called a routine, subprogram, function, method oor procedure"


## 실천 할 수 있는 컨벤션 교정

1. 이름
- 메소드 이름은 동사로 시작한다
- 축약어를 대문자로 표현하지 않는다
  - private String userId
  - private String restApi
  - public class ApiClient {}
- Simple / Light / Base
  - 유의미한 단어를 사용하세요. 어디에 왜 필요한지를 고민하고 이름을 지으세요
- Util
  - Util 이라는 이름하에 모든 static 메소드가 모일겁니다.

2. 동사
- get vs find
  - get return type이 T 인 경우 (일반적으로 데이터가 없을 시 exception 을 throw 합니다.)
  - find return type이 Optional<T> 인 경우
- isExist vs exist
  - exist를 쓰세요. 동사를 반복하는 거라서 없는 단어입니다.
- get
  - get 접두어는 갖고 있는 속성 정보를 제공한다는 의미입니다. 찾아오라는 지시가 아닙니다.

3. 롬복
- getter setter 를 남발하지 마세요
  - 캡슐화를 망치는 주범이다
  - 사실상 public 멤버변수 입니다
  - 객체를 수동적이게 만듭니다.
  - 객체를 능동적이게 만드세요. (TDA 원칙 - Tell don`t ask. 디미터 법칙)

4. 가독성
- Collection.Map 을 남발하지마세요.
  - 가급적이면 일급 클래스로 만들고 사용하더라도 지정된 { scope } 빡을 넘다들지 마세요.
  
5. 관습
- start end
  - range 는 [start,end] 시작은 포함해주고, 끝은 제외한다.
    ~~~java
    for (int i = 0; i < temp.length; i++){
    }
    ~~~
    

더 알아볼 만한 주제
01. 검증이 필요할때 
    - verify vs validate
    - check vs is
02. 코드스타일
03. 단어 조합은 3개 이하로


## 객체 지향적인 코드 짜기 (1) : 객체의 종류, 행동

### 객체의 정류

1. VO
- 번역 : VO는 불변해야 하며, 이는 동일하게 생성된 두 VO는 영원히 동일한 상태임을 유지되어야 한다는 것을 의미합니다. 또한 VO는 잘못된 상태로는 만들어 질 수 없습니다. 따라서 인스턴스화 된 VO는 **항상 유효**하므로 버그를 줄이는데에도 유용합니다.
- 번외. 생성자는 가급적 두개의 역할만 해야합니다
  - 값을 검증합니다.
  - 값을 할당합니다.
  ~~~java
  class UserInfo {
    private final long id;
    private final long username;
    private final long email;
    
    public UserInfo(long id, String userName, String email){
    assert id > 0;
    assert StringUtils.isNotEmpty(userName);
    assert EmailValidator.isValid(email);
  
    this.id = id;
    ...
  }
  ~~~
  
2. DTO
- an object that carries data between processes
- DTO는 상태를 보호하지 않으며 모든 속성을 노출하므로 획득자와 설정자가 필요 없다. 이는 public 속성으로 충분하다는 뜩이다.


3. Entity
- 유일한 식별자가 있고,
- 수명 주기가 있으며,
- 쓰기 모델 저장소에 저장함으로써 지속성을 가지며 나중에 저장소에 불러올 수 있고,
- 명명한 생성자와 명령 메서드를 사용해 인스턴스를 만들거나 그 상태를 조작하는 방법을 사용자에게 제공하며,
- ~~인스턴스를 만들거나 변경할 때 도메인 이벤트를 만들어 낸다.~~

4. PO
- Entity 와 DB Entity 는 다르다는 말을 합니다. JPA 의 Entity 는 흔히 말하는 DB Entity 에 해당한다 보시면 되십니다. 그리고 개인적으로 DB Entity 라는 용어보다는 PO 라고 부르는게 더 맞다고 생각합니다.

**객체를 만들 때의 고민**
객체의 종류에는 3종류만 있는 것이 아니며, 완벽한 분류는 어렵습니다. VO 이면서 Entity 일 수 있으며, DTO 이면서 PO 일 수 도 있고 셋 다 아닐 수도 있다.
사실 분류보다 어딴 갑을 불변으로 만들 것인가? 어떤 인터페이스를 노출할 것인가?

번외로 DAO(Data Access Object), BO(Business Object), SO(Service Object) 

### 디미터 법칙
- 최소 지식의 법칙

### 행동
데이터 위주 사고
~~~java
class Car{
    private Frame frame;
    private Engine engine;
    private List<Wheel> wheels;
    private Direction direction;
    private Speed speed;
}
~~~

행동 위주의 사고
~~~java
class Car{
    public void drive(){}
    public void changeDirection(){}
    public void accelerate(Speed speed){}
    public void decelerate(Speed speed){}
}
~~~

struct 와 class 는 다릅니다.

**duck typing**
행동이 같다면 같은 클래스로 부르겠다. 덕타이핑 이라는 용어는 다음과 같이 표현될 수 있는 덕 테스트에서 유래했댜. 만약 어떤 새가 오리처럼 걷고, 헤엄치고, 꽥꽥거리는 소리를 낸다면 나는 그 새를 오리라고 부를 것이다.

### 순환 참조
순환 참조, 양방향 참조를 만들지 마세요.
- 순환참조를 넘어 순환 의존성 자체가 결합도를 높이는 원인이 됩니다.
- 순환참조 떄문에 Serialize가 불가해집니다.
- 간접 참조로 해결하자. 차라리 Id로 필요할 때마다 찾아오는게 낫습니다.


## 설계 (1) : 의존성이란 무엇인지? (DI vs DIP)

### SOLID
- 단일 책임 원칙
- 계방-폐쇄 원칙
- 리스코프 치환 원칙
- 인터페이스 분리 원칙
- 의존성 역전 원칙

### 의존성
- 의존성이란 무엇인가?
  - Dependency (computer science) or coupling, a state in which one object uses a function of another object

- 의존성 주입이란 무엇인가?
  - 필요한 값을 외부에서 의존성을 넣어주면 의존성 주입이다 (파라미터 주입, 필드 주입, 생성자 주입)

- 의존성 주입(DI)과 오해
  - 의존성이 사라진게 아니라 약해진거다.

- 의존성 역전 (DIP)
  - Dependency Injection과 Dependency Inversion은 다르다.

- 의존성 역전 원칙
  - 첫째, 상위 모듈은 하위 모듈에 의존해서는 안된다. 상위 모듈과 하위 모듈 모두 추상화에 의존해야 한다.
  - 둘째, 추상화는 세분 사항에 의존해서는 안된다. 세부사항이 추상화에 의존해야 한다.
  - **화살표의 방향을 반대로 바꾸는 테크닉**

- 의존성 주입 != 의존성 역전
- 의존성 주입의 대표 도구 = 스프링
- Dependency Injection 이 dependency inversion 을 만들 수 없다.
- 무조건 추상화하라는 의미는 아님, 추상화는 좋은 방법론이긴 하지만 개발하는 데 비용을 증가시키는 경향이 있다.
- 생성자 의존성 주입이 7개 이상 넘어거가너 파라미너 의존성 주입이 4개 이상 넘어간다면 클래스 문할이나 메소드 분할을 고려해야 한다는 신호이다.
- 스프링이 Inversion of Control Container 라는 말을 많이합니다. 그래서 Dependency Inversion 를 제공한다 생각 하는 사람도 있습니다. 아닙니다.


## 설계 (2) : 의존성을 추상화 시키는 방식
- 의존성을 드러내라
- 변하는 값은 주입받아라. (로그인 시간값)
- 변하는 값을 추상화 시켜라 "결론적으로 변하는 값에대한 가장 괜찮은 접근법은 런타임 의존성과 컴파일 타임 의존성을 다르게 하는 것"

- CQRS (Command and Query Responsibility Segregation)
  - 명령과 질의의 책임 분리
  - 메소드를 명령과 질의로 나누자. (더 넓게는 클래스까지도)
  - 하나의 메소드는 명령이나 쿼리여야하며, 두 가지 기능을 모두 가져서는 안된다. 명령은 객체의 상태를 변경할 수 있지만, 값을 반환하지 않는다. 쿼리는 값을 반환하지만 객체를 변경하지 않는다.

**설계에는 정답이 없다.**
- Shotgun surgery : 기능 산재 - 모아둬야 할 것을 분할해서 발생
- Divergent change : 수정 산발 - 분할해야 할 것을 모아놔서 발생



## 
