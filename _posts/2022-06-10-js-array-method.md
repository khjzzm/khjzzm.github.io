---
layout: post
title: javascript TOP3 배열 메서드
---

## .find()
주어진 조건에 만족하는 첫 번째 요소의 값을 반환한다.

~~~javascript
function findBanana(currentFruit){
  return currentFruit === "🍌";
}
const fruits = ["🍍", "🍊", "🍌", "🍒"];
const banana = fruits.find(findBanana);
console.log(banana);

//작동하는 코드 아님.
const banana = fruits.find(
  findBanana(🍍)
  findBanana(🍊)
  findBanana(🍌)
  findBanana(🍒)
)

//arrow funnction
const banana = fruits.find((currentFruit) => currentFruit === "🍌")
~~~


## .map()
배열 내의 모든 요소에 대하여 주어진 함수를 호출한 결과를 모아서 새로운 배열을 반환 한다.

~~~javascript
function double(currntNumber){
  return currntNumber * 2;
}
const source = [2, 4, 6, 8, 10];
const transformed = source.map(double);
console.log(transformed);

//작동하는 코드 아님.
const banana = fruits.find(
  double(2)
  double(4)
  double(6)
  double(8)
  double(10)
)

//arrow funnction
const transformed = source.map((currentNumber) => currentNumber * 2)
~~~

콜백 함수는 뭔가를 반드시 리턴해야한다는것을 기억해야한다.  
화살표 함수(arrow function)를 사용하면 한줄로 코드 작성이 가능하다.  
`arguments => return-value` 처럼 사용 하면 된다. 화살표 함수는 암묵적 리턴(implicit return)을 가지고 있다.  


## .filter()
주어진 함수의 테스트를 통과한 모든 요소를 모아서 배열은 만든다.

~~~javascript
const foods = ["🍟", "🍞" , "🍙", "🍜", "🍛", "🥮", "🍼"]
const favorite = foods.filter((currentFood) => currentFood !== "🍼")
~~~

---
`sort()`, `flat()`, `reduce()`