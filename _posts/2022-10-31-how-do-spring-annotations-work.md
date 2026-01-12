---
layout: post
title: Java Annotation은 어떻게 동작하는가
tags: [java, spring]
---

어노테이션은 코드에 메타데이터를 부여하는 방법이다. 그 자체로는 아무런 동작을 하지 않지만, 리플렉션이나 컴파일러를 통해 처리되어 실제 기능을 수행한다.

---

## 어노테이션의 본질

### 커스텀 어노테이션 정의

```java
package annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(value = RetentionPolicy.RUNTIME)
@Target(value = ElementType.METHOD)
public @interface Worker {
    String name();
    int priority() default 0;
}
```

### 바이트코드 분석

```bash
$ javac Worker.java
$ javap -c Worker
```

**결과:**

```java
Compiled from "Worker.java"
public interface annotation.Worker extends java.lang.annotation.Annotation {
  public abstract java.lang.String name();
  public abstract int priority();
}
```

> **어노테이션은 `java.lang.annotation.Annotation`을 상속받는 특수한 인터페이스다.**

### 어노테이션의 제약사항

- 제네릭일 수 없다
- `extends` 절을 가질 수 없다 (암묵적으로 `Annotation` 확장)
- 메서드는 매개변수를 가질 수 없다
- 메서드는 타입 매개변수를 가질 수 없다
- `throws` 절을 가질 수 없다
- 반환 타입: 기본형, String, Class, Enum, 어노테이션, 또는 이들의 배열만 가능

---

## 메타 어노테이션 (Meta-Annotation)

어노테이션을 정의할 때 사용하는 어노테이션

### @Retention - 유지 정책

어노테이션 정보가 언제까지 유지되는지 결정

```java
public enum RetentionPolicy {
    SOURCE,   // 소스 코드에서만 유지, 컴파일 후 제거
    CLASS,    // 클래스 파일까지 유지, 런타임에는 사용 불가 (기본값)
    RUNTIME   // 런타임까지 유지, 리플렉션으로 접근 가능
}
```

| 정책 | 사용 시점 | 예시 |
|------|----------|------|
| SOURCE | 컴파일 타임 체크 | `@Override`, `@SuppressWarnings` |
| CLASS | 바이트코드 조작 | Lombok |
| RUNTIME | 리플렉션 처리 | Spring `@Component`, `@Autowired` |

### @Target - 적용 대상

```java
public enum ElementType {
    TYPE,            // 클래스, 인터페이스, enum
    FIELD,           // 필드 (enum 상수 포함)
    METHOD,          // 메서드
    PARAMETER,       // 파라미터
    CONSTRUCTOR,     // 생성자
    LOCAL_VARIABLE,  // 지역 변수
    ANNOTATION_TYPE, // 어노테이션 타입
    PACKAGE,         // 패키지
    TYPE_PARAMETER,  // 타입 파라미터 (Java 8+)
    TYPE_USE         // 타입 사용 위치 (Java 8+)
}
```

```java
// 여러 대상에 적용 가능
@Target({ElementType.TYPE, ElementType.METHOD, ElementType.FIELD})
public @interface MyAnnotation { }
```

### @Documented

JavaDoc에 어노테이션 정보 포함

### @Inherited

자식 클래스가 부모의 어노테이션을 상속

```java
@Inherited
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface InheritedAnnotation { }

@InheritedAnnotation
public class Parent { }

public class Child extends Parent { }
// Child도 @InheritedAnnotation을 가짐
```

### @Repeatable (Java 8+)

같은 어노테이션을 여러 번 적용 가능

```java
@Repeatable(Schedules.class)
public @interface Schedule {
    String cron();
}

public @interface Schedules {
    Schedule[] value();
}

// 사용
@Schedule(cron = "0 0 * * *")
@Schedule(cron = "0 12 * * *")
public void scheduledTask() { }
```

---

## 런타임 어노테이션 처리

### 리플렉션을 통한 어노테이션 조회

```java
@Worker(name = "김개발", priority = 1)
public class TaskService {

    @Worker(name = "박팀장", priority = 2)
    public void executeTask(String taskName) {
        System.out.println("Executing: " + taskName);
    }

    public static void main(String[] args) throws Exception {
        // 클래스 레벨 어노테이션 조회
        Class<?> clazz = TaskService.class;
        if (clazz.isAnnotationPresent(Worker.class)) {
            Worker classAnnotation = clazz.getAnnotation(Worker.class);
            System.out.println("Class Worker: " + classAnnotation.name());
        }

        // 메서드 레벨 어노테이션 조회
        Method method = clazz.getDeclaredMethod("executeTask", String.class);
        Worker methodAnnotation = method.getAnnotation(Worker.class);
        if (methodAnnotation != null) {
            System.out.println("Method Worker: " + methodAnnotation.name());
            System.out.println("Priority: " + methodAnnotation.priority());
        }

        // 모든 어노테이션 조회
        Annotation[] annotations = method.getAnnotations();
        for (Annotation annotation : annotations) {
            System.out.println("Found: " + annotation.annotationType().getName());
        }
    }
}
```

---

## 실전 예제 1: 유효성 검증 어노테이션

어노테이션 기반 검증이 어떻게 동작하는지 이해하기 위해 직접 구현해보자.

### 커스텀 구현 (학습용)

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface NotEmpty {
    String message() default "값이 비어있습니다.";
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface Min {
    int value();
    String message() default "최소값보다 작습니다.";
}
```

```java
public class Validator {
    public static List<String> validate(Object obj) throws IllegalAccessException {
        List<String> errors = new ArrayList<>();
        for (Field field : obj.getClass().getDeclaredFields()) {
            field.setAccessible(true);
            Object value = field.get(obj);

            if (field.isAnnotationPresent(NotEmpty.class)) {
                NotEmpty ann = field.getAnnotation(NotEmpty.class);
                if (value == null || value.toString().trim().isEmpty()) {
                    errors.add(field.getName() + ": " + ann.message());
                }
            }
            if (field.isAnnotationPresent(Min.class)) {
                Min ann = field.getAnnotation(Min.class);
                if (value instanceof Number && ((Number) value).intValue() < ann.value()) {
                    errors.add(field.getName() + ": " + ann.message());
                }
            }
        }
        return errors;
    }
}
```

### Jakarta Bean Validation (표준 API)

실무에서는 직접 구현하지 않고 **Jakarta Bean Validation (JSR 380)**을 사용한다.

**의존성 추가:**

```xml
<!-- Maven -->
<dependency>
    <groupId>org.hibernate.validator</groupId>
    <artifactId>hibernate-validator</artifactId>
    <version>8.0.1.Final</version>
</dependency>
<dependency>
    <groupId>org.glassfish.expressly</groupId>
    <artifactId>expressly</artifactId>
    <version>5.0.0</version>
</dependency>
```

```groovy
// Gradle (Spring Boot는 자동 포함)
implementation 'org.springframework.boot:spring-boot-starter-validation'
```

### 표준 검증 어노테이션

| 어노테이션 | 설명 |
|-----------|------|
| `@NotNull` | null 불가 |
| `@NotEmpty` | null, 빈 문자열, 빈 컬렉션 불가 |
| `@NotBlank` | null, 빈 문자열, 공백만 있는 문자열 불가 |
| `@Size(min, max)` | 문자열/컬렉션 크기 제한 |
| `@Min(value)` | 최소값 |
| `@Max(value)` | 최대값 |
| `@Email` | 이메일 형식 |
| `@Pattern(regexp)` | 정규식 패턴 |
| `@Positive` | 양수만 허용 |
| `@PositiveOrZero` | 0 또는 양수 |
| `@Past` / `@Future` | 과거/미래 날짜 |

### @NotNull vs @NotEmpty vs @NotBlank 비교

자주 혼동되는 세 가지 어노테이션의 차이:

| 값 | @NotNull | @NotEmpty | @NotBlank |
|----|----------|-----------|-----------|
| `null` | 실패 | 실패 | 실패 |
| `""` (빈 문자열) | 통과 | 실패 | 실패 |
| `"   "` (공백만) | 통과 | 통과 | 실패 |
| `"abc"` | 통과 | 통과 | 통과 |

```java
// @NotNull: null만 불가, 빈 문자열/공백은 허용
@NotNull
private String field1;  // null ✗, "" ✓, "   " ✓

// @NotEmpty: null과 빈 값 불가, 공백만 있는 문자열은 허용
@NotEmpty
private String field2;  // null ✗, "" ✗, "   " ✓

// @NotBlank: null, 빈 값, 공백만 있는 문자열 모두 불가
@NotBlank
private String field3;  // null ✗, "" ✗, "   " ✗
```

**적용 대상:**
- `@NotNull`: 모든 타입
- `@NotEmpty`: String, Collection, Map, 배열
- `@NotBlank`: String만

### 사용 예시

```java
import jakarta.validation.constraints.*;

public class UserRequest {

    @NotBlank(message = "이름은 필수입니다")
    @Size(min = 2, max = 50, message = "이름은 2~50자여야 합니다")
    private String name;

    @Min(value = 1, message = "나이는 1 이상이어야 합니다")
    @Max(value = 150, message = "나이는 150 이하여야 합니다")
    private int age;

    @NotBlank(message = "이메일은 필수입니다")
    @Email(message = "올바른 이메일 형식이 아닙니다")
    private String email;

    @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호 형식이 올바르지 않습니다")
    private String phone;

    // getter, setter
}
```

### 프로그래밍 방식 검증

```java
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.ConstraintViolation;

public class ValidationExample {
    public static void main(String[] args) {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        Validator validator = factory.getValidator();

        UserRequest user = new UserRequest();
        user.setName("");
        user.setAge(-5);
        user.setEmail("invalid-email");

        Set<ConstraintViolation<UserRequest>> violations = validator.validate(user);

        for (ConstraintViolation<UserRequest> violation : violations) {
            System.out.println(violation.getPropertyPath() + ": " + violation.getMessage());
        }
        // 출력:
        // name: 이름은 필수입니다
        // age: 나이는 1 이상이어야 합니다
        // email: 올바른 이메일 형식이 아닙니다
    }
}
```

### Spring Controller에서 사용

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @PostMapping
    public ResponseEntity<?> createUser(@Valid @RequestBody UserRequest request,
                                        BindingResult bindingResult) {
        if (bindingResult.hasErrors()) {
            List<String> errors = bindingResult.getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .toList();
            return ResponseEntity.badRequest().body(errors);
        }
        // 사용자 생성 로직
        return ResponseEntity.ok("생성 완료");
    }
}
```

### 커스텀 Validator 만들기

표준 어노테이션으로 부족할 때 직접 만들 수 있다.

**1. 어노테이션 정의:**

```java
@Documented
@Constraint(validatedBy = PhoneNumberValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface PhoneNumber {
    String message() default "올바른 전화번호 형식이 아닙니다";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

**2. Validator 구현:**

```java
public class PhoneNumberValidator implements ConstraintValidator<PhoneNumber, String> {

    private static final Pattern PHONE_PATTERN =
        Pattern.compile("^010-\\d{4}-\\d{4}$");

    @Override
    public void initialize(PhoneNumber constraintAnnotation) {
        // 초기화 로직 (필요 시)
    }

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isEmpty()) {
            return true;  // @NotBlank와 조합해서 사용
        }
        return PHONE_PATTERN.matcher(value).matches();
    }
}
```

**3. 사용:**

```java
public class ContactRequest {
    @NotBlank
    @PhoneNumber
    private String phone;
}
```

### 그룹별 검증 (Validation Groups)

```java
// 검증 그룹 인터페이스
public interface OnCreate {}
public interface OnUpdate {}

public class UserRequest {
    @Null(groups = OnCreate.class)        // 생성 시 ID는 null
    @NotNull(groups = OnUpdate.class)     // 수정 시 ID는 필수
    private Long id;

    @NotBlank(groups = {OnCreate.class, OnUpdate.class})
    private String name;
}

// Controller에서 그룹 지정
@PostMapping
public void create(@Validated(OnCreate.class) @RequestBody UserRequest request) { }

@PutMapping
public void update(@Validated(OnUpdate.class) @RequestBody UserRequest request) { }
```

---

## 실전 예제 2: 실행 시간 측정 어노테이션

### 어노테이션 정의

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Timer {
    String value() default "";  // 로그에 표시할 이름
}
```

### 프록시 기반 처리기 (순수 Java)

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

public class TimerProxy implements InvocationHandler {
    private final Object target;

    public TimerProxy(Object target) {
        this.target = target;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        Method targetMethod = target.getClass().getMethod(
            method.getName(), method.getParameterTypes());

        if (targetMethod.isAnnotationPresent(Timer.class)) {
            Timer timer = targetMethod.getAnnotation(Timer.class);
            String name = timer.value().isEmpty() ? method.getName() : timer.value();

            long start = System.currentTimeMillis();
            Object result = method.invoke(target, args);
            long end = System.currentTimeMillis();

            System.out.println("[" + name + "] 실행 시간: " + (end - start) + "ms");
            return result;
        }
        return method.invoke(target, args);
    }

    @SuppressWarnings("unchecked")
    public static <T> T createProxy(T target, Class<T> interfaceType) {
        return (T) Proxy.newProxyInstance(
            interfaceType.getClassLoader(),
            new Class<?>[] { interfaceType },
            new TimerProxy(target)
        );
    }
}
```

### 사용 예시

```java
public interface OrderService {
    void processOrder(String orderId);
    void cancelOrder(String orderId);
}

public class OrderServiceImpl implements OrderService {

    @Timer("주문 처리")
    @Override
    public void processOrder(String orderId) {
        try {
            Thread.sleep(500);  // 처리 시뮬레이션
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("주문 처리 완료: " + orderId);
    }

    @Override
    public void cancelOrder(String orderId) {
        System.out.println("주문 취소: " + orderId);
    }
}

// 실행
public class Main {
    public static void main(String[] args) {
        OrderService service = TimerProxy.createProxy(
            new OrderServiceImpl(), OrderService.class);

        service.processOrder("ORD-001");
        // 출력:
        // 주문 처리 완료: ORD-001
        // [주문 처리] 실행 시간: 502ms

        service.cancelOrder("ORD-002");
        // 출력: 주문 취소: ORD-002
    }
}
```

---

## 실전 예제 3: 의존성 주입 어노테이션

### 어노테이션 정의

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Component {
    String value() default "";
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface Inject { }
```

### 간단한 DI 컨테이너 구현

```java
public class SimpleContainer {
    private Map<Class<?>, Object> beans = new HashMap<>();

    public void scan(String packageName) throws Exception {
        // 패키지 내 클래스 스캔 (간소화된 버전)
        // 실제로는 ClassLoader를 사용해 클래스를 찾음
    }

    public void register(Class<?> clazz) throws Exception {
        if (clazz.isAnnotationPresent(Component.class)) {
            Object instance = clazz.getDeclaredConstructor().newInstance();
            beans.put(clazz, instance);
            System.out.println("Bean 등록: " + clazz.getSimpleName());
        }
    }

    public void injectDependencies() throws IllegalAccessException {
        for (Object bean : beans.values()) {
            for (Field field : bean.getClass().getDeclaredFields()) {
                if (field.isAnnotationPresent(Inject.class)) {
                    field.setAccessible(true);
                    Object dependency = beans.get(field.getType());
                    if (dependency != null) {
                        field.set(bean, dependency);
                        System.out.println("의존성 주입: " +
                            bean.getClass().getSimpleName() + "." + field.getName());
                    }
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    public <T> T getBean(Class<T> clazz) {
        return (T) beans.get(clazz);
    }
}
```

### 사용 예시

```java
@Component
public class UserRepository {
    public String findUser(Long id) {
        return "User-" + id;
    }
}

@Component
public class UserService {
    @Inject
    private UserRepository userRepository;

    public void printUser(Long id) {
        System.out.println(userRepository.findUser(id));
    }
}

// 실행
public class Main {
    public static void main(String[] args) throws Exception {
        SimpleContainer container = new SimpleContainer();
        container.register(UserRepository.class);
        container.register(UserService.class);
        container.injectDependencies();

        UserService userService = container.getBean(UserService.class);
        userService.printUser(1L);
        // 출력: User-1
    }
}
```

---

## Spring Framework의 어노테이션 처리

### @Component 어노테이션

```java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Indexed
public @interface Component {
    String value() default "";
}
```

### 컴포넌트 스캔 동작 원리

Spring은 `ClassPathBeanDefinitionScanner`를 사용해 클래스패스를 스캔한다.

```java
public class ClassPathBeanDefinitionScanner
    extends ClassPathScanningCandidateComponentProvider {

    protected Set<BeanDefinitionHolder> doScan(String... basePackages) {
        Set<BeanDefinitionHolder> beanDefinitions = new LinkedHashSet<>();

        for (String basePackage : basePackages) {
            // 1. 후보 컴포넌트 찾기
            Set<BeanDefinition> candidates = findCandidateComponents(basePackage);

            for (BeanDefinition candidate : candidates) {
                // 2. 스코프 메타데이터 결정
                ScopeMetadata scopeMetadata =
                    this.scopeMetadataResolver.resolveScopeMetadata(candidate);
                candidate.setScope(scopeMetadata.getScopeName());

                // 3. 빈 이름 생성
                String beanName = this.beanNameGenerator
                    .generateBeanName(candidate, this.registry);

                // 4. 공통 어노테이션 처리 (@Lazy, @Primary, @DependsOn 등)
                if (candidate instanceof AnnotatedBeanDefinition) {
                    AnnotationConfigUtils.processCommonDefinitionAnnotations(
                        (AnnotatedBeanDefinition) candidate);
                }

                // 5. 빈 등록
                if (checkCandidate(beanName, candidate)) {
                    BeanDefinitionHolder definitionHolder =
                        new BeanDefinitionHolder(candidate, beanName);
                    beanDefinitions.add(definitionHolder);
                    registerBeanDefinition(definitionHolder, this.registry);
                }
            }
        }
        return beanDefinitions;
    }
}
```

### 스캔 과정 요약

```
1. basePackage 하위의 모든 .class 파일 탐색
2. 각 클래스의 어노테이션 메타데이터 읽기
3. @Component (또는 파생 어노테이션) 확인
4. BeanDefinition 생성 및 등록
5. 의존성 주입 처리 (@Autowired, @Inject 등)
```

---

## Spring의 BeanPostProcessor

Bean 생성 전후에 커스텀 로직을 실행할 수 있다.

### 커스텀 어노테이션 처리 예제

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface LogInjection { }
```

```java
@org.springframework.stereotype.Component
public class LogInjectionBeanPostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) {
        Class<?> clazz = bean.getClass();

        for (Field field : clazz.getDeclaredFields()) {
            if (field.isAnnotationPresent(LogInjection.class)
                    && field.getType().equals(Logger.class)) {
                field.setAccessible(true);
                try {
                    Logger logger = LoggerFactory.getLogger(clazz);
                    field.set(bean, logger);
                } catch (IllegalAccessException e) {
                    throw new RuntimeException(e);
                }
            }
        }
        return bean;
    }
}
```

```java
@Service
public class MyService {
    @LogInjection
    private Logger log;  // 자동으로 Logger 주입됨

    public void doSomething() {
        log.info("작업 수행");
    }
}
```

---

## Spring AOP를 활용한 어노테이션 처리

### 커스텀 어노테이션

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Retry {
    int maxAttempts() default 3;
    long delay() default 1000;
}
```

### Aspect 구현

```java
@Aspect
@Component
public class RetryAspect {

    @Around("@annotation(retry)")
    public Object retry(ProceedingJoinPoint joinPoint, Retry retry) throws Throwable {
        int maxAttempts = retry.maxAttempts();
        long delay = retry.delay();
        Exception lastException = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return joinPoint.proceed();
            } catch (Exception e) {
                lastException = e;
                System.out.println("시도 " + attempt + "/" + maxAttempts +
                    " 실패: " + e.getMessage());

                if (attempt < maxAttempts) {
                    Thread.sleep(delay);
                }
            }
        }
        throw lastException;
    }
}
```

### 사용 예시

```java
@Service
public class ExternalApiService {

    @Retry(maxAttempts = 3, delay = 2000)
    public String callExternalApi() {
        // 불안정한 외부 API 호출
        if (Math.random() < 0.7) {
            throw new RuntimeException("API 호출 실패");
        }
        return "성공!";
    }
}
```

### 실무 예제: API 응답 래핑 AOP

실제 프로젝트에서 사용하는 AOP 패턴이다. 모든 Controller 메서드의 응답을 일관된 형식으로 래핑하고, 실행 시간과 세션 정보를 함께 반환한다.

**공통 Aspect 클래스:**

```java
public class ApiControllerAspect {

    public Object apiAroundProceeding(ProceedingJoinPoint proceedingJoinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        return ApiResponse.of(
            proceedingJoinPoint.proceed(),
            getSession(),
            System.currentTimeMillis() - startTime
        );
    }

    protected Session getSession() {
        ServletRequestAttributes servletRequestAttributes =
            (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (servletRequestAttributes == null) {
            return null;
        }
        return (Session) servletRequestAttributes.getAttribute(
            SessionLoadInterceptor.REQ_ATTR_SESSION,
            RequestAttributes.SCOPE_REQUEST
        );
    }
}
```

**모듈별 Aspect 구현:**

```java
@Aspect
@Component
public class AppApiAspect extends ApiControllerAspect {

    @Around("execution(* com.xxx.aaa.ccc.api.controller..*Controller.*(..))")
    public Object apiResult(ProceedingJoinPoint proceedingJoinPoint) throws Throwable {
        return apiAroundProceeding(proceedingJoinPoint);
    }
}
```

**핵심 포인트:**

| 요소 | 설명 |
|------|------|
| `execution(* ..controller..*Controller.*(..))` | controller 패키지 하위의 모든 Controller 클래스의 모든 메서드 |
| `ProceedingJoinPoint` | @Around에서 원본 메서드 실행 제어 |
| `RequestContextHolder` | 현재 요청 컨텍스트에서 세션 정보 조회 |
| 상속 구조 | 공통 로직은 부모 클래스에, 포인트컷만 자식에서 정의 |

이 패턴의 장점:
- **일관된 응답 형식**: 모든 API가 동일한 구조로 응답
- **횡단 관심사 분리**: 실행 시간 측정, 세션 정보 첨부 등을 비즈니스 로직과 분리
- **재사용성**: 공통 Aspect를 상속받아 모듈별로 포인트컷만 변경

---

## 커스텀 어노테이션 설계 패턴

### 1. 조합 어노테이션 (Composed Annotation)

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Service
@Transactional
public @interface TransactionalService { }

// 사용
@TransactionalService
public class OrderService {
    // @Service + @Transactional 효과
}
```

### 2. 조건부 어노테이션

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Conditional(OnProductionCondition.class)
public @interface ProductionOnly { }

public class OnProductionCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String profile = context.getEnvironment().getProperty("spring.profiles.active");
        return "production".equals(profile);
    }
}
```

### 3. 메타 어노테이션으로 확장

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Component
public @interface Repository { }

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Component
public @interface Service { }

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Component
public @interface Controller { }

// 모두 @Component를 포함하므로 컴포넌트 스캔 대상
```

---

## 정리

| 처리 시점 | 방식 | 예시 |
|----------|------|------|
| **컴파일 타임** | Annotation Processor | Lombok, MapStruct |
| **클래스 로딩** | 바이트코드 조작 | AspectJ weaving |
| **런타임** | 리플렉션 | Spring, Hibernate |

### 어노테이션 설계 체크리스트

```
1. @Retention 결정 - 언제까지 유지할 것인가?
2. @Target 결정 - 어디에 적용할 것인가?
3. 속성 정의 - 어떤 설정이 필요한가?
4. 기본값 설정 - default 값이 필요한가?
5. 처리 방식 결정 - 리플렉션? AOP? BeanPostProcessor?
```

> 어노테이션은 **메타데이터**일 뿐이다.
> 실제 동작은 **리플렉션**, **AOP**, **프록시** 등을 통해 구현된다.
> 어노테이션을 직접 만들어보면 Spring의 마법 같은 기능들이 어떻게 동작하는지 이해할 수 있다.
