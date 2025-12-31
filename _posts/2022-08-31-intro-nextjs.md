---
layout: post
title: NextJS 시작하기
---

## Creating a Project

~~~
npx create-next-app@latest --typescriopt
~~~

package.json
~~~json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
},
~~~

## Pages
next.js 파일이름을 가지고 url를 만들어준다. (컴포넌트 이름은 중요하지 않다.)
~~~javascript
export default function Potato() {
  return "about us";
}
~~~

예외
- index.js is **/**

## Static Pre Rendering
next.js 가장 좋은 기능은 앱에 있는 페이지들이 미리 렌더링 되는 것이다.

[Hydration](https://velog.io/@huurray/React-Hydration-%EC%97%90-%EB%8C%80%ED%95%98%EC%97%AC)


## Routing
Link 컴포넌트를 사용해야한다.

### index.js
~~~jsx
import Link from "next/link";
import { useRouter } from "next/router";

export default function NavBar() {
  const router = useRouter();
  return (
    <nav>
      <Link href="/">
        <a style={{ color: router.pathname === "/" ? "red" : "blue" }}>Home</a>
      </Link>
      <Link href="/about">
        <a style={{ color: router.pathname === "/about" ? "red" : "blue" }}>
          About
        </a>
      </Link>
    </nav>
  );
}
~~~

## CSS Modules
### NavBar.module.css
~~~css
.link {
  text-decoration: none;
}

.active {
  color: tomato;
}
~~~

### NavBar.js
~~~jsx
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "./NavBar.module.css";

export default function NavBar() {
  const router = useRouter();
  return (
    <nav>
      <Link href="/">
        <a
          className={`${styles.link} ${
            router.pathname === "/" ? styles.active : ""
          }`}
        >
          Home
        </a>
      </Link>
      <Link href="/about">
        <a
          className={[
            styles.link,
            router.pathname === "/about" ? styles.active : "",
          ].join(" ")}
        >
          About
        </a>
      </Link>
~~~

## Styles JSX
### NavVar.js
~~~jsx
import Link from "next/link";
import { useRouter } from "next/router";

export default function NavBar() {
  const router = useRouter();
  return (
    <nav>
      <Link href="/">
        <a className={router.pathname === "/" ? "active" : ""}>Home</a>
      </Link>
      <Link href="/about">
        <a className={router.pathname === "/about" ? "active" : ""}>About</a>
      </Link>
      <style jsx>{`
        nav {
          background-color: tomato;
        }
        a {
          text-decoration: none;
        }
        .active {
          color: yellow;
        }
      `}</style>
    </nav>
  );
}
~~~


## Custom APP
pages/_app.js 파일은 index.js를 렌더링 하기전에 렌더링 하는 파일이다. (blueprint)

### MyApp.js
~~~jsx
import NavBar from "../components/NavBar";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <NavBar />
      <Component {...pageProps} />
    </>
  );
}
~~~

## Patterns 

### Layout.js
~~~jsx
import NavBar from "./NavBar";

export default function Layout({ children }) {
  return (
    <>
      <NavBar />
      <div>{children}</div>
    </>
  );
}
~~~

### _app.js
~~~jsx
import Layout from "../components/Layout";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
~~~
