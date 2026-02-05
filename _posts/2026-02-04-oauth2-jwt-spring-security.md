---
layout: post
title: OAuth2, JWT, Spring Security 관계 정리
tags: [ spring, security, oauth2, jwt ]
---

## OAuth2와 JWT는 다른 개념이다

```
OAuth2 = 인증/인가 프레임워크 (규약/프로토콜)
JWT = 토큰 형식 (데이터 포맷)
```

OAuth2는 "어떻게 인증할지"를 정의하고, JWT는 "토큰을 어떤 형식으로 만들지"를 정의한다.

### 비유

```
OAuth2 = 택배 시스템 (절차/규칙)
JWT = 택배 상자 형태 (포장 방식)
```

택배 시스템(OAuth2)에서 상자(토큰)를 어떤 형태로 쓸지는 선택할 수 있다.

---

## OAuth2 토큰 종류

OAuth2에서 사용하는 토큰은 크게 두 가지 형식이 있다.

### 1. Opaque Token (불투명 토큰)

```
토큰: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

랜덤 문자열로, 토큰 자체에는 아무 정보가 없다.

**검증 방식:**

```
Client ──────▶ Resource Server ──────▶ Auth Server
                                        "이 토큰 유효해?"
               ◀─────────────────────── "응, user_id=123이야"
```

| 장점                | 단점                     |
|-------------------|------------------------|
| 토큰 탈취 시 즉시 무효화 가능 | 매번 Auth Server 호출 필요   |
| 토큰에 정보 노출 없음      | Auth Server 장애 시 전체 장애 |
| 구현 단순             | 네트워크 오버헤드              |

### 2. JWT (JSON Web Token)

```
토큰: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYXgtc2NoZWR1bGVyIi...
```

토큰 자체에 정보가 포함되어 있다.

**JWT 구조:**

```
┌─────────────────────────────────────────────────────┐
│  Header (헤더)                                       │
│  { "alg": "RS256", "typ": "JWT" }                   │
├─────────────────────────────────────────────────────┤
│  Payload (페이로드)                                  │
│  {                                                  │
│    "sub": "fax-scheduler",                          │
│    "scope": ["user:read", "user:write"],            │
│    "session": "{\"userId\":100}",                   │
│    "iat": 1699999000,                               │
│    "exp": 1699999999                                │
│  }                                                  │
├─────────────────────────────────────────────────────┤
│  Signature (서명)                                    │
│  RSASHA256(base64(header) + "." + base64(payload))  │
└─────────────────────────────────────────────────────┘
```

**검증 방식:**

```
Client ──────▶ Resource Server
               └─ 서명 검증 (공개키로)
               └─ 만료 시간 확인
               └─ Claim 추출
               └─ 요청 처리
```

Auth Server 호출 없이 자체 검증 가능.

| 장점                 | 단점                     |
|--------------------|------------------------|
| Auth Server 호출 불필요 | 토큰 탈취 시 만료까지 유효        |
| 빠른 검증              | 토큰 크기가 큼               |
| Stateless          | Payload 정보 노출 (암호화 아님) |

---

## Opaque Token vs JWT 비교

| 구분     | Opaque Token   | JWT            |
|--------|----------------|----------------|
| 토큰 내용  | 랜덤 문자열         | 정보 포함 (Base64) |
| 검증 방법  | Auth Server 호출 | 자체 검증 (서명)     |
| 무효화    | 즉시 가능          | 만료까지 불가        |
| 크기     | 작음             | 큼              |
| 상태     | Stateful       | Stateless      |
| 적합한 환경 | 보안 중요, 단일 서버   | MSA, 분산 시스템    |

---

## OAuth2 Grant Types

OAuth2는 상황에 따라 다른 인증 방식(Grant Type)을 제공한다.

### 1. Authorization Code Grant

사용자가 로그인하는 일반적인 웹 애플리케이션용.

```
┌────────┐     ┌────────┐     ┌─────────────┐     ┌──────────┐
│  User  │────▶│ Client │────▶│ Auth Server │────▶│ Resource │
└────────┘     └────────┘     └─────────────┘     └──────────┘
    │              │                │
    │  1. 로그인 요청  │                │
    │──────────────▶│                │
    │              │  2. 로그인 페이지  │
    │              │───────────────▶│
    │              │                │
    │  3. ID/PW 입력  │                │
    │──────────────────────────────▶│
    │              │  4. Auth Code   │
    │              │◀───────────────│
    │              │  5. Token 교환   │
    │              │───────────────▶│
    │              │  6. Access Token│
    │              │◀───────────────│
```

### 2. Client Credentials Grant

**서버 간 통신용** (사용자 없음).

```
┌────────────────┐     ┌─────────────┐     ┌──────────────┐
│ fax-scheduler  │────▶│ Auth Server │────▶│   fax-api    │
│   (Client)     │     │             │     │  (Resource)  │
└────────────────┘     └─────────────┘     └──────────────┘
        │                    │                    │
        │ 1. 토큰 요청         │                    │
        │ (client_id/secret) │                    │
        │───────────────────▶│                    │
        │                    │                    │
        │ 2. JWT 토큰 발급     │                    │
        │◀───────────────────│                    │
        │                    │                    │
        │ 3. API 호출 (Bearer Token)              │
        │────────────────────────────────────────▶│
        │                    │                    │
        │ 4. 응답             │                    │
        │◀────────────────────────────────────────│
```

MSA 환경에서 서비스 간 통신에 주로 사용.

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          internal:
            authorization-grant-type: client_credentials
            client-id: fax-scheduler
            scope: scheduler
```

---

## OAuth2 구성 요소

### 역할 분리

| 구성요소                     | 역할            | 예시            |
|--------------------------|---------------|---------------|
| **Authorization Server** | 토큰 발급         | Auth Server   |
| **Resource Server**      | 토큰 검증, API 제공 | fax-api       |
| **Client**               | 토큰 요청, API 호출 | fax-scheduler |
| **Resource Owner**       | 리소스 소유자       | 사용자 (또는 서비스)  |

### MSA에서의 구성

```
┌─────────────────────────────────────────────────────────────┐
│                      MSA 환경                                │
│                                                              │
│  ┌──────────────┐                                           │
│  │ Auth Server  │◀─── 토큰 발급 요청                         │
│  │              │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         │ JWT (동일한 RSA 키페어 공유)                         │
│         ▼                                                    │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │ user-service │     │order-service │     │ file-service │ │
│  │ (Resource)   │     │ (Resource)   │     │ (Resource)   │ │
│  └──────────────┘     └──────────────┘     └──────────────┘ │
│         ▲                   ▲                   ▲           │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                             │                                │
│                    ┌──────────────┐                         │
│                    │   scheduler  │                         │
│                    │   (Client)   │                         │
│                    └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Spring Security의 OAuth2 지원 변화

### 과거: Spring Security OAuth2 (Deprecated)

```java
// Resource Server 설정
@EnableResourceServer
public class Config extends ResourceServerConfigurerAdapter {

	@Bean
	public JwtAccessTokenConverter accessTokenConverter() { ...}

	@Bean
	public TokenStore tokenStore() { ...}

	@Bean
	public DefaultTokenServices tokenServices() { ...}
}
```

- 2022년 5월 프로젝트 종료
- 별도 라이브러리: `spring-security-oauth2`

### 현재: Spring Security 6.x

```kotlin
// Resource Server 설정
@EnableWebSecurity
class Config {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        return http
            .oauth2ResourceServer { it.jwt { } }
            .build()
    }

    @Bean
    fun jwtDecoder(): JwtDecoder {
        return NimbusJwtDecoder.withPublicKey(publicKey).build()
    }
}
```

- Spring Security 코어에 통합
- Nimbus JOSE+JWT 라이브러리 사용

### 변경 비교

| 구분     | Spring Security OAuth2  | Spring Security 6.x      |
|--------|-------------------------|--------------------------|
| 상태     | Deprecated              | 현재 표준                    |
| 어노테이션  | `@EnableResourceServer` | `@EnableWebSecurity`     |
| 설정 방식  | Adapter 상속              | SecurityFilterChain Bean |
| JWT 처리 | JwtAccessTokenConverter | NimbusJwtDecoder         |
| 빈 개수   | 3개+                     | 1~2개                     |

---

## JWT 검증 방식

### 공개키/개인키 (RSA)

```
Auth Server (토큰 발급)          Resource Server (토큰 검증)
┌─────────────────────┐         ┌─────────────────────┐
│                     │         │                     │
│  개인키로 서명        │         │  공개키로 검증        │
│  (Private Key)      │         │  (Public Key)       │
│                     │         │                     │
└─────────────────────┘         └─────────────────────┘
         │                               ▲
         │         JWT 토큰              │
         └───────────────────────────────┘
```

- Auth Server만 개인키 보유 (서명 가능)
- Resource Server는 공개키로 검증만

### 대칭키 (HMAC)

```
Auth Server & Resource Server 모두 동일한 Secret 공유
```

- 설정 간단
- Secret 유출 시 위험

---

## 정리

| 개념                  | 역할         | 관계                 |
|---------------------|------------|--------------------|
| **OAuth2**          | 인증/인가 프로토콜 | JWT를 토큰 형식으로 선택 가능 |
| **JWT**             | 토큰 데이터 형식  | OAuth2에서 사용될 수 있음  |
| **Opaque Token**    | 토큰 데이터 형식  | OAuth2에서 사용될 수 있음  |
| **Spring Security** | 보안 프레임워크   | OAuth2, JWT 구현 제공  |

```
Spring Security 6.x
├── oauth2ResourceServer { }    ← Resource Server 설정
├── oauth2Client { }            ← Client 설정
├── oauth2Login { }             ← 로그인 설정
└── NimbusJwtDecoder            ← JWT 검증
```

OAuth2는 **프로토콜**이고, JWT는 **토큰 형식**이다. 둘은 독립적이지만 함께 사용되는 경우가 많다.
