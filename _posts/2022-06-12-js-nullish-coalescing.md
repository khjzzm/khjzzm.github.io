---
layout: post
title: 자바스크립트 Optional Chaining & Nullish Coalescing 
tags: [javascript]
---

## Optional Chaining (?.) 연산자

### 기본 개념
Optional Chaining은 ES2020(ES11)에서 도입된 문법으로, 중첩된 객체의 속성에 안전하게 접근할 수 있게 해줍니다.

```javascript
// 기존 방식 (에러 발생 가능)
var user = {
    name: 'kimuzzang',
    age: 32
}

console.log(user.profile.email); // TypeError: Cannot read property 'email' of undefined

// Optional Chaining 사용
console.log(user.profile?.email); // undefined (에러 없음)
```

### 다양한 사용법

#### 1. 객체 속성 접근
```javascript
const user = {
    name: 'kimuzzang',
    profile: {
        email: 'kim@example.com',
        social: {
            twitter: '@kimuzzang'
        }
    }
}

// 안전한 중첩 객체 접근
console.log(user?.profile?.email); // 'kim@example.com'
console.log(user?.profile?.social?.twitter); // '@kimuzzang'
console.log(user?.profile?.social?.instagram); // undefined
console.log(user?.settings?.theme); // undefined
```

#### 2. 배열 인덱스 접근
```javascript
const users = [
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 30 }
];

console.log(users?.[0]?.name); // 'Alice'
console.log(users?.[10]?.name); // undefined
console.log(users?.[0]?.profile?.email); // undefined

// 동적 속성 접근
const propertyName = 'email';
console.log(user?.profile?.[propertyName]); // undefined
```

#### 3. 함수 호출
```javascript
const api = {
    user: {
        getData: function() {
            return { id: 1, name: 'User' };
        }
    }
};

// 메서드가 존재할 때만 호출
console.log(api.user?.getData?.()); // { id: 1, name: 'User' }
console.log(api.user?.updateData?.()); // undefined (에러 없음)

// DOM 메서드 안전 호출
document.querySelector('#button')?.addEventListener?.('click', handler);
```

### 실무 활용 예제

#### API 응답 처리
```javascript
// API 응답이 불완전할 수 있는 경우
function processUserData(apiResponse) {
    const userName = apiResponse?.data?.user?.name ?? 'Unknown User';
    const userEmail = apiResponse?.data?.user?.profile?.email ?? 'No email';
    const userAvatar = apiResponse?.data?.user?.profile?.avatar?.url;
    
    return {
        name: userName,
        email: userEmail,
        hasAvatar: !!userAvatar
    };
}

// 사용 예
const response1 = {
    data: {
        user: {
            name: 'John',
            profile: { email: 'john@example.com' }
        }
    }
};

const response2 = { data: null }; // 빈 응답

console.log(processUserData(response1)); 
// { name: 'John', email: 'john@example.com', hasAvatar: false }

console.log(processUserData(response2)); 
// { name: 'Unknown User', email: 'No email', hasAvatar: false }
```

## Nullish Coalescing (??) 연산자

### 기본 개념
Nullish Coalescing 연산자는 `null` 또는 `undefined`일 때만 대체값을 제공합니다.

```javascript
// || 연산자의 문제점
console.log(0 || 'default'); // 'default' (0도 falsy로 처리)
console.log('' || 'default'); // 'default' (빈 문자열도 falsy로 처리)
console.log(false || 'default'); // 'default' (false도 falsy로 처리)

// ?? 연산자의 정확한 처리
console.log(0 ?? 'default'); // 0
console.log('' ?? 'default'); // ''
console.log(false ?? 'default'); // false
console.log(null ?? 'default'); // 'default'
console.log(undefined ?? 'default'); // 'default'
```

### 실무 활용 패턴

#### 설정값 처리
```javascript
function createConfig(userConfig) {
    return {
        theme: userConfig?.theme ?? 'light',
        fontSize: userConfig?.fontSize ?? 14,
        autoSave: userConfig?.autoSave ?? true,
        maxRetries: userConfig?.maxRetries ?? 3,
        // 0도 유효한 값으로 처리
        timeout: userConfig?.timeout ?? 5000
    };
}

// 사용 예
const config1 = createConfig({ theme: 'dark', timeout: 0 });
console.log(config1.timeout); // 0 (올바르게 처리됨)

const config2 = createConfig({});
console.log(config2.timeout); // 5000 (기본값 사용)
```

#### 함수 매개변수 기본값
```javascript
function searchUsers(query, options) {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;
    const sortBy = options?.sortBy ?? 'name';
    const includeInactive = options?.includeInactive ?? false;
    
    // 검색 로직...
    return {
        query,
        limit,
        offset,
        sortBy,
        includeInactive
    };
}

// 사용 예
console.log(searchUsers('john', { limit: 0 })); 
// limit: 0이 유효한 값으로 처리됨
```

## 고급 활용 패턴

### 체이닝과 함께 사용
```javascript
// 복잡한 데이터 구조 처리
const blogPost = {
    author: {
        name: 'John Doe',
        social: {
            twitter: '@johndoe'
        }
    },
    comments: [
        {
            id: 1,
            author: { name: 'Alice' },
            replies: [{ author: { name: 'Bob' } }]
        }
    ]
};

// 안전한 깊은 접근
const authorTwitter = blogPost?.author?.social?.twitter ?? 'No Twitter';
const firstCommentAuthor = blogPost?.comments?.[0]?.author?.name ?? 'Anonymous';
const firstReplyAuthor = blogPost?.comments?.[0]?.replies?.[0]?.author?.name ?? 'Anonymous';

console.log(authorTwitter); // '@johndoe'
console.log(firstCommentAuthor); // 'Alice'
console.log(firstReplyAuthor); // 'Bob'
```

### 조건부 함수 실행
```javascript
// 플러그인 시스템 예제
class PluginSystem {
    constructor() {
        this.plugins = {};
    }
    
    executeHook(hookName, ...args) {
        // 플러그인이 존재하고 해당 훅이 있을 때만 실행
        return Object.values(this.plugins)
            .map(plugin => plugin?.[hookName]?.(...args))
            .filter(result => result !== undefined);
    }
}

const pluginSystem = new PluginSystem();
pluginSystem.plugins.analytics = {
    onPageView: (url) => console.log(`Analytics: ${url}`),
    onUserAction: (action) => console.log(`Analytics: ${action}`)
};

// 안전한 훅 실행 (존재하지 않는 훅도 에러 없이 처리)
pluginSystem.executeHook('onPageView', '/home');
pluginSystem.executeHook('nonExistentHook', 'data'); // 에러 없음
```

## 성능과 주의사항

### 성능 고려사항
```javascript
// 반복문에서 사용 시 주의
const users = Array(1000).fill().map((_, i) => ({ id: i }));

// 비효율적 - 매번 Optional Chaining 체크
console.time('optional-chaining');
users.forEach(user => {
    const name = user?.profile?.name ?? 'Unknown';
});
console.timeEnd('optional-chaining');

// 효율적 - 미리 존재 여부 체크
console.time('pre-check');
users.forEach(user => {
    if (user && user.profile) {
        const name = user.profile.name ?? 'Unknown';
    } else {
        const name = 'Unknown';
    }
});
console.timeEnd('pre-check');
```

### TypeScript와의 활용
```typescript
interface User {
    id: number;
    name: string;
    profile?: {
        email?: string;
        avatar?: {
            url: string;
            size: number;
        };
    };
}

function getUserAvatar(user: User): string | undefined {
    // TypeScript에서 타입 안정성과 함께 사용
    return user.profile?.avatar?.url;
}

function getUserAvatarWithDefault(user: User): string {
    return user.profile?.avatar?.url ?? '/default-avatar.png';
}
```

## 브라우저 호환성과 대안

### 지원 브라우저
- Chrome 80+
- Firefox 72+
- Safari 13.1+
- Edge 80+

### Babel 트랜스파일링
```javascript
// 최신 문법
const result = obj?.prop?.nested ?? 'default';

// Babel 변환 후
var _obj$prop;
const result = (_obj$prop = obj === null || obj === void 0 ? void 0 : obj.prop) === null || _obj$prop === void 0 ? void 0 : _obj$prop.nested;
if (result === null || result === undefined) {
    result = 'default';
}
```

### 레거시 환경에서의 대안
```javascript
// Optional Chaining 대안
function get(obj, path, defaultValue) {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
        result = result?.[key];
        if (result === undefined || result === null) {
            return defaultValue;
        }
    }
    
    return result;
}

// 사용 예
const value = get(user, 'profile.social.twitter', 'No Twitter');
```

## 마무리

Optional Chaining과 Nullish Coalescing은 JavaScript 코드의 안전성과 가독성을 크게 향상시키는 문법입니다. 특히 API 응답 처리, 설정 객체 다루기, DOM 조작 등에서 매우 유용하며, TypeScript와 함께 사용하면 더욱 강력한 타입 안정성을 제공합니다.

**핵심 포인트:**
- `?.`는 `null`/`undefined` 체크를 간단하게 해줍니다
- `??`는 정확히 `null`/`undefined`일 때만 대체값을 사용합니다
- 둘 다 함께 사용하면 견고한 코드를 작성할 수 있습니다
- 과도한 사용은 성능에 영향을 줄 수 있으니 적절히 사용해야 합니다



