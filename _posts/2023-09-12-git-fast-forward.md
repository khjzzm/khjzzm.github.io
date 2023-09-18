---
layout: post
title: git Fast-Forward
---

git에서 Fast-Forward는 일반적으로 단순한 브랜치 병합 방식을 설명합니다. 
Fast-Forward 병합은 특별한 병합 커밋을 생성하지 않고 브랜치 포인터만 이동시키는 방법입니다.

Fast-Forward 병합의 상황을 설명하면 다음과 같습니다
1. `master`라는 브랜치에서 새로운 브랜치 `feature`를 생성합니다.
2. `feature` 브랜치에서 일부 커밋을 추가합니다.
3. 그 동안 `master` 브랜치에는 어떠한 새로운 커밋도 추가되지 않았습니다.

~~~bash
# master 브랜치에서
git checkout master
git merge feature
~~~
위의 명령을 실행하면, master가 feature의 최신 커밋을 가리키게 됩니다.

하지만, master 브랜치에도 새로운 커밋이 추가되어 있었다면 Fast-Forward 병합은 가능하지 않을 수 있습니다. 
이런 경우에는 실제 병합 커밋이 필요하게 되며, 두 브랜치의 변경 사항을 통합해야 합니다.

**Fast-Forward 병합을 원하지 않는 경우 --no-ff 옵션을 사용하여 병합할 수 있습니다.** 
이렇게 하면 병합 커밋이 강제로 생성되어, 브랜치의 히스토리가 명확하게 표시됩니다.
