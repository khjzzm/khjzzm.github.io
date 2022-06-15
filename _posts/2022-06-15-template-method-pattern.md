---
layout: post
title: 템플릿 메소드 패턴
---

## 변하는 것과 변하지 않는 것을 분리
좋은 설계는 변하는 것과 변하지 않는 것을 분리하는 것이다.
여기서 핵심 기능 부분은 변하고, 로그 추적기를 사용하는 부분은 변하지 않는 부분이다.
이 둘을 분리해서 모듈화해야 한다.

템플릿 메서드 패턴(Template Method Pattern)은 이런 문제를 해결하는 디자인 패턴이다.

~~~java
public abstract class AbstractTemplate {
    public void execute() {
        long startTime = System.currentTimeMillis();
        //비즈니스 로직 실행
        call(); //상속
        //비즈니스 로직 종료
        long endTime = System.currentTimeMillis();
        long resultTime = endTime - startTime;
        log.info("resultTime={}", resultTime);
    }

    protected abstract void call();
}
~~~

템플릿 메서드 패턴은 이름 그대로 템플릿을 사용하는 방식이다. 템플릿은 기준이 되는 거대한 틀이다.
템플릿이라는 틀에 변하지 않는 부분을 몰아둔다. 그리고 일부 변하는 부분을 별도로 호출해서 해결한다.

`AbstractTemplate` 코드를 보자. 변하지 않는 부분인 시간 측정 로직을 몰아둔 것을 확인할 수 있다. 이제
이것이 하나의 템플릿이 된다. 그리고 템플릿 안에서 변하는 부분은 call() 메서드를 호출해서 처리한다.
템플릿 메서드 패턴은 부모 클래스에 변하지 않는 템플릿 코드를 둔다. 그리고 변하는 부분은 자식 클래스에
두고 상속과 오버라이딩을 사용해서 처리한다.

~~~java
public class SubClassLogic1 extends AbstractTemplate {
    @Override
    protected void call() {
        log.info("비즈니스 로직1 실행");
    }
}

public class SubClassLogic2 extends AbstractTemplate {
    @Override
    protected void call() {
        log.info("비즈니스 로직2 실행");
    }
}
~~~

### 익명 내부 클래스 사용하기

템플릿 메서드 패턴은 SubClassLogic1 , SubClassLogic2 처럼 클래스를 계속 만들어야 하는 단점이
있다. 익명 내부 클래스를 사용하면 이런 단점을 보완할 수 있다.
익명 내부 클래스를 사용하면 객체 인스턴스를 생성하면서 동시에 생성할 클래스를 상속 받은 자식
클래스를 정의할 수 있다. 이 클래스는 SubClassLogic1 처럼 직접 지정하는 이름이 없고 클래스 내부에
선언되는 클래스여서 익명 내부 클래스라 한다.

~~~java
void templateMethodV2(){
        AbstractTemplate template1=new AbstractTemplate(){
            @Override
            protected void call(){
                log.info("비즈니스 로직1 실행");
            }
        };
        log.info("클래스 이름1={}",template1.getClass());
        template1.execute();
        
        AbstractTemplate template2=new AbstractTemplate(){
            @Override
            protected void call(){
                log.info("비즈니스 로직1 실행");
            }
        };
        log.info("클래스 이름2={}",template2.getClass());
        template2.execute();
} 
~~~

템플릿 메서드 디자인 패턴의 목적은 다음과 같습니다.
> "작업에서 알고리즘의 골격을 정의하고 일부 단계를 하위 클래스로 연기합니다. 템플릿 메서드를 사용하면
하위 클래스가 알고리즘의 구조를 변경하지 않고도 알고리즘의 특정 단계를 재정의할 수 있습니다." [GOF]

하지만  
템플릿 메서드 패턴은 상속을 사용한다. 따라서 상속에서 오는 단점들을 그대로 안고간다. 특히 자식
클래스가 부모 클래스와 컴파일 시점에 강하게 결합되는 문제가 있다. 이것은 의존관계에 대한 문제이다.
자식 클래스 입장에서는 부모 클래스의 기능을 전혀 사용하지 않는다.

상속을 받는 다는 것은 특정 부모 클래스를 의존하고 있다는 것이다. 자식 클래스의 extends 다음에 바로
부모 클래스가 코드상에 지정되어 있다. 따라서 부모 클래스의 기능을 사용하든 사용하지 않든 간에 부모
클래스를 강하게 의존하게 된다. 여기서 강하게 의존한다는 뜻은 자식 클래스의 코드에 부모 클래스의
코드가 명확하게 적혀 있다는 뜻이다. UML에서 상속을 받으면 삼각형 화살표가 자식 -> 부모 를 향하고
있는 것은 이런 의존관계를 반영하는 것이다.

자식 클래스 입장에서는 부모 클래스의 기능을 전혀 사용하지 않는데, 부모 클래스를 알아야한다. 이것은
좋은 설계가 아니다. 그리고 이런 잘못된 의존관계 때문에 부모 클래스를 수정하면, 자식 클래스에도 영향을
줄 수 있다.

추가로 템플릿 메서드 패턴은 상속 구조를 사용하기 때문에, 별도의 클래스나 익명 내부 클래스를 만들어야
하는 부분도 복잡하다.

템플릿 메서드 패턴과 비슷한 역할을 하면서 상속의 단점을 제거할 수 있는 디자인 패턴이 바로 전략 패턴
(Strategy Pattern)이다.