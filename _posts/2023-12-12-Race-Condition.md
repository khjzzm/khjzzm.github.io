---
layout: post
title: Race Condition (동시성이슈 해결방법 with Redis) 
---

## Lettuce

- setnx 명령어 사용
- spin lock 방식
    - retry 로직 필요

~~~kotlin
@Component
class RedisLockRepository(
        private val redisTemplate: RedisTemplate<String, String>,
) {
    fun lock(key: Long): Boolean {
        val isSuccess: Boolean? = redisTemplate.opsForValue()
                .setIfAbsent(key.toString(), "lock", Duration.ofSeconds(3L))

        return isSuccess ?: false
    }

    fun unlock(key: Long): Boolean {
        return redisTemplate.delete(key.toString())
    }
}

@Service
class RedisLockStockService(
        private val redisLockRepository: RedisLockRepository,
) {
    fun decrease(id: Long, quantity: Long) {
        while (redisLockRepository.lock(id).not()) {
            TimeUnit.MILLISECONDS.sleep(100L) // 100 milliseconds 동안 sleep 하며 주기적으로 요청
        }

        try {
            ...
            // 재고 감소 로직 수행
        } finally {
            redisLockRepository.unlock(id)
        }
    }
}
~~~

## Redisson

- Pub-Sub 기반의 Lock 구현 제공
- 채널을 만들고 Lock을 획득한 Thread가 Lock획득을 시도하는 Thread에게 해제되었음을 알려주는 방식

~~~kotlin
@Service
class RedissonLockStockFacade(
        private val stockService: StockService,
        private val redissonClient: RedissonClient,
) {
    private val log: Logger = LoggerFactory.getLogger(this::class.java)

    fun decrease(id: Long, quantity: Long) {
        val lock: RLock = redissonClient.getLock(id.toString())

        try {
            val available: Boolean = lock.tryLock(5L, 1L, TimeUnit.SECONDS)
            if (available.not()) {
                log.error("lock 획득 실패")
                return
            }
            stockService.decrease(id, quantity)
        } finally {
            lock.unlock()
        }
    }
}
~~~
