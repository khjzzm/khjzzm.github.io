# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 프로젝트 개요

Jekyll 기반 개인 기술 블로그 (GitHub Pages)

- **URL**: https://khjzzm.github.io/
- **테마**: [no-style-please](https://github.com/riggraz/no-style-please) - 미니멀리스트 테마
- **언어**: 한국어

## 기술 스택

- Jekyll 3.9.x
- Ruby (Gemfile 기반)
- GitHub Pages 호스팅
- SASS (압축 모드)

## 디렉토리 구조

```
├── _posts/          # 블로그 포스트 (Markdown)
├── _layouts/        # 페이지 레이아웃 템플릿
├── _includes/       # 재사용 컴포넌트
├── _sass/           # SASS 스타일시트
├── _data/           # 메뉴 등 데이터 파일 (menu.yml)
├── assets/          # 정적 파일 (이미지 등)
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

## 주의사항

- 새 태그 추가 시 위 태그 체계를 따를 것
- 포스트 파일명: `YYYY-MM-DD-slug.md` 형식
- 이미지는 `assets/` 디렉토리에 저장
