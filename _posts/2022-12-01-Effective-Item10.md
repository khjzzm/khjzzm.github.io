---
layout: post
title: equals는 일반 규약을 지켜 재정의 하라
---


## equals를 재정의 하면 안 되는 경우

- 각 인스턴스가 본질적으로 고유 한 경우 - 값이 아닌 동작을 표현하는 클래스의 경우 (Thread가 좋은 예이다.)
- 인스턴스의 논리적 동치성 (Logical Equality)를 검사할 일이 없는 경우 - java.utils.regex.Pattern의 equals는 내부의 정규표현식이 같은지를 검사하는 메서드이다.
- 상위 클래스에서 재정의한 equals가 하위 클래스에서도 적용 되는 경우 - Set, Map, List의 경우 Abstract(Type)의 equals를 쓴다.
- 클래스가 private이거나, package-private여서 equals를 호출할 일이 없는 경우
- 싱글턴을 보장하는 클래스(인스턴스 통제 클래스, Enum (열거타입)) 인 경우 - 객체 간 동등성, 동일성이 보장된다.

## equals 메서드 재정의 일반 규약

1. 반사성(reflexivity)
   - null이 아닌 모든 참조 값 x에 대해, x.equals(x)는 true다.
2. 대칭성(symmetry)
   - null이 아닌 모든 참조 값 x, y에 대해, x.equals(y)가 true면 y.equals(x)도 true다.
   - CaseInsensitiveString
   
~~~java
// 대칭성을 위반한 클래스
public final class CaseInsensitiveString{
  private final String s;

  public CaseInsensitiveString(String s){
    this.s = Obejcts.requireNonNull(s);
  }

  // 대칭성 위배!
  @Override public boolean equals(Object o){
    if(o instanceof CaseInsensitiveString)
      return s.equalsIgnoreCase(((CaseInsensitiveString) o).s);
    if(o instanceof String) // 한방향으로만 작동한다.
      return s.equalsIgnoreCase((String) o);
    return false;
  }
}
~~~

-- 작성중