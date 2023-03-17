---
layout: post
title: dalla sh script
---

~~~shell
#!/bin/sh

REPOSITORY=~/deploy
ORIGIN=origin
repo=("a" "b" "c" "d" "e" "f")

for((var=0; var<${#repo[@]}; var++))
do
  echo $var : ${repo[var]}
done
read -p "배포할 프로젝트 선택:" PROJECT

echo "디렉토리 이동" $REPOSITORY/${repo[$PROJECT]}
cd $REPOSITORY/${repo[$PROJECT]}

echo "깃 페치(git fetch origin -p)"
git fetch origin -p

read -p "병합할 브랜치명 작성 : origin/" BRANCH

echo "깃 병합(git merge --ff-only)" $ORIGIN/$BRANCH
git merge --ff-only $ORIGIN/$BRANCH

echo "깃 푸시(git push origin HEAD:release)" $ORIGIN/$BRANCH
git push origin HEAD:release

echo "깃 로그" $ORIGIN/$BRANCH
git log --graph --all --pretty=format:'%C(yellow)%h -%C(auto)%d %C(bold cyan)%s %C(bold white)(%cr)%Creset %C(dim white)<%an>'
~~~

~~~shell
#!/bin/sh

REPOSITORY=~/deploy
ORIGIN=origin
repo=("a" "b" "c" "d" "e" "f")

for((var=0; var<${#repo[@]}; var++))
do
  echo $var : ${repo[var]}
done
read -p "개발서버 내릴 프로젝트 선택:" PROJECT

echo "디렉토리 이동" $REPOSITORY/${repo[$PROJECT]}
cd $REPOSITORY/${repo[$PROJECT]}

echo "깃 페치(git fetch origin -p)"
git fetch origin -p

echo "깃 마스터 체크아웃(git checkout origin/master)"
git checkout origin/master

echo "깃 릴리즈 푸시강제(push origin HEAD:release -f)"
git push origin HEAD:release -f

echo "깃 로그" $ORIGIN/$BRANCH
git log --graph --all --pretty=format:'%C(yellow)%h -%C(auto)%d %C(bold cyan)%s %C(bold white)(%cr)%Creset %C(dim white)<%an>'
~~~
