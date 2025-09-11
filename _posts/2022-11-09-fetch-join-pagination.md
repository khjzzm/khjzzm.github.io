---
layout: post
title: JPA fetch join 과 pagination
---

# JPA N+1 문제와 Fetch Join, 페이지네이션 완벽 가이드

## 목차
1. [N+1 문제의 이해](#1-n1-문제의-이해)
2. [Fetch Join의 원리와 한계](#2-fetch-join의-원리와-한계)  
3. [DISTINCT의 필요성과 동작 메커니즘](#3-distinct의-필요성과-동작-메커니즘)
4. [페이지네이션 문제와 원인](#4-페이지네이션-문제와-원인)
5. [실무 해결책과 최적화 전략](#5-실무-해결책과-최적화-전략)

---

## 1. N+1 문제의 이해

### 1.1 N+1 문제란?

N+1 문제는 ORM에서 발생하는 대표적인 성능 문제이다. 단순히 "1+N번 쿼리가 실행된다"라고 이해하기보다는, **JPA의 지연 로딩(Lazy Loading) 메커니즘과 영속성 컨텍스트의 동작 원리**를 이해해야 한다.

### 1.2 엔티티 구조 예시

```java
@Entity
public class Order {
    @Id
    private Long id;
    
    @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
    private List<OrderItem> orderItems = new ArrayList<>();
}

@Entity 
public class OrderItem {
    @Id
    private Long id;
    
    @ManyToOne
    @JoinColumn(name = "order_id")
    private Order order;
}
```

### 1.3 수도코드로 보는 N+1 문제 발생 과정

```pseudocode
// 1. 사용자가 주문 목록을 요청
List<Order> orders = orderRepository.findAll();

// 2. JPA/Hibernate의 내부 동작
function findAll() {
    // 2-1. 첫 번째 쿼리 실행
    query = "SELECT id, name, date FROM order"
    resultSet = database.execute(query)  // 1번째 쿼리
    
    orders = []
    for each row in resultSet {
        order = new Order()
        order.id = row.id
        order.name = row.name
        order.date = row.date
        
        // ❗️ 중요: orderItems는 아직 로드하지 않음 (LAZY)
        order.orderItems = LazyCollectionProxy.create(order.id)
        
        persistenceContext.put(order.id, order)  // 1차 캐시 저장
        orders.add(order)
    }
    
    return orders
}

// 3. 비즈니스 로직에서 주문 아이템 접근
for (Order order : orders) {
    // ❗️ 여기서 N+1 문제 발생!
    order.getOrderItems().size();  // Lazy Loading 트리거
}

// 4. getOrderItems() 호출 당 JPA 내부 동작
function getOrderItems(orderId) {
    // 4-1. 1차 캐시에서 확인
    if (!persistenceContext.isLoaded(orderId, "orderItems")) {
        // 4-2. 로드되지 않았다면 DB에서 조회
        query = "SELECT * FROM order_item WHERE order_id = ?"  // N번 실행!
        items = database.execute(query, orderId)
        
        orderItems = []
        for each item in items {
            orderItem = new OrderItem(item)
            orderItems.add(orderItem)
        }
        
        persistenceContext.setLoaded(orderId, "orderItems", orderItems)
    }
    
    return persistenceContext.get(orderId, "orderItems")
}
```

### 1.4 실제 실행되는 SQL 예시

```sql
-- 1번째: 주문 목록 조회 (1번)
SELECT id, name, order_date FROM order;
-- 결과: 100개의 Order 반환

-- 2번째부터: 각 Order의 OrderItem 조회 (N번)
SELECT * FROM order_item WHERE order_id = 1;  -- 1번째 Order
SELECT * FROM order_item WHERE order_id = 2;  -- 2번째 Order
SELECT * FROM order_item WHERE order_id = 3;  -- 3번째 Order
-- ... 100번 반복
SELECT * FROM order_item WHERE order_id = 100; -- 100번째 Order
```

**결과: 총 101번의 쿼리 실행 (1 + 100)**

### 1.5 N+1 문제의 발생 원인

1. **JPA의 지연 로딩 전략**: 성능 최적화를 위해 연관 데이터를 실제로 사용할 때까지 로딩을 지연
2. **영속성 컨텍스트의 동작**: 각 엔티티를 개별적으로 관리하여 연관 데이터 로딩 시점을 예측하기 어려움
3. **쿼리 최적화 부재**: 각 엔티티에 대해 개별 쿼리를 실행하여 일괄 처리 불가

### 1.6 다양한 N+1 문제 시나리오

```java
// 시나리오 1: 직접적인 연관 데이터 접근
List<Order> orders = orderRepository.findAll();
for (Order order : orders) {
    System.out.println(order.getOrderItems().size());  // N+1 발생
}

// 시나리오 2: JSON 직렬화 시
@GetMapping("/orders")
public List<Order> getOrders() {
    return orderService.findAll();  // Jackson이 orderItems 접근하여 N+1 발생
}

// 시나리오 3: 비즈니스 로직에서 조건부 접근
for (Order order : orders) {
    if (order.getOrderItems().isEmpty()) {  // N+1 발생
        // 처리 로직
    }
}
```

---

## 2. Fetch Join의 원리와 한계

### 2.1 Fetch Join이란?

Fetch join은 JPA에서 제공하는 특별한 조인 방식으로, N+1 문제를 해결하는 대표적인 방법이다.

### 2.2 일반 Join vs Fetch Join

#### 일반 Join
- 연관 Entity에 Join을 걸어도 실제 쿼리에서 SELECT 하는 Entity는 오직 JPQL에서 조회하는 주체가 되는 Entity만 조회하여 영속화
- 조회의 주체가 되는 Entity만 SELECT 해서 영속화하기 때문에 데이터는 필요하지 않지만 연관 Entity가 검색조건에는 필요한 경우에 주로 사용됨

#### Fetch Join
- 조회의 주체가 되는 Entity 이외에 Fetch Join이 걸린 연관 Entity도 함께 SELECT 하여 모두 영속화
- Fetch Join이 걸린 Entity 모두 영속화하기 때문에 FetchType이 Lazy인 Entity를 참조하더라도 이미 영속성 컨텍스트에 들어있기 때문에 따로 쿼리가 실행되지 않은 채로 N+1문제가 해결됨

### 2.3 Fetch Join의 한계점

1. **페치 조인 대상에 별칭을 줄 수 없다**
2. **둘 이상의 컬렉션은 페치 조인 할 수 없다** (일대다, 다대다의 문제)
   - 일대일, 다대일 같은 경우 데이터 뻥튀기에 의해 N대다는 fetch join 자체가 위험하다
   - 구현체에 따라 되기도 하는데 컬렉션 * 컬렉션 카테시안 곱이 만들어진다 (하이버네이트를 사용하면 예외발생)
3. **컬렉션 페치조인을 할 경우 페이징 처리가 힘들다**

---

## 3. DISTINCT의 필요성과 동작 메커니즘

### 3.1 수도코드로 보는 fetch join의 문제점

```pseudocode
// 1. JPQL fetch join 실행
query = "SELECT o FROM Order o JOIN FETCH o.orderItems"

// 2. Hibernate의 ResultSet 처리 과정
function processResultSet(resultSet) {
    orders = []
    currentOrder = null
    
    for each row in resultSet {
        // 3. 각 row마다 Order 객체 생성 (중복!)
        if (currentOrder == null || currentOrder.id != row.order_id) {
            currentOrder = new Order()
            currentOrder.id = row.order_id
            currentOrder.name = row.order_name
            currentOrder.orderItems = []
            
            orders.add(currentOrder)  // ❗️ 문제: 같은 Order가 여러 번 추가됨
        }
        
        // 4. OrderItem 객체 생성 및 추가
        orderItem = new OrderItem()
        orderItem.id = row.item_id
        orderItem.name = row.item_name
        
        currentOrder.orderItems.add(orderItem)
    }
    
    return orders
}

// 결과: [Order1, Order1, Order2] - Order1이 중복됨!
```

### 3.2 DISTINCT 없을 때의 문제

```java
// DISTINCT 없는 경우
@Query("SELECT o FROM Order o JOIN FETCH o.orderItems")
List<Order> findOrdersWithItems();

// 결과: Order 객체가 중복되어 반환
// [Order(id=1, name="주문1"), Order(id=1, name="주문1"), Order(id=2, name="주문2")]
```

### 3.3 JPA의 DISTINCT 동작 메커니즘

```pseudocode
// DISTINCT가 추가된 경우의 JPA 처리
query = "SELECT DISTINCT o FROM Order o JOIN FETCH o.orderItems"

function processResultSetWithDistinct(resultSet) {
    orderMap = new HashMap()  // 중복 제거용 Map
    
    for each row in resultSet {
        orderId = row.order_id
        
        // 5. 이미 처리된 Order인지 확인
        if (!orderMap.contains(orderId)) {
            order = new Order()
            order.id = row.order_id
            order.name = row.order_name
            order.orderItems = []
            
            orderMap.put(orderId, order)
        }
        
        currentOrder = orderMap.get(orderId)
        
        // 6. OrderItem 중복 체크 후 추가
        orderItem = new OrderItem()
        orderItem.id = row.item_id
        orderItem.name = row.item_name
        
        if (!currentOrder.orderItems.contains(orderItem)) {
            currentOrder.orderItems.add(orderItem)
        }
    }
    
    return orderMap.values()  // 중복 제거된 Order 목록 반환
}
```

### 3.4 SQL DISTINCT vs JPA DISTINCT의 차이점

```sql
-- 1. SQL DISTINCT: 모든 컬럼이 같아야 중복 제거
SELECT DISTINCT o.id, o.name, oi.id, oi.name
FROM order o JOIN order_item oi ON o.id = oi.order_id

-- 결과: 여전히 중복 row 존재 (item_id가 다르기 때문)
-- | 1 | 주문1 | 1 | 상품A |
-- | 1 | 주문1 | 2 | 상품B |  ← SQL 관점에서는 다른 row
```

```java
// 2. JPA DISTINCT: 엔티티 식별자 기준으로 중복 제거
@Query("SELECT DISTINCT o FROM Order o JOIN FETCH o.orderItems")
List<Order> findOrdersWithItems();

// 결과: Order 엔티티 중복 제거됨
// [Order(id=1), Order(id=2)]  ← JPA가 애플리케이션 레벨에서 중복 제거
```

### 3.5 실무에서의 DISTINCT 사용 패턴

```java
// ✅ 올바른 사용: 컬렉션 fetch join + DISTINCT
@Query("SELECT DISTINCT o FROM Order o JOIN FETCH o.orderItems WHERE o.status = :status")
List<Order> findActiveOrdersWithItems(@Param("status") OrderStatus status);

// ❌ 잘못된 사용: DISTINCT 없이 컬렉션 fetch join
@Query("SELECT o FROM Order o JOIN FETCH o.orderItems WHERE o.status = :status")
List<Order> findActiveOrdersWithItemsWrong(@Param("status") OrderStatus status);

// ✅ 안전한 사용: ToOne 관계는 DISTINCT 불필요
@Query("SELECT o FROM Order o JOIN FETCH o.member WHERE o.status = :status")
List<Order> findActiveOrdersWithMember(@Param("status") OrderStatus status);
```

---

## 4. 페이지네이션 문제와 원인

### 4.1 페이지네이션 문제 상황

일대다 연관관계에서 페치조인과 페이징을 함께 사용할 때 문제가 발생한다.

- 일대일, 다대일 연관관계는 페치조인을 사용해도 페이징API를 문제없이 사용할 수 있다 (데이터가 완전히 다르기 때문에 식별자는 항상 다르다)
- 하이버네이트에서 컬렉션 페치 조인을 하고 페이징API를 사용하면 `HHH000104: firstResult/maxResults specified with collection fetch; applying in memory!` 경고를 발생한다

### 4.2 페이지네이션 문제의 원인

실제 query를 확인해보면 페이징 쿼리(limit, offset)가 없는게 확인된다. 이는 조회된 모든 데이터를 메모리에 올리고 메모리에서 페이징 처리를 진행한다. 데이터가 적으면 상관없지만 많을 경우 OutOfMemoryError가 발생할 수 있다.

**왜 이런 문제가 발생할까?**

일대다 관계에서 fetch join을 하면 데이터가 중복되어 조회된다:

```sql
-- Order와 OrderItem을 fetch join한 경우
SELECT o.*, oi.* 
FROM order o 
INNER JOIN order_item oi ON o.id = oi.order_id
```

| order_id | order_name | item_id | item_name |
|----------|------------|---------|----------|
| 1        | 주문1      | 1       | 상품A    |
| 1        | 주문1      | 2       | 상품B    |
| 2        | 주문2      | 3       | 상품C    |

이때 LIMIT 10을 걸면 Order 엔티티 10개가 아니라 조인된 row 10개를 가져오게 된다. 
Hibernate는 이 문제를 해결하기 위해 모든 데이터를 메모리에 올린 후 애플리케이션 레벨에서 페이징을 수행한다.

---

## 5. 실무 해결책과 최적화 전략

### 5.1 @BatchSize와 default_batch_fetch_size (권장)

가장 실용적인 해결책은 BatchSize 옵션을 설정하여 컬렉션들을 지연로딩 하는 방법이다.

**동작 원리:**
- 설정한 사이즈만큼 데이터를 미리 로딩
- IN 쿼리를 이용해서 한번에 여러 데이터를 조회
- N+1 문제를 1+1(연관된 테이블 수만큼)로 개선

**예시:**
```java
// BatchSize 적용 전: 1 + N번의 쿼리
List<Order> orders = orderRepository.findAll(); // 1번째 쿼리
for (Order order : orders) {
    order.getOrderItems().size(); // 각 Order마다 쿼리 실행 (N번)
}

// BatchSize 적용 후: 1 + 1번의 쿼리
SELECT * FROM order; -- 1번째 쿼리
SELECT * FROM order_item WHERE order_id IN (?, ?, ?, ...); -- 2번째 쿼리 (IN절로 일괄 조회)
``` 

#### 글로벌 설정
```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=100
```
사이즈는 보통 100~1000 정도가 적당하다고 한다.

#### 개별 적용
```java
// 컬렉션에 적용 (ToMany 관계)
@Entity
public class Order {
    @BatchSize(size = 100)
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> orderItems = new ArrayList<>();
}

// 엔티티 클래스에 적용 (ToOne 관계)
@Entity
@BatchSize(size = 100)
public class OrderItem {
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;
}
```

- **ToMany 관계**: 컬렉션 필드에 적용
- **ToOne 관계**: 대상 엔티티 클래스에 적용

### 5.2 기타 해결책들

#### 5.2.1 Fetch Join 사용 (페이징 불가)
```java
@Query("SELECT DISTINCT o FROM Order o JOIN FETCH o.orderItems")
List<Order> findOrdersWithItems();
```

#### 5.2.2 @EntityGraph 사용
```java
@EntityGraph(attributePaths = {"orderItems"})
@Query("SELECT o FROM Order o")
Page<Order> findOrdersWithItems(Pageable pageable);
```

#### 5.2.3 DTO 프로젝션 사용
```java
@Query("SELECT new com.example.OrderDto(o.id, o.name, oi.name) " +
       "FROM Order o JOIN o.orderItems oi")
Page<OrderDto> findOrderDtos(Pageable pageable);
```

### 5.3 페이지네이션과 함께 사용하기

**권장 방법: BatchSize + 페이징**
```java
@Repository
public class OrderRepository {
    
    // 1. 페이징으로 Order만 조회
    public Page<Order> findOrders(Pageable pageable) {
        return orderRepository.findAll(pageable);
    }
    
    // 2. BatchSize로 OrderItem들을 지연 로딩
    // 컨트롤러에서 사용
    @Transactional(readOnly = true)
    public Page<Order> findOrdersWithItems(Pageable pageable) {
        Page<Order> orders = orderRepository.findAll(pageable);
        
        // 지연 로딩 트리거 (BatchSize가 적용됨)
        orders.getContent().forEach(order -> order.getOrderItems().size());
        
        return orders;
    }
}
```

**성능 비교:**
- **Fetch Join + 페이징**: 메모리 문제 발생 가능
- **BatchSize + 페이징**: 안전하고 효율적
- **일반 조회**: N+1 문제 발생

### 5.4 실무 권장사항

1. **글로벌 설정 우선 적용**
   ```properties
   spring.jpa.properties.hibernate.default_batch_fetch_size=100
   ```

2. **특별한 경우에만 개별 설정**
   - 특정 엔티티만 다른 배치 사이즈가 필요한 경우
   
3. **배치 사이즈 선택 기준**
   - 100~1000 사이에서 선택
   - 데이터베이스 IN절 제한 고려
   - 메모리 사용량과 성능의 균형점 찾기

4. **조회 방향 변경 고려**
   ```java
   // Order -> OrderItem 대신
   // OrderItem -> Order 조회 고려
   @Query("SELECT oi FROM OrderItem oi JOIN FETCH oi.order WHERE oi.order.id IN :orderIds")
   List<OrderItem> findItemsByOrderIds(@Param("orderIds") List<Long> orderIds);
   ```

### 5.5 성능 고려사항

```java
// DISTINCT의 성능 영향 분석
public class OrderService {
    
    // 방법 1: DISTINCT + fetch join (메모리 사용량 ↑, 쿼리 수 ↓)
    public List<Order> findOrdersMethod1() {
        return orderRepository.findOrdersWithItemsDistinct();
        // SQL: 1번, 메모리: Order 중복 제거 오버헤드
    }
    
    // 방법 2: BatchSize (메모리 사용량 ↓, 쿼리 수 ↑)
    @Transactional(readOnly = true)
    public List<Order> findOrdersMethod2() {
        List<Order> orders = orderRepository.findAll();
        // 지연 로딩 트리거 (BatchSize로 최적화)
        orders.forEach(order -> order.getOrderItems().size());
        return orders;
        // SQL: 2번 (Orders + OrderItems 일괄 조회)
    }
}
```

---

## 결론

JPA에서 N+1 문제와 페이지네이션은 복합적으로 고려해야 할 중요한 성능 이슈이다. 실무에서는 **@BatchSize를 이용한 지연 로딩 최적화**가 가장 안전하고 효과적인 해결책이며, 상황에 따라 적절한 전략을 선택하는 것이 중요하다.