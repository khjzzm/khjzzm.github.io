---
layout: post
category: devlog
title: Java의 격변사 - Sun의 몰락, Oracle의 인수, Jakarta의 탄생
---

Spring Boot 3으로 업그레이드하려다 보면 갑자기 모든 import가 빨간 줄이 된다. `javax.servlet`이 `jakarta.servlet`으로 바뀌었기 때문이다. 단순한 패키지 이름 변경 같지만, 그 뒤에는 한 회사의 몰락, 74억 달러의 인수극, 상표권 분쟁이 얽혀 있다. Java 30년 역사의 굵직한 사건들이다.

## 1장: Sun Microsystems의 탄생과 전성기 (1982-2000)

Java를 만든 회사는 Oracle이 아니다. Sun Microsystems라는, 지금은 사라진 회사다. 이름의 Sun은 Stanford University Network의 약자다. 1982년, 스탠포드 대학원생들이 만든 회사였다.

Sun은 워크스테이션과 서버 시장의 강자였다. "The Network is the Computer"라는 비전을 가지고 있었는데, 지금 보면 클라우드 시대를 예언한 것 같기도 하다.

1995년, Sun은 Java를 발표했다. James Gosling이 이끄는 팀이 만들었다. 원래는 가전제품용 언어로 시작했는데, 웹 브라우저에서 돌아가는 애플릿으로 방향을 틀면서 폭발적으로 성장했다. "Write Once, Run Anywhere" - 한 번 작성하면 어디서든 실행된다는 약속은 혁명적이었다.

Java는 세 가지 에디션으로 나뉘어 있었다. Java SE(Standard Edition)는 JDK, JVM, 핵심 API다. Java EE(Enterprise Edition)는 서버와 웹 개발을 위한 확장이다. Servlet, JPA, EJB 같은 것들이 여기에 속한다. Java ME(Micro Edition)는 모바일용이었는데, 나중에 Android에 밀려 사실상 사망한다.

여기서 `javax`의 x는 eXtension을 의미한다. Java SE의 핵심이 아닌 확장 API라는 뜻이다.

2000년대 초반, Sun은 승승장구했다. Java는 엔터프라이즈 시장을 지배했고, 닷컴 버블 시절 시가총액이 2000억 달러를 넘었다.

## 2장: Sun의 몰락 (2000-2009)

닷컴 버블이 꺼지면서 Sun도 추락했다. 2002년까지 주가는 90% 이상 폭락했다. 더 큰 문제는 비즈니스 모델이었다. Sun은 하드웨어 회사였는데, 고가의 워크스테이션 시장이 저가의 x86 서버에 잠식당하고 있었다. Linux가 Solaris를 대체하기 시작했다.

Java는 잘 나갔지만, 정작 Sun은 Java로 돈을 벌지 못했다. Java는 무료였고, 라이선스 수익은 미미했다. IBM, BEA, Oracle 같은 회사들이 Java 기반 제품으로 돈을 벌 때, 정작 Java를 만든 Sun은 구경만 하고 있었다.

같은 시기, Apache Jakarta Project가 전성기를 맞고 있었다. 1999년에 시작된 이 프로젝트에서 Tomcat, Log4j, Struts, Ant, Maven 같은 전설적인 도구들이 나왔다. 2000년대 초반 Java 웹 개발은 곧 Jakarta였다. 하지만 2003년 Spring이 등장하면서 Struts가 밀려나기 시작했고, 프로젝트는 점점 분산됐다. 2011년 Apache Jakarta Project는 해체되고 각 프로젝트가 독립했다. 이 "Jakarta"라는 이름은 나중에 다시 등장한다.

2006년, Sun은 Java를 오픈소스로 풀어버렸다. OpenJDK의 시작이다. 커뮤니티에 기여하자는 이상주의적 결정이었지만, 수익화의 길은 더 멀어졌다.

## 3장: Oracle의 인수 (2009-2010)

2009년, Oracle이 Sun을 74억 달러에 인수한다고 발표했다. 업계는 충격에 빠졌다. Oracle은 데이터베이스 회사인데, 왜 하드웨어 회사를 사는 걸까?

Larry Ellison의 계산은 달랐다. Oracle이 원한 건 Sun의 하드웨어가 아니었다. Java와 MySQL이었다. Java는 Oracle의 주력 제품들이 돌아가는 플랫폼이었고, MySQL은 성장하는 오픈소스 데이터베이스 시장의 잠재적 위협이었다.

2010년 1월, 인수가 완료됐다. James Gosling을 비롯한 Sun의 핵심 엔지니어들은 대부분 떠났다. Gosling은 나중에 "Oracle에서 일하는 건 상상할 수 없었다"고 말했다.

## 4장: Oracle 체제의 Java (2010-2017)

Oracle은 Java에 대해 Sun과 다른 접근을 취했다. Sun이 이상주의적이었다면, Oracle은 철저히 비즈니스 중심이었다.

가장 큰 변화는 라이선스 정책이었다. Oracle JDK는 2019년부터 상업적 사용에 유료 라이선스가 필요해졌다. 정확히 말하면 개인 학습이나 개발 용도는 여전히 무료였다. 유료 대상은 기업의 프로덕션 서버였다. 하지만 이미 수백 대의 서버에 Oracle JDK를 깔아둔 기업들은 혼란에 빠졌다. 갑자기 수억 원의 라이선스 비용을 내라니.

대안이 필요했다. 다행히 Sun이 2006년에 오픈소스로 풀어둔 OpenJDK가 있었다. 문제는 OpenJDK 자체는 소스코드일 뿐, 누군가 빌드해서 배포해야 한다는 것이었다. 여기서 JDK 배포판 전쟁이 시작됐다.

Amazon은 Corretto를 내놓았다. AWS 환경에 최적화되어 있고, 무료 LTS 지원 기간이 길다. Azul은 Zulu를 내놓았다. 다양한 플랫폼을 지원하고, 유료 기술 지원 옵션이 있다. Eclipse 재단은 Temurin을 만들었다. 순수한 커뮤니티 기반이다. Microsoft도 자체 OpenJDK 빌드를 배포하기 시작했다.

재미있는 건 이 배포판들이 99% 동일하다는 것이다. 전부 같은 OpenJDK 소스코드를 기반으로 한다. Linux 커널은 하나인데 Ubuntu, CentOS, Debian이 있는 것과 비슷하다. Oracle JDK에서 Amazon Corretto로 바꿔도 코드 한 줄 수정할 필요가 없다. 차이는 지원 기간, 패치 속도, 플랫폼 지원 정도다. 결국 Oracle의 유료화는 역설적으로 JDK 생태계를 더 다양하고 건강하게 만들었다.

Google과의 전쟁도 시작됐다. Android가 Java API를 사용한다는 이유로 Oracle은 Google을 고소했다. 10년에 걸친 소송 끝에 2021년 대법원에서 Google이 승리했지만, 이 싸움은 Java 생태계 전체에 불확실성을 안겼다.

한편 Java EE는 Spring에 시장을 뺏기고 있었다. 복잡한 EJB 대신 가벼운 Spring을 선택하는 개발자들이 늘어났다. Oracle 입장에서 Java EE는 유지보수 부담만 크고 수익은 나지 않는 짐이었다.

## 5장: Jakarta의 탄생 (2017-2020)

2017년, Oracle은 Java EE를 Eclipse 재단에 "기증"했다. 기증이라고 하면 아름다워 보이지만, 실상은 짐을 덜어낸 것에 가까웠다.

문제는 상표권이었다. Oracle은 코드는 줬지만 "Java"라는 이름은 주지 않았다. `javax`는 Java + extension이니까, 이것도 쓰면 안 된다는 입장이었다. Google 소송이 진행 중이던 시점이라 상표권에 민감할 수밖에 없었다.

Eclipse 재단은 협상을 시도했다. "javax 이름 쓰게 해달라", "새 버전에서만 API 수정하면 안 되겠냐". 전부 거절당했다. 결국 완전히 새로운 네임스페이스가 필요했다.

2018년, 커뮤니티 투표에서 "Jakarta EE"가 선택됐다. Java는 인도네시아의 자바 섬에서 따온 이름이고, Jakarta(자카르타)는 그 자바 섬의 수도다. Java와의 연관성을 유지하면서 법적으로 안전한 선택이었다. 2011년에 해체된 Apache Jakarta Project의 레거시를 활용한 것이기도 하다. 개발자들에게 "Jakarta = Java 생태계"라는 인식이 남아있었으니까.

2020년, Jakarta EE 9에서 모든 패키지가 `javax.*`에서 `jakarta.*`로 변경됐다.

## 6장: Java의 르네상스 (2021-현재)

2021년은 Java에게 전환점이었다. 10년간의 Google 소송이 끝났고, Oracle은 라이선스 정책을 다시 바꿨다. Oracle JDK를 다시 무료로 쓸 수 있게 한 것이다. 유료화로 잃었던 신뢰를 회복하려는 시도였다.

같은 해 Java 17 LTS가 출시됐다. Spring Boot 3.0의 최소 요구 버전이 되면서, 많은 기업들이 Java 8에서 17로 대이동을 시작했다. 2022년 11월, Spring Boot 3.0이 정식 출시되면서 Jakarta EE 전환이 본격화됐다.

2023년 9월, Java 21 LTS가 나왔다. 가장 큰 변화는 Virtual Threads(가상 스레드)다. Project Loom이라고 불리던 이 기능은 경량 스레드를 제공한다. 기존에는 OS 스레드 하나당 Java 스레드 하나였는데, 이제 수백만 개의 가상 스레드를 만들 수 있다. Go 언어의 goroutine, Kotlin의 coroutine과 비슷한 개념이다. 동시성 프로그래밍의 패러다임이 바뀌고 있다.

GraalVM과 네이티브 이미지도 주류로 올라왔다. Spring Boot 3부터 AOT(Ahead-of-Time) 컴파일을 공식 지원한다. JVM 없이 바로 실행되는 네이티브 바이너리를 만들 수 있다. 시작 시간이 밀리초 단위로 줄어든다. 서버리스, 컨테이너 환경에서 큰 장점이다.

Kotlin도 빼놓을 수 없다. JetBrains가 만든 이 JVM 언어는 Android 공식 언어가 된 이후 서버 사이드에서도 성장하고 있다. 2024년 Kotlin 2.0이 나오면서 K2 컴파일러가 도입됐고, 컴파일 속도가 대폭 개선됐다. Spring Framework는 Kotlin을 first-class로 지원하고, 많은 개발자들이 Java 대신 Kotlin을 선택하고 있다.

Java는 6개월마다 새 버전이 나온다. Java 22, 23, 24... 버전 숫자는 계속 올라가고 있다. Oracle 체제에서 정체됐던 Java가 다시 빠르게 진화하고 있다.

## 에필로그: 30년, 그리고 계속

Sun Microsystems는 사라졌지만, 그들이 남긴 것들은 여전히 우리 곁에 있다. Java는 30년이 지난 지금도 가장 많이 쓰이는 언어 중 하나다. NFS, ZFS, VirtualBox도 Sun 출신이다.

`javax`에서 `jakarta`로의 변경은 단순한 이름 바꾸기가 아니다. 한 회사의 몰락, 74억 달러의 인수, 10년간의 법정 싸움, 상표권 분쟁이 만들어낸 결과다. 개발자 입장에서는 귀찮은 마이그레이션 작업이지만, 그 뒤에는 30년에 걸친 Java 생태계의 역사가 있다.

Sun의 슬로건 "The Network is the Computer"는 클라우드 시대에 현실이 됐다. 안타깝게도 그 시대를 Sun은 보지 못했다. 하지만 Java는 살아남았다. Virtual Threads로 동시성을 혁신하고, GraalVM으로 성능을 끌어올리고, Kotlin이라는 동반자도 얻었다.

1995년에 James Gosling이 만든 언어가 2026년에도 현역이다. 그 사이에 회사는 바뀌고, 이름은 바뀌고, 소송이 오갔지만, 코드는 여전히 돌아간다. "Write Once, Run Anywhere"라는 약속은 30년이 지난 지금도 유효하다.

다음에 `import jakarta.servlet.http.HttpServletRequest`를 칠 때, 이 한 줄에 담긴 30년의 역사를 떠올려보는 것도 나쁘지 않다.
