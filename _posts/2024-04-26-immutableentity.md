---
layout: post
title: Hibernate Immutable 엔티티
---

불변 엔터티는 다음 계약 사항을 준수해야 한다.

- @Immutable(org.hibernate.annotations.Immutable) 어노테이션이 지정 돼야한다.
- 어떤 종류의 연관관계(@ElementCollection, @OneToOne, @OneToMany, @ManyToOne 또는 @ManyToMany) 도 포함하지 않아야 한다.
- hibernate.cache.use_reference_entries 설정이 true로 지정돼야 한다.

~~~
불변 엔터티는 분해된 상태가 아닌 엔터티 참조로 2차 캐시에 저장된다.
이렇게 되면 분해된 상태에서 엔터티를 재구성하는 성증 저하를 방지할 수 있다(새 엔터티 인스턴스를 만들고 분해된 상태로 채운다).
~~~


~~~java
@Entity
@Immutable
@Cache(usage = CacheConcurrencyStrategy.READ_ONLY, region = "Author")
public class Author implements Serializable {
    private static final long serialVersionUID = 1L;

    @Id
    private Long id;

    private String name;
    private String genre;
    private int age;
    ...
}
~~~

신규 Author 만들기
~~~java
    public void newAuthor() {
        Author author = new Author();

        author.setId(1L);
        author.setName("Joana Nimar");
        author.setGenre("History");
        author.setAge(34);

        authorRepository.save(author);
    }
~~~
데이터베이스에 저장하고 이를 라이트 스루 전략을 통해 2차 캐시에 보관한다


생성된 Author 가져오기
~~~java
    public void fetchAuthor() {
        Author author = authorRepository.findById(1L).orElseThrow();
        System.out.println(author);
    }
~~~
데이터베이스에 접근하지 않고 2차캐시에서 생성된 Author를 가져온다.

Author 수정하기
~~~java
    @Transactional
    public void updateAuthor() {
        Author author = authorRepository.findById(1L).orElseThrow();
        author.setAge(45);
    }
~~~
Author는 변경할 수 없기 때문에(수정할 수 없음) 이 작업은 처리되지 않는다. 이때 오류가 발생하지 않으며 단순히 무시된다.

Author 삭제하기
~~~java
    public void deleteAuthor() {
        authorRepository.deleteById(1L);
    }
~~~
이 작업은 2차 캐시에서 엔터티를 가져와 두 위치(2차캐시 및 데이터베이스)에서 삭제 한다.
