---
layout: post
title: "[Part 1] Kotlin 문법 기초 - Gradle 플러그인 개발을 위한 필수 문법"
tags: [ kotlin, gradle ]
---

> **CI/CD 학습 시리즈**
> - **Part 1: Kotlin 문법 기초** (현재 글)
> - [Part 2: Gradle Plugin 개발](/2026/01/cicd-2-gradle-plugin)
> - [Part 3: Jenkins Pipeline + Groovy 기초](/2026/01/cicd-3-jenkins-pipeline-groovy)
> - [Part 4: App-Builder Plugin 실전 분석](/2026/01/cicd-4-app-builder-plugin)

실제 Gradle 플러그인 프로젝트(app-builder-plugin)를 분석하며 Kotlin 문법을 학습한 내용을 정리합니다.

## 프로젝트 구조

```
app-builder-gradle-plugin/
└── src/main/kotlin/com/knet/plugins/gradle/
    ├── AppBuilderPlugin.kt           # 플러그인 진입점
    ├── entity/                       # 데이터 모델
    ├── extension/                    # 플러그인 설정
    ├── logger/                       # 로깅 유틸리티
    ├── tasks/
    │   ├── builder/                  # 빌드 태스크
    │   │   └── executor/             # AppBuilder, Version, Build, Helm Executor
    │   └── targets/                  # 모듈 감지 태스크
    │       └── executor/             # DetectorExecutor
    └── utils/                        # 공통 유틸리티
```

---

## Level 1: 기본 문법

### 1.1 enum class - 열거형 클래스

**Kotlin:**

```kotlin
enum class LogLevel(
    val pattern: String,      // 각 enum 값이 가질 속성
) {
    FATAL(pattern = ".* (FATAL|CRITICAL) .*"),
    ERROR(pattern = ".* (ERROR|SEVERE) .*"),
    WARN(pattern = ".* WARN(ING)? .*"),
    DEBUG(pattern = ".* (DEBUG|FINE|TRACE) .*"),
    INFO(pattern = ".* INFO .*");

    // enum 안에 메서드 정의
    fun matches(line: String): Boolean {
        return pattern.toRegex().containsMatchIn(line)
    }

    companion object {
        fun findMatchingLevel(line: String): LogLevel? {
            return entries.find { it.matches(line) }
        }
    }
}
```

**Java 동등 코드:**

```java
public enum LogLevel {
	FATAL(".* (FATAL|CRITICAL) .*"),
	ERROR(".* (ERROR|SEVERE) .*"),
	WARN(".* WARN(ING)? .*"),
	DEBUG(".* (DEBUG|FINE|TRACE) .*"),
	INFO(".* INFO .*");

	private final String pattern;  // 필드 직접 선언 필요

	LogLevel(String pattern) {     // 생성자 직접 작성 필요
		this.pattern = pattern;
	}

	public String getPattern() {   // getter 직접 작성 필요
		return pattern;
	}

	public boolean matches(String line) {
		return Pattern.compile(pattern).matcher(line).find();
	}

	public static LogLevel findMatchingLevel(String line) {
		return Arrays.stream(values())
			.filter(level -> level.matches(line))
			.findFirst()
			.orElse(null);
	}
}
```

| Kotlin                                     | Java                                   | 차이점              |
|--------------------------------------------|----------------------------------------|------------------|
| `enum class LogLevel(val pattern: String)` | 필드 + 생성자 + getter 각각 작성                | Kotlin은 한 줄로 끝   |
| `companion object { }`                     | `static` 메서드                           | Kotlin은 블록으로 그룹화 |
| `entries`                                  | `values()`                             | Kotlin 1.9+에서 추가 |
| `entries.find { }`                         | `Arrays.stream().filter().findFirst()` | Kotlin이 더 간결     |

### 1.2 object - 싱글톤 객체

**Kotlin:**

```kotlin
object AnsiColor {
    const val RESET = "\u001B[0m"
    const val TIME_GRAY = "\u001B[90m"
    const val BG_BRIGHT_RED = "\u001B[101m"
}

// 사용
println("${AnsiColor.TIME_GRAY}시간${AnsiColor.RESET}")
```

**Java 동등 코드:**

```java
public final class AnsiColor {
	public static final String RESET = "\u001B[0m";
	public static final String TIME_GRAY = "\u001B[90m";
	public static final String BG_BRIGHT_RED = "\u001B[101m";

	private AnsiColor() {
	}  // 인스턴스화 방지
}

// 사용
System.out.

println(AnsiColor.TIME_GRAY +"시간"+AnsiColor.RESET);
```

| Kotlin             | Java                          | 차이점                 |
|--------------------|-------------------------------|---------------------|
| `object AnsiColor` | `final class` + `private 생성자` | Kotlin은 키워드 하나로 싱글톤 |
| `const val`        | `public static final`         | Kotlin이 더 간결        |
| `"${변수}"`          | `+ 변수 +` (문자열 연결)             | Kotlin 문자열 템플릿이 편리  |

### 1.3 data class - 데이터 클래스

**Kotlin:**

```kotlin
data class ModuleInfo(
    var index: Int,        // var = 변경 가능
    val name: String,      // val = 변경 불가 (읽기전용)
    val language: String,
    val type: String,
    var changed: Boolean,
    var version: String?,  // ? = nullable (null 허용)
    var status: String,
)

// 사용
val module = ModuleInfo(
    index = 0, name = "edoc-api", language = "JAVA",
    type = "app", changed = true, version = "1.0.0", status = "PENDING"
)

println(module)                    // toString() 자동
module.copy(version = "1.0.1")     // 일부만 바꾼 복사본
module == otherModule              // equals() 자동
```

**Java 동등 코드 (전통적인 방식):**

```java
public class ModuleInfo {
	private int index;
	private final String name;
	private final String language;
	private final String type;
	private boolean changed;
	private String version;  // nullable
	private String status;

	// 생성자
	public ModuleInfo(int index, String name, String language,
					  String type, boolean changed, String version, String status) {
		this.index = index;
		this.name = name;
		this.language = language;
		this.type = type;
		this.changed = changed;
		this.version = version;
		this.status = status;
	}

	// Getter (7개)
	public int getIndex() {
		return index;
	}

	public String getName() {
		return name;
	}

	public String getLanguage() {
		return language;
	}

	public String getType() {
		return type;
	}

	public boolean isChanged() {
		return changed;
	}

	public String getVersion() {
		return version;
	}

	public String getStatus() {
		return status;
	}

	// Setter (var 필드만)
	public void setIndex(int index) {
		this.index = index;
	}

	public void setChanged(boolean changed) {
		this.changed = changed;
	}

	public void setVersion(String version) {
		this.version = version;
	}

	public void setStatus(String status) {
		this.status = status;
	}

	// equals() - 직접 구현 필요
	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (o == null || getClass() != o.getClass()) return false;
		ModuleInfo that = (ModuleInfo) o;
		return index == that.index && changed == that.changed &&
			Objects.equals(name, that.name) &&
			Objects.equals(language, that.language) &&
			Objects.equals(type, that.type) &&
			Objects.equals(version, that.version) &&
			Objects.equals(status, that.status);
	}

	// hashCode() - 직접 구현 필요
	@Override
	public int hashCode() {
		return Objects.hash(index, name, language, type, changed, version, status);
	}

	// toString() - 직접 구현 필요
	@Override
	public String toString() {
		return "ModuleInfo{index=" + index + ", name='" + name + "', ...}";
	}

	// copy() - Java에는 없음, 직접 구현해야 함
	public ModuleInfo copy(Integer index, String name, /* ... */) {
		return new ModuleInfo(
			index != null ? index : this.index,
			name != null ? name : this.name,
			// ... 모든 필드
		);
	}
}
```

**Java 16+ record (간단한 경우만):**

```java
// record는 모든 필드가 final (val)이어야 함
// var 필드나 nullable 표현이 제한적
public record ModuleInfo(
		int index,
		String name,
		String language,
		String type,
		boolean changed,
		String version,
		String status
	) {
}
```

| Kotlin                    | Java                                     | 차이점                |
|---------------------------|------------------------------------------|--------------------|
| `data class` 7줄           | 전통: 70줄+ / record: 10줄                   | Kotlin이 훨씬 간결      |
| `val`/`var` 혼용            | record는 모두 final                         | Kotlin이 유연함        |
| `String?`                 | `@Nullable String` 또는 `Optional<String>` | Kotlin null 안전성 내장 |
| `copy(version = "1.0.1")` | 직접 구현 필요                                 | Kotlin 자동 생성       |
| Named argument            | Java에 없음                                 | 가독성 향상             |

### 1.4 val vs var

**Kotlin:**

```kotlin
val name = "edoc-api"    // 재할당 불가 (타입 추론: String)
name = "other"           // 컴파일 에러!

var version = "1.0.0"    // 재할당 가능
version = "1.0.1"        // OK
```

**Java 동등 코드:**

```java
final String name = "edoc-api";  // final = 재할당 불가
name ="other";                   // 컴파일 에러!

String version = "1.0.0";         // final 없음 = 재할당 가능
version ="1.0.1";                // OK
```

| Kotlin                    | Java                           | 차이점               |
|---------------------------|--------------------------------|-------------------|
| `val`                     | `final`                        | Kotlin은 기본이 불변 권장 |
| `var`                     | (일반 변수)                        | Java는 기본이 가변      |
| 타입 추론 `val name = "text"` | `var name = "text"` (Java 10+) | 둘 다 타입 추론 가능      |

### 1.5 Nullable (?) - Kotlin의 핵심 기능

**Kotlin:**

```kotlin
var version: String? = null    // null 허용
var name: String = "edoc"      // null 불가 (컴파일 에러!)
name = null                    // 컴파일 에러!

// null 안전 접근
version?.length                // null이면 null 반환
version ?: "default"           // null이면 기본값
version!!                      // null 아님을 단언 (위험)
```

**Java 동등 코드:**

```java
String version = null;         // Java는 모든 참조 타입이 nullable
String name = "edoc";
name =null;                   // 가능! (NPE 위험)

// null 체크 - 직접 해야 함
	if(version !=null){
int len = version.length();
}

// Optional 사용 (Java 8+)
Optional<String> optVersion = Optional.ofNullable(version);
int len = optVersion.map(String::length).orElse(0);

// 기본값
String result = version != null ? version : "default";
// 또는
String result = Objects.requireNonNullElse(version, "default");
```

| Kotlin              | Java                             | 차이점                |
|---------------------|----------------------------------|--------------------|
| `String?`           | `@Nullable String` (어노테이션)       | Kotlin은 타입 시스템에 내장 |
| `String` (non-null) | 없음 (모든 참조가 nullable)             | **컴파일 시점에 NPE 방지** |
| `?.` (safe call)    | `if (x != null) x.method()`      | Kotlin이 간결         |
| `?:` (Elvis)        | 삼항 연산자 `x != null ? x : default` | Kotlin이 간결         |
| `!!`                | `Objects.requireNonNull(x)`      | 명시적 단언             |

**Kotlin Null Safety의 장점:**

```
Java:   런타임에 NPE 발생 → 서비스 장애
Kotlin: 컴파일 시점에 null 체크 강제 → 안전한 코드
```

---

## Level 2: 함수와 주요 문법

### 2.1 함수 선언

**Kotlin:**

```kotlin
// 기본 형태
fun getCurrentBranch(): String {
    return "main"
}

// 반환 타입 생략 (Unit = void)
fun configureGitUser() {
    // ...
}

// 표현식 함수 (한 줄)
private fun normalizeKey(name: String): String = name.substringAfterLast(":")

// 기본값 파라미터
fun connect(host: String, port: Int = 8080): Connection {
    ...
}

// Named argument
connect(host = "localhost", port = 3000)
connect(host = "localhost")  // port는 기본값 8080
```

**Java 동등 코드:**

```java
// 기본 형태
public String getCurrentBranch() {
	return "main";
}

// void 반환
public void configureGitUser() {
	// ...
}

// 한 줄 함수도 블록 필요
private String normalizeKey(String name) {
	return name.substring(name.lastIndexOf(":") + 1);
}

// 기본값 파라미터 - Java에 없음! 오버로딩으로 구현
public Connection connect(String host, int port) { ...}

public Connection connect(String host) {
	return connect(host, 8080);  // 오버로딩
}

// Named argument - Java에 없음!
connect("localhost",3000);
```

| Kotlin         | Java                     | 차이점        |
|----------------|--------------------------|------------|
| `fun`          | 반환타입 앞에                  | 키워드가 다름    |
| `Unit`         | `void`                   | 반환값 없음     |
| `= expression` | `{ return expression; }` | 표현식 함수로 간결 |
| 기본값 파라미터       | 오버로딩으로 구현                | Kotlin이 편리 |
| Named argument | 없음                       | 가독성 향상     |

### 2.2 when 표현식 (switch 대체)

**Kotlin:**

```kotlin
// 값 매칭 (표현식으로 값 반환)
return when (logLevel) {
    FATAL, ERROR -> "${BG_BRIGHT_RED}$line${RESET}"
    WARN -> "${BG_BRIGHT_YELLOW}$line${RESET}"
    else -> "${BG_BRIGHT_WHITE}$line${RESET}"
}

// 조건 매칭 (if-else 대체)
when {
    appDockerfile.exists() -> return MODULE_TYPE_APP
    libDockerfile.exists() -> return MODULE_TYPE_LIB
}

// 타입 매칭
when (obj) {
    is String -> println("문자열: ${obj.length}")  // 자동 캐스팅!
    is Int -> println("정수: ${obj + 1}")
    else -> println("알 수 없음")
}
```

**Java 동등 코드:**

```java
// switch 표현식 (Java 14+)
return switch(logLevel){
	case FATAL,ERROR ->BG_BRIGHT_RED +line +RESET;
    case WARN ->BG_BRIGHT_YELLOW +line +RESET;
default ->BG_BRIGHT_WHITE +line +RESET;
};

// 조건 매칭 - Java에 없음! if-else 체인 필요
	if(appDockerfile.

exists()){
	return MODULE_TYPE_APP;
}else if(libDockerfile.

exists()){
	return MODULE_TYPE_LIB;
}

// 타입 매칭 - Java 17+ pattern matching
	if(obj instanceof
String s){
	System.out.

println("문자열: "+s.length());
	}else if(obj instanceof
Integer i){
	System.out.

println("정수: "+(i +1));
	}else{
	System.out.

println("알 수 없음");
}
```

| Kotlin         | Java                        | 차이점             |
|----------------|-----------------------------|-----------------|
| `when (value)` | `switch (value)` (Java 14+) | 비슷              |
| `when { 조건 }`  | `if-else` 체인                | **Kotlin만의 기능** |
| `is Type ->`   | `instanceof` (Java 17+)     | Kotlin이 더 간결    |
| 자동 스마트 캐스팅     | 패턴 매칭 변수 필요                 | Kotlin이 편리      |

### 2.3 문자열 템플릿

**Kotlin:**

```kotlin
val name = "edoc-api"
println("모듈: $name")                    // "모듈: edoc-api"
println("길이: ${name.length}")           // "길이: 8"
println("대문자: ${name.uppercase()}")    // "대문자: EDOC-API"

// 여러 줄 문자열
val json = """
    {
        "name": "$name",
        "version": "1.0.0"
    }
""".trimIndent()
```

**Java 동등 코드:**

```java
String name = "edoc-api";
System.out.

println("모듈: "+name);                         // 문자열 연결
System.out.

println("길이: "+name.length());
	System.out.

println("대문자: "+name.toUpperCase());

// String.format 사용
	System.out.

println(String.format("모듈: %s, 길이: %d", name, name.length()));

// 여러 줄 문자열 (Java 15+)
String json = """
	{
	    "name": "%s",
	    "version": "1.0.0"
	}
	""".formatted(name);
```

| Kotlin          | Java                   | 차이점         |
|-----------------|------------------------|-------------|
| `"$변수"`         | `+ 변수 +` 또는 `%s`       | Kotlin이 직관적 |
| `"${표현식}"`      | `+ 표현식 +`              | 중괄호로 표현식 삽입 |
| `"""..."""`     | `"""..."""` (Java 15+) | 비슷          |
| `.trimIndent()` | 수동 처리 필요               | 들여쓰기 자동 제거  |

### 2.4 클래스 정의와 생성자

**Kotlin:**

```kotlin
class GitUtils(
    private val project: Project,    // 주 생성자 파라미터 = 클래스 속성
    private val logger: Logger,
    private val workspace: File
) {
    init {
        // 객체 생성 시 자동 실행
        initializeGitEnvironment()
    }

    // 보조 생성자
    constructor(project: Project) : this(project, defaultLogger, defaultWorkspace)
}

// 상속
open class Animal(val name: String)                    // open = 상속 가능
class Dog(name: String) : Animal(name)                 // : = extends

// 인터페이스 구현
class MyPlugin : Plugin<Project> {
    override fun apply(project: Project) {}
}
```

**Java 동등 코드:**

```java
public class GitUtils {
	private final Project project;
	private final Logger logger;
	private final File workspace;

	// 주 생성자
	public GitUtils(Project project, Logger logger, File workspace) {
		this.project = project;
		this.logger = logger;
		this.workspace = workspace;
		initializeGitEnvironment();  // init 블록 역할
	}

	// 보조 생성자 (오버로딩)
	public GitUtils(Project project) {
		this(project, defaultLogger, defaultWorkspace);
	}
}

// 상속
public class Animal {                                   // 기본이 상속 가능
	private final String name;

	public Animal(String name) {
		this.name = name;
	}
}

public class Dog extends Animal {                       // extends
	public Dog(String name) {
		super(name);
	}
}

// 인터페이스 구현
public class MyPlugin implements Plugin<Project> {      // implements
	@Override
	public void apply(Project project) {
	}
}
```

| Kotlin                  | Java                   | 차이점                   |
|-------------------------|------------------------|-----------------------|
| `class Foo(val x: Int)` | 필드 + 생성자 + getter 별도   | Kotlin이 간결            |
| `init { }`              | 생성자 본문                 | 명시적 초기화 블록            |
| `:` (상속/구현)             | `extends`/`implements` | 콜론으로 통일               |
| `open class`            | (기본이 상속 가능)            | **Kotlin은 기본이 final** |
| `override fun`          | `@Override`            | 키워드로 명시               |

### 2.5 Null Safety 연산자 정리

**Kotlin:**

```kotlin
val fromEnv = System.getenv("BRANCH_NAME") ?: System.getenv("GIT_BRANCH")
if (!fromEnv.isNullOrBlank()) return sanitizeBranch(fromEnv)

// 다양한 null 처리 패턴
val length = name?.length ?: 0                    // null이면 0
val upper = name?.uppercase()                     // null이면 null
val nonNull = name ?: throw IllegalArgumentException()  // null이면 예외
val forced = name!!                               // null이면 NPE (위험!)
```

**Java 동등 코드:**

```java
String fromEnv = System.getenv("BRANCH_NAME");
if(fromEnv ==null)fromEnv =System.

getenv("GIT_BRANCH");
if(fromEnv !=null&&!fromEnv.

isBlank())return

sanitizeBranch(fromEnv);

// Java의 null 처리
int length = name != null ? name.length() : 0;
String upper = name != null ? name.toUpperCase() : null;
if(name ==null)throw new

IllegalArgumentException();

String forced = Objects.requireNonNull(name);
```

| 연산자            | 이름          | Java 동등 코드                  |
|----------------|-------------|-----------------------------|
| `?:`           | Elvis       | `x != null ? x : default`   |
| `?.`           | Safe call   | `if (x != null) x.method()` |
| `!!`           | Not-null 단언 | `Objects.requireNonNull(x)` |
| `?.takeIf { }` | 조건부 반환      | `Optional.filter()`         |

### 2.6 컬렉션 함수 (람다)

**Kotlin:**

```kotlin
val dockerfileModules = modules.filter { module ->
    hasDockerfile(module, workspace)
}

output.trim()
    .split(" ")
    .filter { it.isNotBlank() }   // it = 각 요소 (람다 기본 파라미터)
    .map { it.uppercase() }
    .forEach { println(it) }

// 체이닝 예제
val result = modules
    .filter { it.changed }              // 변경된 것만
    .map { it.name }                    // 이름만 추출
    .sorted()                           // 정렬
    .joinToString(", ")                 // 문자열로 합침
```

**Java 동등 코드 (Stream API):**

```java
List<String> dockerfileModules = modules.stream()
	.filter(module -> hasDockerfile(module, workspace))
	.collect(Collectors.toList());

Arrays.

stream(output.trim().

split(" "))
	.

filter(s ->!s.

isBlank())
	.

map(String::toUpperCase)
    .

forEach(System.out::println);

// 체이닝 예제
String result = modules.stream()
	.filter(m -> m.isChanged())         // getter 호출
	.map(Module::getName)               // 메서드 레퍼런스
	.sorted()
	.collect(Collectors.joining(", "));
```

| Kotlin          | Java Stream                 | 차이점                |
|-----------------|-----------------------------|--------------------|
| `filter { }`    | `.filter(x -> ...)`         | Kotlin이 간결         |
| `map { }`       | `.map(x -> ...)`            | 동일                 |
| `forEach { }`   | `.forEach(x -> ...)`        | 동일                 |
| `find { }`      | `.filter().findFirst()`     | Kotlin이 직관적        |
| `any { }`       | `.anyMatch(x -> ...)`       | 이름만 다름             |
| `firstOrNull()` | `.findFirst().orElse(null)` | Kotlin이 간결         |
| **바로 사용 가능**    | `.stream()` 필요              | **Kotlin 컬렉션이 편리** |
| **결과가 List**    | `.collect()` 필요             | Kotlin이 간결         |

### 2.7 vararg (가변 인자)

**Kotlin:**

```kotlin
fun execGitCommand(vararg args: String): String {
    val processBuilder = ProcessBuilder("git", *args)
    //                                         ^ spread 연산자
}

// 호출
execGitCommand("fetch", "origin", "--tags")
execGitCommand("status")

// 배열을 vararg로 전달
val commands = arrayOf("fetch", "origin")
execGitCommand(*commands)  // spread 연산자로 펼침
```

**Java 동등 코드:**

```java
public String execGitCommand(String... args) {
	// Java의 varargs는 내부적으로 배열
	List<String> command = new ArrayList<>();
	command.add("git");
	command.addAll(Arrays.asList(args));
	ProcessBuilder processBuilder = new ProcessBuilder(command);
}

// 호출
execGitCommand("fetch","origin","--tags");

execGitCommand("status");

// 배열을 vararg로 전달 - 그냥 전달하면 됨
String[] commands = {"fetch", "origin"};

execGitCommand(commands);
```

| Kotlin                | Java             | 차이점               |
|-----------------------|------------------|-------------------|
| `vararg args: String` | `String... args` | 문법만 다름            |
| `*array` (spread)     | 그냥 전달            | Kotlin은 명시적 펼침 필요 |

### 2.8 스코프 함수 - Kotlin만의 강력한 기능

**Kotlin:**

```kotlin
// also - 부가 작업 후 원래 객체 반환
private val mapper = jacksonObjectMapper()
    .findAndRegisterModules()
    .also { println("Mapper 초기화: $it") }  // 로깅 등 부가 작업

// let - null 체크 후 변환
val length = name?.let { it.length } ?: 0

// apply - 객체 설정
val person = Person().apply {
    this.name = "Kim"
    this.age = 30
}

// run - 객체 내에서 계산
val result = person.run {
    "$name is $age years old"
}

// with - 객체를 인자로 받아 블록 실행
with(person) {
    println(name)
    println(age)
}
```

**Java 동등 코드 (스코프 함수 없음!):**

```java
// also - Java에 없음, 별도 변수 필요
ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
System.out.

println("Mapper 초기화: "+mapper);
// mapper를 그대로 사용

// let - Optional 또는 if문
int length = Optional.ofNullable(name)
	.map(String::length)
	.orElse(0);
// 또는
int length = name != null ? name.length() : 0;

// apply - Java에 없음, setter 따로 호출
Person person = new Person();
person.

setName("Kim");
person.

setAge(30);

// run - Java에 없음
String result = person.getName() + " is " + person.getAge() + " years old";

// with - Java에 없음
System.out.

println(person.getName());
	System.out.

println(person.getAge());
```

| 스코프 함수          | 반환값   | 참조     | Java 대체          |
|-----------------|-------|--------|------------------|
| `also { }`      | 원래 객체 | `it`   | 없음 (변수 저장 후 사용)  |
| `let { }`       | 람다 결과 | `it`   | `Optional.map()` |
| `apply { }`     | 원래 객체 | `this` | 없음 (setter 체이닝)  |
| `run { }`       | 람다 결과 | `this` | 없음               |
| `with(obj) { }` | 람다 결과 | `this` | 없음               |

**스코프 함수 선택 가이드:**

```
원래 객체 반환?
├── Yes → 객체 참조가 it? → also (로깅, 검증)
│         객체 참조가 this? → apply (초기화, 설정)
└── No  → 객체 참조가 it? → let (null 체크, 변환)
          객체 참조가 this? → run (계산)
```

### 2.9 Pair, Triple과 구조 분해

**Kotlin:**

```kotlin
// Pair 반환 - 두 값을 묶어서 반환
private fun normalizeBuildInfo(buildInfo: BuildInfo): Pair<BuildInfo, Boolean> {
    return Pair(buildInfo, false)
    // 또는: return buildInfo to false
}

// Triple 반환 - 세 값을 묶어서 반환
fun getEnvironment(): Triple<String, String, String> {
    return Triple("dev", "test", "prod")
}

// 구조 분해 (destructuring) - 한 번에 여러 변수에 할당
val (normalized, changed) = normalizeBuildInfo(raw)
val (dev, test, prod) = getEnvironment()

// data class도 구조 분해 가능
data class Person(val name: String, val age: Int)
val (name, age) = Person("Kim", 30)
```

**Java 동등 코드:**

```java
// Pair - Java에 없음! 직접 만들거나 라이브러리 사용
// Apache Commons: Pair<BuildInfo, Boolean>
// 또는 Map.Entry, 또는 커스텀 클래스

// 보통 커스텀 record 사용 (Java 16+)
record NormalizeResult(BuildInfo buildInfo, boolean changed) {
}

private NormalizeResult normalizeBuildInfo(BuildInfo buildInfo) {
	return new NormalizeResult(buildInfo, false);
}

// 구조 분해 - Java에 없음! 각각 꺼내야 함
NormalizeResult result = normalizeBuildInfo(raw);
BuildInfo normalized = result.buildInfo();
boolean changed = result.changed();
```

| Kotlin              | Java                | 차이점          |
|---------------------|---------------------|--------------|
| `Pair<A, B>`        | 없음 (record 필요)      | Kotlin 내장    |
| `Triple<A, B, C>`   | 없음                  | Kotlin 내장    |
| `val (a, b) = pair` | `pair.getFirst()` 등 | **구조 분해 지원** |
| `a to b`            | `new Pair<>(a, b)`  | 간결한 생성 문법    |

### 2.10 문자열 확장 함수들

**Kotlin:**

```kotlin
raw.removePrefix("refs/heads/")
    .removePrefix("origin/")
    .trim()

remoteUrl.substringAfterLast("/")
    .removeSuffix(".git")

// 더 많은 확장 함수
"  hello  ".trim()                    // "hello"
"hello".uppercase()                   // "HELLO"
"HELLO".lowercase()                   // "hello"
"hello".capitalize()                  // "Hello" (deprecated, use replaceFirstChar)
"hello world".split(" ")              // ["hello", "world"]
"hello".repeat(3)                     // "hellohellohello"
"hello".reversed()                    // "olleh"
"hello".take(3)                       // "hel"
"hello".drop(2)                       // "llo"
"abc".padStart(5, '0')                // "00abc"
"abc".padEnd(5, '0')                  // "abc00"
```

**Java 동등 코드:**

```java
// removePrefix - Java에 없음! 직접 구현
String result = raw;
if(result.

startsWith("refs/heads/")){
result =result.

substring("refs/heads/".length());
	}
	if(result.

startsWith("origin/")){
result =result.

substring("origin/".length());
	}
result =result.

trim();

// substringAfterLast - Java에 없음!
int lastSlash = remoteUrl.lastIndexOf("/");
String afterSlash = lastSlash >= 0 ? remoteUrl.substring(lastSlash + 1) : remoteUrl;
if(afterSlash.

endsWith(".git")){
afterSlash =afterSlash.

substring(0,afterSlash.length() -4);
	}

// Java 문자열 메서드
	"  hello  ".

trim();                   // "hello"
"hello".

toUpperCase();                // "HELLO"
"HELLO".

toLowerCase();                // "hello"
"hello world".

split(" ");             // String[] 반환
"hello".

repeat(3);                    // "hellohellohello" (Java 11+)
new

StringBuilder("hello").

reverse().

toString();  // "olleh"
"hello".

substring(0,3);              // "hel"
"hello".

substring(2);                 // "llo"
String.

format("%5s","abc").

replace(' ','0');  // "00abc" (복잡!)
```

| Kotlin                  | Java                            | 차이점           |
|-------------------------|---------------------------------|---------------|
| `removePrefix()`        | 직접 구현                           | **Kotlin 내장** |
| `removeSuffix()`        | 직접 구현                           | **Kotlin 내장** |
| `substringAfterLast()`  | `lastIndexOf()` + `substring()` | **Kotlin 내장** |
| `substringBeforeLast()` | 직접 구현                           | **Kotlin 내장** |
| `take(n)`               | `substring(0, n)`               | Kotlin이 직관적   |
| `drop(n)`               | `substring(n)`                  | Kotlin이 직관적   |

---

## Level 3: Gradle 플러그인 구조

### 3.1 Plugin 클래스 - 진입점

```kotlin
class AppBuilderPlugin : Plugin<Project> {

    override fun apply(project: Project) {
        // 1. Extension 등록 (DSL 설정 블록)
        project.extensions.create(
            AppBuilderExtension.NAME,           // "appBuilder"
            AppBuilderExtension::class.java,
            project.objects
        )

        // 2. Task 등록
        registerTasks(project)
    }

    private fun registerTasks(project: Project) {
        project.tasks.register(GetTargetsTask.TASK_NAME, GetTargetsTask::class.java)
        project.tasks.register(AppBuilderTask.TASK_NAME, AppBuilderTask::class.java)
    }
}
```

| Gradle API                    | 설명                |
|-------------------------------|-------------------|
| `Plugin<Project>`             | Gradle 플러그인 인터페이스 |
| `apply(project)`              | 플러그인이 적용될 때 실행    |
| `project.extensions.create()` | DSL 설정 블록 등록      |
| `project.tasks.register()`    | 태스크 등록 (lazy)     |

### 3.2 Extension 클래스 - DSL 설정

```kotlin
abstract class AppBuilderExtension @Inject constructor(objects: ObjectFactory) {
    companion object {
        val NAME = "appBuilder"
    }

    var ecrRegistry: Property<String> = objects.property(String::class.java)
    var dryRun: Property<Boolean> = objects.property(Boolean::class.java).convention(false)

    val nexus: NexusConfig = objects.newInstance(NexusConfig::class.java)

    fun nexus(action: Action<NexusConfig>) = action.execute(nexus)
}
```

**사용자가 build.gradle.kts에서 사용하는 방식:**

```kotlin
appBuilder {
    ecrRegistry = "111111111.dkr.ecr.ap-northeast-2.amazonaws.com"
    dryRun = true

    nexus {
        username = "admin"
        password = "secret"
    }
}
```

### 3.3 Property<T> - Gradle의 지연 평가

```kotlin
var ecrRegistry: Property<String> = objects.property(String::class.java)

// 값 읽기
val registry = appBuilderExtension.ecrRegistry.get()
val registry = appBuilderExtension.ecrRegistry.getOrElse("default")
val registry = appBuilderExtension.ecrRegistry.orNull
```

### 3.4 Task 클래스

```kotlin
open class GetTargetsTask : DefaultTask() {

    companion object {
        val TASK_NAME = "GetTargets"
    }

    @Internal
    val extension = this.project.extensions.getByName(...) as GetTargetsTaskExtension

    @TaskAction
    fun execute() {
        val (targetModule, workspace) = processParameters()
        val executor = DetectorExecutor(project, logger)
        executor.execute(workspace, ...)
    }
}
```

| 어노테이션         | 설명              |
|---------------|-----------------|
| `@TaskAction` | 태스크 실행 메서드 지정   |
| `@Internal`   | Gradle 캐시에서 제외  |
| `@Input`      | 입력 값 (변경 시 재실행) |
| `@OutputFile` | 출력 파일 (캐시 키)    |

### 3.5 클래스 참조 문법

```kotlin
AppBuilderExtension::class                    // KClass<AppBuilderExtension>
AppBuilderExtension::class.java               // Class<AppBuilderExtension>
AppBuilderExtension::class.simpleName         // "AppBuilderExtension"
```

### 3.6 as 연산자 (타입 캐스팅)

**Kotlin:**

```kotlin
// 안전하지 않은 캐스팅 (실패 시 ClassCastException)
val extension = project.extensions.getByName("appBuilder") as AppBuilderExtension

// 안전한 캐스팅 (실패 시 null)
val extension = project.extensions.getByName("appBuilder") as? AppBuilderExtension

// 스마트 캐스팅 (is 체크 후 자동 캐스팅)
if (obj is String) {
    println(obj.length)  // 자동으로 String으로 캐스팅됨!
}
```

**Java 동등 코드:**

```java
// 캐스팅 (실패 시 ClassCastException)
AppBuilderExtension extension = (AppBuilderExtension) project.getExtensions().getByName("appBuilder");

// 안전한 캐스팅 - instanceof 체크 필요
Object obj = project.getExtensions().getByName("appBuilder");
AppBuilderExtension extension = obj instanceof AppBuilderExtension
	? (AppBuilderExtension) obj
	: null;

// 타입 체크 후 캐스팅 (Java 17+ 패턴 매칭)
if(obj instanceof
String s){
	System.out.

println(s.length());
	}
// Java 16 이하
	if(obj instanceof String){
String s = (String) obj;  // 수동 캐스팅 필요
    System.out.

println(s.length());
	}
```

| Kotlin  | Java               | 차이점            |
|---------|--------------------|----------------|
| `as`    | `(Type)`           | 같음             |
| `as?`   | `instanceof` + 캐스팅 | **Kotlin이 간결** |
| 스마트 캐스팅 | 패턴 매칭 (Java 17+)   | Kotlin이 더 오래됨  |

### 3.7 의존성 주입 (@Inject)

```kotlin
abstract class AppBuilderExtension @Inject constructor(objects: ObjectFactory) {
    // Gradle이 자동으로 ObjectFactory 주입
}
```

---

## Level 4: 실전 비즈니스 로직 (Executor)

### 4.1 Executor 아키텍처

```
GetTargetsTask                    AppBuilderTask
     │                                  │
     ▼                                  ▼
DetectorExecutor              AppBuilderExecutor (오케스트레이터)
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                         Version    Build     Helm
                         Executor   Executor  Executor
```

### 4.2 ?.let { } 패턴 - null 안전 처리

```kotlin
private fun getModuleInfo(buildInfo: BuildInfo, targetModule: String): ModuleInfo {
    val normalized = normalizeKey(targetModule)

    // null이 아니면 블록 실행
    buildInfo.modules[normalized]?.let {
        return it
    }

    buildInfo.modules[targetModule]?.let {
        return it
    }

    throw IllegalArgumentException("Module '$targetModule' not found")
}
```

### 4.3 copy() - data class 복사

```kotlin
val updatedInfo = moduleInfo.copy(
    version = versionInfo.version,   // 이 값만 변경
    status = "SUCCESS"               // 이 값만 변경
)
// 나머지 속성은 원본 유지
```

### 4.4 Triple - 세 값 묶기

```kotlin
private fun determineEnvironmentByBranch(branchName: String): Triple<String, String, String> {
    val nodeEnv = if (branchName == "main") "prod" else "dev"
    val goProEnv = if (branchName == "main") "prod" else "dev"
    val springEnv = "cloudconfig,test"

    return Triple(nodeEnv, goProEnv, springEnv)
}

// 구조 분해로 받기
val (nodeEnv, goEnv, springEnv) = determineEnvironmentByBranch(currentBranch)
```

### 4.5 apply { } - 객체 설정 블록

```kotlin
val dumperOptions = DumperOptions().apply {
    defaultFlowStyle = DumperOptions.FlowStyle.BLOCK
    isPrettyFlow = true
    indent = 2
}
```

### 4.6 use { } - 자동 리소스 해제

**Kotlin:**

```kotlin
process.inputStream.bufferedReader().use { reader ->
    reader.lineSequence().forEach { line ->
        println(formatLogLine(line))
    }
}
// use 블록 끝나면 자동으로 reader.close()

// 파일 읽기
File("data.txt").bufferedReader().use { reader ->
    val content = reader.readText()
}

// 여러 리소스
FileInputStream("input.txt").use { input ->
    FileOutputStream("output.txt").use { output ->
        input.copyTo(output)
    }
}
```

**Java 동등 코드 (try-with-resources):**

```java
// Java 7+ try-with-resources
try(BufferedReader reader = new BufferedReader(
	new InputStreamReader(process.getInputStream()))){
	reader.

lines().

forEach(line ->{
	System.out.

println(formatLogLine(line));
	});
	}
// try 블록 끝나면 자동으로 reader.close()

// 파일 읽기
	try(
BufferedReader reader = new BufferedReader(new FileReader("data.txt"))){
String content = reader.lines().collect(Collectors.joining("\n"));
}

// 여러 리소스
	try(
FileInputStream input = new FileInputStream("input.txt");
FileOutputStream output = new FileOutputStream("output.txt")){
	input.

transferTo(output);
}
```

| Kotlin     | Java           | 차이점                     |
|------------|----------------|-------------------------|
| `.use { }` | `try () { }`   | Kotlin은 확장 함수, Java는 문법 |
| 람다 내부에서 사용 | try 블록 내부에서 사용 | Kotlin이 함수형             |
| 중첩 use     | 세미콜론으로 구분      | Java가 더 간결              |

### 4.7 toMutableMap() - 불변 → 가변 변환

```kotlin
val currentBuildInfo = jsonUtil.readBuildInfo()
val updatedModules = currentBuildInfo.modules.toMutableMap()

updatedModules[key] = updatedInfo  // 이제 수정 가능
```

### 4.8 forEachIndexed - 인덱스와 함께 순회

```kotlin
dockerfileModules.forEachIndexed { index, module ->
    val moduleInfo = ModuleInfo(
        index = index,
        name = module,
        // ...
    )
}
```

### 4.9 ?: throw - null이면 예외

```kotlin
val version = moduleInfo.version
    ?: throw IllegalArgumentException("Module version is missing")
```

### 4.10 try-finally 패턴

```kotlin
try {
    cloneHelmRepo(workDir)
    updateModuleValues(...)
    commitAndPushChanges(...)
} finally {
    // 성공/실패 관계없이 항상 실행
    if (workDir.exists()) {
        workDir.deleteRecursively()
    }
}
```

### 4.11 중첩 data class

```kotlin
class BuildExecutor(...) {

    // 클래스 내부에 정의된 data class
    private data class ModuleBuildContext(
        val module: String,
        val moduleType: String,
        val tagVersion: String,
        // ...
    )
}
```

---

## 전체 요약

```
Level 1: 기본 문법
├── enum class    열거형 + 속성 + 메서드
├── object        싱글톤
├── data class    자동 equals/hashCode/toString/copy
└── val/var, ?    불변/가변, nullable

Level 2: 함수와 컬렉션
├── fun           함수 선언, 표현식 함수
├── when          switch 대체 (값/조건 매칭)
├── Null Safety   ?. ?: !! takeIf
├── 컬렉션 함수    filter, map, forEach, find, any
└── 스코프 함수    also, let, apply, run

Level 3: Gradle 플러그인
├── Plugin<Project>  플러그인 인터페이스
├── Extension        DSL 설정 블록 (abstract + @Inject)
├── Task             @TaskAction으로 실행 메서드 지정
└── Property<T>      Gradle 지연 평가 속성

Level 4: 비즈니스 로직
├── ?.let { }      null 안전 처리 패턴
├── .copy()        data class 부분 복사
├── .use { }       자동 리소스 해제
├── Pair/Triple    여러 값 반환
└── toMutableMap() 불변→가변 변환
```

---

## Kotlin vs Java 핵심 비교표

### 코드량 비교

| 기능               | Kotlin        | Java                     | 차이    |
|------------------|---------------|--------------------------|-------|
| data class (7필드) | **7줄**        | 70줄+                     | 10배 ↓ |
| 싱글톤              | **3줄**        | 10줄+                     | 3배 ↓  |
| null 체크          | **1줄** (`?.`) | 3줄+ (if문)                | 3배 ↓  |
| 컬렉션 필터링          | **1줄**        | 3줄 (.stream().collect()) | 3배 ↓  |

### Kotlin만의 기능 (Java에 없음)

| 기능                 | 설명                            | Java 대체          |
|--------------------|-------------------------------|------------------|
| **스코프 함수**         | `also`, `let`, `apply`, `run` | 없음               |
| **Elvis 연산자**      | `?:`                          | 삼항 연산자           |
| **Safe call**      | `?.`                          | if문              |
| **스마트 캐스팅**        | is 체크 후 자동 캐스팅                | 패턴 매칭 (Java 17+) |
| **구조 분해**          | `val (a, b) = pair`           | 없음               |
| **확장 함수**          | `String.removePrefix()`       | 유틸 클래스           |
| **기본값 파라미터**       | `fun foo(x: Int = 0)`         | 오버로딩             |
| **Named argument** | `foo(name = "a")`             | 없음               |
| **when 조건 매칭**     | `when { 조건 -> }`              | if-else 체인       |

### Java가 더 나은 경우

| 상황            | 이유            |
|---------------|---------------|
| 기존 Java 프로젝트  | 호환성, 팀 익숙함    |
| Android 아닌 서버 | Java 생태계가 더 큼 |
| 레거시 코드 유지보수   | Java 개발자 많음   |

### 결론: 언제 Kotlin을 선택할까?

```
✅ Kotlin 추천
├── Gradle 플러그인 개발 (Kotlin DSL 지원)
├── Android 앱 개발 (공식 언어)
├── 새 프로젝트 시작
├── 간결한 코드 선호
└── Null Safety 중요

✅ Java 유지
├── 기존 Java 프로젝트
├── 팀이 Java에 익숙
└── Spring 생태계 (둘 다 OK)
```
