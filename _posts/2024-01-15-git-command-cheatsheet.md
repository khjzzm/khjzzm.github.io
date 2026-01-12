---
layout: post
title: Git 명령어 치트시트
tags: [git]
---

실무에서 자주 사용하는 Git 명령어 모음. 기본부터 고급까지 정리했다.

---

## 설정 (Configuration)

### 사용자 정보 설정

```bash
# 전역 사용자 이름 설정
git config --global user.name "홍길동"

# 전역 이메일 설정
git config --global user.email "hong@example.com"

# 현재 저장소에만 적용 (--global 제거)
git config user.name "홍길동"

# 설정 확인
git config --list
git config user.name
```

### 기본 설정

```bash
# 기본 브랜치명 설정 (main 권장)
git config --global init.defaultBranch main

# 기본 에디터 설정
git config --global core.editor "code --wait"  # VS Code
git config --global core.editor "vim"          # Vim

# 줄바꿈 설정 (Windows)
git config --global core.autocrlf true

# 줄바꿈 설정 (Mac/Linux)
git config --global core.autocrlf input

# 컬러 출력 활성화
git config --global color.ui auto
```

---

## 저장소 생성 (Repository)

### git init - 새 저장소 초기화

현재 디렉토리에 새로운 Git 저장소를 생성한다.

```bash
# 현재 디렉토리에 저장소 생성
git init

# 특정 디렉토리에 저장소 생성
git init my-project

# bare 저장소 생성 (서버용, 작업 디렉토리 없음)
git init --bare my-project.git
```

### git clone - 원격 저장소 복제

원격 저장소를 로컬로 복제한다.

```bash
# HTTPS로 복제
git clone https://github.com/user/repo.git

# SSH로 복제
git clone git@github.com:user/repo.git

# 특정 디렉토리명으로 복제
git clone https://github.com/user/repo.git my-folder

# 특정 브랜치만 복제
git clone -b develop https://github.com/user/repo.git

# 얕은 복제 (최신 커밋만, 히스토리 제외)
git clone --depth 1 https://github.com/user/repo.git

# 서브모듈 포함 복제
git clone --recurse-submodules https://github.com/user/repo.git
```

---

## 기본 작업 흐름 (Basic Workflow)

### git status - 상태 확인

작업 디렉토리의 현재 상태를 확인한다.

```bash
# 전체 상태 확인
git status

# 간단한 형태로 확인
git status -s
git status --short

# 출력 예시:
# M  modified-file.txt    (스테이징됨)
#  M unstaged-file.txt    (수정됨, 스테이징 안됨)
# ?? new-file.txt         (추적 안됨)
# A  added-file.txt       (새로 추가됨)
# D  deleted-file.txt     (삭제됨)
```

### git add - 스테이징

변경사항을 스테이징 영역에 추가한다.

```bash
# 특정 파일 스테이징
git add filename.txt

# 여러 파일 스테이징
git add file1.txt file2.txt

# 현재 디렉토리의 모든 변경사항 스테이징
git add .

# 모든 변경사항 스테이징 (삭제 포함)
git add -A
git add --all

# 특정 패턴의 파일들 스테이징
git add *.js
git add src/

# 대화형 스테이징 (부분 선택)
git add -p
git add --patch
```

### git commit - 커밋

스테이징된 변경사항을 저장소에 기록한다.

```bash
# 메시지와 함께 커밋
git commit -m "커밋 메시지"

# 스테이징 + 커밋 한번에 (추적 중인 파일만)
git commit -am "커밋 메시지"

# 에디터로 상세 메시지 작성
git commit

# 마지막 커밋 수정 (메시지 변경)
git commit --amend -m "수정된 메시지"

# 마지막 커밋에 파일 추가
git add forgotten-file.txt
git commit --amend --no-edit

# 빈 커밋 (CI 트리거용)
git commit --allow-empty -m "빈 커밋"

# 날짜 지정 커밋
git commit --date="2024-01-15 10:00:00" -m "메시지"
```

### git diff - 변경사항 비교

파일 간의 차이를 확인한다.

```bash
# 작업 디렉토리 vs 스테이징 영역
git diff

# 스테이징 영역 vs 마지막 커밋
git diff --staged
git diff --cached

# 특정 파일의 변경사항
git diff filename.txt

# 두 커밋 비교
git diff commit1 commit2

# 두 브랜치 비교
git diff main develop

# 변경된 파일 목록만 표시
git diff --name-only

# 통계만 표시 (추가/삭제 줄 수)
git diff --stat
```

---

## 브랜치 (Branch)

### git branch - 브랜치 관리

브랜치를 생성, 조회, 삭제한다.

```bash
# 브랜치 목록 확인
git branch

# 원격 브랜치 포함 전체 목록
git branch -a

# 원격 브랜치만 확인
git branch -r

# 새 브랜치 생성
git branch feature/login

# 브랜치 삭제 (병합된 브랜치)
git branch -d feature/login

# 브랜치 강제 삭제 (병합 여부 무관)
git branch -D feature/login

# 브랜치 이름 변경
git branch -m old-name new-name

# 현재 브랜치 이름 변경
git branch -m new-name

# 브랜치별 마지막 커밋 확인
git branch -v

# 병합된/병합 안된 브랜치 필터
git branch --merged
git branch --no-merged
```

### git checkout / git switch - 브랜치 전환

다른 브랜치로 이동하거나 파일을 복원한다.

```bash
# 브랜치 전환 (전통적 방식)
git checkout develop

# 브랜치 전환 (권장, Git 2.23+)
git switch develop

# 브랜치 생성하면서 전환
git checkout -b feature/new
git switch -c feature/new

# 원격 브랜치 기반으로 로컬 브랜치 생성
git checkout -b feature/new origin/feature/new
git switch -c feature/new origin/feature/new

# 이전 브랜치로 전환
git checkout -
git switch -

# 특정 커밋으로 이동 (detached HEAD)
git checkout abc1234

# 파일 복원 (변경사항 취소)
git checkout -- filename.txt
git restore filename.txt  # Git 2.23+

# 스테이징 취소
git restore --staged filename.txt
```

### git merge - 브랜치 병합

다른 브랜치의 변경사항을 현재 브랜치에 통합한다.

```bash
# 브랜치 병합 (main에 feature 병합)
git checkout main
git merge feature/login

# Fast-forward 병합 비활성화 (병합 커밋 생성)
git merge --no-ff feature/login

# 병합 메시지 지정
git merge feature/login -m "feature/login 병합"

# 충돌 발생 시 병합 취소
git merge --abort

# Squash 병합 (커밋을 하나로 합침)
git merge --squash feature/login
git commit -m "feature/login 기능 추가"
```

### git rebase - 브랜치 리베이스

커밋을 다른 베이스 위에 재배치한다.

```bash
# 현재 브랜치를 main 위에 리베이스
git rebase main

# 대화형 리베이스 (최근 3개 커밋 수정)
git rebase -i HEAD~3

# 리베이스 중 충돌 해결 후 계속
git rebase --continue

# 리베이스 취소
git rebase --abort

# 현재 단계 건너뛰기
git rebase --skip
```

**대화형 리베이스 옵션:**

| 명령어 | 설명 |
|--------|------|
| pick | 커밋 사용 |
| reword | 커밋 메시지 수정 |
| edit | 커밋 수정 |
| squash | 이전 커밋과 합침 |
| fixup | 이전 커밋과 합침 (메시지 버림) |
| drop | 커밋 삭제 |

---

## 원격 저장소 (Remote)

### git remote - 원격 저장소 관리

원격 저장소 연결을 관리한다.

```bash
# 원격 저장소 목록 확인
git remote
git remote -v  # URL 포함

# 원격 저장소 추가
git remote add origin https://github.com/user/repo.git

# 원격 저장소 URL 변경
git remote set-url origin https://github.com/user/new-repo.git

# 원격 저장소 제거
git remote remove origin

# 원격 저장소 이름 변경
git remote rename origin upstream

# 원격 저장소 정보 확인
git remote show origin
```

### git push - 원격에 업로드

로컬 변경사항을 원격 저장소에 업로드한다.

```bash
# 현재 브랜치 푸시
git push

# 특정 브랜치 푸시
git push origin main

# 브랜치 푸시 및 업스트림 설정
git push -u origin feature/login
git push --set-upstream origin feature/login

# 모든 브랜치 푸시
git push --all

# 태그 푸시
git push --tags
git push origin v1.0.0

# 강제 푸시 (주의: 히스토리 덮어씀)
git push --force
git push -f

# 안전한 강제 푸시 (원격이 변경되지 않은 경우만)
git push --force-with-lease

# 원격 브랜치 삭제
git push origin --delete feature/old
git push origin :feature/old
```

### git pull - 원격에서 가져오기

원격 저장소의 변경사항을 가져와 병합한다.

```bash
# 현재 브랜치 풀
git pull

# 특정 원격/브랜치에서 풀
git pull origin main

# 리베이스로 풀 (병합 커밋 없이)
git pull --rebase
git pull -r

# 풀 충돌 시 취소
git pull --abort  # rebase 모드일 때
git merge --abort  # merge 모드일 때
```

### git fetch - 원격 정보 가져오기

원격 저장소의 변경사항을 가져오되 병합하지 않는다.

```bash
# 모든 원격에서 가져오기
git fetch

# 특정 원격에서 가져오기
git fetch origin

# 삭제된 원격 브랜치 정리
git fetch --prune
git fetch -p

# 모든 원격의 모든 브랜치 가져오기
git fetch --all
```

---

## 히스토리 (History)

### git log - 커밋 히스토리

커밋 기록을 조회한다.

```bash
# 기본 로그
git log

# 한 줄로 표시
git log --oneline

# 그래프로 표시
git log --graph

# 그래프 + 한 줄 + 모든 브랜치
git log --graph --oneline --all

# 최근 N개 커밋만
git log -5

# 특정 파일의 히스토리
git log -- filename.txt
git log -p filename.txt  # 변경 내용 포함

# 특정 저자의 커밋
git log --author="홍길동"

# 날짜 범위
git log --since="2024-01-01" --until="2024-01-31"
git log --after="1 week ago"

# 커밋 메시지 검색
git log --grep="버그 수정"

# 변경 내용 검색
git log -S "function_name"

# 포맷 지정
git log --pretty=format:"%h %s (%an, %ar)"
```

**자주 쓰는 포맷:**

| 옵션 | 설명 |
|------|------|
| %H | 커밋 해시 (전체) |
| %h | 커밋 해시 (축약) |
| %s | 커밋 메시지 제목 |
| %an | 저자 이름 |
| %ar | 저자 날짜 (상대) |
| %ad | 저자 날짜 |

### git show - 커밋 상세 정보

특정 커밋의 상세 정보를 확인한다.

```bash
# 마지막 커밋 상세 정보
git show

# 특정 커밋 상세 정보
git show abc1234

# 특정 커밋의 특정 파일
git show abc1234:path/to/file.txt

# 변경된 파일 목록만
git show --name-only abc1234
```

### git blame - 라인별 작성자

각 라인을 누가 언제 수정했는지 확인한다.

```bash
# 파일의 각 라인별 작성자 확인
git blame filename.txt

# 특정 라인 범위만
git blame -L 10,20 filename.txt

# 공백 변경 무시
git blame -w filename.txt

# 이동/복사된 라인 추적
git blame -M filename.txt
```

---

## 되돌리기 (Undo)

### git reset - 커밋 되돌리기

HEAD를 이전 상태로 되돌린다.

```bash
# 스테이징 취소 (파일 유지)
git reset HEAD filename.txt
git reset filename.txt

# 마지막 커밋 취소 (변경사항은 스테이징 영역에)
git reset --soft HEAD~1

# 마지막 커밋 취소 (변경사항은 작업 디렉토리에)
git reset HEAD~1
git reset --mixed HEAD~1

# 마지막 커밋 완전 삭제 (변경사항도 삭제, 주의!)
git reset --hard HEAD~1

# 특정 커밋으로 되돌리기
git reset --hard abc1234

# 원격 브랜치 상태로 되돌리기
git reset --hard origin/main
```

| 옵션 | 스테이징 | 작업 디렉토리 |
|------|----------|---------------|
| --soft | 유지 | 유지 |
| --mixed (기본) | 취소 | 유지 |
| --hard | 취소 | 삭제 |

### git revert - 커밋 되돌리기 (안전)

기존 커밋을 취소하는 새 커밋을 생성한다.

```bash
# 특정 커밋 되돌리기
git revert abc1234

# 커밋 없이 되돌리기 (변경사항만 적용)
git revert --no-commit abc1234

# 여러 커밋 되돌리기
git revert abc1234..def5678

# 병합 커밋 되돌리기
git revert -m 1 merge-commit-hash
```

### git stash - 임시 저장

작업 중인 변경사항을 임시로 저장한다.

```bash
# 변경사항 임시 저장
git stash
git stash push -m "작업 중인 로그인 기능"

# 추적되지 않는 파일도 포함
git stash -u
git stash --include-untracked

# stash 목록 확인
git stash list

# 최근 stash 적용 (stash 유지)
git stash apply

# 특정 stash 적용
git stash apply stash@{2}

# 최근 stash 적용 후 삭제
git stash pop

# 특정 stash 삭제
git stash drop stash@{0}

# 모든 stash 삭제
git stash clear

# stash 내용 확인
git stash show stash@{0}
git stash show -p stash@{0}  # diff 포함
```

### git clean - 추적되지 않는 파일 삭제

추적되지 않는 파일을 삭제한다.

```bash
# 삭제될 파일 미리보기
git clean -n
git clean --dry-run

# 추적되지 않는 파일 삭제
git clean -f

# 디렉토리도 삭제
git clean -fd

# .gitignore 파일도 삭제
git clean -fx

# 대화형 모드
git clean -i
```

---

## 태그 (Tag)

버전 릴리스에 태그를 붙인다.

```bash
# 태그 목록 확인
git tag
git tag -l "v1.*"  # 패턴 검색

# 경량 태그 생성
git tag v1.0.0

# 주석 태그 생성 (권장)
git tag -a v1.0.0 -m "버전 1.0.0 릴리스"

# 특정 커밋에 태그
git tag -a v1.0.0 abc1234 -m "메시지"

# 태그 정보 확인
git show v1.0.0

# 태그 삭제
git tag -d v1.0.0

# 원격에서 태그 삭제
git push origin --delete v1.0.0

# 태그 푸시
git push origin v1.0.0
git push --tags  # 모든 태그
```

---

## Cherry-pick

특정 커밋만 선택해서 현재 브랜치에 적용한다.

```bash
# 특정 커밋 가져오기
git cherry-pick abc1234

# 여러 커밋 가져오기
git cherry-pick abc1234 def5678

# 커밋 범위 가져오기
git cherry-pick abc1234..def5678

# 커밋 없이 변경사항만 적용
git cherry-pick --no-commit abc1234

# 충돌 해결 후 계속
git cherry-pick --continue

# cherry-pick 취소
git cherry-pick --abort
```

---

## 검색 (Search)

### git grep - 코드 검색

저장소 내 코드를 검색한다.

```bash
# 문자열 검색
git grep "TODO"

# 대소문자 무시
git grep -i "todo"

# 라인 번호 표시
git grep -n "function"

# 파일명만 표시
git grep -l "class"

# 특정 파일 타입에서 검색
git grep "import" -- "*.java"

# 특정 커밋/브랜치에서 검색
git grep "bug" HEAD~5
git grep "bug" main
```

---

## 유용한 팁

### 별칭 (Alias) 설정

```bash
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.lg "log --graph --oneline --all"

# 사용
git co main
git st
git lg
```

### .gitignore 파일

```gitignore
# 컴파일된 파일
*.class
*.jar
*.war

# IDE 설정
.idea/
.vscode/
*.iml

# 빌드 디렉토리
/build/
/target/
/dist/
/node_modules/

# 로그 파일
*.log

# 환경 설정 파일
.env
.env.local
application-local.yml

# OS 파일
.DS_Store
Thumbs.db
```

### reflog - 모든 작업 기록

실수로 삭제한 커밋 복구에 유용하다.

```bash
# reflog 확인
git reflog

# 특정 시점으로 복구
git reset --hard HEAD@{2}
```

---

## 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `git init` | 새 저장소 초기화 |
| `git clone` | 원격 저장소 복제 |
| `git status` | 작업 디렉토리 상태 확인 |
| `git add` | 스테이징 영역에 추가 |
| `git commit` | 변경사항 커밋 |
| `git push` | 원격에 업로드 |
| `git pull` | 원격에서 가져와 병합 |
| `git fetch` | 원격 정보만 가져오기 |
| `git branch` | 브랜치 관리 |
| `git checkout` / `switch` | 브랜치 전환 |
| `git merge` | 브랜치 병합 |
| `git rebase` | 브랜치 리베이스 |
| `git diff` | 변경사항 비교 |
| `git log` | 커밋 히스토리 조회 |
| `git reset` | 커밋 되돌리기 |
| `git revert` | 커밋 취소 (새 커밋 생성) |
| `git stash` | 변경사항 임시 저장 |
| `git tag` | 태그 관리 |
| `git cherry-pick` | 특정 커밋 가져오기 |

> Git은 분산 버전 관리 시스템이다.
> 명령어를 익히면 협업과 코드 관리가 훨씬 수월해진다.
