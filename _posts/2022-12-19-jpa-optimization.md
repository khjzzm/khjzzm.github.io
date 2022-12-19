---
layout: post
title: JPA 활용 - API 개발과 성능 최적화
---

~~~java
public CreateMemberResponse saveMemberV1(@RequestBody @Valid Member member){
        Long id = memberService.join(member);
        return new CreateMemberResponse(id);
}
~~~

문제점
- 엔티티에 프레젠테이션 계층을 위한 로직이 추가된다.
- 엔티티에 API 검증을 위한 로직이 들어간다. (@NotEmpty 등등)
- 실무에서는 회원 엔티티를 위한 API가 다양하게 만들어지는데, 한 엔티티에 각각의 API를 위한 모든 요청 요구사항을 담기는 어렵다.
- 엔티티가 변경되면 API 스펙이 변한다.

결론
- API 요청 스펙에 맞추어 별도의 DTO를 파라미터로 받는다.



~~~java
public CreateMemberResponse saveMemberV2(@RequestBody @Valid CreateMemberRequest request) {
    Member member = new Member();
    member.setName(request.getName());
    Long id = memberService.join(member);
    return new CreateMemberResponse(id);
}
~~~