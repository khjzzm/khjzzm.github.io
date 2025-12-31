# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 프로젝트 개요

Jekyll 기반 개인 기술 블로그 (GitHub Pages)

- **URL**: https://khjzzm.github.io/
- **테마**: [no-style-please](https://github.com/riggraz/no-style-please) - 미니멀리스트 테마 (커스텀 확장)
- **언어**: 한국어
- **폰트**: Pretendard (CDN)

## 기술 스택

- Jekyll 3.9.x
- Ruby (Gemfile 기반)
- GitHub Pages 호스팅
- SCSS (압축 모드)
- Liquid 템플릿

## 디렉토리 구조

```
├── _posts/          # 블로그 포스트 (Markdown)
├── _layouts/        # 페이지 레이아웃 템플릿
│   ├── default.html
│   ├── home.html
│   └── post.html
├── _includes/       # 재사용 컴포넌트
│   ├── head.html         # <head> 태그, 폰트/CSS 로드
│   ├── post_list.html    # 포스트 목록 컴포넌트
│   ├── toc.html          # 목차 (Table of Contents)
│   └── related-posts.html # 관련 글 추천
├── _sass/           # SASS 스타일시트
│   └── no-style-please.scss  # 기본 테마 변수 및 스타일
├── _data/           # 데이터 파일
│   └── menu.yml
├── assets/
│   ├── css/main.scss     # 메인 스타일시트 (커스텀 확장)
│   └── js/
│       ├── code-copy.js  # 코드 복사 버튼
│       └── search.js     # 검색 기능
├── _config.yml      # Jekyll 설정
└── Gemfile          # Ruby 의존성
```

## 포스트 작성 규칙

### Front Matter 형식
```yaml
---
layout: post
title: 제목
tags: [tag1, tag2]
---
```

### 카테고리 (선택적)
- `commit`: 커밋된 시간들
- `devlog`: 컴파일되지 않는 이야기

### 태그 체계 (정형화됨)
| 태그 | 용도 |
|-----|-----|
| `java` | Java 언어 |
| `spring` | Spring 프레임워크 |
| `jpa` | JPA/ORM |
| `design-pattern` | 디자인패턴 |
| `database` | DB 일반 |
| `javascript` | JS/프론트엔드 |
| `performance` | 성능 최적화 |
| `aws` | AWS 서비스 |
| `architecture` | 설계/클린코드 |
| `testing` | 테스트 |
| `git` | 버전관리 |
| `devops` | 인프라 |
| `essay` | 비기술 글 |

## 로컬 개발

### Docker로 실행 (권장)
```bash
docker run --rm -v "$(pwd)":/site -p 4000:4000 bretfisher/jekyll-serve
```

### Ruby로 실행
```bash
bundle install
bundle exec jekyll serve
```

접속: http://localhost:4000

## 블로그 기능

### 포스트 기능
- **목차 (TOC)**: h2, h3 헤딩 자동 추출, 기본 접힘 상태 (`_includes/toc.html`)
- **읽기 진행률 바**: 스크롤 위치 기반 상단 프로그레스 바
- **관련 글 추천**: 태그 기반 최대 4개 추천 (`_includes/related-posts.html`)
- **읽기 시간**: 글자 수 기반 예상 읽기 시간 표시
- **코드 복사 버튼**: 코드 블록 호버 시 복사 버튼 표시

### 검색 기능
- `/search.html`: 전체 포스트 검색
- `assets/js/search.js`: 클라이언트 사이드 검색
- 제목, 내용, 태그 기반 검색

### 네비게이션
- 사이트 헤더 우측 검색 아이콘
- 포스트 하단 이전/다음 글 네비게이션
- 태그 페이지 (`/tags.html`)

## 스타일 가이드

### CSS 변수 (no-style-please.scss)
```scss
--fg: black;        // 텍스트 색상 (다크모드: #e0e0e0)
--bg: white;        // 배경색 (다크모드: #1a1a1a)
--link: #007acc;    // 링크 색상 (다크모드: #6db3f2)
--border: black;    // 테두리 색상 (다크모드: #555)
```

### 주요 스타일 클래스 (main.scss)
- `.post-content`: 본문 스타일 (font-size: 1.0625rem, line-height: 1.7)
- `.post-list`, `.post-item`: 포스트 목록 (컴팩트, 구분선)
- `.toc`: 목차 박스
- `.related-posts`: 관련 글 섹션
- `pre.highlight`: 코드 블록 (VS Code 다크 테마)
- `code`: 인라인 코드 (핑크색 하이라이트)

### 반응형 브레이크포인트
- Ultra-wide: 1400px+
- Large Desktop: 1200px - 1399px
- Desktop: 1025px - 1199px
- Tablet: 768px - 1024px
- Mobile Large: 480px - 767px
- Mobile Small: 479px 이하

## 포스트 작성 시 주의사항

### 마크다운 테이블
테이블 구분선 너비를 콘텐츠에 맞게 조정:
```markdown
| 컬럼1 | 컬럼2 | 컬럼3 |
|-------|-------|-------|
| 내용  | 내용  | 내용  |
```
- 제목 위에 빈 줄 추가 필요
- 긴 콘텐츠가 있는 컬럼은 구분선(---)을 더 길게

### 헤딩 구조 (TOC용)
- h2: 주요 섹션
- h3: 하위 섹션
- h2/h3가 2개 미만이면 TOC 숨김

## 주의사항

- 새 태그 추가 시 위 태그 체계를 따를 것
- 포스트 파일명: `YYYY-MM-DD-slug.md` 형식
- 이미지는 `assets/` 디렉토리에 저장
- 다크 모드 지원: `prefers-color-scheme: dark` 및 `body[a="dark"]`
