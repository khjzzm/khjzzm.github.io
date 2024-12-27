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

