---
layout: post
title: git 워크플로우 원격 브랜치와 로컬 병합 in terminal
---


## 상황
개발서버에 `DCL-2000` branch 가 배포(`release` branch) 되어있는 상황 에서 A가 `DCL-1000` 배포요청 함

### wanted
`DCL-1000` 브랜치를 개발서버->실서버 배포 후 다시 `DCL-2000` 브랜치를 개발서버에 배포하는것

### git command
1. git checkout origin/master
2. git push origin HEAD:release -f or git push origin +HEAD:release
3. git merge --ff-only `origin/DCL-1000`
4. git push origin HEAD:release
   - Jenkins build
5. git push origin HEAD:master 
6. git checkout `origin/DCL-2000`
7. git merge origin/master
8. git push origin HEAD:refs/heads/`DCL-2000`

###
1. `origin/master`의 상태를 로컬에 체크아웃합니다. 일반적으로 직접 원격 브랜치를 체크아웃하는 것은 추천되지 않습니다. 대신, 로컬 브랜치를 만들어 해당 원격 브랜치를 추적하는 것이 좋습니다.
2. 현재 위치(HEAD)를 강제로 `release` 브랜치에 푸시합니다. `-f`는 강제 푸시를 의미하므로 주의가 필요합니다. 이 명령은 기존의 `release` 브랜치의 내용을 덮어쓰게 됩니다.
3. `origin/DCL-1000` 원격 브랜치의 변경사항을 fast-forward 방식으로 병합합니다. 이는 병합 커밋 없이 변경사항을 추가하는 것을 의미합니다.
4. 현재 위치의 변경사항을 `release` 브랜치에 푸시합니다.
    - 젠킨스에서 release(Branches to build) 브랜치를 빌드 합니다.
5. 현재 위치의 변경사항을 `master` 브랜치에 푸시합니다. (실서버 확인 후 master 올립니다.)
6. `origin/DCL-2000`의 상태를 로컬에 체크아웃합니다.
7. `origin/master`의 변경사항을 현재 체크아웃된 브랜치에 병합합니다.
8. 현재 위치의 변경사항을 `DCL-2000` 브랜치에 푸시합니다.

이렇게 해서 주어진 명령어를 실행한 후의 결과는 다음과 같습니다:
- `release`와 `master` 브랜치는 `origin/DCL-1000`의 변경사항을 포함하게 됩니다.
- `DCL-2000` 브랜치는 `origin/master`의 변경사항을 포함하게 됩니다.

