---
layout: post
title: 프레임워크와 라이브러리의 차이
---

추상계층이 헷갈리는 거네요.

일단 모든 소스코드든 라이브러리든 메모리에 들어가는 정보는, 컴파일러나 인터프리터에게는 호출가능한 모듈일 뿐입니다.
이런 물리적인 계층을 보지말고, 그 위의 논리적인 계층을 봐야합니다.

라이브러리는 톱, 망치, 삽같은 연장입니다.
사람이 들고 썰고, 바꿔들고 내려치고, 다시 바꿔들고 땅을 파는 겁니다.

프레임워크는 차, 비행기, 배같은 탈것입니다.
사람이 타서 엔진 켜고, 기어 넣고, 핸들 돌리고, 운전하거나, 조종하거나 해야합니다.

도구를 쓸 때, 급하면 썰어야 할 곳에 망치를 쳐도 됩니다. 땅 파야할 때 톱으로 땅을 긁어내도 됩니다.
사람은 도구를 선택하는 입장이기 때문에, 어떤 도구를 사용하든 원하는 것을 만들어낼 수 만 있으면 됩니다.

반면에, 탈것은 정해진 곳으로만 다녀야 합니다. 차를 타고 하늘을 날거나, 배를 타고 땅으로 갈 수는 없습니다.
하지만, 그 목적에 맞게 만들어져 있기 때문에, 톱이나 망치를 들고 먼저 탈것을 만들어야할 필요가 없습니다.
그저 정해진 규칙에 맞춰서 엔진, 기어, 핸들만 잘 돌리면 됩니다.

라이브러리와는 달리 프레임워크는 이미 프로그래밍할 규칙이 정해져 있습니다.
예를 들어, 설정파일로 사용되는 XML에 어떤 태그를 써야하며, 어떤 함수를 추가적으로 작성해야하고,
소스 파일을 어느 위치에 넣어야하며, DB와 연동하기 위해 무엇을 써넣어야 하는지 정해져 있습니다.
보통 이런 대부분의 작업은 프레임워크가 하고자 하는 일에 비하면 아주 작은 일이며, 사람은 극히 일부분만 조정함으로써 목적을 달성할 수 있습니다.

만약 프레임워크가 담당하는 부분이 내가 하고자 하는 목적과 다를 경우에는 어떻게 할까요?
그럼 그냥 프레임워크를 잘못쓴겁니다.
더 목적에 가까운 프레임워크를 찾아보면 대부분 있을겁니다.
없거나 구하기 힘들다면, 비슷한 프레임워크를 라이브러리 단계에서 변경해서 다른 프레임워크로 만들면 됩니다.
차를 튜닝한다음, 차를 다시 운전하면 된다는 말이지요.

혹시 프레임워크 없이 그냥 라이브러리로만 만들면 안될까요?
안될 이유가 어딨겠습니까?
그냥 다 다시 만들 능력과 시간과 여유만 있다면 그렇게 해도 되지요.
스스로 만든 프레임워크는 버그도 스스로 잡아야하지만, 남들이 만들어놓은 프레임워크는 쓰는 사람이 많은 만큼 그만큼 수정이나 업데이트도 빠릅니다.
기능이 마음에 안드는 부분이 있다면, 프레임워크를 고치면 됩니다. 처음부터 다 만드는 것보다는 싸게 먹히지요.
내일 당장 지방에서 서울로 출근해야하는데, 혼자서 차를 만들어서 타고 가야한다는 생각을 해보세요.

---
#### [프레임워크와 라이브러리의 차이는 무엇입니까?](https://kldp.org/node/124237)
