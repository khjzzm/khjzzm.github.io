---
layout: post
title: Strapi v5 커스텀 플러그인 사용 가이드
tags: [javascript]
---

# Strapi v5 커스텀 플러그인 사용 가이드

## 개요

`@nuxtjs/strapi` 모듈 대신 커스텀 `plugins/strapi.js`를 사용하여 Strapi v4/v5 API와 통신합니다.

---

## 플러그인 구조

```javascript
// plugins/strapi.js
import Vue from 'vue'
import qs from 'qs'
import _ from 'lodash'
import axios from 'axios'

export default ({ app }, inject) => {
  const strapi = {
    fetch(contentType, params) { ... },
    findMany(contentType, params) { ... },
    findOne(contentType, params) { ... },
    count(contentType, params) { ... },
  }

  Vue.prototype.$strapi = strapi  // 컴포넌트에서 this.$strapi
  inject('strapi', strapi)         // context에서 $strapi (SSR 지원)
}
```

---

## 사용 가능한 메서드

### 1. `findMany(contentType, params)`
여러 개의 항목을 조회합니다.

```javascript
// 기본 사용
const notices = await this.$strapi.findMany('biz4in-notices')

// 옵션 포함
const notices = await this.$strapi.findMany('biz4in-notices', {
  populate: '*',
  filters: { ... },
  sort: [{ regDate: 'desc' }],
  pagination: { start: 0, limit: 10 },
})
```

**반환값**: 배열 `[{ id, documentId, title, ... }, ...]`

---

### 2. `findOne(contentType, params)`
조건에 맞는 첫 번째 항목을 조회합니다.

```javascript
const notice = await this.$strapi.findOne('biz4in-notices', {
  filters: { slug: 'my-notice-slug' }
})
```

**반환값**: 객체 `{ id, documentId, title, ... }` 또는 `null`

---

### 3. `count(contentType, params)`
조건에 맞는 항목의 개수를 조회합니다.

```javascript
const total = await this.$strapi.count('biz4in-notices', {
  filters: { ... }
})
```

**반환값**: 숫자 `10`

---

### 4. `fetch(contentType, params)`
원본 API 응답을 그대로 반환합니다. (내부용)

```javascript
const response = await this.$strapi.fetch('biz4in-notices', params)
// response = { data: [...], meta: { pagination: {...} } }
```

---

## 쿼리 파라미터

### populate (관계 필드 포함)

Strapi v4/v5에서는 관계 필드(이미지, 참조 등)가 **기본적으로 제외**됩니다.

```javascript
// 모든 관계 필드 포함
{ populate: '*' }

// 특정 필드만 포함
{ populate: 'image' }
{ populate: ['image', 'group'] }

// 중첩 관계
{ populate: { group: { populate: '*' } } }
```

---

### filters (필터링)

#### 기본 필터
```javascript
{ filters: { title: 'Hello' } }
// WHERE title = 'Hello'

{ filters: { slug: { $eq: 'my-slug' } } }
// WHERE slug = 'my-slug'
```

#### 비교 연산자
| 연산자 | 설명 | 예시 |
|--------|------|------|
| `$eq` | 같음 | `{ field: { $eq: 'value' } }` |
| `$ne` | 같지 않음 | `{ field: { $ne: 'value' } }` |
| `$lt` | 작음 | `{ field: { $lt: 10 } }` |
| `$lte` | 작거나 같음 | `{ field: { $lte: 10 } }` |
| `$gt` | 큼 | `{ field: { $gt: 10 } }` |
| `$gte` | 크거나 같음 | `{ field: { $gte: 10 } }` |
| `$contains` | 포함 (LIKE %value%) | `{ field: { $contains: 'text' } }` |
| `$startsWith` | 시작 | `{ field: { $startsWith: 'Hello' } }` |
| `$endsWith` | 끝 | `{ field: { $endsWith: 'World' } }` |
| `$null` | null 여부 | `{ field: { $null: true } }` |
| `$in` | 배열 포함 | `{ field: { $in: [1, 2, 3] } }` |
| `$notIn` | 배열 미포함 | `{ field: { $notIn: [1, 2] } }` |

#### OR 조건
```javascript
{
  filters: {
    $or: [
      { title: { $contains: 'keyword' } },
      { description: { $contains: 'keyword' } },
      { body: { $contains: 'keyword' } },
    ]
  }
}
```

#### AND 조건
```javascript
{
  filters: {
    $and: [
      { startDT: { $lte: '2024-12-01' } },
      { endDT: { $gte: '2024-12-01' } },
    ]
  }
}
```

#### 관계 필드 필터
```javascript
// group 관계의 code 필드로 필터
{ filters: { group: { code: { $eq: 'service-terms' } } } }

// group 관계의 id로 필터
{ filters: { group: { id: { $eq: 5 } } } }
```

---

### sort (정렬)

```javascript
// 단일 정렬
{ sort: [{ regDate: 'desc' }] }

// 다중 정렬
{ sort: [{ regDate: 'desc' }, { ordering: 'asc' }] }
```

---

### pagination (페이지네이션)

#### start/limit 방식
```javascript
{
  pagination: {
    start: 0,    // 시작 인덱스
    limit: 10,   // 가져올 개수
  }
}
```

#### page/pageSize 방식
```javascript
{
  pagination: {
    page: 1,       // 페이지 번호 (1부터 시작)
    pageSize: 10,  // 페이지당 개수
  }
}
```

---

## 실제 사용 예시

### 공지사항 목록 (검색 + 페이지네이션)
```javascript
async fetch() {
  let params = { filters: {} }

  // 검색어 필터
  if (this.keyword) {
    params.filters.$or = [
      { title: { $contains: this.keyword } },
      { description: { $contains: this.keyword } },
      { body: { $contains: this.keyword } },
    ]
  }

  // 전체 개수
  this.totalRows = await this.$strapi.count('biz4in-notices', params)

  // 페이지네이션 + 정렬
  params.pagination = {
    start: (this.page - 1) * this.size,
    limit: this.size,
  }
  params.sort = [{ regDate: 'desc' }]

  // 목록 조회
  this.notices = await this.$strapi.findMany('biz4in-notices', params)
}
```

### 이벤트 배너 (날짜 필터 + 이미지 포함)
```javascript
async fetch() {
  const today = dayjs().format('YYYY-MM-DD')

  this.banners = await this.$strapi.findMany('biz4in-event-banners', {
    populate: '*',  // 이미지 필드 포함
    filters: {
      startDT: { $lte: today },
      endDT: { $gte: today },
    },
    sort: [{ ordering: 'asc' }],
    pagination: { start: 0, limit: 5 },
  })
}
```

### 약관 조회 (관계 필터)
```javascript
async fetch() {
  this.terms = await this.$strapi.findMany('biz4in-terms', {
    populate: '*',
    filters: {
      group: { code: { $eq: 'service-terms' } },
    },
    sort: [{ regDate: 'desc' }],
  })

  this.currentTerm = this.terms[0]
}
```

### 단일 항목 조회 (slug로)
```javascript
async asyncData({ $strapi, params }) {
  const notice = await $strapi.findOne('biz4in-notices', {
    filters: { slug: params.slug }
  })

  return { notice }
}
```

---

## v3 → v5 마이그레이션 비교

| 항목 | Strapi v3 (@nuxtjs/strapi) | Strapi v5 (커스텀) |
|------|---------------------------|-------------------|
| **메서드** | `$strapi.find()` | `$strapi.findMany()` |
| **단일조회** | `$strapi.findOne()` | `$strapi.findOne()` |
| **개수** | `$strapi.count()` | `$strapi.count()` |
| **ID 필드** | `_id` | `documentId` |
| **관계 필드** | 자동 포함 | `populate: '*'` 필요 |
| **필터 문법** | 배열 `[['field', 'value']]` | 객체 `{ filters: { field: value } }` |
| **정렬** | `['_sort', 'field:DESC']` | `sort: [{ field: 'desc' }]` |
| **페이지네이션** | `['_start', 0], ['_limit', 10]` | `pagination: { start: 0, limit: 10 }` |
| **OR 조건** | `['_where[_or][0][field_contains]', val]` | `{ $or: [{ field: { $contains: val } }] }` |

---

## 접근 가능한 곳

| 위치 | 접근 방법 |
|------|----------|
| Vue 컴포넌트 | `this.$strapi` |
| asyncData | `context.$strapi` 또는 `{ $strapi }` |
| fetch | `this.$strapi` |
| Vuex store | `this.$strapi` (actions 내) |
| Middleware | `context.$strapi` |
| Plugins | `context.$strapi` |

---

## 에러 처리

```javascript
try {
  const data = await this.$strapi.findMany('biz4in-notices')
} catch (error) {
  console.error('Strapi API 에러:', error.response?.data)
  // { data: null, error: { status: 400, name: 'ValidationError', message: '...' } }
}
```

---

## 주의사항

1. **populate 필수**: 이미지, 참조 등 관계 필드를 사용하려면 `populate: '*'` 추가
2. **null 체크**: 관계 필드가 비어있을 수 있으므로 `banner.image?.[0]?.url` 처럼 체크
3. **documentId 사용**: v5에서는 `_id` 대신 `documentId` 사용
4. **정렬 대소문자**: `'desc'`, `'asc'` (소문자)
