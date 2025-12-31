---
layout: post
title: jpa 순환참조
---

## 문제 상황
JPA 순환참조는 `1:N`, `N:1`, `양방향` 관계에서 일어 날 수 있다.

~~~java
@GetMapping("/list")
public List<Order> getList(@ModelAttribute OrderSearch search){
    List<Order> items=orderService.findItems(search);
    return items;
}
~~~
주문(Order) 정보 리스트를 가져오는 상황에서 Entity 그대로  return 해줬다.   

~~~java
public class Order {
    ...
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "MEMBER_ID")
    private Member member;      //주문 회원
    ...
}
~~~

~~~java
public class Member {
    ...
    @OneToMany(mappedBy = "member")
    @Builder.Default
    private List<Order> orders = new ArrayList<Order>();
    ...
}
~~~

주문과 회원응 서로 양방향 매핑이 되어있는데 이때 `Order->Member->Order->...->Member... `
순환참조가 일어나서 무한재귀 상태에 빠지면서 Stack Over Flow 상태에 빠진다.

## 해결책

1. `@JsonIgnore` 사용

2. `@JsonManagedReference`, `@JsonBackReference` 사용   
양방향 관계에서 정방향(연관관계 주인)에 JsonManagedReference 추가 (정상적으로 직렬화 수행)   
역방향에 JsonBackReference 추가(직렬화가 되지 않도록 수행)

3. return to DTO   
주 원인은 양방향 관계에서 entity 자체를 그대로 return 하였기 때문이다. DTO를 만들어서 필요한 데이터만 옮겨 닮도록하자.

4. 연관관계 재 설정   
비즈니스 로직을 다시 한번 생각 해보자.  
[Member 도메인이 Order를 조회하는 경우가 많을까?](fixme)
