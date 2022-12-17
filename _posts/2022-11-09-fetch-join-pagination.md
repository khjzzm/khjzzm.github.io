---
layout: post
title: JPA fetch join 과 pagination
---


## 문제 상황
>N+1 문제를 해결하기 위해서 fetch join 을 사용 후 Pageable 기능을 사용할때

JPA 를 사용하다보면 자연스럽게 N+1 문제에 마주치게 된다. 여러 해결 방법중에 `fetch join` 으로 문제를 해결하는 방법을 알게 된다.
fetch join은 JPA만 있는 특별한 join 이다. 일반 join 과 fetch join 차이점은

#### 일반 Join
- 연관 Entity에 Join을 걸어도 실제 쿼리에서 SELECT 하는 Entity는 오직 JPQL에서 조회하는 주체가 되는 Entity만 조회하여 영속화
- 조회의 주체가 되는 Entity만 SELECT 해서 영속화하기 때문에 데이터는 필요하지 않지만 연관 Entity가 검색조건에는 필요한 경우에 주로 사용됨

#### Fetch Join
- 조회의 주체가 되는 Entity 이외에 Fetch Join이 걸린 연관 Entity도 함께 SELECT 하여 모두 영속화
- Fetch Join이 걸린 Entity 모두 영속화하기 때문에 FetchType이 Lazy인 Entity를 참조하더라도 이미 영속성 컨텍스트에 들어있기 때문에 따로 쿼리가 실행되지 않은 채로 N+1문제가 해결됨

Fetch join에 걸려있는 Entity에 대한 모든 컬럼을 영속화 하기 때문에 Query문 한번으로 모든 데이터를 조회해 온다. (N+1 문제 해결)   
[DTO 객체를 만들어서 해결하는방법](작성중)

하지만 fetch join 의 한계점 이 존재한다.
1. 페치 조인 대상에 별칭을 줄 수 없다. (이번 문제 상황과는 관련없다.)
2. 둘 이상의 컬렉션은 페치 조인 할 수 없다 (일대다, 다대다 의 문제)
    - 일대일, 다대일 같은 경우 데이터 뻥튀기에 의해 N대다 는 fetch join 자체가 위험 하다.
    - 구현체에 따라 되기도 하는데 컬렉션 * 컬렉션 카테시안 곱이 만들어진다. (하이버네이트를 사용하면 예외발생)
3. 컬렉션 패치조인을 할 경우 페이징 처리가 힘들다.
    - 일대일, 다대일 연관관계는 페치조인을 사용해도 페이징API 를 문제없이 사용 할수 있다. 데이터가 완전히 다르기떄문에(식별자는 항상 다르다)
    - 하이버네이트에서 컬렉션 페치 조인을 하고 페이징API를 사용하면 `HHH000104: firstResult/maxResults specified with collection fetch; applying in memory!` 경고를 발생한다.
실제 query를 확인해보면 페이징 쿼리(limit, offset)가 없는게 확인 된다. 이는 조회된 모든 데이터를 메모리에 올리고 메모리에서 페이징 처리를 진행한다. 데이터가 적으면 상관없지만 많을 경우 ....
   - fetch join을 한다해도, 결국 DB 입장에서는 join문이 나가게 되는데, 그러면 일대다 관계에서는 각 row마다,
연결된 테이블 row 수만큼 늘어나게 되는데, 그렇게 되면 Hibernate 입장에서는 limit를 중복으로 생긴 row를 고려해서 걸어야할지, 아니면 중복으로 생긴 row를 무시하고 그냥 limit를 날려할지 고민하게되는데, 이를 sql문으로 해결하지 않고 그냥 메모리에 데이터를 전부 올려버리고 페이지네이션하는 방법으로 해결하고 있는 것이다.


@OneToMany 연관관계가 맺어진 경우 페치조인과 페이징 처리가 어려워졌다. 페치조인을 inner join 으로 바꾸면 다시 lazy loading N+1 문제가 발생한다.   

## 해결책
>@BatchSize, default_batch_fetch_size 를 통한 처리

성능 최적화를 위해서 BatchSize 옵션을 설정하여 컬렉션들을 지연로딩 하는 방법이 있다.   
설정한 사이즈 만큼 데이터를 끌어와서 한번에 IN 쿼리를 이용해서 조회하는 방법이다.

N+1 에서 1+1(연관된 테이블 만큼) 으로 변경 된다. 

적용방법은 2가지이다.

글로벌 설정
~~~
spring.jpa.properties.hibernate.default_batch_fetch_size: 100
~~~
사이즈는 보통 100~1000 정도가 적당하다고 한다. 

개별적용
~~~java
@BatchSize(size = 100)
@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
private List<OrderItem> orderItems = new ArrayList<>();
~~~
ToMany는 해당 필드에 작성 하고 ToOne은 클래스에 작성한다.


---
@OneToMany 조회를 @ManyToOne 조회로 변경 해도 된다. 그러나 이건

