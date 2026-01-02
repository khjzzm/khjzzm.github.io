---
layout: post
title: Traefik Gateway 설정 가이드
tags: [devops]
---

# Traefik Gateway 로컬 개발 환경 구축 가이드

## 개요

마이크로서비스 아키텍처에서 각 서비스가 다른 포트에서 실행되면 프론트엔드에서 CORS 문제가 발생하고, 서비스별 엔드포인트 관리가 복잡해집니다. **Traefik Gateway**를 사용하면 단일 엔드포인트(`localhost:8082`)로 모든 마이크로서비스에 접근할 수 있어 이러한 문제를 해결할 수 있습니다.

### 이 가이드에서 다루는 내용

- Traefik Gateway 설정 및 구조
- 로컬 서비스와 개발 서버 간 전환 방법
- Nuxt.js 프론트엔드와의 연동
- 새 서비스 추가 방법
- 트러블슈팅

---

## 아키텍처

### 전체 요청 흐름

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Browser   │ ──▶ │  Nuxt App        │ ──▶ │  Traefik Gateway    │ ──▶ │  Backend Services│
│             │     │  (Nuxt Proxy)    │     │  (localhost:8082)   │     │  (localhost:*)   │
└─────────────┘     └──────────────────┘     └─────────────────────┘     └──────────────────┘
```

### Traefik 내부 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                           │
│                    http://localhost:8082/users/api/...          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Traefik Gateway                            │
│                        (Port 8082)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                        Routers                            │  │
│  │   /auth/* → auth-router                                   │  │
│  │   /users/* → users-router                                 │  │
│  │   /orders/* → orders-router                               │  │
│  │   ...                                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Middlewares                           │  │
│  │   strip-prefix-middleware: /users/api → /api              │  │
│  │   dev-header-middleware: Host 헤더 변경                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                       Services                            │  │
│  │   local-auth-service → host.docker.internal:11000         │  │
│  │   local-users-service → host.docker.internal:21000        │  │
│  │   dev-service → https://dev.api.example.com               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Microservices (Local)                        │
│   auth-server:11000  │  users-api:21000  │  ...                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 파일 구조

```
traefik-gateway/
├── traefik.yaml    # Traefik 메인 설정 (EntryPoints, Providers, API)
└── gateway.yaml    # 라우팅 규칙 설정 (Routers, Middlewares, Services)
```

---

## 설정 파일 상세

### traefik.yaml (메인 설정)

Traefik의 기본 동작을 정의하는 설정 파일입니다.

```yaml
# EntryPoints - 트래픽 진입점
entryPoints:
  web:
    address: ":80"    # 컨테이너 내부 80포트 → 호스트 8082포트로 매핑

# Providers - 라우팅 규칙 제공자
providers:
  file:
    filename: "/etc/traefik/gateway.yaml"  # gateway.yaml에서 라우팅 규칙 로드
    watch: false

# API & Dashboard
api:
  dashboard: true     # 대시보드 활성화 (http://localhost:8081)
  insecure: true      # 인증 없이 접근 허용

# 로깅
log:
  level: INFO
accessLog: true       # 액세스 로그 활성화
```

| 설정 | 설명 |
|-----|------|
| `entryPoints.web` | HTTP 요청을 받는 포트 (컨테이너 내부 80, 외부 8082) |
| `providers.file` | 라우팅 규칙 파일 경로 지정 |
| `api.dashboard` | 웹 대시보드 활성화 여부 |
| `api.insecure` | 대시보드 인증 없이 접근 (개발용) |

### gateway.yaml (라우팅 규칙)

gateway.yaml은 크게 **3개 섹션**으로 구성됩니다:

#### 1. Routers (라우터)

URL 경로 패턴에 따라 요청을 적절한 서비스로 라우팅합니다.

```yaml
http:
  routers:
    users-router:
      rule: PathPrefix(`/users`)          # /users로 시작하는 모든 요청
      entryPoints: [ web ]                # web 엔트리포인트 사용
      service: local-users-service        # 로컬 서비스로 전달
      middlewares: [ strip-prefix-middleware ]  # 미들웨어 적용
```

**라우터 전환 방법 (로컬 ↔ 개발서버)**:
```yaml
# 로컬 서비스 사용 (기본)
service: local-users-service
middlewares: [ strip-prefix-middleware ]

# 개발 서버 사용 (주석 해제하여 전환)
#service: dev-service
#middlewares: [ dev-header-middleware ]
```

#### 2. Middlewares (미들웨어)

요청을 변환하거나 헤더를 수정합니다.

| 미들웨어 | 용도 | 동작 |
|---------|------|------|
| `strip-prefix-middleware` | 로컬 서비스용 | `/users/api/v1/...` → `/api/v1/...` |
| `dev-header-middleware` | 개발서버 프록시용 | Host 헤더를 `dev.api.example.com`으로 변경 |
| `cors-middleware` | CORS 설정 | 모든 Origin 허용 (개발용) |

```yaml
middlewares:
  strip-prefix-middleware:
    replacePathRegex:
      regex: "^/[a-z0-9-]+/(.*)"    # 첫 번째 경로 세그먼트 제거
      replacement: "/$1"

  dev-header-middleware:
    headers:
      customRequestHeaders:
        X-Forwarded-Host: dev.api.example.com
        Host: dev.api.example.com
```

#### 3. Services (서비스)

실제 백엔드 서비스의 주소를 정의합니다.

```yaml
services:
  # 로컬 서비스 (host.docker.internal로 호스트 머신 접근)
  local-auth-service:
    loadBalancer:
      servers: [ { url: http://host.docker.internal:11000 } ]

  # 개발 서버 프록시
  dev-service:
    loadBalancer:
      servers: [ { url: https://dev.api.example.com } ]
      serversTransport: skip-verify-transport  # SSL 검증 스킵
```

---

## 서비스 포트 매핑

### 현재 서비스 상태

> **개발서버 기본 사용 모듈**: calculator, scheduler, certificate, maintenance, company-info
>
> 위 5개 모듈은 기본적으로 원격 개발서버(`dev.api.example.com`)를 사용하도록 설정되어 있습니다.

### 로컬 서비스 포트 목록

| 서비스 그룹 | 서비스명 | 경로 | 포트 | 기본 설정 |
|------------|---------|------|------|----------|
| **Auth** | auth | `/auth` | 11000 | 로컬 |
| **Base** | users | `/users` | 21000 | 로컬 |
| | calculator | `/calculator` | 23000 | **개발서버** |
| | scheduler | `/scheduler` | 24000 | **개발서버** |
| | storage | `/storage` | 25000 | 로컬 |
| | certificate | `/certificate` | 26000 | **개발서버** |
| | maintenance | `/maintenance` | 27000 | **개발서버** |
| **Document** | invoice | `/invoice` | 31000 | 로컬 |
| | receipt | `/receipt` | 32000 | 로컬 |
| | report | `/report` | 33000 | 로컬 |
| **Notification** | email | `/email` | 41000 | 로컬 |
| | sms | `/sms` | 42000 | 로컬 |
| | fax | `/fax` | 43000 | 로컬 |
| | push | `/push` | 44000 | 로컬 |
| **DataSync** | payment | `/payment` | 53000 | 로컬 |
| | banking | `/banking` | 54000 | 로컬 |
| | company-info | `/company-info` | 55000 | **개발서버** |
| **Core** | main-api | `/main-api` | 61000 | 로컬 |
| | admin-api | `/admin-api` | 62000 | 로컬 |
| | partner-api | `/partner-api` | 63000 | 로컬 |
| | public-api | `/public-api` | 64000 | 로컬 |

---

## Nuxt.js 프론트엔드 연동

### Nuxt Proxy 설정

Nuxt.js에서는 `@nuxtjs/proxy` 모듈을 사용하여 Traefik Gateway로 요청을 프록시합니다.

```javascript
// nuxt.config.js
export default {
  axios: {
    proxy: true,
    prefix: process.env.DOMAIN + '/proxy',
  },

  proxy: {
    '/proxy/api': {
      target: process.env.API_GATEWAY_URL,  // http://localhost:8082
      pathRewrite: { '^/proxy/api/': '/main-api/api/' },
    },
    '/proxy/oauth2': {
      target: process.env.API_GATEWAY_URL,
      pathRewrite: { '^/proxy/oauth2/': '/main-api/oauth2/' },
    },
    '/proxy/users/api': {
      target: process.env.API_GATEWAY_URL,
      pathRewrite: { '^/proxy/users/api/': '/users/api/' },
    },
  },
}
```

### 이중 프록시 구조의 이점

```
Browser → Nuxt Proxy → Traefik Gateway → Backend Service
```

| 계층 | 역할 |
|-----|------|
| **Nuxt Proxy** | CORS 우회, 클라이언트에 실제 API 주소 숨김 |
| **Traefik Gateway** | 마이크로서비스 라우팅, 로드밸런싱, 경로 변환 |

### 실제 요청 흐름 예시

브라우저에서 사용자 정보를 조회하는 경우:

```
1. Browser
   GET http://localhost:3000/proxy/api/users
                    ↓
2. Nuxt Proxy (pathRewrite 적용)
   GET http://localhost:8082/main-api/api/users
                    ↓
3. Traefik Gateway (main-api-router 매칭)
   rule: PathPrefix(`/main-api`)
   middleware: strip-prefix-middleware
                    ↓
4. strip-prefix-middleware (경로 변환)
   /main-api/api/users → /api/users
                    ↓
5. local-main-api-service
   GET http://host.docker.internal:61000/api/users
                    ↓
6. main-api 서비스에서 응답 반환
```

---

## 사용 방법

### 1. Docker로 Traefik 실행

```yaml
# docker-compose.yml
services:
  traefik-gateway:
    image: traefik:v3.4.4
    container_name: traefik-gateway
    ports:
      - "8081:8080"    # 대시보드
      - "8082:80"      # 게이트웨이
    volumes:
      - ./traefik-gateway:/etc/traefik  # 설정 파일 마운트
```

```bash
docker-compose up -d traefik-gateway
```

### 2. 게이트웨이를 통한 API 호출

```bash
# 사용자 API 호출 예시
curl http://localhost:8082/users/api/v1/members

# 인증 API 호출 예시
curl http://localhost:8082/auth/api/v1/token

# 송장 API 호출 예시
curl http://localhost:8082/invoice/api/v1/list

# 메인 API 호출 예시
curl http://localhost:8082/main-api/api/v1/dashboard
```

### 3. 개발 서버로 프록시 전환

특정 서비스를 개발 서버(`dev.api.example.com`)로 프록시하려면:

1. `gateway.yaml`에서 해당 라우터 설정 변경:
```yaml
users-router:
  rule: PathPrefix(`/users`)
  entryPoints: [ web ]
  #service: local-users-service             # 주석 처리
  #middlewares: [ strip-prefix-middleware ] # 주석 처리
  service: dev-service                       # 활성화
  middlewares: [ dev-header-middleware ]     # 활성화
```

2. Traefik 컨테이너 재시작:
```bash
docker restart traefik-gateway
```

### 4. 대시보드 접근

Traefik 대시보드에서 라우터, 서비스, 미들웨어 상태를 확인할 수 있습니다:

- **URL**: http://localhost:8081
- **기능**:
    - 라우터 목록 및 상태 확인
    - 서비스 헬스체크 상태
    - 실시간 요청 모니터링

---

## 새 서비스 추가하기

새로운 마이크로서비스를 게이트웨이에 추가하려면:

### 1. Router 추가

```yaml
routers:
  new-service-router:
    rule: PathPrefix(`/new-service`)
    entryPoints: [ web ]
    service: local-new-service
    middlewares: [ strip-prefix-middleware ]
    # 개발서버 사용 시:
    #service: dev-service
    #middlewares: [ dev-header-middleware ]
```

### 2. Service 추가

```yaml
services:
  local-new-service:
    loadBalancer:
      servers: [ { url: http://host.docker.internal:PORT } ]
```

### 3. Traefik 재시작

```bash
docker restart traefik-gateway
```

---

## 트러블슈팅

### 502 Bad Gateway

**원인**: 백엔드 서비스가 실행되지 않거나 연결할 수 없음

**해결 방법**:
```bash
# 1. 백엔드 서비스 실행 상태 확인
curl http://localhost:61000/actuator/health

# 2. 해당 서비스를 개발서버로 전환
# gateway.yaml에서 service를 dev-service로 변경
```

### 404 Not Found

**원인**: 라우터 규칙이 매칭되지 않음

**해결 방법**:
```bash
# 1. 대시보드에서 라우터 상태 확인
# http://localhost:8081/dashboard/#/http/routers

# 2. 요청 경로가 PathPrefix와 일치하는지 확인
# 예: /users로 시작해야 users-router에 매칭됨
```

### CORS 에러

**원인**: 프론트엔드에서 직접 Traefik Gateway 호출 시 CORS 정책 위반

**해결 방법**:
```yaml
# gateway.yaml에서 cors-middleware 활성화
routers:
  users-router:
    middlewares: [ strip-prefix-middleware, cors-middleware ]
```

또는 Nuxt Proxy를 통해 요청하도록 변경 (권장)

### 설정 변경이 반영되지 않음

**원인**: `watch: false` 설정으로 인해 파일 변경이 자동 감지되지 않음

**해결 방법**:
```bash
docker restart traefik-gateway
```

### host.docker.internal 연결 실패 (Linux)

**원인**: Linux에서는 `host.docker.internal`이 기본 지원되지 않음

**해결 방법**:
```yaml
# docker-compose.yml
services:
  traefik-gateway:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## 주의사항

- `host.docker.internal`은 Docker 컨테이너에서 호스트 머신에 접근하기 위한 특수 DNS 이름입니다.
- `dev-service`는 SSL 인증서 검증을 스킵합니다 (`insecureSkipVerify: true`). 프로덕션에서는 사용하지 마세요.
- 설정 변경 후 `watch: false`이므로 반드시 컨테이너를 재시작해야 합니다.
- 대시보드 `insecure: true` 설정은 개발 환경에서만 사용하세요.

---

## 참고 자료

- [Traefik 공식 문서](https://doc.traefik.io/traefik/)
- [Traefik Routers](https://doc.traefik.io/traefik/routing/routers/)
- [Traefik Middlewares](https://doc.traefik.io/traefik/middlewares/overview/)
- [Nuxt.js Proxy Module](https://github.com/nuxt-community/proxy-module)
