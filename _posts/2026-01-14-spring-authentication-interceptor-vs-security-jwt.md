---
layout: post
title: Spring 인증 구현 - 커스텀 인터셉터 vs Spring Security + JWT
tags: [spring, java, security]
---

Spring에서 인증을 구현하는 두 가지 방식을 비교한다. 커스텀 인터셉터 + AES 암호화 방식과 Spring Security + JWT 방식의 구조, 장단점, 선택 기준을 정리한다.

---

## 전체 아키텍처

```
HTTP Request
    │
    ▼
┌─────────────────────────┐
│  SessionLoadInterceptor │  ← 세션 로드 (실패해도 통과)
│  - 쿠키/헤더에서 추출    │
│  - 복호화 & 역직렬화     │
│  - request.setAttribute │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ RequireSessionInterceptor│  ← 세션 검증 (@RequireSession 있으면)
│  - 세션 없으면 예외 발생  │
└─────────────────────────┘
    │
    ▼
   Controller
```

---

## @RequireSession 어노테이션

### 어노테이션 정의

```java
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireSession {
}
```

- `@Target({ElementType.METHOD, ElementType.TYPE})`: 메서드 또는 클래스 레벨에 적용 가능
- `@Retention(RetentionPolicy.RUNTIME)`: 런타임에 리플렉션으로 접근 가능

### 사용 예시

```java
// 클래스 레벨 - 모든 메서드에 세션 필수
@RequireSession
@RestController
public class UserController {
    // ...
}

// 메서드 레벨 - 특정 메서드만 세션 필수
@RestController
public class PublicController {

    @RequireSession
    @GetMapping("/my-info")
    public UserInfo getMyInfo() { ... }

    @GetMapping("/public-data")  // 세션 불필요
    public Data getPublicData() { ... }
}
```

---

## RequireSessionInterceptor

```java
public class RequireSessionInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        // HandlerMethod가 아니면 통과
        if (!(handler instanceof HandlerMethod)) return true;

        HandlerMethod handlerMethod = (HandlerMethod) handler;
        boolean required = handlerMethod.hasMethodAnnotation(RequireSession.class)
            || handlerMethod.getBeanType().isAnnotationPresent(RequireSession.class);

        if (!required) return true;

        Session session = (Session) request.getAttribute(SessionLoadInterceptor.REQ_ATTR_SESSION);

        if (session == null) {
            throw new BusinessException(DefaultErrorCode.UNAUTHORIZED);
        }

        return true;
    }
}
```

**동작 흐름:**

| 단계 | 설명 |
|------|------|
| 1 | `handler`가 `HandlerMethod`가 아니면 통과 (정적 리소스 등) |
| 2 | 메서드 또는 클래스에 `@RequireSession`이 있는지 확인 |
| 3 | 어노테이션이 없으면 통과 |
| 4 | `SessionLoadInterceptor`가 미리 로드한 세션을 request attribute에서 조회 |
| 5 | 세션이 없으면 `BusinessException(UNAUTHORIZED)` 예외 발생 |

---

## SessionLoadInterceptor

```java
public class SessionLoadInterceptor implements HandlerInterceptor {

    public static final String REQ_ATTR_SESSION = "SESSION";

    @Autowired
    protected ObjectMapper objectMapper;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        Session session = SessionUtil.getSession(request, objectMapper);

        if (session != null) {
            request.setAttribute(REQ_ATTR_SESSION, session);
        }

        return true;  // 항상 통과 (세션 없어도 OK)
    }
}
```

---

## SessionUtil - 세션 추출 로직

```java
public class SessionUtil {

    public static final String SESSION_ID = "SESSIONID";

    public static Session getSession(HttpServletRequest request,
                                     ObjectMapper objectMapper) throws JsonProcessingException {
        String encryptedSession = null;

        // 1. 쿠키에서 세션 추출
        Cookie sessionCookie = WebUtils.getCookie(request, SESSION_ID);
        if (sessionCookie != null && !Strings.isNullOrEmpty(sessionCookie.getValue())) {
            encryptedSession = sessionCookie.getValue();
        }

        // 2. 쿠키에 없으면, 헤더에서 세션 추출
        if (encryptedSession == null) {
            encryptedSession = request.getHeader(SESSION_ID);
        }

        if (encryptedSession == null)
            return null;

        // 3. AES 복호화 & JSON 역직렬화
        Session session = objectMapper.readValue(
            EncryptUtil.decryptAES(encryptedSession),
            Session.class
        );
        session.setDoDT(LocalDateTime.now());
        return session;
    }
}
```

| 순서 | 소스 | 설명 |
|------|------|------|
| 1 | Cookie | `SESSIONID` 쿠키에서 먼저 조회 |
| 2 | Header | 쿠키에 없으면 `SESSIONID` 헤더에서 조회 |
| 3 | 복호화 | AES 암호화된 값을 복호화 |
| 4 | 역직렬화 | JSON → `Session` 객체로 변환 |
| 5 | 타임스탬프 | 현재 시간 설정 |

---

## Session 클래스

```java
@Getter @NoArgsConstructor @Builder @ToString
public class Session {
    // 서비스 식별 정보
    protected Product object;
    protected String product;
    ...
    
    // 사용자 식별 정보
    protected Integer memberSeq;
    protected Integer userSeq;
    ...
	
    // 세션 메타 정보
    protected SessionType doSessionType;  // 세션 유형
    protected Integer doSessionSeq;       // 세션 고유번호
    @Setter
    protected LocalDateTime doDT;         // 요청 시간
    protected String doIp;                // 요청 IP
}
```

### SessionType (세션 유형)

| 값 | 설명 | 용도 |
|----|------|------|
| `SYSTEM` | 시스템 | 내부 배치, 스케줄러 등 |
| `MANAGER` | 관리자 | 백오피스 관리자 |
| `PARTNER` | 파트너 | 파트너사 담당자 |
| `USER` | 사용자 | 일반 사용자 |
| `GUEST` | 비회원 | 로그인하지 않은 사용자 |

### 팩토리 메서드

```java
// 시스템 세션 생성 (배치 작업 등에서 사용)
Session.generateSystemSession("batch-job");

// 게스트 세션 생성 (비로그인 사용자)
Session.generateGuestSession("web");
```

---

## AES 암호화 (EncryptUtil)

### 암호화 알고리즘 스펙

| 항목 | 값 |
|------|-----|
| 알고리즘 | AES (Advanced Encryption Standard) |
| 운영 모드 | CBC (Cipher Block Chaining) |
| 패딩 | PKCS5Padding |
| 키 길이 | 128비트 (MD5 해시 결과) |
| IV 길이 | 128비트 (MD5 해시 결과) |
| 인코딩 | Base64 |

### 암호화 흐름

```
  Key: "YOUR_ENCRYPT_KEY"          IV: "YOUR_ENCRYPT_IV"
           │                              │
           ▼                              ▼
      ┌─────────┐                    ┌─────────┐
      │  MD5    │                    │  MD5    │
      │  Hash   │                    │  Hash   │
      └────┬────┘                    └────┬────┘
           │                              │
           ▼                              ▼
      128bit Key                    128bit IV
           │                              │
           └──────────┬───────────────────┘
                      │
                      ▼
              ┌───────────────┐
  평문 ──────▶│ AES/CBC/PKCS5 │──────▶ 암호문 (bytes)
  (UTF-8)     └───────────────┘              │
                                             ▼
                                      ┌────────────┐
                                      │   Base64   │
                                      │   Encode   │
                                      └─────┬──────┘
                                            │
                                            ▼
                                     암호화된 문자열
```

### StringEncrypter 핵심 코드

```java
public class StringEncrypter {
    private Cipher rijndael;
    private SecretKeySpec key;
    private IvParameterSpec initalVector;

    public StringEncrypter(String key, String initialVector) {
        // AES/CBC/PKCS5Padding 알고리즘 생성
        this.rijndael = Cipher.getInstance("AES/CBC/PKCS5Padding");

        // MD5 해시로 128비트 키/IV 생성
        MessageDigest md5 = MessageDigest.getInstance("MD5");
        this.key = new SecretKeySpec(
            md5.digest(key.getBytes(StandardCharsets.UTF_8)), "AES"
        );
        this.initalVector = new IvParameterSpec(
            md5.digest(initialVector.getBytes(StandardCharsets.UTF_8))
        );
    }

    public String encrypt(String value) throws Exception {
        this.rijndael.init(Cipher.ENCRYPT_MODE, this.key, this.initalVector);
        byte[] utf8Value = value.getBytes(StandardCharsets.UTF_8);
        byte[] encryptedValue = this.rijndael.doFinal(utf8Value);
        return Base64Encoder.encode(encryptedValue);
    }

    public String decrypt(String value) throws Exception {
        this.rijndael.init(Cipher.DECRYPT_MODE, this.key, this.initalVector);
        byte[] encryptedValue = Base64Encoder.decode(value);
        byte[] decryptedValue = this.rijndael.doFinal(encryptedValue);
        return new String(decryptedValue, StandardCharsets.UTF_8);
    }
}
```

---

## 인터셉터 등록 설정

### ApiWebMvcConfig

```java
@Slf4j
public class ApiWebMvcConfig implements WebMvcConfigurer {

    // 인터셉터 Bean 등록
    @Bean
    public SessionLoadInterceptor sessionLoadInterceptor() {
        return new SessionLoadInterceptor();
    }

    @Bean
    public RequireSessionInterceptor requireSessionInterceptor() {
        return new RequireSessionInterceptor();
    }

    // 인터셉터 체인 등록
    @Override
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        registry.addInterceptor(sessionLoadInterceptor())
                .order(0)
                .addPathPatterns("/**");

        registry.addInterceptor(requireSessionInterceptor())
                .order(0)
                .addPathPatterns("/**");
    }

    // ArgumentResolver 등록
    @Bean
    public SessionArgumentResolver sessionArgumentResolver() {
        return new SessionArgumentResolver();
    }

    @Override
    public void addArgumentResolvers(@NonNull List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(sessionArgumentResolver());
    }
}
```

### 실제 프로젝트에서 사용

```java
@Configuration
@ControllerAdvice  // ExceptionHandler 활성화
public class WebMvcConfig extends ApiWebMvcConfig {
    // 필요시 추가 설정 오버라이드
}
```

---

## 컨트롤러에서 세션 사용

```java
@GetMapping("/my-info")
@RequireSession
public UserInfo getMyInfo(Session session) {  // SessionArgumentResolver가 자동 주입
    return userService.getInfo(session.getUserSeq());
}
```

---

## 세션 흐름 요약

```
로그인 성공
    │
    ▼
┌─────────────────────────────────────┐
│ Session 객체 생성                    │
│ - product 설정                       │
│ - memberSeq, userSeq 설정            │
│ - doSessionType = USER/MANAGER/...  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ JSON 직렬화 → AES 암호화             │
│ → Cookie/Header에 SESSIONID로 저장   │
└─────────────────────────────────────┘
    │
    ▼ (다음 요청)
┌─────────────────────────────────────┐
│ SessionLoadInterceptor              │
│ - SESSIONID 복호화 & 역직렬화         │
│ - request.setAttribute("SESSION")   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ RequireSessionInterceptor           │
│ - @RequireSession 어노테이션 체크    │
│ - 세션 없으면 UNAUTHORIZED 예외      │
└─────────────────────────────────────┘
    │
    ▼
   Controller에서 Session 사용
```

---

## Spring Security + JWT와 비교

### 아키텍처 비교

**커스텀 인터셉터 방식**
```
Request → SessionLoadInterceptor → RequireSessionInterceptor → Controller
              (AES 복호화)              (null 체크)
```

**Spring Security + JWT 방식**
```
Request → JwtAuthenticationFilter → SecurityContext → Controller
              (JWT 검증/파싱)         (Authentication 저장)
```

### 구현 코드 비교

#### 커스텀 인터셉터 방식

```java
// 세션 로드
@Override
public boolean preHandle(HttpServletRequest request, ...) {
    Session session = SessionUtil.getSession(request, objectMapper);
    if (session != null) {
        request.setAttribute("SESSION", session);
    }
    return true;
}

// 세션 검증
@Override
public boolean preHandle(HttpServletRequest request, ...) {
    Session session = (Session) request.getAttribute("SESSION");
    if (session == null) {
        throw new BusinessException(DefaultErrorCode.UNAUTHORIZED);
    }
    return true;
}

// 컨트롤러에서 사용
@RequireSession
@GetMapping("/my-info")
public UserInfo getMyInfo(Session session) {
    return userService.getInfo(session.getUserSeq());
}
```

#### Spring Security + JWT 방식

```java
// JWT 필터
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, ...) {
        String token = resolveToken(request);

        if (token != null && jwtTokenProvider.validateToken(token)) {
            Authentication auth = jwtTokenProvider.getAuthentication(token);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }
}

// Security 설정
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/public/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }
}

// 컨트롤러에서 사용
@GetMapping("/my-info")
public UserInfo getMyInfo(@AuthenticationPrincipal UserDetails user) {
    return userService.getInfo(user.getUsername());
}
```

### 기능 비교

| 기능 | 커스텀 인터셉터 | Spring Security + JWT |
|------|----------------|----------------------|
| 인증 | `@RequireSession` | `@PreAuthorize`, URL 패턴 |
| 인가 (권한) | 직접 구현 필요 | `@PreAuthorize("hasRole('ADMIN')")` |
| 메서드 보안 | 미지원 | `@Secured`, `@PreAuthorize` |
| CORS | 별도 설정 | 통합 설정 |
| CSRF | 별도 설정 | 통합 설정 |
| OAuth2 | 직접 구현 | 내장 지원 |

### 토큰 구조 비교

**커스텀 AES 토큰**
```
AES암호화(JSON) → Base64

// 원본 데이터
{"memberSeq":123,"userSeq":456,"doSessionType":"USER"}

// 암호화 후 (예시)
dGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIGFlcyBlbmNyeXB0ZWQ=
```

**JWT 토큰**
```
Base64(Header).Base64(Payload).Signature

// Header
{"alg":"HS256","typ":"JWT"}

// Payload
{"sub":"456","memberSeq":123,"role":"USER","exp":1234567890}

// 전체 토큰
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0NTYiLCJtZW1iZXJTZXEiOjEyM30.signature
```

### 보안 비교

| 항목 | 커스텀 인터셉터 | Spring Security + JWT |
|------|----------------|----------------------|
| 암호화 | AES-CBC (기밀성) | 없음 (Base64만) |
| 서명 | 없음 | HMAC/RSA (무결성) |
| 만료 | 직접 구현 | `exp` 클레임 표준 |
| 표준화 | 자체 스펙 | RFC 7519 |
| 디버깅 | 복호화 필요 | jwt.io에서 확인 가능 |

**참고:** JWT는 암호화가 아닌 서명 방식이라 페이로드가 노출됨. 민감 정보는 담지 않아야 함.

### 장단점 정리

#### 커스텀 인터셉터 방식

**장점**
- 단순한 구조, 이해하기 쉬움
- 외부 의존성 최소화
- 페이로드 암호화로 내용 숨김
- 토큰 크기가 작음

**단점**
- 인가(권한) 로직 직접 구현 필요
- 보안 취약점 발견 시 직접 대응
- 표준이 아니라 협업/인수인계 어려움

#### Spring Security + JWT 방식

**장점**
- 업계 표준, 검증된 보안
- 풍부한 인가 기능 내장
- OAuth2, OIDC 등 확장 용이
- 커뮤니티 지원, 문서화 풍부

**단점**
- 학습 곡선이 가파름
- 설정이 복잡함
- 페이로드가 노출됨 (서명만 검증)
- 토큰 크기가 큼

### 선택 가이드

```
┌─────────────────────────────────────────────────────────┐
│                    프로젝트 특성                         │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
    ┌───────────┐                   ┌───────────┐
    │  레거시    │                   │  신규     │
    │  빠른개발  │                   │  확장성   │
    │  단순인증  │                   │  복잡인가 │
    └─────┬─────┘                   └─────┬─────┘
          │                               │
          ▼                               ▼
  ┌───────────────┐               ┌───────────────┐
  │ 커스텀 인터셉터 │               │ Spring Security│
  │    + AES      │               │    + JWT      │
  └───────────────┘               └───────────────┘
```

| 상황 | 추천 |
|------|------|
| 내부 시스템, 단순 인증만 필요 | 커스텀 인터셉터 |
| 역할/권한 기반 인가 필요 | Spring Security |
| OAuth2/소셜 로그인 필요 | Spring Security |
| MSA 환경, 서비스 간 인증 | Spring Security + JWT |
| 레거시 시스템 유지보수 | 기존 방식 유지 |

### 마이그레이션 고려사항

커스텀 방식에서 Spring Security로 전환 시:

1. **점진적 전환**: 새 API부터 적용, 기존 API는 유지
2. **토큰 호환**: 전환 기간 동안 두 토큰 모두 지원
3. **테스트**: 기존 인증 로직과 동일하게 동작하는지 검증
4. **클라이언트 대응**: 토큰 형식 변경에 따른 클라이언트 수정
