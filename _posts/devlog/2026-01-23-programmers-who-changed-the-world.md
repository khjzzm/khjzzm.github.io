---
layout: post
category: devlog
title: 세상을 바꾼 프로그래머들 - 우리가 매일 쓰는 것들을 만든 사람들
---

개발자라면 매일 쓰는 것들이 있다. Git으로 커밋하고, Linux 서버에 배포하고, Java나 Python으로 코드를 짠다. JavaScript로 웹을 만들고, C로 시스템을 건드린다. 이것들은 그냥 하늘에서 떨어진 게 아니다. 누군가 만들었다. 대부분 한두 명이 시작했다. 그들의 이야기다.

## Alan Turing - 모든 것의 시작 전에

컴퓨터가 존재하기 전에, 컴퓨터를 상상한 사람이 있었다.

1936년, 케임브리지 대학교. 24살의 Alan Turing은 논문을 한 편 썼다. "계산 가능한 수에 대하여(On Computable Numbers)." 이 논문에서 그는 가상의 기계를 상상했다. 무한한 테이프, 테이프를 읽고 쓰는 헤드, 상태를 저장하는 메모리. 튜링 머신이다.

```
튜링 머신:

[...| 0 | 1 | 1 | 0 | 1 |...]  ← 무한한 테이프
           ↑
         [헤드]  ← 읽고/쓰고/이동
           |
        [상태]   ← 현재 상태에 따라 동작

→ 이 단순한 기계로 모든 계산을 할 수 있다
```

이건 진짜 기계가 아니었다. 수학적 개념이었다. 하지만 이 개념이 현대 컴퓨터의 이론적 기반이 됐다. "계산 가능하다"는 것이 무엇인지 정의했다. 컴퓨터가 할 수 있는 것과 할 수 없는 것의 경계를 그었다.

1939년, 2차 세계대전. Turing은 영국 블레츨리 파크에서 일했다. 임무는 독일군의 Enigma 암호 해독. Enigma는 당시 해독 불가능하다고 여겨졌다. 매일 설정이 바뀌었고, 경우의 수는 천문학적이었다.

Turing은 Bombe라는 기계를 만들었다. Enigma의 설정을 자동으로 찾아내는 장치. 이 기계 덕분에 연합군은 독일 해군의 통신을 읽을 수 있었다. 역사가들은 이것이 전쟁을 2년 단축시켰다고 추정한다. 수백만 명의 목숨.

```
Turing의 유산:
├── 튜링 머신 (1936) - 계산 이론의 기초
├── Enigma 해독 (1939-1945)
├── ACE 설계 (최초의 저장 프로그램 컴퓨터 중 하나)
├── 튜링 테스트 (1950) - AI 판별 기준
├── 형태발생 연구 (생물학적 패턴)
└── "튜링상" - 컴퓨터 과학의 노벨상
```

1950년, Turing은 질문을 던졌다. "기계가 생각할 수 있는가?" 그리고 테스트를 제안했다. 사람이 기계와 대화해서 구분할 수 없다면, 그 기계는 "생각한다"고 볼 수 있지 않을까? 튜링 테스트다. 70년이 지난 지금, ChatGPT와 대화하면서 우리는 아직도 이 질문을 던진다.

비극이 있었다. 1952년, Turing은 동성애 혐의로 유죄 판결을 받았다. 당시 영국에서 동성애는 범죄였다. 감옥 대신 화학적 거세를 선택했다. 1954년, 41살의 나이로 세상을 떠났다. 사과에 청산가리를 발라 먹었다. 자살로 추정된다.

2009년, 영국 총리가 공식 사과했다. 2013년, 엘리자베스 2세 여왕이 사면했다. 60년이 걸렸다.

컴퓨터 과학의 최고 영예는 "튜링상(Turing Award)"이다. 컴퓨터 과학의 노벨상. 이 글에 나오는 사람들 중 상당수가 튜링상 수상자다. McCarthy, Dijkstra, Kay, Knuth, Thompson, Ritchie, Hopper, Berners-Lee. 전부 Turing의 이름을 딴 상을 받았다.

그가 없었다면 컴퓨터는 없었다. 적어도 지금 우리가 아는 형태로는.

## Grace Hopper - 컴파일러의 어머니

1945년, 하버드 대학교. Grace Hopper는 Mark I 컴퓨터를 프로그래밍하고 있었다. 해군 중위였다. 세계대전 중에 입대해서 컴퓨터를 만났다.

어느 날 Mark II가 멈췄다. 원인을 찾아보니 릴레이에 나방이 끼어 있었다. Hopper는 그 나방을 로그북에 테이프로 붙이고 적었다. "First actual case of bug being found." 버그(bug)라는 말은 전부터 있었지만, 진짜 벌레가 발견된 건 이때가 처음이었다. 그 로그북은 지금 스미스소니언 박물관에 있다.

1952년, Hopper는 최초의 컴파일러를 만들었다. A-0 System. 사람들은 불가능하다고 했다. "컴퓨터는 산술만 할 수 있어. 프로그램을 작성할 순 없어." Hopper는 무시하고 만들었다.

```
당시 상황:

프로그래머: "영어로 코드를 쓰면 안 될까요?"
상사: "컴퓨터는 영어를 이해 못 해"
Hopper: "컴퓨터가 번역하면 되잖아요"
상사: "불가능해"
Hopper: (그냥 만듦)
```

그녀의 철학은 단순했다. "프로그래머가 기계어를 배우는 것보다, 기계가 영어를 이해하게 만드는 게 낫다." 이 생각이 COBOL로 이어졌다.

1959년, Hopper는 COBOL 개발을 주도했다. "Common Business-Oriented Language". 영어에 가까운 문법으로 비즈니스 로직을 작성한다.

```cobol
IDENTIFICATION DIVISION.
PROGRAM-ID. HELLO-WORLD.
PROCEDURE DIVISION.
    DISPLAY 'Hello, World!'.
    STOP RUN.
```

COBOL은 살아있다. 60년이 넘었는데 아직도 돌아간다. 전 세계 ATM의 95%, 은행 거래의 대부분이 COBOL이다. 2020년 코로나 때 미국 실업급여 시스템이 터졌다. COBOL 개발자를 급히 찾았다. 찾기 어려웠다.

Hopper는 강연할 때 30cm짜리 전선을 들고 다녔다. "이게 나노초입니다." 빛이 1나노초 동안 가는 거리. 추상적인 개념을 눈에 보이게 만들었다.

```
Hopper의 유산:
├── 최초의 컴파일러 (A-0 System, 1952)
├── COBOL (1959)
├── "버그" 일화의 주인공
├── 고급 프로그래밍 언어 개념
└── "용서를 구하는 게 허락을 구하는 것보다 쉽다"
```

Hopper는 해군에서 퇴역과 복귀를 반복했다. 너무 필요한 사람이라 계속 불려왔다. 79세에 준장(Rear Admiral)으로 최종 퇴역했다. 미 해군 역사상 최고령 현역이었다. "Amazing Grace"라는 별명이 붙었다.

1992년에 세상을 떠났다. 미 해군 구축함 USS Hopper가 그녀의 이름을 달고 있다.

## John McCarthy - AI와 Lisp의 아버지

1956년, 다트머스 대학교. John McCarthy는 학회를 하나 열었다. 주제는 "인공지능(Artificial Intelligence)". 이 용어를 만든 사람이 그다. 기계가 생각할 수 있을까? 그 질문에 이름을 붙였다.

2년 뒤, McCarthy는 프로그래밍 언어를 만들었다. Lisp. "List Processing"의 약자다. 1958년, FORTRAN 다음으로 오래된 고급 언어. 지금도 쓰인다. 60년이 넘었다.

Lisp는 괄호 투성이다. 처음 보면 기겁한다. 하지만 그 괄호가 혁명이었다.

```lisp
; Lisp 코드 예시
(defun factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

(factorial 5)  ; 결과: 120

; 코드가 곧 데이터 (S-expression)
'(+ 1 2)       ; 이건 리스트
(+ 1 2)        ; 이건 실행됨 → 3
```

"코드가 곧 데이터다(Code as Data)." Lisp의 핵심 철학이다. 프로그램이 자기 자신을 수정할 수 있다. 매크로로 언어를 확장할 수 있다. 메타프로그래밍의 시작이다.

McCarthy는 가비지 컬렉션도 발명했다. 프로그래머가 메모리를 직접 해제하지 않아도 되는 시스템. Java, Python, JavaScript, Go. 현대 언어 대부분이 가비지 컬렉션을 쓴다. 1959년에 나온 개념이다.

시분할 시스템(Time-sharing)도 그의 아이디어다. 여러 사용자가 한 컴퓨터를 동시에 쓰는 개념. 지금은 당연하지만, 1960년대엔 혁명이었다. 클라우드 컴퓨팅의 조상이다.

```
McCarthy의 유산:
├── Lisp (1958)
├── "인공지능" 용어 (1956)
├── 가비지 컬렉션 (1959)
├── 시분할 시스템 개념
├── MIT AI Lab 공동 설립
└── Stanford AI Lab 설립
```

McCarthy는 2011년에 세상을 떠났다. 그가 이름 붙인 "인공지능"은 지금 세상을 뒤흔들고 있다. ChatGPT, 자율주행, 이미지 생성. 전부 AI다. 1956년에 그가 던진 질문, "기계가 생각할 수 있을까?"에 대한 답을 아직도 찾고 있다.

Lisp의 영향은 곳곳에 남아있다. 람다 표현식, 함수형 프로그래밍, 재귀, 동적 타이핑. JavaScript의 클로저, Python의 리스트 컴프리헨션, Java의 람다. 전부 Lisp에서 왔다. 괄호는 줄었지만 아이디어는 살아있다.

## Edsger Dijkstra - goto의 적, 구조의 아버지

1956년, 네덜란드. 26살의 Edsger Dijkstra는 약혼녀와 쇼핑을 하다가 카페에 앉았다. 20분 만에 최단 경로 알고리즘을 고안했다. 종이와 연필도 없이. 그게 Dijkstra 알고리즘이다. 지금 모든 내비게이션이 이 알고리즘을 쓴다.

```
Dijkstra 알고리즘:
  "A에서 B까지 가장 짧은 길은?"

Google Maps, 카카오맵, 네이버지도
전부 Dijkstra (또는 그 변형)
```

1968년, Dijkstra는 편지를 한 통 썼다. "Go To Statement Considered Harmful." goto문이 해롭다는 주장이었다. 당시 프로그래밍은 goto 천지였다. 코드가 여기저기 점프했다. 스파게티 코드. 읽을 수 없고, 유지보수할 수 없고, 버그 투성이.

```
goto 시대의 코드:

10 IF X > 0 GOTO 50
20 PRINT "NEGATIVE"
30 GOTO 70
40 GOTO 20
50 PRINT "POSITIVE"
60 GOTO 70
70 END

→ 흐름을 따라가려면 눈이 빙빙
```

Dijkstra는 대안을 제시했다. 구조적 프로그래밍. 순차, 선택(if), 반복(while). 이 세 가지만으로 모든 프로그램을 작성할 수 있다. goto 없이.

```
구조적 프로그래밍:

if x > 0:
    print("POSITIVE")
else:
    print("NEGATIVE")

→ 위에서 아래로 읽으면 된다
```

이 논문은 전쟁을 일으켰다. "goto 없이 어떻게 코딩하냐"는 반발이 거셌다. 하지만 Dijkstra가 이겼다. 지금 goto를 쓰는 언어는 거의 없다. 쓰더라도 권장하지 않는다.

Dijkstra는 동시성 문제도 해결했다. 세마포어(Semaphore)를 발명했다. 여러 프로세스가 동시에 자원에 접근할 때 충돌을 막는 메커니즘. 운영체제 교과서에 반드시 나온다. "식사하는 철학자 문제"도 그가 만든 비유다.

```
Dijkstra의 유산:
├── Dijkstra 알고리즘 (1956)
├── "Go To Statement Considered Harmful" (1968)
├── 구조적 프로그래밍
├── 세마포어 (동시성 제어)
├── THE 운영체제
└── "식사하는 철학자 문제"
```

Dijkstra는 괴짜였다. 컴퓨터를 안 썼다. 프로그램을 손으로 썼다. 만년필로. "컴퓨터는 생각을 방해한다"고 했다. 1300개가 넘는 손글씨 메모(EWD 시리즈)를 남겼다. 전부 스캔되어 온라인에 공개되어 있다.

그는 독설가이기도 했다. BASIC을 배운 학생은 "정신적으로 불구가 된다"고 했다. COBOL은 "정신을 마비시킨다"고 했다. PL/I는 "치명적 질병"이라고 했다. 과격했지만, 코드 품질에 대한 집착에서 나온 말이었다.

2002년에 세상을 떠났다. 그가 남긴 말: "컴퓨터 과학에서 가장 어려운 것은 이름 짓기다."

## Alan Kay - 미래를 발명한 사람

"미래를 예측하는 가장 좋은 방법은 그것을 발명하는 것이다."

Alan Kay가 한 말이다. 그리고 그는 실제로 미래를 발명했다.

1968년, Kay는 Dynabook이라는 개념을 제안했다. 아이들이 들고 다니며 쓸 수 있는 개인용 컴퓨터. 책 크기에 그래픽 화면과 키보드가 달린 기계. 1968년에. 컴퓨터가 방 하나를 차지하던 시대에 노트북을 상상한 것이다. 아이패드가 나오기 42년 전이다.

1970년대, Xerox PARC. Kay는 Smalltalk을 만들었다. 최초의 진정한 객체지향 언어. "모든 것은 객체다"라는 철학. 메시지를 주고받는 객체들의 세계.

```smalltalk
"Smalltalk 코드 예시"
| greeting |
greeting := 'Hello, World!'.
Transcript show: greeting.

"모든 것이 객체, 모든 것이 메시지"
3 + 4              "3에게 '+' 메시지를 4와 함께 보냄"
'hello' size       "'hello'에게 'size' 메시지를 보냄 → 5"
```

Smalltalk이 돌아가는 환경도 혁명이었다. 윈도우, 아이콘, 메뉴, 마우스. 지금 우리가 당연하게 쓰는 GUI다. Kay와 Xerox PARC 팀이 만들었다.

1979년, Steve Jobs가 Xerox PARC를 방문했다. Smalltalk과 GUI를 보고 충격받았다. 그리고 Macintosh를 만들었다. Windows도 여기서 영감을 받았다. 지금 우리가 보는 모든 그래픽 인터페이스의 원형이 Xerox PARC에서 나왔다.

```
Kay의 유산:
├── Smalltalk (1972)
├── 객체지향 프로그래밍 개념
├── GUI (윈도우, 아이콘, 메뉴, 마우스)
├── Dynabook 개념 (노트북/태블릿의 원형)
├── Xerox Alto (최초의 개인용 컴퓨터)
└── "미래를 예측하는 가장 좋은 방법은 발명하는 것이다"
```

Kay는 객체지향을 발명했지만, 지금의 OOP를 보면 한숨을 쉰다. "내가 생각한 객체지향이 아닌데." Java나 C++의 클래스 중심 OOP는 그의 의도와 다르다고 한다. 그가 원한 건 생물학적 세포처럼 독립적으로 동작하며 메시지를 주고받는 객체들이었다.

80대인 지금도 Kay는 강연을 다닌다. 컴퓨터 교육, 아이들을 위한 프로그래밍, 미래의 컴퓨팅. 50년 전에 미래를 상상한 사람이 아직도 미래를 이야기한다.

## Dennis Ritchie & Ken Thompson - 모든 것의 시작

1969년, 벨 연구소. Ken Thompson과 Dennis Ritchie는 Multics 프로젝트에서 빠져나와 자기들만의 운영체제를 만들기 시작했다. 이름은 Unix. Thompson이 뼈대를 잡고, Ritchie가 C 언어를 만들어 Unix를 다시 작성했다.

C 언어는 혁명이었다. 어셈블리처럼 하드웨어를 직접 건드릴 수 있으면서도, 사람이 읽을 수 있는 코드였다. "이식성 있는 어셈블리"라는 별명이 붙었다. Unix는 C로 작성되었기 때문에 다른 컴퓨터로 옮길 수 있었다. 이전까지 운영체제는 특정 하드웨어에 묶여 있었다.

```
Ritchie의 유산:
├── C 언어 (1972)
├── Unix (Thompson과 공동, 1969)
└── "The C Programming Language" (K&R, 1978)

Thompson의 유산:
├── Unix (1969)
├── B 언어 (C의 전신)
├── UTF-8 (Rob Pike와 공동)
└── Go 언어 (2009, Google에서)
```

Dennis Ritchie는 2011년에 세상을 떠났다. 공교롭게도 Steve Jobs가 죽은 지 일주일 후였다. Jobs의 죽음은 전 세계 뉴스였지만, Ritchie의 죽음은 조용했다. 아이러니하게도 Jobs의 모든 제품은 Ritchie가 만든 것들 위에서 돌아갔다. macOS는 Unix 기반이고, iOS의 핵심은 C로 작성되어 있다.

Ken Thompson은 80대인 지금도 현역이다. Google에서 Go 언어를 만들었다.

## Brian Kernighan - "Hello, World!"의 아버지

Brian Kernighan은 코드를 만들기보다 글을 썼다. 그 글이 프로그래밍을 바꿨다.

1978년, Kernighan은 Dennis Ritchie와 함께 "The C Programming Language"를 출판했다. K&R이라 불리는 이 책은 프로그래밍 서적의 교과서가 됐다. 얇고, 명확하고, 예제가 실용적이었다. 그 책 첫 예제가 이거였다.

```c
#include <stdio.h>

main()
{
    printf("hello, world\n");
}
```

"Hello, World!" 프로그램의 시작이다. Kernighan이 1974년 벨 연구소 내부 문서에서 처음 사용했다. 이후 모든 프로그래밍 언어의 첫 예제가 됐다. 새 언어를 배우면 Hello World부터 찍는다. 40년이 지난 지금도.

Kernighan은 AWK도 만들었다. Alfred Aho, Peter Weinberger와 함께. 이름이 세 사람 성의 첫 글자다. 텍스트 처리의 스위스 아미 나이프. 지금도 쉘 스크립트에서 쓴다.

```bash
# AWK 예제: 두 번째 컬럼 출력
awk '{print $2}' file.txt

# 패턴 매칭
awk '/error/ {print $0}' log.txt

# 합계 계산
awk '{sum += $1} END {print sum}' numbers.txt
```

Kernighan의 진짜 재능은 설명이었다. 복잡한 개념을 명확하게 풀어냈다. "The Unix Programming Environment", "The Practice of Programming", "The Go Programming Language". 전부 명저다. 프로그래머들이 글쓰기를 배울 때 그의 책을 참고한다.

```
Kernighan의 유산:
├── "The C Programming Language" (K&R, 1978)
├── "Hello, World!" 프로그램
├── AWK 언어 (1977)
├── "The Unix Programming Environment" (1984)
├── "The Practice of Programming" (1999)
└── "The Go Programming Language" (2015)
```

그는 아직도 프린스턴 대학교에서 가르친다. 80대에도 학부생들에게 프로그래밍을 가르친다. "프로그래밍은 글쓰기와 같다"고 말한다. 명확하게, 간결하게, 읽는 사람을 생각하며.

## Linus Torvalds - "재미로 만들었는데요"

1991년, 핀란드 헬싱키 대학교. 21살 학생 Linus Torvalds가 Usenet에 글을 올렸다.

> "나는 386(486) AT 클론용 무료 운영체제를 만들고 있습니다. 그냥 취미입니다. GNU처럼 크고 전문적인 게 되진 않을 겁니다."

그 "취미"가 Linux가 됐다. 지금 전 세계 서버의 90% 이상이 Linux로 돌아간다. 안드로이드도 Linux다. 슈퍼컴퓨터 500대 전부가 Linux다.

2005년, Torvalds는 또 하나를 만들었다. Linux 커널 개발에 쓰던 상용 버전 관리 시스템 BitKeeper가 무료 라이선스를 철회했다. 화가 난 Torvalds는 2주 만에 Git을 만들었다. "일주일이면 될 줄 알았는데 2주 걸렸다"고 했다.

```
Torvalds의 유산:
├── Linux 커널 (1991)
└── Git (2005)
```

Torvalds는 독설가로 유명하다. 메일링 리스트에서 코드 리뷰할 때 욕설이 난무한다. "당신의 코드는 쓰레기다"는 식이다. 2018년에 잠시 휴식을 선언하고 커뮤니케이션 방식을 개선하겠다고 했다. 조금 나아졌다고 한다. 조금.

## James Gosling - 자바의 아버지

1991년, Sun Microsystems. James Gosling과 그의 팀은 가전제품용 언어를 만들고 있었다. TV 셋톱박스 같은 곳에 들어갈 작은 프로그램을 위한 언어. 프로젝트 이름은 Green, 언어 이름은 Oak였다. Oak는 상표권 문제로 Java가 됐다. 회의실 근처 커피숍 이름이었다는 설도 있고, 그냥 커피 원두 산지라는 설도 있다.

가전제품 시장은 실패했다. 하지만 1995년, 웹이 폭발하면서 Java Applet이 떴다. 브라우저에서 돌아가는 프로그램. "Write Once, Run Anywhere"라는 슬로건이 나왔다. 한 번 작성하면 어디서든 돌아간다.

Applet은 죽었지만 Java는 살아남았다. 서버 사이드로 옮겨가서 엔터프라이즈 시장을 장악했다. 안드로이드 앱의 기본 언어가 됐다. 30년이 지난 지금도 TIOBE 지수 상위권이다.

```
Gosling의 유산:
├── Java (1995)
├── Emacs의 첫 Unix 포트
└── NeWS 윈도우 시스템
```

2010년 Oracle이 Sun을 인수했다. Gosling은 몇 달 버티다가 퇴사했다. 이유는 밝히지 않았지만, Oracle과 맞지 않았다는 건 누구나 알았다. 이후 Google, 해양 로봇 스타트업 등을 거쳐 Amazon AWS에서 일했다.

## Guido van Rossum - 자비로운 종신 독재자

1989년 크리스마스 연휴, 네덜란드. Guido van Rossum은 심심했다. 취미 프로젝트로 새 언어를 만들기 시작했다. ABC 언어의 후계자로, 읽기 쉽고 배우기 쉬운 언어. 이름은 영국 코미디 그룹 Monty Python에서 따왔다.

Python의 철학은 단순했다. "가독성이 중요하다(Readability counts)." 중괄호 대신 들여쓰기로 블록을 구분했다. 처음엔 욕을 많이 먹었다. 지금은 당연하게 받아들여진다.

```python
# Python의 선(The Zen of Python)에서
import this

# Beautiful is better than ugly.
# Explicit is better than implicit.
# Simple is better than complex.
# Readability counts.
```

van Rossum은 오랫동안 "BDFL(Benevolent Dictator For Life, 자비로운 종신 독재자)"이었다. Python의 모든 중요한 결정은 그가 내렸다. 2018년, PEP 572(바다코끼리 연산자 `:=`) 논쟁에 지쳐서 BDFL 자리에서 물러났다. "더 이상 안 하겠다"고 선언했다.

```
van Rossum의 유산:
├── Python (1991)
└── BDFL 모델 (오픈소스 거버넌스의 한 유형)
```

Python은 지금 가장 인기 있는 언어 중 하나다. AI/ML, 데이터 과학, 웹, 자동화. 어디에나 Python이 있다.

## Brendan Eich - 10일의 기적

1995년 5월, Netscape. Brendan Eich는 10일 만에 프로그래밍 언어를 만들었다. 원래 이름은 Mocha, 그다음 LiveScript, 최종적으로 JavaScript. Java의 인기에 편승하려고 이름을 바꿨다. Java와는 아무 관련이 없다.

10일 만에 만든 언어답게 문제가 많았다. `==`와 `===`의 차이, `this`의 혼란스러운 동작, 타입 강제 변환의 괴상한 규칙들. 하지만 브라우저를 장악했다. 유일하게 브라우저에서 돌아가는 언어였으니까.

```javascript
// JavaScript의 유명한 괴상함들
[] + []        // ""
	[] + {}        // "[object Object]"
{
}
+[]        // 0
"11" + 1       // "111"
"11" - 1       // 10
```

20년이 지나면서 JavaScript는 성숙해졌다. ES6(2015)에서 대대적으로 개선됐다. Node.js로 서버에서도 돌아간다. TypeScript가 타입을 보완했다. 지금은 세계에서 가장 많이 쓰이는 언어다.

```
Eich의 유산:
├── JavaScript (1995)
├── Mozilla Firefox (공동 창립)
└── Brave 브라우저 (현재 CEO)
```

Eich는 논란이 있는 인물이다. 2014년 Mozilla CEO가 됐다가, 동성결혼 반대 단체 기부 이력이 밝혀져서 11일 만에 사임했다. 지금은 Brave 브라우저를 만드는 회사의 CEO다.

## Bjarne Stroustrup - C를 더 낫게

1979년, 벨 연구소. Bjarne Stroustrup은 박사 연구 때 Simula라는 언어를 썼다. 객체지향 개념이 좋았다. 하지만 너무 느렸다. C는 빨랐지만 대규모 프로그램을 짜기엔 구조가 부족했다.

그래서 둘을 합쳤다. "C with Classes"로 시작해서 1983년 C++가 됐다. `++`는 C의 증가 연산자다. "C보다 하나 더 낫다"는 뜻.

```cpp
// C++ 이전: C로 구조화된 코드 짜기
struct Point {
    int x, y;
};
void point_move(struct Point* p, int dx, int dy) {
    p->x += dx;
    p->y += dy;
}

// C++ 이후: 객체지향
class Point {
public:
    int x, y;
    void move(int dx, int dy) {
        x += dx;
        y += dy;
    }
};
```

C++는 복잡하다. 매우 복잡하다. Stroustrup 본인도 "C++를 완전히 이해하는 사람은 없다"고 했다. 하지만 성능이 필요한 곳에선 대안이 없었다. 게임 엔진, 데이터베이스, 브라우저, 운영체제. 성능이 중요한 소프트웨어는 대부분 C++다.

```
Stroustrup의 유산:
└── C++ (1983)
```

Stroustrup은 70대인 지금도 C++ 표준 위원회에서 활동한다. 언어가 너무 복잡해지는 걸 막으려고 애쓴다고 한다. 잘 안 되고 있다고 한다.

## Anders Hejlsberg - 언어를 네 번 만든 사람

Anders Hejlsberg는 특이한 이력을 가졌다. 성공적인 프로그래밍 언어를 네 개나 만들었다.

1980년대, Borland에서 Turbo Pascal을 만들었다. 빠른 컴파일 속도로 유명했다. 이후 Delphi를 만들었다. Visual Basic 킬러로 불렸다.

1996년, Microsoft가 그를 스카우트했다. Borland가 소송을 걸 정도로 거물이었다. Microsoft에서 J++(Java 클론)를 만들다가 Sun과 싸우고, 아예 새 언어를 만들었다. C#이다.

2012년, TypeScript를 만들었다. JavaScript에 타입을 얹은 언어. 처음엔 "또 Microsoft가 이상한 거 만들었네" 했는데, 지금은 대세가 됐다.

```
Hejlsberg의 유산:
├── Turbo Pascal (1983)
├── Delphi (1995)
├── C# (2000)
└── TypeScript (2012)
```

네 개의 언어가 전부 성공했다. 이 정도 기록을 가진 사람은 없다.

## Donald Knuth - 컴퓨터 과학의 아리스토텔레스

Donald Knuth는 프로그래머라기보다 학자다. 하지만 그가 없었다면 현대 프로그래밍은 존재하지 않았을 것이다.

1962년, Knuth는 컴파일러에 관한 책을 쓰기 시작했다. 12페이지짜리 개요가 3000페이지가 됐다. 그래서 시리즈로 나눴다. "The Art of Computer Programming", 줄여서 TAOCP. 컴퓨터 과학의 바이블이다.

```
TAOCP 시리즈:
├── Vol 1: Fundamental Algorithms (1968)
├── Vol 2: Seminumerical Algorithms (1969)
├── Vol 3: Sorting and Searching (1973)
├── Vol 4A: Combinatorial Algorithms (2011)
└── Vol 4B: Combinatorial Algorithms (2022)
    ... (Vol 5, 6, 7 계획 중, 80대에도 집필 중)
```

빌 게이츠가 말했다. "이 책을 다 읽었다면 이력서를 보내라." 농담 반 진담 반이다. 전부 읽은 사람은 거의 없다. 하지만 알고리즘을 공부하는 사람이라면 한 번은 펼쳐본다.

1977년, Knuth는 책 조판이 마음에 안 들었다. 출판사가 납품한 결과물이 너무 못생겼다. 그래서 직접 조판 시스템을 만들었다. TeX(텍)이다. 수학 수식을 아름답게 표현할 수 있는 시스템. 40년이 지난 지금도 모든 학술 논문이 TeX(또는 LaTeX)로 작성된다.

```latex
% TeX으로 작성한 수식
$$ E = mc^2 $$

$$ \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi} $$

$$ \sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6} $$
```

Knuth의 버전 넘버링은 독특하다. TeX의 버전은 π에 수렴한다. 3, 3.1, 3.14, 3.141... 현재 3.141592653이다. 그가 죽으면 버전이 π가 되고, 더 이상 업데이트되지 않는다. METAFONT는 e에 수렴한다.

그는 버그 리포트에 수표를 보낸다. 처음엔 2.56달러(16진수로 0x100센트). 지금은 인플레이션 반영해서 올랐다. 대부분 수표를 현금화하지 않고 액자에 넣어둔다. "Knuth 수표"를 받는 건 프로그래머의 훈장이다.

```
Knuth의 유산:
├── "The Art of Computer Programming" (1968~)
├── TeX 조판 시스템 (1978)
├── METAFONT (폰트 설계 시스템)
├── Literate Programming (문학적 프로그래밍)
├── 알고리즘 분석 방법론
└── 빅오 표기법 대중화
```

Knuth는 이메일을 안 쓴다. 1990년에 끊었다. 집중해서 책을 쓰려면 방해가 없어야 한다고. 연락하려면 비서에게 편지를 보내야 한다. 종이 편지. 80대인 지금도 스탠포드 연구실에서 TAOCP를 쓰고 있다. 완성까지 앞으로 25년은 더 걸릴 거라고 한다.

## Richard Stallman - 자유 소프트웨어의 전도사

1983년, MIT AI 연구소. Richard Stallman은 프린터 드라이버 소스코드를 달라고 했다가 거절당했다. 예전엔 소스코드를 공유하는 게 당연했는데, 상업화되면서 막혔다. 분노한 Stallman은 GNU 프로젝트를 시작했다. GNU는 "GNU's Not Unix"의 재귀 약자다.

목표는 완전히 자유로운 운영체제였다. 누구나 쓰고, 수정하고, 배포할 수 있는. Stallman은 GCC(컴파일러), Emacs(에디터), GDB(디버거) 등 핵심 도구들을 만들었다. 그리고 GPL(General Public License)을 만들었다. 자유 소프트웨어의 법적 기반.

```
Stallman의 유산:
├── GNU 프로젝트 (1983)
├── GCC (GNU Compiler Collection)
├── Emacs
├── GPL 라이선스
└── "Free Software" 운동
```

GNU에는 커널이 없었다. Hurd라는 커널을 만들고 있었지만 완성이 안 됐다. 1991년 Linus Torvalds의 Linux가 나왔다. GNU 도구들 + Linux 커널 = 완전한 운영체제. 그래서 Stallman은 "GNU/Linux"라고 불러야 한다고 주장한다. 대부분 그냥 Linux라고 부르지만.

Stallman은 극단적이다. "오픈소스"라는 말도 싫어한다. "자유 소프트웨어"라고 불러야 한다고 한다. 편의성과 타협하지 않는다. 휴대폰도 안 쓴다. 자유 소프트웨어가 아니니까.

## Tim Berners-Lee - 웹을 발명한 사람

1989년, CERN(유럽 입자물리연구소). Tim Berners-Lee는 문서 공유 시스템을 제안했다. 연구소 내 문서들이 여기저기 흩어져 있어서 찾기 어려웠다. 하이퍼텍스트로 연결하면 어떨까?

그가 만든 것: HTTP(프로토콜), HTML(문서 형식), URL(주소 체계), 최초의 웹 브라우저, 최초의 웹 서버. 웹의 모든 기반을 한 사람이 만들었다.

```
Berners-Lee의 유산:
├── HTTP
├── HTML
├── URL
├── 최초의 웹 브라우저/서버
└── W3C (World Wide Web Consortium) 설립
```

중요한 결정이 있었다. 특허를 내지 않았다. 로열티를 받지 않았다. 웹을 공개했다. 만약 특허를 냈다면? 웹페이지 하나 열 때마다 돈을 내야 했을 수도 있다. 웹이 이렇게 퍼지지 못했을 수도 있다.

Berners-Lee는 기사 작위를 받았다. "Sir Tim Berners-Lee"다.

## Rob Pike - 벨 연구소의 마지막 세대

Rob Pike는 덜 알려졌지만, 우리가 매일 쓰는 것들을 만들었다.

1980년대, 벨 연구소. Pike는 Thompson, Ritchie와 함께 일했다. Unix의 다음 버전인 Plan 9을 만들었다. 상업적으로는 실패했지만, 아이디어는 살아남았다. "모든 것은 파일이다"라는 Unix 철학을 극단까지 밀어붙인 시스템이었다. 네트워크 연결도 파일, 프로세스도 파일, 윈도우도 파일.

1992년, Pike는 Ken Thompson과 함께 UTF-8을 설계했다. 식당 종이 냅킨에 스케치한 게 시작이었다. 전 세계 모든 문자를 표현하면서도 ASCII와 호환되는 인코딩. 지금 웹페이지의 98%가 UTF-8이다. 이 글도 UTF-8로 인코딩되어 있다.

```
Pike의 유산:
├── UTF-8 (1992, Thompson과 공동)
├── Go 언어 (2009, Thompson, Griesemer와 공동)
├── Plan 9 운영체제
├── sam, acme 에디터
└── "The Practice of Programming" (Kernighan과 공저)
```

2007년, Google. Pike는 C++ 컴파일이 45분 걸리는 걸 보면서 답답해했다. Thompson, Robert Griesemer와 함께 새 언어를 만들기 시작했다. Go다. C의 단순함, Python의 가독성, 그리고 현대적인 동시성 지원. 컴파일은 몇 초면 끝난다.

Go의 설계 철학은 "적을수록 좋다"였다. 제네릭도 없었다(나중에 추가됨). 예외도 없다. 상속도 없다. 다른 언어들이 기능을 추가할 때, Go는 뺐다. Pike는 말했다. "복잡함은 곱셈이다. 단순함을 유지하는 게 더 어렵다."

## Larry Wall - 언어학자가 만든 언어

Larry Wall은 프로그래머가 아니라 언어학자였다. 자연어를 연구했다. 그래서 그가 만든 프로그래밍 언어도 자연어처럼 생겼다.

1987년, Wall은 시스템 관리를 하면서 텍스트 처리 작업이 많았다. sed, awk로는 부족했다. 그래서 Perl을 만들었다. "Practical Extraction and Report Language"의 약자라고 하는데, 나중에 붙인 거다. 원래 이름의 의미는 없다.

Perl의 모토는 "There's more than one way to do it(TMTOWTDI, 팀투디)"이다. 같은 일을 하는 방법이 열 가지가 있다. Python의 "There should be one obvious way"와 정반대다. Wall은 자연어가 그렇다고 봤다. 같은 뜻을 여러 방식으로 표현할 수 있듯이.

```perl
# Perl의 유명한 한 줄짜리들
perl -e 'print "Hello World\n"'
perl -pe 's/foo/bar/g' file.txt
perl -ne 'print if /pattern/' file.txt

# 같은 일을 하는 여러 방법
print "Hello" if $condition;
$condition && print "Hello";
$condition and print "Hello";
```

Perl은 1990년대 웹의 언어였다. CGI 스크립트는 거의 다 Perl이었다. "인터넷의 덕트 테이프"라고 불렸다. 뭐든 붙일 수 있었다.

Wall은 "프로그래머의 세 가지 미덕"을 말했다.

```
1. 게으름 (Laziness)
   → 반복 작업을 자동화하게 만든다

2. 조급함 (Impatience)
   → 느린 프로그램을 못 참고 최적화하게 만든다

3. 자만심 (Hubris)
   → 남들이 욕할 코드를 못 짜게 만든다
```

농담처럼 들리지만, 진지한 통찰이다.

```
Wall의 유산:
├── Perl (1987)
├── patch 프로그램 (diff를 적용하는 도구)
├── rn (Usenet 뉴스리더)
└── "프로그래머의 세 가지 미덕"
```

Perl은 2000년대 이후 Python과 Ruby에 밀렸다. Perl 6(지금은 Raku)는 15년간 개발되다가 별개의 언어가 됐다. 하지만 Wall의 영향은 남았다. 정규표현식 문법, 텍스트 처리 패러다임, 그리고 "여러 방법이 있다"는 철학.

## John Backus - 최초의 고급 언어

1954년, IBM. John Backus는 지쳤다. 기계어로 프로그래밍하는 건 너무 고통스러웠다. 0과 1의 나열. 한 글자라도 틀리면 처음부터 다시. 그래서 팀을 만들었다. 목표는 "수학 공식처럼 코드를 쓰는 것".

3년 후, FORTRAN이 나왔다. "FORmula TRANslation". 최초의 고급 프로그래밍 언어. 수학 공식을 그대로 코드로 옮길 수 있었다.

```fortran
C     FORTRAN 코드 예시 (1957)
      PROGRAM HELLO
      PRINT *, 'Hello, World!'
      END PROGRAM HELLO

C     수학 공식을 그대로
      X = (-B + SQRT(B**2 - 4*A*C)) / (2*A)
```

사람들은 비웃었다. "기계가 만든 코드가 손으로 짠 것보다 빠를 리 없어." Backus는 증명했다. FORTRAN 컴파일러가 만든 코드는 손으로 짠 것과 거의 같은 속도였다. 고급 언어의 시대가 열렸다.

Backus는 BNF(Backus-Naur Form)도 만들었다. 프로그래밍 언어의 문법을 정의하는 표기법. 지금도 모든 언어 명세에 쓰인다.

```
Backus의 유산:
├── FORTRAN (1957)
├── BNF 표기법 (1959)
└── 함수형 프로그래밍 연구 (1977 튜링상 강연)
```

FORTRAN은 아직도 살아있다. 과학 계산, 기상 예보, 물리 시뮬레이션. 70년 가까이 현역이다. 고급 언어의 할아버지.

## Niklaus Wirth - 단순함의 철학자

Niklaus Wirth는 언어를 여러 개 만들었다. Pascal, Modula, Modula-2, Oberon. 전부 같은 철학이었다. "단순하고 명확하게."

1970년, Pascal이 나왔다. 프로그래밍 교육을 위한 언어. 구조적 프로그래밍을 배우기 좋게 설계됐다. 변수를 먼저 선언하고, 타입을 명확히 하고, 블록 구조로 코드를 짠다.

```pascal
program HelloWorld;
begin
  writeln('Hello, World!');
end.

{ 구조적이고 읽기 쉬운 }
function Factorial(n: integer): integer;
begin
  if n <= 1 then
    Factorial := 1
  else
    Factorial := n * Factorial(n - 1);
end;
```

1980년대, Pascal은 대학 교육의 표준이었다. 대부분의 프로그래머가 Pascal로 프로그래밍을 배웠다. Turbo Pascal(Anders Hejlsberg가 만든)이 PC에서 폭발적으로 인기를 끌었다.

Wirth는 "Wirth의 법칙"으로도 유명하다. "소프트웨어는 하드웨어가 빨라지는 것보다 더 빨리 느려진다." 무어의 법칙의 비관적 쌍둥이다. 하드웨어가 2년마다 2배 빨라져도, 소프트웨어가 더 무거워져서 체감 속도는 그대로라는 뜻.

```
Wirth의 유산:
├── Pascal (1970)
├── Modula-2 (1978)
├── Oberon (1987)
├── "Wirth의 법칙"
├── "Algorithms + Data Structures = Programs" (1976)
└── 구조적 프로그래밍 교육의 표준화
```

Wirth는 2024년 1월에 세상을 떠났다. 89세. 단순함을 추구한 평생이었다.

## Yukihiro Matsumoto (Matz) - 개발자의 행복

1995년, 일본. Yukihiro Matsumoto(마츠모토 유키히로, 통칭 Matz)는 새 언어를 공개했다. Ruby. 이름은 동료의 탄생석에서 따왔다. Perl이 진주(Pearl)니까 루비(Ruby)로.

Matz의 철학은 독특했다. "프로그래머를 행복하게." 기계를 위한 언어가 아니라 사람을 위한 언어. 코드를 쓰는 것 자체가 즐거워야 한다.

```ruby
# Ruby: 사람이 읽기 좋은 코드
5.times { puts "Hello" }

# 영어처럼 읽힌다
3.days.ago
"hello".reverse.upcase

# 블록과 이터레이터
[1, 2, 3].map { |n| n * 2 }  # => [2, 4, 6]
```

Ruby는 일본에서 시작해서 세계로 퍼졌다. 2005년, Ruby on Rails가 나오면서 폭발했다. "15분 만에 블로그 만들기" 데모가 유명했다. Twitter, GitHub, Airbnb. 초기 스타트업들이 Rails로 빠르게 제품을 만들었다.

```
Matz의 유산:
├── Ruby (1995)
├── "프로그래머를 행복하게" 철학
├── Ruby on Rails 생태계의 기반
└── MINASWAN (Matz Is Nice And So We Are Nice)
```

Matz는 지금도 Ruby를 개발한다. "MINASWAN"이라는 문화가 있다. "Matz는 친절하고 우리도 친절하다." Ruby 커뮤니티는 친절하기로 유명하다. 언어 창시자의 성격이 커뮤니티 문화가 됐다.

## Rasmus Lerdorf - 웹의 80%를 만든 남자

1994년, Rasmus Lerdorf는 자기 이력서 웹페이지의 방문자를 추적하고 싶었다. 그래서 Perl 스크립트를 몇 개 만들었다. "Personal Home Page Tools". 줄여서 PHP.

Lerdorf는 PHP를 프로그래밍 언어로 만들 생각이 없었다. 그냥 자기 웹페이지용 도구였다. 그런데 사람들이 가져다 쓰기 시작했다. 기능 요청이 들어왔다. 덧붙이고 덧붙이다 보니 언어가 됐다.

```php
<?php
// PHP: HTML 안에 코드를 섞는다
echo "Hello, World!";

// 그냥 되는 것들
$name = "PHP";
echo "This is $name";  // 문자열 안에 변수가 그냥 들어감
?>
```

PHP는 "제대로 설계된" 언어가 아니다. Lerdorf 본인도 인정한다. "나는 프로그래밍 언어를 만드는 방법을 몰랐다. 그냥 계속 다음 문제를 해결했을 뿐이다." 일관성이 없고, 함수 이름이 뒤죽박죽이고, 이상한 동작이 많다.

하지만 웹에서 이겼다. 배우기 쉽고, 시작하기 쉽고, 어디서나 돌아간다. WordPress, Wikipedia, Facebook(초기). 웹사이트의 약 80%가 PHP로 돌아간다.

```
Lerdorf의 유산:
├── PHP (1995)
├── 웹 서버 사이드 스크립팅의 대중화
└── "나는 프로그래밍을 싫어한다" (유명한 인용)
```

Lerdorf는 "나는 프로그래밍을 싫어한다"고 말한 적 있다. 문제를 해결하는 건 좋아하지만, 코드 자체를 쓰는 건 싫다고. 최소한의 코드로 문제를 해결하는 게 그의 방식이다.

## Graydon Hoare - 안전한 시스템 언어의 꿈

2006년, Mozilla. Graydon Hoare는 엘리베이터에서 소프트웨어 버그로 고장난 일을 겪었다. 21층까지 계단으로 올라갔다. "C와 C++의 메모리 버그가 세상을 이렇게 만들었구나." Rust가 시작됐다.

Rust의 목표는 명확했다. C++만큼 빠르면서 메모리 안전한 언어. 가비지 컬렉션 없이. 컴파일 타임에 메모리 오류를 잡는다. "세그폴트를 컴파일 에러로."

```rust
// Rust: 소유권 시스템
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;  // s1의 소유권이 s2로 이동
    // println!("{}", s1);  // 컴파일 에러! s1은 더 이상 유효하지 않음
    println!("{}", s2);  // OK
}

// 빌림(Borrowing)
fn calculate_length(s: &String) -> usize {
    s.len()
}  // s는 빌린 것이므로 여기서 해제되지 않음
```

배우기 어렵다. 컴파일러가 까다롭다. 하지만 컴파일되면 안전하다. 메모리 버그, 데이터 레이스, 널 포인터. C/C++를 괴롭히던 문제들이 Rust에서는 컴파일 에러가 된다.

```
Hoare의 유산:
├── Rust (2010, 1.0은 2015)
├── 소유권(Ownership) 시스템
├── "두려움 없는 동시성(Fearless Concurrency)"
└── 메모리 안전성의 새로운 패러다임
```

Hoare는 2013년에 Rust 팀을 떠났다. 하지만 Rust는 계속 성장했다. Linux 커널에 Rust가 들어갔다. Torvalds가 C 외의 언어를 커널에 허용한 건 처음이다. Discord, Dropbox, Cloudflare. 성능이 중요한 곳에서 Rust가 C++를 대체하고 있다.

## Chris Lattner - 컴파일러의 마법사

Chris Lattner는 도구를 만드는 사람이다. 그의 도구 위에서 다른 사람들이 언어를 만든다.

2000년, 일리노이 대학교 대학원생 Lattner는 LLVM을 만들기 시작했다. 컴파일러의 중간 단계를 모듈화한 프로젝트. 프론트엔드(언어 파싱)와 백엔드(기계어 생성)를 분리한다. 새 언어를 만들고 싶으면? LLVM 프론트엔드만 만들면 된다. 최적화와 코드 생성은 LLVM이 해준다.

```
전통적 컴파일러:
  [소스코드] → [컴파일러] → [기계어]
               (전부 직접 만듦)

LLVM:
  [소스코드] → [프론트엔드] → [LLVM IR] → [LLVM 백엔드] → [기계어]
               (이것만 만들면 됨)    (공용)      (공용)
```

Rust, Swift, Kotlin Native, Julia. 전부 LLVM 위에서 돌아간다. LLVM이 없었다면 이 언어들은 존재하지 않거나, 훨씬 열등했을 것이다.

2010년, Apple에서 Lattner는 Clang을 완성했다. LLVM 기반의 C/C++/Objective-C 컴파일러. GCC를 대체했다. 그리고 2014년, Swift를 발표했다.

```swift
// Swift: 현대적이고 안전한 문법
let greeting = "Hello, World!"
print(greeting)

// 옵셔널로 null 안전성
var name: String? = nil
print(name?.count ?? 0)  // nil이면 0

// 간결한 클로저
let numbers = [1, 2, 3]
let doubled = numbers.map { $0 * 2 }
```

Swift는 Objective-C를 대체하기 위해 만들어졌다. 더 안전하고, 더 빠르고, 더 현대적인 언어. iPhone 앱 개발의 미래.

```
Lattner의 유산:
├── LLVM (2000~)
├── Clang (2007)
├── Swift (2014)
└── Mojo (2023, AI 프로그래밍 언어)
```

Lattner는 Apple을 떠나 Tesla(자율주행), Google(TPU), SiFive(RISC-V)를 거쳤다. 지금은 Modular에서 Mojo를 만들고 있다. Python처럼 쓰기 쉬우면서 C처럼 빠른 AI 언어. 또 다른 혁명을 준비 중이다.

## 그들의 공통점

24명. 90년의 역사. 이 사람들에게는 몇 가지 공통점이 있다.

**첫째, 자기가 필요해서 만들었다.**

Torvalds는 Minix가 마음에 안 들어서 Linux를 만들었다. BitKeeper가 짜증나서 Git을 만들었다. Berners-Lee는 문서 찾기 귀찮아서 웹을 만들었다. Backus는 기계어 프로그래밍이 고통스러워서 FORTRAN을 만들었다. Hoare는 엘리베이터 버그로 21층 계단을 오르고 나서 Rust를 만들었다. Knuth는 책 조판이 못생겨서 TeX를 만들었다. "이런 게 있으면 좋겠다"가 아니라 "이게 없으면 안 되겠다"였다.

**둘째, 처음엔 작게 시작했다.**

Linux는 "전문적인 게 되진 않을 것"이라는 취미 프로젝트였다. Python은 크리스마스 연휴 심심풀이였다. JavaScript는 10일짜리 프로토타입이었다. PHP는 이력서 방문자 추적용 스크립트였다. Ruby는 동료의 탄생석 이름을 붙인 개인 프로젝트였다. Dijkstra 알고리즘은 카페에서 약혼녀와 쇼핑 중 20분 만에 나왔다. 세상을 바꾸겠다고 시작한 게 아니었다.

**셋째, 공개했다.**

Berners-Lee는 웹에 특허를 내지 않았다. Stallman은 GCC를 GPL로 공개했다. Thompson과 Ritchie는 Unix 소스코드를 대학에 나눠줬다. Lattner는 LLVM을 오픈소스로 만들어서 수십 개의 언어가 그 위에서 태어났다. 돈을 벌 기회를 포기한 것처럼 보이지만, 그래서 더 많이 퍼졌다.

**넷째, 오래 붙들었다.**

Torvalds는 30년 넘게 Linux를 유지보수한다. Stroustrup은 40년 넘게 C++를 발전시킨다. van Rossum은 30년간 Python을 이끌었다. Knuth는 60년 넘게 TAOCP를 쓰고 있다. 80대에도 완성까지 25년 더 걸린다고 한다. Matz는 30년간 Ruby를 개발하며 "개발자의 행복"을 추구한다. 한 번 만들고 끝이 아니라, 평생을 바쳤다.

**다섯째, 성격이 코드에 드러난다.**

Dijkstra의 날카로움은 구조적 프로그래밍의 엄격함이 됐다. Matz의 친절함은 Ruby 커뮤니티의 MINASWAN 문화가 됐다. Wall의 언어학적 관점은 Perl의 "여러 방법이 있다" 철학이 됐다. Wirth의 단순함 추구는 Pascal의 명확한 문법이 됐다. 창시자의 철학이 언어의 DNA가 됐다.

**여섯째, 대부분 독설가다.**

Torvalds는 "당신의 코드는 쓰레기"라고 메일링 리스트에 쓴다. Dijkstra는 BASIC을 배운 학생을 "정신적 불구"라고 했다. Stallman은 "오픈소스"라는 말을 싫어한다. 하지만 그 날카로움은 품질에 대한 집착에서 나왔다. 타협하지 않았기 때문에 살아남았다.

## 우리가 쓰는 모든 것

지금 이 순간에도, 그들의 유산이 돌아가고 있다.

**아침에 일어나서:**
스마트폰 알람이 울린다. 안드로이드라면 Linux 커널(Torvalds) 위에서 Java(Gosling) 또는 Kotlin이 돌아간다. 아이폰이라면 Unix 계열 OS 위에서 Swift(Lattner)가 돌아간다. 둘 다 C(Ritchie)로 작성된 핵심 위에서.

**회사에서:**
터미널을 연다. Unix의 후손이 돌아간다. `ls`, `cd`, `grep`. Thompson과 Ritchie의 유산이다. `git commit`을 친다. Torvalds가 2주 만에 만든 도구. `git diff`의 결과를 적용하는 건 Wall이 만든 patch다.

**코드를 짠다:**
중괄호, 세미콜론, `if`, `for`, `while`. 전부 C에서 왔다. 객체지향? Kay의 Smalltalk에서 시작했다. 람다 표현식? McCarthy의 Lisp에서 왔다. 가비지 컬렉션? 역시 Lisp. 1959년에.

**웹을 연다:**
HTTP로 요청이 간다. HTML로 렌더링된다. URL로 주소가 정해진다. 전부 Berners-Lee 한 사람이 만들었다. 문자가 깨지지 않는 건? Pike와 Thompson이 냅킨에 설계한 UTF-8 덕분이다.

**브라우저 안에서:**
Eich가 10일 만에 만든 JavaScript가 돌아간다. 타입이 필요하면 Hejlsberg의 TypeScript. 서버에서는? van Rossum의 Python, Gosling의 Java, Lerdorf의 PHP가 응답을 만든다. PHP는 웹의 80%다.

**배포한다:**
서버는 Linux(Torvalds). 컨테이너는 Go(Pike, Thompson)로 작성된 Docker와 Kubernetes. 코드가 컴파일되는 건? Lattner의 LLVM이 기반이다. Rust, Swift, Kotlin Native. 전부 LLVM 위에서 돌아간다.

**집에 와서:**
게임을 켠다. 게임 엔진은 C++(Stroustrup)다. 그래픽 드라이버도 C다. 스트리밍 서비스를 본다. 서버는 Linux, 추천 알고리즘은 Python. AI가 추천해주는 건? McCarthy가 1956년에 이름 붙인 "인공지능"이다.

**내비게이션을 켠다:**
최단 경로를 찾는다. Dijkstra가 카페에서 20분 만에 고안한 알고리즘이다. 1956년에.

**이 글을 읽는다:**
학술 논문처럼 예쁘게 조판된 수식이 있다면? Knuth의 TeX. 이 글이 블로그에 올라온 건? Ruby on Rails(Matsumoto)나 Python(van Rossum) 프레임워크일 수 있다.

---

90년 전 Turing이 상상한 기계가 지금 주머니에 들어있다. 70년 전 Hopper가 만든 컴파일러 개념이 매일 코드를 번역한다. 60년 전 McCarthy가 만든 가비지 컬렉션이 메모리를 청소한다. 50년 전 Thompson과 Ritchie가 만든 Unix가 서버실에서 돌아간다. 30년 전 Torvalds가 취미로 만든 OS가 세상을 지탱한다.

우리는 거인의 어깨 위에 서 있다. 24명의 거인. 90년의 유산. 매일 쓰면서도 의식하지 못할 뿐이다.

---

## 타임라인: 프로그래밍 역사의 이정표

```
1936 ──── 튜링 머신 (Turing)
          "계산 가능하다"의 정의, 모든 컴퓨터의 이론적 기반
          │
1945 ──── Enigma 해독 완료 (Turing)
          │
1952 ──── 최초의 컴파일러 A-0 (Hopper)
          "영어로 코드를 쓸 수 있다"
          │
1956 ──── "인공지능" 용어 탄생 (McCarthy)
       ├─ Dijkstra 알고리즘 (Dijkstra)
          │
1957 ──── FORTRAN (Backus)
          │
1958 ──── Lisp (McCarthy)
          가비지 컬렉션, 함수형 프로그래밍의 시작
          │
1959 ──── COBOL (Hopper)
          지금도 ATM의 95%가 사용
          │
1964 ──── BASIC (Kemeny & Kurtz)
          │
1968 ──── "Go To Considered Harmful" (Dijkstra)
       ├─ TAOCP Vol.1 출판 (Knuth)
       ├─ Dynabook 개념 제안 (Kay)
          구조적 프로그래밍의 시작
          │
1969 ──── Unix (Thompson & Ritchie)
       ├─ ARPANET (인터넷의 조상)
          │
1970 ──── Pascal (Wirth)
          │
1972 ──── C 언어 (Ritchie)
       ├─ Smalltalk (Kay)
          객체지향 프로그래밍, GUI의 탄생
          │
1977 ──── AWK (Aho, Weinberger, Kernighan)
          │
1978 ──── "The C Programming Language" K&R 출판 (Kernighan & Ritchie)
       ├─ TeX (Knuth)
          "Hello, World!"의 시작
          │
1983 ──── C++ (Stroustrup)
       ├─ GNU 프로젝트 시작 (Stallman)
       ├─ Turbo Pascal (Hejlsberg)
          │
1984 ──── Macintosh 출시 (Xerox PARC GUI의 영향)
          │
1985 ──── GCC (Stallman)
       ├─ Windows 1.0
          │
1987 ──── Perl (Wall)
          "인터넷의 덕트 테이프"
          │
1989 ──── WWW 제안 (Berners-Lee)
          HTTP, HTML, URL
          │
1991 ──── Linux (Torvalds)
       ├─ Python (van Rossum)
       ├─ WWW 공개 (Berners-Lee)
          "그냥 취미입니다"가 세상을 바꿈
          │
1992 ──── UTF-8 (Pike & Thompson)
          냅킨에 설계, 지금 웹의 98%가 사용
          │
1995 ──── Java (Gosling)
       ├─ JavaScript (Eich) - 10일 만에 제작
       ├─ PHP (Lerdorf)
       ├─ Delphi (Hejlsberg)
       ├─ Ruby (Matsumoto)
          │
1998 ──── Google 설립
          │
2000 ──── LLVM 시작 (Lattner)
       ├─ C# (Hejlsberg)
          │
2005 ──── Git (Torvalds) - 2주 만에 제작
          │
2009 ──── Go (Pike, Thompson, Griesemer)
       ├─ Node.js (Dahl)
          │
2010 ──── Rust (Hoare, Mozilla)
          │
2012 ──── TypeScript (Hejlsberg)
          │
2014 ──── Swift (Lattner)
          │
2015 ──── Rust 1.0 (Hoare)
          │
2023 ──── Mojo (Lattner)
          │
현재 ──── 이 모든 것 위에서 코딩 중
```

### 한눈에 보는 인물과 창작물

| 인물                     | 창작물                      | 연도               | 지금도 쓰이나?       |
|------------------------|--------------------------|------------------|----------------|
| **Alan Turing**        | 튜링 머신, 튜링 테스트            | 1936, 1950       | 이론적 기반         |
| **Grace Hopper**       | 컴파일러, COBOL              | 1952, 1959       | COBOL: ATM 95% |
| **John McCarthy**      | Lisp, AI 용어, GC          | 1956, 1958       | Lisp 파생 언어들    |
| **John Backus**        | FORTRAN, BNF             | 1957, 1959       | 과학 계산, 기상 예보   |
| **Edsger Dijkstra**    | 최단경로, 세마포어               | 1956, 1965       | 모든 내비게이션       |
| **Donald Knuth**       | TAOCP, TeX               | 1968, 1978       | 모든 학술 논문       |
| **Niklaus Wirth**      | Pascal, Modula, Oberon   | 1970, 1978, 1987 | 교육의 유산         |
| **Ken Thompson**       | Unix, UTF-8, Go          | 1969, 1992, 2009 | 전부 현역          |
| **Dennis Ritchie**     | C, Unix                  | 1972, 1969       | C: 시스템 전부      |
| **Brian Kernighan**    | K&R, AWK, Hello World    | 1974, 1977       | AWK: 쉘 스크립트    |
| **Alan Kay**           | Smalltalk, GUI, OOP      | 1972             | 모든 GUI, 모든 OOP |
| **Bjarne Stroustrup**  | C++                      | 1983             | 게임, 브라우저, OS   |
| **Richard Stallman**   | GNU, GCC, GPL            | 1983, 1985       | 오픈소스 전체        |
| **Larry Wall**         | Perl, patch              | 1987             | patch: Git이 사용 |
| **Tim Berners-Lee**    | HTTP, HTML, URL          | 1989             | 지금 이 글         |
| **Guido van Rossum**   | Python                   | 1991             | AI/ML 표준 언어    |
| **Linus Torvalds**     | Linux, Git               | 1991, 2005       | 서버 90%, 개발자 전원 |
| **Rob Pike**           | UTF-8, Go                | 1992, 2009       | 웹 98%, 클라우드    |
| **Rasmus Lerdorf**     | PHP                      | 1995             | 웹사이트 80%       |
| **Yukihiro Matsumoto** | Ruby                     | 1995             | Rails, 스타트업    |
| **Brendan Eich**       | JavaScript               | 1995             | 웹 전체           |
| **James Gosling**      | Java                     | 1995             | 엔터프라이즈, 안드로이드  |
| **Anders Hejlsberg**   | Pascal, Delphi, C#, TS   | 1983-2012        | 전부 현역          |
| **Chris Lattner**      | LLVM, Clang, Swift, Mojo | 2000-2023        | 현대 컴파일러 기반     |
| **Graydon Hoare**      | Rust                     | 2010             | Linux 커널, 시스템  |

90년의 역사. 한 줄 한 줄이 누군가의 평생이다.
