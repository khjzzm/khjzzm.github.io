---
layout: post
title: Jenkins + Nx 모노레포 CI/CD 파이프라인 완전 가이드
tags: [ jenkins, nx, ci-cd, kubernetes, gradle ]
---

## 모노레포에서 CI/CD가 복잡해지는 이유

하나의 Git 저장소에 `downtime`, `downtime-api` 두 모듈이 있다고 하자.
`downtime-api`의 컨트롤러에 API 하나를 추가했다. 건드린 건 이 모듈뿐이다.

그런데 Jenkins가 `downtime`까지 포함해서 전체 빌드를 돌리고, 전체 배포까지 한다면?
빌드 시간도 낭비고, 안 건드린 모듈이 배포되면서 불필요한 장애 리스크까지 생긴다.

반대로 `downtime`의 enum을 고쳤는데 `downtime-api`가 빌드에서 빠진다면?
`downtime-api`는 `downtime`에 의존하고 있으므로, 런타임에 깨질 수 있다.

결국 필요한 건 이런 파이프라인이다.
- **바뀐 모듈만** 빌드한다
- 의존관계에 있는 모듈은 **함께 빌드**한다
- 커밋 메시지를 보고 **버전을 자동으로 결정**한다
- 배포 대상인 모듈만 **배포**한다

이 글에서는 Jenkins Shared Library + Nx를 활용해 이 문제를 어떻게 풀었는지, `downtime` 프로젝트를 예시로 설명한다.

## 전체 아키텍처

```
┌─ Git Push ──────────────────────────────────────────────────────────┐
│                                                                     │
│  Developer → GitHub → Jenkins (Webhook) → Kubernetes Pod            │
│                                                                     │
│  Pipeline Stages:                                                   │
│  Setup → Detect → Version → Build → Package(모듈별) → Deploy        │
│                                                                     │
│  Deploy:                                                            │
│  ECR (Docker Image) → helm-values repo 업데이트 → ArgoCD 자동 배포    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 프로젝트 구조 이해

`downtime` 프로젝트를 기준으로 본다.

```
com.knet.msa/downtime/              ← Git 리포 = Nx 워크스페이스
├── nx.json                          ← Nx 설정 (sharedGlobals, release 등)
├── build.gradle.kts                 ← 루트 Gradle 빌드 설정 ★ sharedGlobals
├── settings.gradle.kts              ← Gradle 모듈 포함 설정  ★ sharedGlobals
├── gradle.properties                ← Gradle 속성            ★ sharedGlobals
├── package.json                     ← 루트 npm (nx 의존성)
├── Jenkinsfile                      ← @Library('jenkins') _ ; nxBuild()
│
├── downtime/                        ← 도메인/공유 모듈 (라이브러리)
│   ├── project.json                 → tags: ["lang:kotlin"]
│   ├── package.json                 → version: 0.0.0
│   ├── build.gradle.kts
│   └── src/main/kotlin/...
│
└── downtime-api/                    ← REST API 모듈 (배포 대상)
    ├── project.json                 → tags: ["lang:kotlin", "type:deployable"]
    ├── package.json                 → version: 0.0.0
    ├── build.gradle.kts
    ├── Dockerfile
    └── src/main/kotlin/...
```

두 모듈의 차이를 보자.

| | downtime | downtime-api |
|---|---|---|
| 역할 | 도메인 공유 라이브러리 | REST API 서버 |
| tags | `lang:kotlin` | `lang:kotlin`, **`type:deployable`** |
| package 타겟 | Nexus에 jar publish | Docker 이미지 빌드 → ECR push |
| 배포 여부 | X | O (ArgoCD) |
| 의존관계 | 없음 | `downtime`에 의존 |

`type:deployable` 태그가 있어야 Docker 이미지를 빌드하고 ArgoCD로 배포한다.
`downtime`처럼 라이브러리 모듈은 Nexus에 jar만 publish하고 끝난다.

## Jenkinsfile

각 프로젝트의 `Jenkinsfile`은 단 2줄이다.

```groovy
@Library('jenkins') _
nxBuild()
```

모든 파이프라인 로직은 Jenkins Shared Library의 `vars/nxBuild.groovy`에 있다.
프로젝트마다 파이프라인 코드를 복붙할 필요 없이, 공통 라이브러리 하나로 모든 Nx 모노레포 프로젝트의 CI/CD를 처리한다.

## 파이프라인 스테이지 상세

### 1. Setup

```groovy
stage("Setup") {
    sh "git config --global --add safe.directory ${env.WORKSPACE}"
    sh "git config --global user.name 'Jenkins'"
    sh "git config --global user.email 'jenkins@knetbiz.com'"
    sh "git remote set-url origin https://${GITHUB_USERNAME}:${GITHUB_PASSWORD}@github.com/private-knet/${env.GIT_REPO_NAME}.git"
    sh "npm ci"
}
```

- Git 설정 (버전 태그 push를 위해 인증 정보 포함된 remote URL 설정)
- `npm ci`로 Nx 및 의존성 설치

### 2. Detect - 변경 감지

이 스테이지가 파이프라인의 핵심이다. 세 가지를 수행한다.

**전체 프로젝트 목록 추출 (위상 정렬)**

```groovy
def projectsResult = sh(
    script: """nx graph --print 2>/dev/null | node -p "..."
""",
    returnStdout: true
)
```

`nx graph`에서 의존관계 그래프를 읽어 위상 정렬(topological sort)된 순서로 프로젝트 목록을 만든다.
downtime 프로젝트의 경우 `downtime`이 먼저, `downtime-api`가 나중에 온다.
이 순서가 중요한 이유는 라이브러리(`downtime`)가 먼저 publish되어야 API(`downtime-api`)가 빌드될 수 있기 때문이다.

**변경된 모듈 감지**

```groovy
def affectedResult = sh(
    script: "nx show projects --affected --base=${base}",
    returnStdout: true
)
```

`base`는 이전 성공 빌드의 커밋이다. 그 커밋 이후로 변경된 파일이 속한 모듈만 affected로 판별한다.
`downtime-api`의 `project.json`에 `"implicitDependencies": ["downtime"]`이 설정되어 있으므로, `downtime` 모듈이 변경되면 `downtime-api`도 자동으로 affected에 포함된다.

**배포 대상 모듈 판별**

```groovy
def deployResult = sh(
    script: "nx show projects --affected --base=${base} --with-tag type:deployable",
    returnStdout: true
)
```

affected 모듈 중 `type:deployable` 태그가 있는 것만 배포 대상으로 분류한다.

### 3. Version - 버전 결정

Conventional Commits 규칙에 따라 자동으로 버전을 결정한다.

**커밋 메시지와 버전의 관계:**

| 커밋 접두사 | 버전 변화 | 예시 |
|---|---|---|
| `fix:` | **patch** (0.0.X) | `fix: null 체크 누락` |
| `feat:` | **minor** (0.X.0) | `feat: 조회 API 추가` |
| `feat!:` 또는 본문에 `BREAKING CHANGE:` | **major** (X.0.0) | `feat!: 응답 구조 변경` |
| `chore:`, `docs:`, `refactor:`, `style:`, `ci:`, `test:` | **변화 없음** | `chore: import 정리` |

각 접두사의 의미:
- **fix** — 버그 수정. SemVer의 patch에 해당
- **feat** — feature의 줄임말. 새로운 기능 추가. SemVer의 minor에 해당
- **feat!** — `!`는 breaking change를 의미. 하위 호환이 깨지는 변경. SemVer의 major에 해당
- **chore** — "허드렛일"이라는 뜻. 코드 동작에 영향 없는 잡일 (의존성 업데이트, 설정 변경 등)
- **docs** — documentation. 문서만 변경
- **refactor** — 기능 변화 없이 코드 구조 개선. 버그 수정도 아니고 기능 추가도 아닌 변경
- **style** — 코드 포맷팅, 세미콜론, 공백 등. 동작에 영향 없는 스타일 변경
- **ci** — continuous integration. CI/CD 설정 파일 변경 (Jenkinsfile, GitHub Actions 등)
- **test** — 테스트 코드 추가/수정. 프로덕션 코드 변경 없음
- **perf** — performance. 성능 개선. `fix:`와 같이 patch bump 대상

이 규칙은 [Conventional Commits](https://www.conventionalcommits.org/) 스펙을 따른다. Angular 팀에서 시작된 커밋 컨벤션이 표준화된 것이다.

**동작 순서:**

```
1) 각 모듈의 최신 Git 태그에서 현재 버전 조회
   예: git tag -l 'downtime-api/v*' --sort=-v:refname | head -1
       → downtime-api/v0.1.0 → 현재 버전 0.1.0

2) nx release version 실행 (conventional commits 분석)
   main 브랜치: nx release version
   dev 브랜치:  nx release version --preid=beta

3) 버전이 올라간 모듈만 Git 태그 생성
   예: git tag downtime-api/v0.2.0

4) 태그 push 후, affected를 버전이 올라간 모듈만으로 축소
```

**버전이 안 올라간 모듈은 이후 Build/Deploy에서 완전히 제외된다.** 이것이 `chore:` 커밋이 배포를 트리거하지 않는 이유다.

### 4. Build

```groovy
stage("Build") {
    sh "nx run-many --target=build --projects=${affected.join(',')}"
}
```

affected 모듈만 Gradle 빌드를 실행한다. 내부적으로 각 모듈의 `project.json`에 정의된 build 타겟이 실행된다.

```json
// downtime/project.json
{ "build": { "command": "sh ./gradlew downtime:build" } }

// downtime-api/project.json
{ "build": { "command": "sh ./gradlew downtime-api:build" } }
```

### 5. Package - 모듈별 스테이지

```groovy
projects.each { module ->
    stage(stageName) {
        if (!affected.contains(module)) {
            Utils.markStageSkippedForConditional(STAGE_NAME)
        } else {
            sh "nx run ${module}:package"
        }
    }
}
```

전체 프로젝트를 순회하되, affected가 아닌 모듈은 스킵 처리한다.
Stage View에서 항상 동일한 스테이지가 보이도록 하기 위함이다.

각 모듈의 package 타겟은 역할에 따라 다르다.

```
downtime     → gradlew downtime:publish     → Nexus에 jar 배포
downtime-api → buildctl build ...           → Docker 이미지 빌드 → ECR push
```

위상 정렬 순서로 실행되므로 `downtime`이 먼저 Nexus에 publish되고, 그 후 `downtime-api`가 빌드된다.

### 6. Deploy

```groovy
stage("Deploy") {
    // helm-values 리포 clone
    sh "git clone --depth 1 ${helmValuesRepo} /tmp/helm-values"

    // 각 배포 대상 모듈의 이미지 태그 업데이트
    deployable.each { module ->
        def valuesFile = "/tmp/helm-values/${env.GIT_REPO_NAME}/${cluster}@${module}.yaml"
        sh "sed -i 's|tag:.*|tag: ${versions[module]}|' ${valuesFile}"
    }

    // commit & push → ArgoCD가 감지하여 자동 배포
    sh """
        cd /tmp/helm-values
        git add .
        git commit -m "downtime: downtime-api → v0.2.0"
        git push origin main
    """
}
```

`type:deployable` 태그가 있는 모듈만 여기서 처리된다.
helm-values 리포의 이미지 태그를 업데이트하면 ArgoCD가 변경을 감지하고 Kubernetes에 자동 배포한다.

배포 환경은 브랜치로 결정된다.

```groovy
def cluster = env.BRANCH_NAME == 'main' ? 'prod' : 'dev'
// main → prod@downtime-api.yaml
// dev  → dev@downtime-api.yaml
```

## sharedGlobals - 루트 빌드 파일 변경 감지

Nx의 `affected` 명령은 **프로젝트 디렉토리 안의 파일 변경만** 감지한다.
루트에 있는 `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`가 바뀌어도 Nx는 이를 모른다.

하지만 이 파일들은 모든 모듈의 빌드에 영향을 준다.
예를 들어 `gradle.properties`에서 Kotlin 버전을 올리면 모든 모듈이 다시 빌드되어야 한다.

`nx.json`에서 이 파일들을 `sharedGlobals`로 지정한다.

```json
{
  "namedInputs": {
    "sharedGlobals": [
      "{workspaceRoot}/build.gradle.kts",
      "{workspaceRoot}/settings.gradle.kts",
      "{workspaceRoot}/gradle.properties"
    ]
  }
}
```

파이프라인의 Detect 스테이지에서 별도로 이 파일들의 변경 여부를 확인한다.

```groovy
// nx.json에서 sharedGlobals 파일 목록을 읽어온다
def sharedGlobals = sh(
    script: "node -p \"require('./nx.json').namedInputs.sharedGlobals.map(...)\"",
    returnStdout: true
)

// git diff로 해당 파일들의 변경 여부를 확인한다
sharedGlobalsChanged = sh(
    script: "git diff --name-only ${base} HEAD -- ${sharedGlobals}",
    returnStdout: true
)

// nx affected가 비어있는데 sharedGlobals가 변경된 경우 → 전체 프로젝트를 affected로 추가
if (!affected && sharedGlobalsChanged) {
    affected.addAll(projects)
}
```

그리고 Version 스테이지에서, sharedGlobals 변경으로 affected가 된 모듈은 conventional commit에 의한 bump이 없더라도 **강제 patch bump**한다.

```groovy
if (newVersion == currentVersions[module] && sharedGlobalsChanged) {
    def bumpType = env.BRANCH_NAME == 'main' ? 'patch' : 'prerelease'
    sh "cd ${root} && npm version ${bumpType} --no-git-tag-version"
}
```

이 보완 로직 덕분에 루트 빌드 설정 변경 시 커밋 메시지와 관계없이 전체 모듈이 빌드/배포된다.

## 시나리오별 동작 예시

### 시나리오 1: API 모듈에 기능 추가

```bash
# downtime-api/src/.../controller/DowntimeController.kt 수정
git commit -m "feat: 점검 시간 조회 API 추가"
git push origin main
```

```
Detect   → affected: [downtime-api], deployable: [downtime-api]
Version  → feat: → minor bump → 0.1.0 → 0.2.0
           태그: downtime-api/v0.2.0
Build    → gradlew downtime-api:build ✅
Package  → [kotlin] downtime      → ⏭ 스킵 (affected 아님)
           [kotlin] downtime-api  → buildctl → ECR push ✅
Deploy   → prod@downtime-api.yaml → tag: 0.2.0 → ArgoCD 배포 ✅
```

### 시나리오 2: 공유 모듈 버그 수정

```bash
# downtime/src/.../enums/DowntimeServiceType.kt 수정
git commit -m "fix: DowntimeServiceType 잘못된 enum 값 수정"
git push origin main
```

`downtime-api`는 `downtime`에 의존(`implicitDependencies`)하므로 함께 affected 된다.

```
Detect   → affected: [downtime, downtime-api], deployable: [downtime-api]
Version  → fix: → patch bump
           downtime     0.0.0 → 0.0.1  태그: downtime/v0.0.1
           downtime-api 0.1.0 → 0.1.1  태그: downtime-api/v0.1.1
Build    → gradlew downtime:build + downtime-api:build ✅
Package  → [kotlin] downtime      → gradlew downtime:publish → Nexus ✅
           [kotlin] downtime-api  → buildctl → ECR push ✅
Deploy   → prod@downtime-api.yaml → tag: 0.1.1 → ArgoCD 배포 ✅
```

`downtime`은 `type:deployable`이 아니므로 Deploy에서 제외된다.
하지만 Nexus에 새 버전이 publish되어 다른 프로젝트에서도 이 라이브러리를 가져다 쓸 수 있다.

### 시나리오 3: 코드 정리 (chore 커밋)

```bash
# downtime-api/src/.../service/DowntimeService.kt에서 불필요한 import 제거
git commit -m "chore: 불필요한 import 정리"
git push origin main
```

```
Detect   → affected: [downtime-api], deployable: [downtime-api]
Version  → chore: → 버전 변화 없음 → "No version changes detected"
           currentBuild.result = 'NOT_BUILT' ❌
Build    → ⏭ 스킵
Package  → ⏭ 전체 스킵
Deploy   → ⏭ 스킵
```

`chore:`, `docs:`, `refactor:`, `style:`, `ci:`, `test:` 접두사는 conventional commits에서 버전을 올리지 않는다.
**빌드와 배포가 일어나지 않으므로** 코드 정리성 커밋을 안심하고 push할 수 있다.

### 시나리오 4: 루트 빌드 설정 변경 (sharedGlobals)

```bash
# gradle.properties에서 Kotlin 버전 업데이트
git commit -m "chore: Kotlin 2.2.0 업데이트"
git push origin main
```

```
Detect   → nx affected → 비어있음 (프로젝트 디렉토리 변경 없음)
           git diff → gradle.properties 변경 감지 (sharedGlobals)
           → 전체 프로젝트를 affected로 추가
           affected: [downtime, downtime-api], deployable: [downtime-api]
Version  → chore: → nx release가 bump 안 함
           하지만 sharedGlobalsChanged → 강제 patch bump
           downtime     0.0.1 → 0.0.2
           downtime-api 0.2.0 → 0.2.1
Build    → 전체 빌드 ✅
Package  → 전체 package ✅
Deploy   → downtime-api ArgoCD 배포 ✅
```

루트 빌드 파일 변경은 커밋 메시지와 무관하게 **무조건 전체 빌드/배포**를 트리거한다.

### 시나리오 5: dev 브랜치에서 기능 개발

```bash
git checkout -b dev
# downtime-api 수정
git commit -m "feat: 점검 예약 기능 추가"
git push origin dev
```

```
Detect   → affected: [downtime-api], deployable: [downtime-api]
Version  → feat: → minor bump (beta 프리릴리즈)
           0.2.0 → 0.3.0-beta.0
           태그: downtime-api/v0.3.0-beta.0
Build    → gradlew downtime-api:build ✅
Package  → buildctl → ECR push (tag: 0.3.0-beta.0) ✅
Deploy   → dev@downtime-api.yaml → tag: 0.3.0-beta.0 → ArgoCD dev 환경 배포 ✅
```

dev 브랜치에서는 `--preid=beta`가 붙어 프리릴리즈 버전이 만들어지고, dev 환경에만 배포된다.

### 시나리오 6: 변경 사항 없이 빌드

이전 성공 빌드 이후 아무 변경도 없는데 수동으로 Jenkins 빌드를 실행한 경우.

```
Detect   → affected: [], deployable: []
           sharedGlobalsChanged: ""
           → "No changes detected"
           currentBuild.result = 'NOT_BUILT' ❌
이후     → 전체 스킵
```

### 시나리오 7: 여러 커밋이 쌓인 후 빌드

```bash
git commit -m "docs: README 업데이트"
git commit -m "refactor: 서비스 레이어 리팩토링"
git commit -m "feat: 점검 알림 기능 추가"
git push origin main
```

nx release version은 **마지막 태그 이후의 모든 커밋**을 분석한다.
`feat:`이 하나라도 있으면 minor bump이 적용된다.

```
Version  → docs + refactor + feat → 가장 높은 bump 적용 → minor bump
           0.2.0 → 0.3.0
```

bump 우선순위: `major > minor > patch`. 여러 커밋 중 가장 큰 변경이 최종 버전에 반영된다.

### 시나리오 8: BREAKING CHANGE

```bash
git commit -m "feat!: 점검 API 응답 구조 전면 변경

BREAKING CHANGE: DowntimeResponse의 startTime 필드가 schedule.start로 이동"
git push origin main
```

```
Version  → feat!: → major bump
           0.3.0 → 1.0.0
```

`feat!:` 접두사 또는 커밋 본문의 `BREAKING CHANGE:` 키워드가 major bump을 트리거한다.
API 호환성이 깨지는 변경을 할 때 사용한다.

## 버전 관리 규칙 정리

### 왜 package.json의 version이 항상 0.0.0인가

소스 코드의 `package.json`에는 `"version": "0.0.0"`이 고정되어 있다.
실제 버전은 Git 태그(`downtime-api/v0.2.0`)로 관리한다.

Version 스테이지에서 이렇게 동작한다.

```
1. Git 태그에서 현재 버전 조회 → downtime-api/v0.2.0 → 0.2.0
2. package.json의 version을 0.2.0으로 덮어씀
3. nx release version 실행 → conventional commits 분석 → 0.3.0으로 bump
4. 새 태그 생성: downtime-api/v0.3.0
5. 태그만 push (package.json 변경은 커밋하지 않음)
```

이 방식의 장점은 소스 코드에 버전 변경 커밋이 섞이지 않는다는 것이다.

### 릴리즈 태그 패턴

```
{projectName}/v{version}

예시:
downtime/v0.0.1
downtime-api/v0.2.0
downtime-api/v0.3.0-beta.0
```

`nx.json`의 `release.releaseTagPattern`으로 설정되어 있다.

```json
{
  "release": {
    "releaseTagPattern": "{projectName}/v{version}",
    "projectsRelationship": "independent"
  }
}
```

`independent` 모드이므로 각 모듈이 독립적으로 버전을 관리한다.

## 의존관계와 빌드 순서

`downtime-api`의 `project.json`에 의존관계가 명시되어 있다.

```json
{
  "name": "downtime-api",
  "implicitDependencies": ["downtime"]
}
```

이 설정은 두 가지 역할을 한다.

**1. 변경 전파**: `downtime`이 변경되면 `downtime-api`도 affected에 포함된다.

```
downtime 파일 변경 → affected: [downtime, downtime-api]
```

**2. 빌드 순서 보장**: Detect 스테이지에서 위상 정렬을 수행하여 의존성이 먼저 처리된다.

```
Package 순서: downtime (Nexus publish) → downtime-api (Docker build)
```

`downtime-api`의 Gradle 빌드가 `downtime` jar를 Nexus에서 가져다 쓰기 때문에,
반드시 `downtime`이 먼저 publish되어야 한다.

## 실행 환경

파이프라인은 Kubernetes Pod에서 실행된다.

```groovy
node('buildkit-nx') {        // buildkit-nx 라벨이 붙은 K8s Pod
    container("buildkit") {  // buildkit 컨테이너 안에서 실행
        // 모든 스테이지가 여기서 실행
    }
}
```

인증 정보는 Jenkins Credentials로 관리한다.

```groovy
withCredentials([
    usernamePassword(credentialsId: 'nexus', ...),    // Nexus 저장소 인증
    usernamePassword(credentialsId: 'github', ...)    // GitHub 인증 (태그 push, helm-values)
])
```

## 다른 MSA 프로젝트에도 동일하게 적용

이 파이프라인은 `downtime` 전용이 아니다. 같은 구조를 따르는 모든 프로젝트에서 동일하게 동작한다.

```
com.knet.msa/
├── auth/          → Jenkinsfile → nxBuild()
├── bank/          → Jenkinsfile → nxBuild()
├── calendar/      → Jenkinsfile → nxBuild()
├── downtime/      → Jenkinsfile → nxBuild()
├── file-manager/  → Jenkinsfile → nxBuild()
├── gateway/       → Jenkinsfile → nxBuild()
├── mail/          → Jenkinsfile → nxBuild()
├── members/       → Jenkinsfile → nxBuild()
├── message/       → Jenkinsfile → nxBuild()
└── ...
```

새 프로젝트를 추가할 때 필요한 것은 다음과 같다.

1. `project.json`에 Nx 프로젝트 정의 (tags, targets)
2. `package.json`에 version: 0.0.0
3. 배포 대상이면 `type:deployable` 태그 추가
4. `Jenkinsfile`에 2줄 작성

```groovy
@Library('jenkins') _
nxBuild()
```

파이프라인 코드를 건드릴 필요가 전혀 없다.

## 핵심 요약

- **변경 감지**: `nx affected`가 변경된 모듈만 골라내고, 의존관계로 연결된 모듈도 함께 포함
- **버전 결정**: Conventional Commits(`fix:`, `feat:`, `feat!:`)로 자동 결정. `chore:` 등은 빌드/배포 안 함
- **sharedGlobals**: 루트 빌드 파일 변경 시 전체 모듈 강제 빌드/배포
- **배포 대상**: `type:deployable` 태그로 판별. 라이브러리는 Nexus, 앱은 ECR+ArgoCD
- **브랜치 전략**: main → 정식 버전 + prod 배포, 그 외 → beta 프리릴리즈 + dev 배포
- **빌드 순서**: 위상 정렬로 의존성 순서 보장
