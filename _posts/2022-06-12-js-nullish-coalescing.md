---
layout: post
title: 자바스크립트 optional chaining
---

~~~javascript
var user = {
    name : 'kimuzzang',
    age : 32
}

console.log(user?.age) //의미없음
~~~
체이닝 2개 이상인경우 에러남  
undefined.value, null.value

optional chaining 연산자
.? 왼쪽이 null, undefined면 점 안찍어주고 undefined 남겨줌  
중첩된 object자료에서 자료뽑을 때 reference 에러없이 안전하게 뽑을 수 있음

~~~javascript
var user = {
    name : 'kimuzzang',
    //age : {value:20}
}

console.log(user.age.value)
console.log(user.age?.value) 
~~~

~~~javascript
document.querySelector('#a')?.innerHTML
~~~

? 문법은 에러를 해결해주는 문법이 아니라 에러를 감춰주는 문법이다.

~~~javascript
console.log(undefined ?? '대왕오감자')
~~~
?? nullish coalescing 연산자


~~~javascript
var obj = {
    data : {
        name : {
            id : cosmos,
            date: 2022-06-12
        },
    },
}
console.log(obj.data?.name?.id ?? 'atom')
~~~



