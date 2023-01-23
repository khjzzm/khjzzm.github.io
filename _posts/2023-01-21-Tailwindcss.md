---
layout: post
title: tour of tailwind
---

## SetUp

next.js with react18
~~~
npx create-next-app@latest
~~~

~~~
npm install -D tailwindcss postcss autoprefixer
~~~

~~~
npx tailwindcss init -p  
~~~
- postcss.config
- tailwind.config.js


### Modifiers
~일 때 실행하는 것들, 
Tailwind에 포함된 모든 단일 modifier
```
Modifier(왼쪽), CSS(오른쪽)
hover (&:hover)
focus (&:focus)
active (&:active)
first (&:first-child)
disabled (&:disabled)
sm (@media (min-width: 640px))
md ( @media (min-width: 768px))
lg (@media (min-width: 1024px))
dark (@media (prefers-color-scheme: dark))
```
[https://tailwindcss.com/docs/hover-focus-and-other-states#quick-reference](https://tailwindcss.com/docs/hover-focus-and-other-states#quick-reference)

### Transitions
상자 그림자가 있는 윤곽선을 만들기 위한 유틸리티입니다.   
ring-{width} 유틸리티를 사용하여 특정 두께의 solid box-shadow를 요소에 적용합니다. 링은 기본적으로 반투명한 파란색으로 많은 시스템의 기본 포커스 링 스타일과 유사합니다.   
ex) ring-2 ring-offset-2 focus:ring-2 ring-red-500   
```css
button class="ring-2 ring-offset-2 focus:ring-2"
div class="ring-2 hover:ring-4 md:ring-4"
```
[https://tailwindcss.com/docs/ring-width](https://tailwindcss.com/docs/ring-width)

Ring Color   
외곽선 링의 색상을 설정하는 유틸리티입니다.   
ring-{color} 유틸리티를 사용하여 외곽선 링의 색상을 설정합니다.  
```css
button class="... ring-2 ring-blue-500"
button class="... ring-2 ring-blue-500/50
```
[https://tailwindcss.com/docs/ring-color](https://tailwindcss.com/docs/ring-color)

### More Modifiers

**group**
상위(부모) 상태를 기반으로 한 스타일 지정
일부 부모 요소의 상태를 기반으로 요소의 스타일을 지정해야 하는 경우 부모를 group 클래스로 표시하고 group-hover와 같은 group-* 수정자를 사용하여 대상 요소의 스타일을 지정합니다.
이 패턴은 group-focus, group-active 또는 group-odd와 같은 모든 유사 클래스 수정자와 함께 작동합니다.

```html
<a href="#" class="group">
    <h3 class="group-hover:text-white">New project</h3>
</a>
```

[https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-parent-state](https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-parent-state)

**peer**
형제 상태를 기반으로 한 스타일 지정
형제 요소의 상태를 기반으로 요소의 스타일을 지정해야 하는 경우 형제를 peer 클래스로 표시하고 peer-invalid와 같은 peer-* 수정자를 사용하여 대상 요소의 스타일을 지정합니다. 이 패턴은 모든 유사 클래스 수정자(예: peer-focus, peer-required 및 peer-disabled)와 함께 작동합니다.
```html
<input class="peer"/>
<p class="peer-invalid:visible"> Pizza</p>
```
[https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-sibling-state](https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-sibling-state)

### Responsive Modifiers

Mobile First

기본적으로 Tailwind는 Bootstrap과 같은 다른 프레임워크에서 사용하는 것과 유사한 모바일 우선 breakpoint 시스템을 사용합니다. 이것이 의미하는 바는 접두사가 붙지 않은 유틸리티(예: uppercase)는 모든 화면 크기에 적용되는 반면 접두사가 붙은 유틸리티(예: md:uppercase)는 지정된 breakpoint 이상에서만 적용됩니다.

이 접근 방식이 사람들을 가장 자주 놀라게 하는 부분은 모바일용으로 스타일을 지정하려면 sm: 접두사가 붙은 버전이 아니라 접두사가 없는 버전의 유틸리티를 사용해야 한다는 것입니다. sm을 "작은 화면에서"를 의미하는 것으로 생각하지 마십시오. "작은 breakpoint"로 생각하십시오.
div class="sm:text-center" => 작은 사이즈 (not 모바일)

이러한 이유로 디자인을 위한 모바일 레이아웃을 먼저 구현한 다음 sm 화면에 적합한 변경 사항을 레이어링한 다음 md 화면 등을 적용하는 것이 좋습니다.
```css
sm 640px @media (min-width: 640px) { ... }
md 768px @media (min-width: 768px) { ... }
lg 1024px @media (min-width: 1024px) { ... }
xl 1280px @media (min-width: 1280px) { ... }
2xl 1536px @media (min-width: 1536px) { ... }
```
[https://tailwindcss.com/docs/responsive-design#mobile-first](https://tailwindcss.com/docs/responsive-design#mobile-first])

Customizing breakpoints
[https://tailwindcss.com/docs/responsive-design#customizing-breakpoints](https://tailwindcss.com/docs/responsive-design#customizing-breakpoints)


### DarkMode
Tailwind에는 dark 모드가 활성화되어 있을 때 사이트 스타일을 다르게 지정할 수 있습니다. 현재 사용 중인 컴퓨터에서 설정한 라이트 모드 또는 다크 모드에 따라 dark가 자동으로 적용됩니다.
```css
dark:bg-slate-900
```
[https://tailwindcss.com/docs/dark-mode](https://tailwindcss.com/docs/dark-mode)

**수동으로 다크 모드 전환**
운영 체제 기본 설정에 의존하는 대신 수동으로 다크 모드 전환을 지원하려면 media 대신 class을 사용하십시오.
```js
// tailwind.config.js
module.exports = {
// 클래스를 기준으로 다크모드 적용 (최상위 부모에 dark클래스 지정)
darkMode: 'class',

// @media(prefers-color-scheme)를 기준으로 다크모드 적용 (기본 값)
darkMode: "media",
}
```
[https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually](https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually)

**prefers-color-scheme** CSS 미디어 특성은 사용자의 시스템이 라이트 테마나 다크 테마를 사용하는지 탐지하는 데에 사용됩니다.
```css
@media (prefers-color-scheme: light) {
    .themed {
        background: white;
        color: black;
    }
}
```
[https://developer.mozilla.org/ko/docs/Web/CSS/@media/prefers-color-scheme](https://developer.mozilla.org/ko/docs/Web/CSS/@media/prefers-color-scheme)

### Just In Time Compiler

Migrating to the JIT engine

2021년 3월에 발표한 새로운 Just-in-Time 엔진이 Tailwind CSS v3.0의 클래식 엔진을 대체했습니다. 새로운 엔진은 프로젝트에 필요한 스타일을 주문형으로 생성합니다.

Tailwind CSS v3.0 이전: 거대한 CSS파일을 생성하고, 그 파일에 이미 정의해놓은 클래스들을 가져와 사용하는 방식.
대략 20만줄 정도 되는 클래스로 가득찬 파일을 가져와 개발 단계에서 사용하기 때문에 매우 무겁고, 배포 전에는 purge를 해줘야 해서 번거로움

Tailwind CSS v3.0이후: 사용자가 사용하는 스타일들만 그때 그때 생성해서 사용하는 방식. 여러 클래스들을 조합해서 사용할 수 있고, 매우 가볍고, 배포 전 purge를 해주지 않아도 되서 편함

[https://tailwindcss.com/docs/upgrade-guide#migrating-to-the-jit-engine](https://tailwindcss.com/docs/upgrade-guide#migrating-to-the-jit-engine)


### Plugins
재사용 가능한 타사 플러그인으로 Tailwind 플러그인을 사용하면 CSS 대신 JavaScript를 사용하여 사용자의 스타일시트에 삽입할 Tailwind에 대한 새 스타일을 등록할 수 있습니다.
[https://tailwindcss.com/docs/plugins](https://tailwindcss.com/docs/plugins)

`@tailwindcss/forms` (form요소에 다양한 기본 스타일을 추가해줍니다.)
form 요소를 유틸리티로 쉽게 재정의할 수 있도록 하는 form 스타일에 대한 기본 reset을 제공하는 플러그인입니다. @tailwindcss/forms 플러그인은 유틸리티 클래스를 사용하여 form 요소의 스타일을 쉽게 지정할 수 있도록 하는 독창적인 form reset layer를 추가합니다.
~~~
npm install -D @tailwindcss/forms
~~~

@tailwindcss/forms 플러그인 설치 후, tailwind.config.js에 아래와 같이 plugins에 추가
```js
// tailwind.config.js
module.exports = {
    theme: {
    // ...
},
plugins: [
    require('@tailwindcss/forms'),
    // ...
]
```
[https://tailwindcss.com/docs/plugins#forms](https://tailwindcss.com/docs/plugins#forms])
[https://github.com/tailwindlabs/tailwindcss-forms](https://github.com/tailwindlabs/tailwindcss-forms)

CSS **user-select** 속성은 사용자가 텍스트를 선택할 수 있는지 지정합니다.
~~~css
user-select: none;
~~~
[https://developer.mozilla.org/ko/docs/Web/CSS/user-select](https://developer.mozilla.org/ko/docs/Web/CSS/user-select)


**Max-Width**
요소의 최대 너비를 설정하는 유틸리티입니다.
```css
max-w-none => max-width: none;
max-w-xs => max-width: 20rem; /* 320px */
max-w-sm => max-width: 24rem; /* 384px */
max-w-md => max-width: 28rem; /* 448px */
max-w-lg => max-width: 32rem; /* 512px */
max-w-full => max-width: 100%;
max-w-screen-sm => max-width: 640px;
max-w-screen-md => max-width: 768px;
max-w-screen-lg => max-width: 1024px;
max-w-screen-xl => max-width: 1280px;
```
대괄호를 사용하여 임의의 값을 사용하여 즉시 속성을 생성할 수도 있습니다.
~~~html
<div class="max-w-[50%]"/>
~~~
[https://tailwindcss.com/docs/max-width](https://tailwindcss.com/docs/max-width)
