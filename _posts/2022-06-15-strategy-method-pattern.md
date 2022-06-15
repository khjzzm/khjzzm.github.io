---
layout: post
title: 전략 패턴
---

전략 패턴은 변하지 않는 부분을 Context 라는 곳에 두고, 변하는 부분을 Strategy 라는 인터페이스를
만들고 해당 인터페이스를 구현하도록 해서 문제를 해결한다. 상속이 아니라 위임으로 문제를 해결하는
것이다.

전략 패턴에서 Context 는 변하지 않는 템플릿 역할을 하고, Strategy 는 변하는 알고리즘 역할을 한다.

>알고리즘 제품군을 정의하고 각각을 캡슐화하여 상호 교환 가능하게 만들자. 전략을 사용하면 알고리즘을
사용하는 클라이언트와 독립적으로 알고리즘을 변경할 수 있다.


~~~java
public interface Strategy {
    void call();
}
~~~
이 인터페이스는 변하는 알고리즘 역할을 한다.

~~~java
public class StrategyLogic1 implements Strategy {
    @Override
    public void call() {
        log.info("비즈니스 로직1 실행");
    }
}

public class StrategyLogic2 implements Strategy {
    @Override
    public void call() {
        log.info("비즈니스 로직2 실행");
    }
}
~~~
변하는 알고리즘은 Strategy 인터페이스를 구현하면 된다. 여기서는 비즈니스 로직1, 로직2를 구현했다.


~~~java
public class ContextV1 {
    private Strategy strategy;

    public ContextV1(Strategy strategy) {
        this.strategy = strategy;
    }

    public void execute() {
        long startTime = System.currentTimeMillis();
        //비즈니스 로직 실행
        strategy.call(); //위임
        //비즈니스 로직 종료
        long endTime = System.currentTimeMillis();
        long resultTime = endTime - startTime;
        log.info("resultTime={}", resultTime);
    }
}
~~~
ContextV1 은 변하지 않는 로직을 가지고 있는 템플릿 역할을 하는 코드이다. 전략 패턴에서는 이것을
컨텍스트(문맥)이라 한다.
쉽게 이야기해서 컨텍스트(문맥)는 크게 변하지 않지만, 그 문맥 속에서 strategy 를 통해 일부 전략이
변경된다 생각하면 된다.

Context 는 내부에 Strategy strategy 필드를 가지고 있다. 이 필드에 변하는 부분인 Strategy 의
구현체를 주입하면 된다.
전략 패턴의 핵심은 Context 는 Strategy 인터페이스에만 의존한다는 점이다. 덕분에 Strategy 의
구현체를 변경하거나 새로 만들어도 Context 코드에는 영향을 주지 않는다.

~~~java
void strategyV1(){
    Strategy strategyLogic1=new StrategyLogic1();
    ContextV1 context1=new ContextV1(strategyLogic1);
    context1.execute();

    Strategy strategyLogic2=new StrategyLogic2();
    ContextV1 context2=new ContextV1(strategyLogic2);
    context2.execute();
}
~~~
코드를 보면 의존관계 주입을 통해 ContextV1 에 Strategy 의 구현체인 strategyLogic1 를 주입하는
것을 확인할 수 있다. 이렇게해서 Context 안에 원하는 전략을 주입한다. 이렇게 원하는 모양으로 조립을
완료하고 난 다음에 context1.execute() 를 호출해서 context 를 실행한다.

### 익명 내부 클래스 사용하기

~~~java
void strategyV2() {
    Strategy strategyLogic1 = new Strategy() {
        @Override
        public void call() {
            log.info("비즈니스 로직1 실행");
        }
    };
    log.info("strategyLogic1={}", strategyLogic1.getClass());
    ContextV1 context1 = new ContextV1(strategyLogic1);
    context1.execute();

    Strategy strategyLogic2 = new Strategy() {
        @Override
        public void call() {
            log.info("비즈니스 로직2 실행");
        }
    };
    log.info("strategyLogic2={}", strategyLogic2.getClass());
    ContextV1 context2 = new ContextV1(strategyLogic2);
    context2.execute();
}
~~~

~~~java
void strategyV3() {
    ContextV1 context1 = new ContextV1(new Strategy() {
        @Override
        public void call() {
            log.info("비즈니스 로직1 실행");
        }
    });
    context1.execute();
    ContextV1 context2 = new ContextV1(new Strategy() {
        @Override
        public void call() {
            log.info("비즈니스 로직2 실행");
        }
    });
    context2.execute();
}
~~~
익명 내부 클래스를 변수에 담아두지 말고, 생성하면서 바로 ContextV1 에 전달해도 된다.

~~~java
void strategyV4() {
    ContextV1 context1 = new ContextV1(() -> log.info("비즈니스 로직1 실행"));
    context1.execute();
    ContextV1 context2 = new ContextV1(() -> log.info("비즈니스 로직2 실행"));
    context2.execute();
}
~~~
익명 내부 클래스를 자바8부터 제공하는 람다로 변경할 수 있다. 람다로 변경하려면 인터페이스에 메서드가
1개만 있으면 되는데, 여기에서 제공하는 Strategy 인터페이스는 메서드가 1개만 있으므로 람다로
사용할 수 있다.


선 조립, 후 실행   
여기서 이야기하고 싶은 부분은 Context 의 내부 필드에 Strategy 를 두고 사용하는 부분이다.
이 방식은 Context 와 Strategy 를 실행 전에 원하는 모양으로 조립해두고, 그 다음에 Context 를
실행하는 선 조립, 후 실행 방식에서 매우 유용하다.
Context 와 Strategy 를 한번 조립하고 나면 이후로는 Context 를 실행하기만 하면 된다. 우리가
스프링으로 애플리케이션을 개발할 때 애플리케이션 로딩 시점에 의존관계 주입을 통해 필요한 의존관계를
모두 맺어두고 난 다음에 실제 요청을 처리하는 것 과 같은 원리이다.
이 방식의 단점은 Context 와 Strategy 를 조립한 이후에는 전략을 변경하기가 번거롭다는 점이다. 물론
Context 에 setter 를 제공해서 Strategy 를 넘겨 받아 변경하면 되지만, Context 를 싱글톤으로
사용할 때는 동시성 이슈 등 고려할 점이 많다. 그래서 전략을 실시간으로 변경해야 하면 차라리 이전에
개발한 테스트 코드 처럼 Context 를 하나더 생성하고 그곳에 다른 Strategy 를 주입하는 것이 더 나은
선택일 수 있다.

---

이번에는 전략 패턴을 조금 다르게 사용해보자. 이전에는 Context 의 필드에 Strategy 를 주입해서
사용했다. 이번에는 전략을 실행할 때 직접 파라미터로 전달해서 사용해보자.

~~~java
public class ContextV2 {
    public void execute(Strategy strategy) {
        long startTime = System.currentTimeMillis();
        //비즈니스 로직 실행
        strategy.call(); //위임
        //비즈니스 로직 종료
        long endTime = System.currentTimeMillis();
        long resultTime = endTime - startTime;
        log.info("resultTime={}", resultTime);
    }
}
~~~
ContextV2 는 전략을 필드로 가지지 않는다. 대신에 전략을 execute(..) 가 호출될 때 마다 항상
파라미터로 전달 받는다.

~~~java
void strategyV1() {
    ContextV2 context = new ContextV2();
    context.execute(new StrategyLogic1());
    context.execute(new StrategyLogic2());
}
~~~
Context 와 Strategy 를 '선 조립 후 실행'하는 방식이 아니라 Context 를 실행할 때 마다 전략을 인수로
전달한다.
클라이언트는 Context 를 실행하는 시점에 원하는 Strategy 를 전달할 수 있다. 따라서 이전 방식과
비교해서 원하는 전략을 더욱 유연하게 변경할 수 있다.
테스트 코드를 보면 하나의 Context 만 생성한다. 그리고 하나의 Context 에 실행 시점에 여러 전략을
인수로 전달해서 유연하게 실행하는 것을 확인할 수 있다.


ContextV1 은 필드에 Strategy 를 저장하는 방식으로 전략 패턴을 구사했다.
- 선 조립, 후 실행 방법에 적합하다.
- Context 를 실행하는 시점에는 이미 조립이 끝났기 때문에 전략을 신경쓰지 않고 단순히 실행만 하면 된다.

ContextV2 는 파라미터에 Strategy 를 전달받는 방식으로 전략 패턴을 구사했다.
- 실행할 때 마다 전략을 유연하게 변경할 수 있다.
- 단점 역시 실행할 때 마다 전략을 계속 지정해주어야 한다는 점이다.