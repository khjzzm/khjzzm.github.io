---
layout: post
title: 트레일링 슬래시 (Trailing Slash)
tags: [spring, devops]
---

트레일링 슬래시(Trailing Slash)는 URL 끝에 붙는 슬래시(`/`)를 말한다. 단순해 보이지만 SEO, 캐싱, 라우팅에 영향을 미치는 중요한 요소다.

---

## 트레일링 슬래시란?

```
https://example.com/users    ← 트레일링 슬래시 없음
https://example.com/users/   ← 트레일링 슬래시 있음
```

이 두 URL은 기술적으로 **다른 URL**이다.

---

## 역사적 배경

### 파일 시스템에서의 의미

```
/users     → 파일
/users/    → 디렉토리
```

전통적인 웹 서버에서:
- `/about` → `about` 파일 또는 `about.html` 반환
- `/about/` → `about/index.html` 반환

### 현대 웹 애플리케이션

SPA, API 서버에서는 파일 시스템과 URL이 직접 매핑되지 않는다.
하지만 트레일링 슬래시의 처리 방식은 여전히 중요하다.

---

## SEO 관점

### 중복 콘텐츠 문제

```
https://example.com/products
https://example.com/products/
```

두 URL이 같은 콘텐츠를 반환하면 검색 엔진은 이를 **중복 콘텐츠**로 인식한다.

### 해결 방법

**1. 일관된 정책 선택**

```
모든 URL에 트레일링 슬래시 사용
또는
모든 URL에 트레일링 슬래시 미사용
```

**2. Canonical URL 설정**

```html
<link rel="canonical" href="https://example.com/products" />
```

**3. 301 리다이렉트**

```
/products/ → 301 Redirect → /products
```

---

## 프레임워크별 처리

### Spring Boot

Spring MVC는 기본적으로 트레일링 슬래시를 **동일하게 처리**한다.

```java
@GetMapping("/users")
public List<User> getUsers() {
    return userService.findAll();
}
// /users 와 /users/ 모두 동일하게 처리됨
```

**Spring Boot 3.x에서 변경됨**

Spring Framework 6.0부터 트레일링 슬래시 매칭이 **기본적으로 비활성화**되었다.

```java
// /users 만 매칭, /users/ 는 404
@GetMapping("/users")
public List<User> getUsers() { ... }
```

**트레일링 슬래시 매칭 활성화 (Spring Boot 3.x)**

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        configurer.setUseTrailingSlashMatch(true);
    }
}
```

**리다이렉트 처리**

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // 트레일링 슬래시 제거 리다이렉트
        registry.addRedirectViewController("/users/", "/users");
    }
}
```

**Filter로 전역 처리**

```java
@Component
public class TrailingSlashRedirectFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String uri = request.getRequestURI();

        if (uri.length() > 1 && uri.endsWith("/")) {
            String newUri = uri.substring(0, uri.length() - 1);
            String query = request.getQueryString();
            if (query != null) {
                newUri += "?" + query;
            }
            response.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
            response.setHeader("Location", newUri);
            return;
        }

        filterChain.doFilter(request, response);
    }
}
```

### Nginx

```nginx
# 트레일링 슬래시 제거
server {
    # /path/ → /path 로 301 리다이렉트
    rewrite ^/(.*)/$ /$1 permanent;
}

# 트레일링 슬래시 추가
server {
    # /path → /path/ 로 301 리다이렉트
    rewrite ^([^.]*[^/])$ $1/ permanent;
}
```

### Apache

```apache
# .htaccess - 트레일링 슬래시 제거
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)/$ /$1 [R=301,L]

# 트레일링 슬래시 추가
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*[^/])$ /$1/ [R=301,L]
```

### Express.js

```javascript
// 트레일링 슬래시 제거 미들웨어
app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
        const query = req.url.slice(req.path.length);
        const safePath = req.path.slice(0, -1).replace(/\/+/g, '/');
        res.redirect(301, safePath + query);
    } else {
        next();
    }
});
```

### Next.js

```javascript
// next.config.js
module.exports = {
    trailingSlash: false,  // 트레일링 슬래시 제거
    // trailingSlash: true,  // 트레일링 슬래시 추가
};
```

---

## API 설계 시 고려사항

### REST API 관례

```
GET /users      ← 컬렉션 (일반적)
GET /users/     ← 덜 일반적
GET /users/123  ← 단일 리소스
```

**권장:**
- API에서는 트레일링 슬래시 **미사용**이 일반적
- 일관성 있게 하나의 정책 유지

### GraphQL

```
POST /graphql   ← 트레일링 슬래시 없음이 표준
```

---

## CDN과 캐싱

### 캐시 키 분리

```
/products   → Cache Key A
/products/  → Cache Key B
```

CDN은 두 URL을 **다른 캐시 키**로 처리한다.
동일한 콘텐츠가 두 번 캐싱되어 캐시 효율이 떨어진다.

### CloudFront 설정

```yaml
# CloudFront Functions으로 정규화
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 트레일링 슬래시 제거
    if (uri.length > 1 && uri.endsWith('/')) {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                location: { value: uri.slice(0, -1) }
            }
        };
    }

    return request;
}
```

---

## 상대 경로 문제

트레일링 슬래시 유무에 따라 상대 경로 해석이 달라진다.

### 예시

```html
<!-- 현재 URL: /users -->
<a href="profile">프로필</a>
<!-- 이동: /profile -->

<!-- 현재 URL: /users/ -->
<a href="profile">프로필</a>
<!-- 이동: /users/profile -->
```

### 해결책

```html
<!-- 절대 경로 사용 -->
<a href="/users/profile">프로필</a>

<!-- 루트 상대 경로 -->
<a href="/profile">프로필</a>
```

---

## 테스트 체크리스트

```
1. /path 와 /path/ 가 동일하게 동작하는가?
2. 리다이렉트 시 301(영구)을 사용하는가?
3. Canonical URL이 설정되어 있는가?
4. CDN 캐시가 정규화되어 있는가?
5. 상대 경로가 올바르게 작동하는가?
```

---

## 실무 권장사항

### 1. 정책 선택

| 유형 | 권장 |
|------|------|
| REST API | 트레일링 슬래시 없음 |
| 웹사이트 | 팀/프레임워크 관례 따름 |
| 정적 사이트 | 일관성 유지 |

### 2. 리다이렉트 설정

```
선택한 정책과 다른 URL 요청 시 → 301 리다이렉트
```

### 3. Canonical URL

```html
<link rel="canonical" href="https://example.com/products" />
```

### 4. 사이트맵

```xml
<url>
    <loc>https://example.com/products</loc>
</url>
<!-- 일관된 형식 사용 -->
```

---

## Spring Boot 3.x 마이그레이션 주의

Spring Boot 2.x에서 3.x로 업그레이드 시:

```
기존: /users/ 요청 → /users 핸들러 매칭 ✓
변경: /users/ 요청 → 404 Not Found ✗
```

**마이그레이션 방법:**

```java
// 1. 설정으로 이전 동작 유지
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        configurer.setUseTrailingSlashMatch(true);
    }
}

// 2. 또는 리다이렉트 필터 추가
```

---

## 정리

| 항목 | 설명 |
|------|------|
| 정의 | URL 끝의 슬래시 (`/`) |
| SEO | 중복 콘텐츠 문제 발생 가능 |
| 캐싱 | 다른 캐시 키로 처리됨 |
| 상대 경로 | 해석 방식이 달라짐 |
| 해결책 | 일관된 정책 + 301 리다이렉트 |

> 트레일링 슬래시는 작은 차이지만 SEO, 캐싱, 사용자 경험에 영향을 미친다.
> 프로젝트 초기에 정책을 정하고 일관되게 적용하자.
