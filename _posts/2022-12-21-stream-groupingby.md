---
layout: post
title: Java Stream GroupingBy
---


자바 Stream 에서 최종 연산자 collect 의 Collector 인터페이스를 구현하여 그룹화하는 다양한 방법.

### groupingBy()
특정 속성(property)값에 의해서 그룹핑을 짓는다. 결과값으로 항상 Map<K, V> 형태를 리턴하게 된다.
SQL문에서도 사용하는 group by 를 생각하면 더 쉽게 이해할 수 있다.

파라미터
1. classifier (Function<? super T,? extends K> ): 분류 기준을 나타낸다.
2. mapFactory (Supplier) : 결과 Map 구성 방식을 변경할 수 있다.
3. downStream (Collector<? super T,A,D>): 집계 방식을 변경할 수 있다.


### 예제

| SHOP_ID | NAME | PRICE |
|---------|------|-------|
| 1       | 슈비버거 | 3500  |
| 2       | 슈슈버거 | 3700  |
| 3       | 오늘의초밥 | 5600  |
| 4       | 오늘의초밥 | 5000  |
| 5       | 슈슈버거 | 3700  |
| 6       | 슈슈버거 | 3700  |
| 7       | 오늘의초밥 | 5600  |
| 8       | 오늘의초밥 | 5000  |
| 9       | 슈비버거 | 3700  |
| 10      | 오늘의초밥 | 5000  |


~~~java
@Data
public class Item {
    int shop_id;
    String name;
    String price;
}
~~~

#### 단일키 groupingBy
~~~java
public Map<String, List<Item>> groupingBySingleArgument(List<Item> item){
    return item.stream().collect(Collectors.groupingBy(Item::getName));
}
~~~

name key값으로 그룹핑된 List<Item> 이 value로 들어감.


#### jpa 예제
~~~java
private Map<Long, List<OrderItemQueryDto>> findOrderItemMap(List<Long> orderIds) {
      List<OrderItemQueryDto> orderItems = em.createQuery(
              "select new jpabook.jpashop.repository.order.query.OrderItemQueryDto(oi.order.id, i.name, oi.orderPrice, oi.count)" +
                      " from OrderItem oi" +
                      " join oi.item i" +
                      " where oi.order.id in :orderIds", OrderItemQueryDto.class)
              .setParameter("orderIds", orderIds)
              .getResultList();
      return orderItems.stream()
              .collect(Collectors.groupingBy(OrderItemQueryDto::getOrderId));
}
~~~

---
TODO   
- 복합키
- toSet()
- multiple fields
- 통계 (sum, average, maximum, minimum, summary)
- value 값을 다른 타입으로 리턴