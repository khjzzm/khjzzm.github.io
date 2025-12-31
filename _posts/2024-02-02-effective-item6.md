---
layout: post
title: 불필요한 객체 생성을 피하라
---

문자열

- 사실상 동일한 객체라서 매번 새로 만들 필요가 없다.
- new String("자비")을 사용하지 않고 문자열 리터럴 ("자바")을 사용해 기존에 동일한 문자열을 재사용하는 것이 좋다.

정규식, Pattern

- 생성 비용이 비싼 객체라서 반복해서 생성하기보다, 캐싱하여 재사용하는 것이 좋다.

오토박싱(auto Boxing)

- 기본 타입(int)을 그에 상응하는 박싱된 기본 타입(Integer)으로 상호 변환해주는 기술
- 기본 타입과 박싱된 기본 타입을 섞어서 사용하면 변환하는 과정에서 불필요한 객체가 생성될 수 있다.

**"객체 생성은 비싸니 피하라."는 뜻으로 오해하면 안 된다.**

- p31, 사용 자제 API (Deprecation)
- p32, 정규 표현식
- p32, 한 번 쓰고 버려져서 가비지 컬렉션 대상이 된다.
- p33, 초기화 지연 기법 (아이템 83에서 다룸)
- p34, 방어적 복사 (아이템 50에서 다룸)

### 클라이언트가 사용하지 않길 바라는 코드가 있다면...

- **사용자제**를 권장하고 대안을 제시하는 방법이 있다.
- @Deprecated 컴파일시 경고 메시지를 통해 사용 자제를 권장하는 API라는 것을 클라이언트에 알려줄 수 있다.
- @deprecated 문서화(javadoc)에 사용해, 왜 해당 API 사용을 지양하며, 그 대신 권장하는 API가 어떤 것인지 표기할 수 있다.

~~~java
public class Deprecation {

    /**
     * @deprecated in favor of
     * {@link #Deprecation(String)}
     */
    @Deprecated(forRemoval = true, since = "1.2")
    public Deprecation() {
    }

    private String name;

    public Deprecation(String name) {
        this.name = name;
    }

}
~~~


###  정규 표현식
내부적으로 Pattern이 쓰이는 곳

- String.matches(String regex)
- String.split(String regex)
  - 대안 Pattern.complie(regex).split(str)
- String.replace*(String regex, String replacement)
  - 대안 Pattern.compile(regex).matcher(str).replaceAll(repl)


