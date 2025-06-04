---
layout: post
title: Java final, static
tags: [java]
---

## final
마지막의, 변경될 수 없는  
java에서 final을 키워드를 사용하는 경우는 `변수`, `메소드`, `클래스` 이다.

### 변수
해당 변수가 생성자나 대입연산자를 통해 한 번만 초기화 가능함을 의미한다.

### 메소드
해당 메소드를 오버라이드 하거나 숨길 수 없을을 의미한다.

### 클래스
해당 클래스는 상속할 수 없음을 의미한다. 상속 계층 구조에서 '마지막'클래스 이다.  
보안과 효율성을 얻기 위해 자바 표준 라이브러리 클래스에서 사용할 수 있다. 대표적으로 `java.lang.System`, `java.lang.String` 등이 있다.


### final 멤버 변수는 반드시 상수가 아니다.
```java
class Wod {
    final int numberOfSnatch;
    Wod(int numberOfSnatch) {
        this.numberOfSnatch = numberOfSnatch;
    }
}

class Use {
    Wod wod1 = new Wod(100);
    Wod wod2 = new Wod(200);
}
```
위 코드에서 fianl 변수는 생성자를 통해 초기화 되었다. 즉 Wod 클래스의 인스턴스 들은 각기 다른 value 값을 갖게 되었다.
각 인스턴스 안에서는 변하지 않겠지만, 클래스 레벨에서 통용되는 상수라고는 할수 없다.

### private 메소드와 private 클래스의 모든 메소드는 명시하지 않아도 final 처럼 동작한다.

둘다 오버라이드가 불가능하다. private 메소드에 여전히 final 명시는 가능하지만 불필요 하다.  
- private: 자식 클래스에서 안보인다.  
- final: 자식 클래스에서 보인다.  


## static
'전역', '정적'   
java에서 static 키워드를 사용하는 경우는 `멤버변수`, `메소드`, `블록`, `클래스`, `import` 이다.

### 클래스 멤버 변수(static)을 final로 지정하는 이유
클래스에서 사용할 해당 변수의 데이터를 고정 시키겠다는 의미이다. 해당 클래스에서 쓸 때 변하지 않고 일관된 값으로 쓸 것을 **멤버상수** 로 지정하는 것 이다.  
따라서 인스턴스가 만들어질 때마다 새로 메모리를 잡는게 아니라, 클래스 레벨에서 한 번만 메모리 공간을 할당 한 뒤 쭉 쓰게 된다.

```java
public static final String BIKE_TO_WORK = "For Time";
public static final int MAX_JERKS = 300;
```


### final 멤버 변수에 static을 사용하지 않는 경우
DI(Dependency Injection) 기법을 사용해 클래스 내부에 외부 클래스 의존성을 주입 하는 경우 (Spring Framework 가 대표적 이다)  

~~~java
public class MovieRecommender {

    private final CustomerPreferenceDao customerPreferenceDao;

    @Autowired
    public MovieRecommender(CustomerPreferenceDao customerPreferenceDao) {
        this.customerPreferenceDao = customerPreferenceDao;
    }

    // ...
}
~~~
MovieRecommender 클래스가 CustomerPreferenceDao를 private final 멤버 필드로 가지고 있으며 생성자를 통해 주입받아 한 번 초기화 되고 있다.
이제 MovieRecommender의 인스턴스는 작동 내내 변하지 않는 customerPreferenceDao 멤버 필드를 사용하게 될 것입니다.


### static 멤버 변수에 final을 사용하지 않는 경우
기술적으로는 충분히 가능하다. 하지만 보통의 경우로 보기 어렵다. static 필드는 클래스 스코프의 전역 변수라고 볼수 있다.
final을 쓰지 않았다면 값이 얼마 든지 바뀔 수 있는 상태가 된다. 이는 모든 클래스 인스턴스에서 접근하여 그 값을 변경 할 수 있기 때문에.
값을 추론하거나 테스트 하기 어렵게 만들 것이며, 동시성 프로그래밍을 어렵게 하는 요인이 될 것이다.

