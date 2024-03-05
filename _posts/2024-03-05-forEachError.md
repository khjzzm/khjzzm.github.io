---
layout: post
title: forEach list Exception
---

매일 매시각마다 구독(정기결제) 대상자를 데이터베이스에서 리스트로 받아와 결제 처리를 진행하고 있습니다. 
처음에는 아래와 같이 forEach를 사용하여 결제 처리 함수를 호출하는 방식으로 구현했습니다.

~~~java
list.forEach(this::payWithBillKey);
~~~

하지만, **payWithBillKey** 함수에서 데이터베이스 삽입 중 예외가 발생하면, 
forEach 문이 초기 아이템 처리에서 멈추어 버리는 문제가 발생했습니다. 이로 인해 리스트의 다른 아이템들에 대한 처리가 전혀 이루어지지 않았습니다.

### 문제의 해결
이 문제를 해결하기 위해, 예외 처리를 추가하여 각 아이템을 처리하는 도중 예외가 발생해도 다음 아이템의 처리가 계속될 수 있도록 수정했습니다.

~~~java
list.forEach(item -> {
    try {
        this.payWithBillKey(item);
    } catch (Exception e) {
        log.error("payWithBillKey error item is {}", item, e);
    }
});
~~~
이러한 변경을 통해, 하나의 아이템 처리에서 예외가 발생하더라도 다음 아이템으로 넘어가서 처리를 계속 진행할 수 있게 되었습니다. 
아래는 이를 시뮬레이션하기 위한 간단한 예제 코드입니다.

~~~java
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {
   private static final Logger log = LoggerFactory.getLogger(Main.class);

   public static void main(String[] args) {
      List<Integer> list = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

      list.forEach(item -> {
         try {
            if (item == 2 || item == 3) {
               throw new RuntimeException("Exception for item: " + item);
            }
            System.out.println("Success item: " + item);
         } catch (Exception e) {
            log.error("Error item: {}", item, e);
         }
      });
   }
}
~~~
이 코드를 통해 특정 아이템(예: 2, 3) 처리 중 예외가 발생하더라도, 
나머지 아이템들의 처리가 중단되지 않고 계속 진행됨을 확인할 수 있습니다. 
이 방식으로, 모든 대상자에 대한 결제 처리를 안정적으로 완료할 수 있게 되었습니다.
