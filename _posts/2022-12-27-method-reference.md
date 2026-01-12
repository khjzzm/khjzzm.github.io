---
layout: post
title: Java 메서드 레퍼런스 완벽 가이드
tags: [java]
---

메서드 레퍼런스(Method Reference)는 Java 8에서 도입된 기능으로, 람다 표현식을 더 간결하게 작성하는 방법이다. `클래스::메서드명` 구문을 사용해 기존 메서드를 참조한다.

---

## 람다 vs 메서드 레퍼런스

```java
// 람다 표현식
str -> str.toString()
str -> str.length()
(a, b) -> a.compareTo(b)
x -> System.out.println(x)

// 메서드 레퍼런스
Object::toString
String::length
Integer::compareTo
System.out::println
```

> 메서드 레퍼런스는 람다의 **축약형**이다. 람다가 단순히 기존 메서드를 호출하는 경우 사용할 수 있다.

---

## 메서드 레퍼런스 4가지 유형

| 유형 | 문법 | 예시 |
|------|------|------|
| 정적 메서드 | `Class::staticMethod` | `Integer::parseInt` |
| 인스턴스 메서드 (특정 객체) | `instance::method` | `System.out::println` |
| 인스턴스 메서드 (임의 객체) | `Class::instanceMethod` | `String::length` |
| 생성자 | `Class::new` | `ArrayList::new` |

---

## 1. 정적 메서드 참조

`ClassName::staticMethodName`

클래스의 정적 메서드를 참조한다.

```java
// 람다
Function<String, Integer> parser1 = s -> Integer.parseInt(s);

// 메서드 레퍼런스
Function<String, Integer> parser2 = Integer::parseInt;

// 사용
List<String> numbers = List.of("1", "2", "3", "4", "5");
List<Integer> parsed = numbers.stream()
    .map(Integer::parseInt)
    .toList();
```

### 다양한 예시

```java
// Math 클래스
Function<Double, Double> abs = Math::abs;
BinaryOperator<Integer> max = Math::max;
BinaryOperator<Integer> min = Math::min;

// Collections
Comparator<Integer> naturalOrder = Comparator::naturalOrder;

// 직접 정의한 정적 메서드
public class StringUtils {
    public static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}

Predicate<String> blankCheck = StringUtils::isBlank;
```

---

## 2. 특정 객체의 인스턴스 메서드 참조

`instance::instanceMethodName`

이미 존재하는 특정 객체의 인스턴스 메서드를 참조한다.

```java
// 람다
Consumer<String> printer1 = s -> System.out.println(s);

// 메서드 레퍼런스
Consumer<String> printer2 = System.out::println;

// 사용
List.of("A", "B", "C").forEach(System.out::println);
```

### 다양한 예시

```java
// StringBuilder 인스턴스
StringBuilder sb = new StringBuilder();
Consumer<String> appender = sb::append;

List.of("Hello", " ", "World").forEach(sb::append);
System.out.println(sb);  // "Hello World"

// 특정 인스턴스의 메서드
String prefix = "Mr. ";
Function<String, String> addPrefix = prefix::concat;
System.out.println(addPrefix.apply("Kim"));  // "Mr. Kim"

// Comparator 사용
Collator collator = Collator.getInstance(Locale.KOREAN);
List<String> names = List.of("가", "나", "다");
names.stream()
    .sorted(collator::compare)
    .forEach(System.out::println);
```

---

## 3. 임의 객체의 인스턴스 메서드 참조

`ClassName::instanceMethodName`

특정 타입의 임의 객체에 대해 인스턴스 메서드를 참조한다. 첫 번째 파라미터가 메서드를 호출하는 객체가 된다.

```java
// 람다
Function<String, Integer> len1 = s -> s.length();
BiFunction<String, String, Boolean> eq1 = (s1, s2) -> s1.equals(s2);

// 메서드 레퍼런스
Function<String, Integer> len2 = String::length;
BiPredicate<String, String> eq2 = String::equals;

// 사용
List<String> words = List.of("apple", "banana", "cherry");
List<Integer> lengths = words.stream()
    .map(String::length)
    .toList();  // [5, 6, 6]
```

### 람다로 변환하면?

```java
// String::length 는 다음과 동일
(String s) -> s.length()

// String::compareTo 는 다음과 동일
(String s1, String s2) -> s1.compareTo(s2)

// String::equals 는 다음과 동일
(String s1, Object s2) -> s1.equals(s2)
```

### 정렬 예시

```java
List<String> names = Arrays.asList("Charlie", "Alice", "Bob");

// 람다 
names.sort((s1, s2) -> s1.compareTo(s2));

// 메서드 레퍼런스
names.sort(String::compareTo);

// 대소문자 무시
names.sort(String::compareToIgnoreCase);
```

---

## 4. 생성자 참조

`ClassName::new`

생성자를 참조한다. 함수형 인터페이스의 파라미터에 따라 적절한 생성자가 선택된다.

```java
// 람다
Supplier<List<String>> supplier1 = () -> new ArrayList<>();
Function<Integer, List<String>> supplier2 = size -> new ArrayList<>(size);

// 메서드 레퍼런스
Supplier<List<String>> supplier3 = ArrayList::new;       // 기본 생성자
Function<Integer, List<String>> supplier4 = ArrayList::new;  // 파라미터 1개 생성자
```

### 객체 생성

```java
@AllArgsConstructor
@Data
public class Person {
    private String name;
    private int age;
}

// 람다
BiFunction<String, Integer, Person> creator1 = (name, age) -> new Person(name, age);

// 메서드 레퍼런스
BiFunction<String, Integer, Person> creator2 = Person::new;

// Stream에서 활용
List<String> names = List.of("Kim", "Lee", "Park");
List<Person> persons = names.stream()
    .map(name -> new Person(name, 0))  // 람다 필요 (추가 로직)
    .toList();
```

### 배열 생성자 참조

```java
// 람다
IntFunction<String[]> arrayCreator1 = size -> new String[size];

// 메서드 레퍼런스
IntFunction<String[]> arrayCreator2 = String[]::new;

// Stream을 배열로 변환
String[] array = Stream.of("a", "b", "c")
    .toArray(String[]::new);
```

---

## Stream API와 메서드 레퍼런스

### map

```java
List<String> names = List.of("alice", "bob", "charlie");

// 대문자 변환
List<String> upper = names.stream()
    .map(String::toUpperCase)
    .toList();

// 길이 추출
List<Integer> lengths = names.stream()
    .map(String::length)
    .toList();
```

### filter

```java
List<String> items = List.of("", "apple", null, "banana", "  ");

// null이 아닌 것만
List<String> nonNull = items.stream()
    .filter(Objects::nonNull)
    .toList();

// 빈 문자열 제외
List<String> nonEmpty = items.stream()
    .filter(Objects::nonNull)
    .filter(Predicate.not(String::isEmpty))
    .toList();
```

### sorted

```java
List<String> words = List.of("Banana", "apple", "Cherry");

// 자연 정렬
words.stream().sorted(String::compareTo);

// 대소문자 무시 정렬
words.stream().sorted(String::compareToIgnoreCase);

// 객체 정렬
List<Person> people = /* ... */;
people.stream()
    .sorted(Comparator.comparing(Person::getName))
    .toList();
```

### forEach

```java
List<String> items = List.of("A", "B", "C");

items.forEach(System.out::println);

// Map의 forEach
Map<String, Integer> map = Map.of("a", 1, "b", 2);
map.forEach((k, v) -> System.out.println(k + "=" + v));  // BiConsumer라 람다 필요
```

### reduce

```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5);

// 합계
int sum = numbers.stream()
    .reduce(0, Integer::sum);

// 최대값
Optional<Integer> max = numbers.stream()
    .reduce(Integer::max);

// 문자열 연결
List<String> words = List.of("Hello", "World");
String joined = words.stream()
    .reduce("", String::concat);
```

### collect

```java
// toList (Java 16+)
List<String> list = stream.toList();

// joining
String result = stream.collect(Collectors.joining(", "));

// groupingBy
Map<String, List<Person>> byCity = people.stream()
    .collect(Collectors.groupingBy(Person::getCity));
```

---

## Optional과 메서드 레퍼런스

```java
Optional<String> optional = Optional.of("hello");

// map
Optional<Integer> length = optional.map(String::length);

// filter
Optional<String> filtered = optional.filter(String::isEmpty);

// ifPresent
optional.ifPresent(System.out::println);

// orElseGet
String value = optional.orElseGet(String::new);

// or (Java 9+)
Optional<String> result = optional.or(() -> Optional.of("default"));
```

---

## Comparator와 메서드 레퍼런스

```java
@Data
public class Employee {
    private String name;
    private String department;
    private int salary;
}

List<Employee> employees = /* ... */;

// 이름순 정렬
employees.sort(Comparator.comparing(Employee::getName));

// 급여 역순 정렬
employees.sort(Comparator.comparing(Employee::getSalary).reversed());

// 부서 → 급여순 복합 정렬
employees.sort(
    Comparator.comparing(Employee::getDepartment)
              .thenComparing(Employee::getSalary)
);

// null 처리
employees.sort(
    Comparator.comparing(Employee::getName,
        Comparator.nullsLast(Comparator.naturalOrder()))
);
```

---

## 메서드 레퍼런스 사용 불가 케이스

### 1. 추가 로직이 필요한 경우

```java
// 람다 필요 - 추가 연산
list.stream()
    .map(s -> s.length() + 1)  // 메서드 레퍼런스 불가
    .toList();

// 람다 필요 - 조건부 로직
list.stream()
    .filter(s -> s != null && s.length() > 3)
    .toList();
```

### 2. 파라미터 순서가 다른 경우

```java
// 람다 필요
BiFunction<String, String, String> concat = (a, b) -> b.concat(a);
// String::concat은 (a, b) -> a.concat(b)
```

### 3. 인스턴스 생성 시 추가 설정

```java
// 람다 필요
Supplier<List<String>> supplier = () -> {
    List<String> list = new ArrayList<>();
    list.add("default");
    return list;
};
```

---

## this와 super 메서드 레퍼런스

```java
public class Parent {
    public void greet() {
        System.out.println("Hello from Parent");
    }
}

public class Child extends Parent {

    @Override
    public void greet() {
        System.out.println("Hello from Child");
    }

    public void demo() {
        Runnable r1 = this::greet;   // Child의 greet
        Runnable r2 = super::greet;  // Parent의 greet

        r1.run();  // "Hello from Child"
        r2.run();  // "Hello from Parent"
    }
}
```

---

## 실전 예제

### DTO 변환

```java
@Data
@AllArgsConstructor
public class UserDto {
    private String name;
    private String email;

    public static UserDto from(User user) {
        return new UserDto(user.getName(), user.getEmail());
    }
}

// 엔티티 → DTO 변환
List<UserDto> dtos = users.stream()
    .map(UserDto::from)
    .toList();
```

### Validator

```java
public class Validators {
    public static boolean isValidEmail(String email) {
        return email != null && email.contains("@");
    }

    public static boolean isNotBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}

// 유효성 검사
boolean allValid = users.stream()
    .map(User::getEmail)
    .allMatch(Validators::isValidEmail);
```

### Builder 패턴과 함께

```java
public interface EntityBuilder<T> {
    T build();
}

public <T> List<T> buildAll(List<EntityBuilder<T>> builders) {
    return builders.stream()
        .map(EntityBuilder::build)
        .toList();
}
```

---

## 정리

| 상황 | 람다 | 메서드 레퍼런스 |
|------|------|----------------|
| 기존 메서드 단순 호출 | `s -> s.length()` | `String::length` |
| 정적 메서드 호출 | `s -> Integer.parseInt(s)` | `Integer::parseInt` |
| 특정 객체 메서드 | `s -> out.println(s)` | `System.out::println` |
| 생성자 호출 | `() -> new ArrayList<>()` | `ArrayList::new` |
| 추가 로직 필요 | `s -> s.length() + 1` | 불가 |

### 선택 기준

```
1. 람다가 기존 메서드를 그대로 호출 → 메서드 레퍼런스
2. 추가 연산이나 조건이 필요 → 람다
3. 가독성이 더 좋은 쪽 선택
```

> 메서드 레퍼런스는 코드를 간결하게 만들지만, 때로는 람다가 더 명확할 수 있다.
> 팀의 코드 스타일과 가독성을 고려해 선택하자.
