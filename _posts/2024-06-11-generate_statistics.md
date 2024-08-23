---
layout: post
title: generate_statistics
---

~~~mysql
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
           [10:04:46.418] [ INFO] [http-nio-8080-exec-1] o.h.e.i.StatisticalLoggingSessionEventListener :258           
│ Session Metrics {
    39541 nanoseconds spent acquiring 1 JDBC connections;
    0 nanoseconds spent releasing 0 JDBC connections;
    105834 nanoseconds spent preparing 2 JDBC statements;
    16818251 nanoseconds spent executing 2 JDBC statements;
    0 nanoseconds spent executing 0 JDBC batches;
    0 nanoseconds spent performing 0 L2C puts;
    0 nanoseconds spent performing 0 L2C hits;
    0 nanoseconds spent performing 0 L2C misses;
    0 nanoseconds spent executing 0 flushes (flushing a total of 0 entities and 0 collections);
    3375 nanoseconds spent executing 1 partial-flushes (flushing a total of 0 entities and 0 collections)
}
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~~~


- **JDBC connections**의 획득과 반환: 이는 데이터베이스 연결을 가져오고 반환하는 데 걸린 시간을 나타냅니다. 이 값을 최소화하려면 연결 풀을 효과적으로 사용해야 합니다.
  - JDBC 연결 획득/반환 시간: 이 시간은 최소화해야 합니다. 여기에 많은 시간이 소요되는 경우 연결 풀링 구성을 확인해야 할 수 있습니다.
- **JDBC statements**의 준비와 실행: 이는 SQL 문을 준비하고 실행하는 데 걸린 시간을 나타냅니다. 이 시간이 길면 SQL 쿼리 최적화가 필요할 수 있습니다.
  - JDBC 문장 준비/실행 시간: 이 시간은 일반적으로 최소화해야 합니다. SQL 쿼리가 복잡하거나 크게 작업이 확장될 경우 이 수치가 늘어나게 됩니다. 이를 줄이려면 쿼리를 최적화하거나 필요에 따라 SQL 쿼리를 직접 작성하는 등의 방법을 고려해 볼 수 있습니다.
- **JDBC batches**의 실행: 이는 여러 SQL 문장을 한 번에 실행하는 배치 처리의 시간을 나타냅니다.
  - JDBC 배치 실행 시간: 이 시간은 일반적으로 최소화해야 합니다. 마찬가지로 쿼리를 최적화하거나 필요에 따라 SQL 쿼리를 직접 작성하는 등의 방법을 고려해 볼 수 있습니다.
- **L2C puts**, **L2C hits**, **L2C misses**: 이는 두 번째 레벨 캐시의 성능을 나타냅니다. 
  - L2C puts/hits/misses: 이 경우, L2C misses 수치를 최소화하려는 노력이 필요합니다. 높은 miss 비율은 캐시 구성을 재검토해야 함을 나타낼 수 있습니다.
    - **L2C puts**는 캐시에 객체가 저장된 횟수
    - **L2C hits**는 요청한 데이터를 캐시에서 찾은 횟수
    - **L2C misses**는 요청한 데이터를 캐시에서 찾지 못한 횟수를 의미합니다.
- **flushes**와 **partial-flushes**: 이는 Hibernate가 처음으로 데이터베이스에 쓰기 위해 캐시를 비우는 작업의 횟수와 그에 걸린 시간을 나타냅니다.
  - flushes/partial-flushes: 이 시간은 일반적으로 최소화해야 합니다. 이는 Hibernate가 데이터베이스에 교차하는 시점을 제어하고 오버헤드를 최소화하도록 도와줍니다.






