---
layout: post
title: Jetbrains Academy Kotlin (AtomicKotlin)
---


~~~kotlin
fun main(){
    println("Hello, Kotlin!")
}
~~~

~~~kotlin
package varAndValExercise1

fun main() {
    var answer = 42
    println(answer)
    answer = 43
    println(answer)
}
~~~

~~~kotlin
// Functions/MultiplyByTwo.kt

fun multiplyByTwo(x: Int): Int {  // [1]
  println("Inside multiplyByTwo") // [2]
  return x * 2
}

fun main() {
  val r = multiplyByTwo(5)        // [3]
  println(r)
}
/* Output:
Inside multiplyByTwo
10
*/
~~~
