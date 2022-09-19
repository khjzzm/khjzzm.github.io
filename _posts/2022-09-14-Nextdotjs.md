---
layout: post
title: Next.js
---

## why Next.js
1. 규모가 있는 서비스 구조 설계를 어떻게 할 것인가?
2. 개발환경 / 코드 분할 / 파일기반 구조
3. SEO
4. 프론트엔드에 필요한 간단한 API 구성
5. 손쉬운 배포 시스템 Vercel

대체제로는 Gatsby / Remix 등이 있음

- Node.js 16.15.1
- Yarn 1.22.19 `npm install -g yarn`
- Git
- VSCode

~~~
npx create-next-app nextjs-blog --use-npm --example "https://github.com/vercel/next-learn/tree/master/basics/learn-starter
~~~


## VSCode Extension
- React Snippets
- ESLint
- Prettier
- Bracket Pair

## prettier
- yarn add -D prettier
- .prettierrc
- .prettierignore
- prettier-fix 명령 추가

## Next.js 가 제시하는 3+1 가지 Data Fetching 방법
-SSR(Server Side Render)
    - 서버가 그린다, 그린다 : 데이터를 가져와서 그린다. 서버가 그린다 : 서버가 데이터를 가져와서 그린다.
    - getServerSideProps

-CSR(Client Side Render)
    - 클라이언트가 그린다, 그린다 : 데이터를 가져와서 그린다. 클라이언트가 그린다 : 클라이언트가 데이터를 가져와서 그린다.
    - 따로없음, 기존 리액트랑 동일

-SSG(Static-Site Generation)
    - 정적인 사이트를 생성한다
    - 생성한다 : 데이터를 가져와서 그려둔다.
    - 정적인 사이트를 생성한다: 정적인 사이트를 데이터를 가져와서 그려둔다.
    - getStaticProps(getStaticPaths)

-ISR(Incremental Static Regeneration)
    - 증분 정적 사이트를 재생성한다
    - 재생성 한다: (특정 주기로) 데이터를 가져와서 다시 그려둔다.
    - 증분 정적 사이트를 재생성한다: (특정 주기로) 정적인 사이트를 데이터를 가져와서 다시 그려둔다.
    - getStaticProps _with revalidate_

## Pages
pages/index.js => /   
pages/ssg.js => /ssg   
pages/products/[slug].js = > /products/*  
(js, jsx, ts, tsx)

Pre-renders 와 SEO 상관관계   
Next.js는 모든 페이지를 기본적으로 pre-render한다.   
CSR만 제공한다면, Client(브라우저) 처럼 동작하지 않는 검색엔진의 경우 아무런 데이터도 조회해갈 수 없다.   
Pre-render를 해두면 Client 처럼 동작하지 않는 검색엔진에게 필요한 데이터를 제공 할 수 있다.   

SSG(recommended) & SSR   
SSG는 빌드 타임에 pre-render, SSR은 요청 타임에 pre-render   

SSG 2가지 상황
 - Page의 내용물이 외부 데이터에 의존적인 상황(getStaticProps 만 가지고도 가능)
 - Page Paths 까지 외부 데이터에 의존적인 상황(getStaticPaths  도 함께 활용해야 가능)

## Layouts
하나의 공통된 Layout을 쓰는 경우 components/Layout.js   
컴포넌트 하나를 pages/_app.js 에서 활용하면 됨

여러개의 Layouts을 활용하고 싶은 경우 components/SubLayout.js   
Page.getLayout에 getLayout 함수를 제공

## Images
Next.js 가 제공하는 최적화 Image Component
 - Improved Performance
 - Visual Stability(CLS- Cumulative Layout Shift 방지)
 - Faster Page Loads(viewport 진입시 로드 / blue 처리)
 - Asset Flexibility(리사이징)
 
## Router
Next.js의 Router 는 file-system 기반
pages/ 혹은 src/pages   
둘 다 있다면? 뭐가 우선순위를 가질까?

### Nested routes   
pages/product/first-item.js => /product/first-item   
pages/settings/my/info.js => /settings/my/info

### slug
pages/category/[slug].js => /category/:slug   
pages/[username]/info.js => /:username/info   
pages/cart/[...slug].js => /cart/* (ex. /cart/2022/06/24)

## Dynamic Routes
[slug]값은 어떻게 활용한 것 인가?   
pages/category/[slug].js   

import {useRouter} from 'next/router'   
const router = useRouter()   
const {slug} = router.query   


다중 슬러그   
1. pages/[username]/[info].js   
   - const {username, info} = router.query

2. pages/cart/[...slug].js
   - const {slug} = router.query 
   - slug는 배열

optional slug
pages/cart/[...slug].js = > /cert 로 접근하면 404가 뜬다.   
pages/cart/[[..slug]].js 해주면 slug가 존재하지 않아도 받는다.


## Routing 방법
- <Link href="url"><a>url로</a></Link>
- router.push("url")

## Shallow Routing
getServerSideProps / getStaticProps 등을 다시 실행시키지 않고, 현재 상태를 잃지 않고 url을 바꾸는 방법

상태는 유지하면서 URL만 바꾸고 싶은 경우?  
사용자가 어떤 동작을 했고, 그 기록을 query로 남기고 싶을때 * query로 남기면 사용자가 새로고침을 해도 유지된다.   

Data fetching 을 일으키고 싶지 않다면?

### url을 바꾸는 3가지 방식
1.location.replace("url): 로컬 state 유지 안됨(리렌더)
2.router.push(url): 로컬 state 유지 / data fetching o
3.router.push(url, as {shallow: true}): 로컬 state 유지 / data fetching x

## Next.js 가 제공하는 API Routes
pages/api/*   
Routing 에서 다뤘던 여러 Slug 활용법 적용 가능   
 - /api/post/creat.js
 - /api/post/[pid].js
 - /api/post/[..slug].js

### API Middlewares
내장 Middleware의 기능  
req.cookies / req.query ...   
req/res 관련 다양한 기능들은 Middleware 들을 활용할 수 있다.   
ex) CORS(교차 출처 리소스 공유)

### Response
- res.status(code)
- res.json(body): serializable object
- res.redirect(code, url)
- res.send(body) : string / object / Buffer

## Next.js 가 제공하는 여러 기능들
- page-based routing system(with dynamic routes)
- Pre-rendering SSG / SSR
- Automatic code splitting for faster page loads
- Client-side routing with optimized prefetching
- API Routes(with Serverless Function)
- Development environment(with Fast Refresh)

## Data를 가져오는 함수 getSortedPostsData의 확장
- 다른 File 조회
- 외부 api 요청
- DB 조회

### getStaticPaths 가 반환하는 fallback의 의미?
fallback의 의미?
fallback: false, true, 'blocking'

## Vercel 배포
github + vercel import deploay

## Tailwind CSS
[https://tailwindcss.com/docs/guides/nextjs](https://tailwindcss.com/docs/guides/nextjs)

