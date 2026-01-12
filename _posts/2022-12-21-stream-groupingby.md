---
layout: post
title: Java Stream groupingBy 완벽 가이드
tags: [java]
---

`Collectors.groupingBy()`는 SQL의 GROUP BY와 유사하게 스트림 요소를 특정 기준으로 그룹화하는 강력한 수집기다.

---

## 기본 개념

### groupingBy 메서드 시그니처

```java
// 1. 기본 형태 - classifier만 지정
groupingBy(Function<? super T, ? extends K> classifier)

// 2. downstream 지정 - 그룹화된 결과를 추가 가공
groupingBy(Function<? super T, ? extends K> classifier,
           Collector<? super T, A, D> downstream)

// 3. mapFactory 지정 - 결과 Map 타입 지정
groupingBy(Function<? super T, ? extends K> classifier,
           Supplier<M> mapFactory,
           Collector<? super T, A, D> downstream)
```

| 파라미터 | 설명 |
|----------|------|
| classifier | 그룹화 기준 (Function) |
| downstream | 그룹 내 요소 집계 방식 (Collector) |
| mapFactory | 결과 Map 구현체 지정 (Supplier) |

---

## 예제 데이터

```java
@Data
@AllArgsConstructor
public class Product {
    private Long id;
    private String name;
    private String category;
    private int price;
    private int quantity;
}

List<Product> products = List.of(
    new Product(1L, "슈비버거", "버거", 3500, 10),
    new Product(2L, "슈슈버거", "버거", 3700, 15),
    new Product(3L, "오늘의초밥", "초밥", 5600, 8),
    new Product(4L, "연어초밥", "초밥", 5000, 12),
    new Product(5L, "치즈버거", "버거", 3700, 20),
    new Product(6L, "참치초밥", "초밥", 5600, 5),
    new Product(7L, "새우초밥", "초밥", 5000, 7),
    new Product(8L, "더블버거", "버거", 4500, 10)
);
```

---

## 기본 그룹화

### 단일 키로 그룹화

```java
// 카테고리별 상품 목록
Map<String, List<Product>> byCategory = products.stream()
    .collect(Collectors.groupingBy(Product::getCategory));

// 결과:
// {버거=[슈비버거, 슈슈버거, 치즈버거, 더블버거],
//  초밥=[오늘의초밥, 연어초밥, 참치초밥, 새우초밥]}
```

### 조건식으로 그룹화

```java
// 가격대별 분류
Map<String, List<Product>> byPriceRange = products.stream()
    .collect(Collectors.groupingBy(p -> {
        if (p.getPrice() < 4000) return "저가";
        else if (p.getPrice() < 5000) return "중가";
        else return "고가";
    }));
```

---

## 결과 타입 변경 (downstream)

### toSet() - 중복 제거

```java
// Set으로 수집
Map<String, Set<Product>> byCategorySet = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.toSet()
    ));
```

### mapping() - 특정 필드만 추출

```java
// 카테고리별 상품명 목록
Map<String, List<String>> namesByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.mapping(Product::getName, Collectors.toList())
    ));

// 결과: {버거=[슈비버거, 슈슈버거, 치즈버거, 더블버거], 초밥=[...]}
```

```java
// 카테고리별 상품명 (Set으로 중복 제거)
Map<String, Set<String>> uniqueNamesByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.mapping(Product::getName, Collectors.toSet())
    ));
```

### collectingAndThen() - 결과 변환

```java
// 그룹화 후 불변 리스트로 변환
Map<String, List<Product>> immutableGroups = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.collectingAndThen(
            Collectors.toList(),
            Collections::unmodifiableList
        )
    ));
```

---

## 통계 집계

### counting() - 개수

```java
// 카테고리별 상품 수
Map<String, Long> countByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.counting()
    ));
// {버거=4, 초밥=4}
```

### summingInt() - 합계

```java
// 카테고리별 총 재고
Map<String, Integer> totalQuantity = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.summingInt(Product::getQuantity)
    ));
// {버거=55, 초밥=32}
```

### averagingDouble() - 평균

```java
// 카테고리별 평균 가격
Map<String, Double> avgPrice = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.averagingDouble(Product::getPrice)
    ));
// {버거=3850.0, 초밥=5300.0}
```

### maxBy() / minBy() - 최대/최소

```java
// 카테고리별 최고가 상품
Map<String, Optional<Product>> mostExpensive = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.maxBy(Comparator.comparingInt(Product::getPrice))
    ));

// Optional 제거
Map<String, Product> mostExpensiveProduct = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.collectingAndThen(
            Collectors.maxBy(Comparator.comparingInt(Product::getPrice)),
            Optional::get
        )
    ));
```

### summarizingInt() - 종합 통계

```java
// 카테고리별 가격 통계 (count, sum, min, max, average)
Map<String, IntSummaryStatistics> priceStats = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.summarizingInt(Product::getPrice)
    ));

priceStats.forEach((category, stats) -> {
    System.out.println(category + ":");
    System.out.println("  개수: " + stats.getCount());
    System.out.println("  합계: " + stats.getSum());
    System.out.println("  평균: " + stats.getAverage());
    System.out.println("  최소: " + stats.getMin());
    System.out.println("  최대: " + stats.getMax());
});
```

---

## 복합 키 그룹화

### 다중 필드로 그룹화

```java
// 카테고리 + 가격으로 그룹화 (Map의 Key로 List 사용)
Map<List<Object>, List<Product>> byMultipleFields = products.stream()
    .collect(Collectors.groupingBy(p ->
        List.of(p.getCategory(), p.getPrice())
    ));
```

### Record를 키로 사용 (Java 16+)

```java
record ProductKey(String category, int price) {}

Map<ProductKey, List<Product>> byCompositeKey = products.stream()
    .collect(Collectors.groupingBy(p ->
        new ProductKey(p.getCategory(), p.getPrice())
    ));
```

### 클래스를 키로 사용

```java
@Data
@AllArgsConstructor
@EqualsAndHashCode  // 반드시 필요!
public class GroupKey {
    private String category;
    private int priceRange;
}

Map<GroupKey, List<Product>> byGroupKey = products.stream()
    .collect(Collectors.groupingBy(p ->
        new GroupKey(p.getCategory(), p.getPrice() / 1000 * 1000)
    ));
```

---

## 다단계 그룹화

### 2단계 그룹화

```java
// 카테고리 → 가격대로 2단계 그룹화
Map<String, Map<String, List<Product>>> twoLevel = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.groupingBy(p -> p.getPrice() < 4000 ? "저가" : "고가")
    ));

// 결과:
// {버거={저가=[슈비버거, 슈슈버거, 치즈버거], 고가=[더블버거]},
//  초밥={고가=[오늘의초밥, 연어초밥, 참치초밥, 새우초밥]}}
```

### 3단계 그룹화

```java
Map<String, Map<String, Map<Integer, List<Product>>>> threeLevel = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.groupingBy(
            p -> p.getPrice() < 4000 ? "저가" : "고가",
            Collectors.groupingBy(Product::getQuantity)
        )
    ));
```

---

## Map 구현체 지정

### LinkedHashMap - 순서 유지

```java
// 입력 순서 유지
Map<String, List<Product>> orderedByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        LinkedHashMap::new,
        Collectors.toList()
    ));
```

### TreeMap - 정렬

```java
// 키 기준 정렬
Map<String, List<Product>> sortedByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        TreeMap::new,
        Collectors.toList()
    ));
```

### ConcurrentHashMap - 병렬 처리

```java
// 병렬 스트림에서 사용
ConcurrentMap<String, List<Product>> concurrent = products.parallelStream()
    .collect(Collectors.groupingByConcurrent(Product::getCategory));
```

---

## 실전 예제

### JPA 쿼리 결과 그룹화

```java
// 주문 ID별 주문 상품 그룹화
private Map<Long, List<OrderItemDto>> findOrderItemMap(List<Long> orderIds) {
    List<OrderItemDto> orderItems = em.createQuery(
        "SELECT new com.example.OrderItemDto(oi.order.id, i.name, oi.price, oi.count) " +
        "FROM OrderItem oi " +
        "JOIN oi.item i " +
        "WHERE oi.order.id IN :orderIds", OrderItemDto.class)
        .setParameter("orderIds", orderIds)
        .getResultList();

    return orderItems.stream()
        .collect(Collectors.groupingBy(OrderItemDto::getOrderId));
}
```

### 날짜별 매출 집계

```java
@Data
public class Sale {
    private LocalDate date;
    private String product;
    private int amount;
}

// 월별 총 매출
Map<YearMonth, Integer> monthlySales = sales.stream()
    .collect(Collectors.groupingBy(
        s -> YearMonth.from(s.getDate()),
        Collectors.summingInt(Sale::getAmount)
    ));

// 요일별 평균 매출
Map<DayOfWeek, Double> avgByDayOfWeek = sales.stream()
    .collect(Collectors.groupingBy(
        s -> s.getDate().getDayOfWeek(),
        Collectors.averagingInt(Sale::getAmount)
    ));
```

### 부서별 직원 급여 통계

```java
@Data
public class Employee {
    private String name;
    private String department;
    private int salary;
}

// 부서별 급여 총합과 직원 수
Map<String, String> deptSummary = employees.stream()
    .collect(Collectors.groupingBy(
        Employee::getDepartment,
        Collectors.collectingAndThen(
            Collectors.summarizingInt(Employee::getSalary),
            stats -> String.format("인원: %d, 총급여: %,d, 평균: %,.0f",
                stats.getCount(), stats.getSum(), stats.getAverage())
        )
    ));
```

### Boolean 분할 (partitioningBy)

```java
// 가격 5000원 기준 분할
Map<Boolean, List<Product>> partitioned = products.stream()
    .collect(Collectors.partitioningBy(p -> p.getPrice() >= 5000));

List<Product> expensive = partitioned.get(true);
List<Product> cheap = partitioned.get(false);

// 분할 + 카운팅
Map<Boolean, Long> partitionCount = products.stream()
    .collect(Collectors.partitioningBy(
        p -> p.getPrice() >= 5000,
        Collectors.counting()
    ));
```

---

## reducing() 활용

```java
// 카테고리별 상품명 연결
Map<String, String> joinedNames = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.mapping(
            Product::getName,
            Collectors.joining(", ")
        )
    ));
// {버거=슈비버거, 슈슈버거, 치즈버거, 더블버거, 초밥=...}

// 카테고리별 가격 합계 (reducing 사용)
Map<String, Integer> totalByCategory = products.stream()
    .collect(Collectors.groupingBy(
        Product::getCategory,
        Collectors.reducing(0, Product::getPrice, Integer::sum)
    ));
```

---

## 정리

| 용도 | Collector |
|------|-----------|
| 리스트로 수집 | `toList()` |
| Set으로 수집 | `toSet()` |
| 개수 | `counting()` |
| 합계 | `summingInt/Long/Double()` |
| 평균 | `averagingInt/Long/Double()` |
| 최대/최소 | `maxBy()` / `minBy()` |
| 종합 통계 | `summarizingInt/Long/Double()` |
| 필드 추출 | `mapping()` |
| 문자열 연결 | `joining()` |
| 결과 변환 | `collectingAndThen()` |
| Boolean 분할 | `partitioningBy()` |

> `groupingBy`는 downstream Collector와 조합하면 SQL의 GROUP BY + 집계 함수와 동일한 기능을 수행한다.
> 복잡한 집계는 다단계 그룹화와 `collectingAndThen`을 활용하자.
