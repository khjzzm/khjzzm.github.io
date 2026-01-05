---
layout: post
title: Spring @Transactional 실무 가이드 - 클래스 vs 메서드 레벨, 멀티 데이터소스, AWS Read Replica
tags: [spring, java, database]
---

## 클래스 레벨 vs 메서드 레벨 @Transactional

### 클래스 레벨에 적용

```java
@Service
@Transactional
public class UserService {

    public void createUser() { }  // 트랜잭션 적용됨

    public void updateUser() { }  // 트랜잭션 적용됨

    public User getUser() { }     // 트랜잭션 적용됨 (읽기도!)
}
```

- 해당 클래스의 **모든 public 메서드**에 트랜잭션이 적용됨
- 기본 설정이 모든 메서드에 동일하게 적용

### 메서드 레벨에 적용

```java
@Service
public class UserService {

    @Transactional
    public void createUser() { }  // 트랜잭션 적용됨

    @Transactional(readOnly = true)
    public User getUser() { }     // 읽기 전용 트랜잭션

    public void simpleTask() { }  // 트랜잭션 없음
}
```

- 특정 메서드에만 선택적으로 적용 가능
- 메서드별로 다른 트랜잭션 속성 지정 가능

### 둘 다 사용할 경우 (메서드가 우선)

```java
@Service
@Transactional(readOnly = true)  // 기본값: 읽기 전용
public class UserService {

    public User getUser() { }     // readOnly = true 적용

    @Transactional              // 메서드 레벨이 오버라이드
    public void createUser() { } // readOnly = false (기본값)
}
```

### 실무 권장 패턴

```java
@Service
@Transactional(readOnly = true)  // 클래스 기본: 읽기 전용
public class UserService {

    // 조회 메서드들은 그대로 상속
    public User getUser() { }
    public List<User> findAll() { }

    // 쓰기 메서드만 오버라이드
    @Transactional
    public void createUser() { }

    @Transactional
    public void deleteUser() { }
}
```

이 패턴의 장점:
- 조회 메서드에 `readOnly = true` → DB 최적화 (Flush 생략, 읽기 복제본 사용 가능)
- 쓰기 메서드만 명시적으로 표시 → 코드 의도 명확

---

## @Transactional 주의사항 상세

### 1. private 메서드에는 @Transactional이 작동하지 않음

Spring AOP는 **프록시 기반**으로 동작한다.

```java
@Service
public class UserService {

    @Transactional
    public void createUser() { }      // 작동함 - 프록시가 가로챔

    @Transactional
    private void saveLog() { }        // 작동 안함!
}
```

동작 원리:

```
[클라이언트] → [프록시 객체] → [실제 UserService]
                    ↓
              트랜잭션 시작/종료
              (public 메서드만 가로챌 수 있음)
```

프록시는 클래스를 상속하거나 인터페이스를 구현하는 방식으로 생성되는데, **private 메서드는 상속/오버라이드가 불가능**하므로 프록시가 가로챌 수 없다.

### 2. 같은 클래스 내부 호출은 트랜잭션이 적용되지 않음

이게 가장 흔한 실수다.

```java
@Service
public class UserService {

    public void createUserWithLog() {
        createUser();      // 트랜잭션 적용 안됨!
        saveLog();         // 트랜잭션 적용 안됨!
    }

    @Transactional
    public void createUser() {
        userRepository.save(user);
    }

    @Transactional
    public void saveLog() {
        logRepository.save(log);
    }
}
```

왜 안될까?

```
외부에서 호출할 때:
[Controller] → [UserService 프록시] → [실제 UserService]
                      ↓
                트랜잭션 처리 ✅

내부에서 호출할 때:
[실제 UserService] → this.createUser()
        ↓
   프록시를 거치지 않음 ❌
```

내부 호출은 `this.createUser()`로 실행되어 **프록시를 우회**한다.

#### 해결 방법들

**방법 1: 클래스 분리 (권장)**

```java
@Service
public class UserService {

    private final UserCreator userCreator;
    private final LogService logService;

    public void createUserWithLog() {
        userCreator.createUser();  // 프록시 통과
        logService.saveLog();      // 프록시 통과
    }
}

@Service
public class UserCreator {
    @Transactional
    public void createUser() { }
}
```

**방법 2: 자기 자신 주입 (Self-injection)**

```java
@Service
public class UserService {

    @Autowired
    private UserService self;  // 프록시 객체가 주입됨

    public void createUserWithLog() {
        self.createUser();     // 프록시 통과
        self.saveLog();        // 프록시 통과
    }

    @Transactional
    public void createUser() { }

    @Transactional
    public void saveLog() { }
}
```

**방법 3: 호출하는 메서드에 @Transactional 적용**

```java
@Service
public class UserService {

    @Transactional  // 여기에 적용
    public void createUserWithLog() {
        createUser();   // 이미 트랜잭션 안에 있음
        saveLog();      // 이미 트랜잭션 안에 있음
    }

    public void createUser() { }  // @Transactional 불필요
    public void saveLog() { }     // @Transactional 불필요
}
```

### 3. readOnly = true는 성능 힌트일 뿐, 쓰기를 막지는 않음

```java
@Transactional(readOnly = true)
public void updateUser(User user) {
    userRepository.save(user);  // 실행됨! 에러 안남!
}
```

`readOnly = true`가 실제로 하는 일:

| 항목             | 설명                                        |
|------------------|---------------------------------------------|
| Hibernate Flush  | MANUAL로 설정 → 변경감지(Dirty Checking) 비활성화 |
| 스냅샷 저장      | 엔티티 스냅샷 저장 안함 → 메모리 절약       |
| DB 힌트          | 일부 DB는 읽기 복제본으로 라우팅             |

그러나:

```java
@Transactional(readOnly = true)
public void update() {
    User user = userRepository.findById(1L);
    user.setName("변경됨");  // 무시됨 (Flush 안함)

    userRepository.save(user);  // 하지만 이건 실행됨!
}
```

실제 동작 차이 정리:

| 케이스                  | readOnly=true 일 때 |
|-------------------------|---------------------|
| 엔티티 수정 후 자동 flush | 막힘               |
| repository.save() 호출  | 실행됨              |
| Native UPDATE 쿼리      | 실행됨              |
| JPQL UPDATE 쿼리        | 실행됨              |

---

## 트랜잭션 전파 (Propagation)

트랜잭션 전파는 트랜잭션이 이미 존재할 때 새로운 트랜잭션을 어떻게 처리할지 결정한다.

### Propagation 옵션

| Propagation     | 설명                                               | 사용 상황                 |
|-----------------|----------------------------------------------------|---------------------------|
| REQUIRED (기본값) | 기존 트랜잭션 있으면 참여, 없으면 새로 생성       | 일반적인 경우             |
| REQUIRES_NEW    | 항상 새 트랜잭션 생성 (기존 트랜잭션 일시 중단)    | 독립적인 작업, 로깅       |
| SUPPORTS        | 기존 트랜잭션 있으면 참여, 없으면 트랜잭션 없이 실행 | 조회 작업               |
| NOT_SUPPORTED   | 트랜잭션 없이 실행 (기존 트랜잭션 일시 중단)       | 트랜잭션 불필요           |
| MANDATORY       | 기존 트랜잭션 필수, 없으면 예외                    | 반드시 트랜잭션 내에서 실행 |
| NEVER           | 트랜잭션이 있으면 예외                             | 트랜잭션 금지             |
| NESTED          | 중첩 트랜잭션 (savepoint)                          | 부분 롤백 필요            |

### REQUIRED (기본값)

```java
@Transactional
public void methodA() {
    // 트랜잭션 시작
    methodB();  // 같은 트랜잭션에 참여
}

@Transactional(propagation = Propagation.REQUIRED)
public void methodB() {
    // methodA의 트랜잭션에 참여
}
```

```
methodA() 호출
    └─ 트랜잭션 시작 ─────────────────────────┐
         │                                    │
         └─ methodB() 호출                    │
              └─ 기존 트랜잭션 참여            │
         │                                    │
    └─ 커밋/롤백 ─────────────────────────────┘
```

### REQUIRES_NEW

```java
@Transactional
public void methodA() {
    // 트랜잭션 A 시작
    methodB();  // 새 트랜잭션 B 시작 (A는 일시 중단)
    // methodB 완료 후 A 재개
}

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void methodB() {
    // 항상 새 트랜잭션에서 실행
    // 여기서 롤백해도 methodA에 영향 없음
}
```

```
methodA() 호출
    └─ 트랜잭션 A 시작 ───────────────────────┐
         │                                    │
         └─ methodB() 호출                    │ (A 일시 중단)
              └─ 트랜잭션 B 시작 ────┐        │
              └─ 트랜잭션 B 커밋 ────┘        │
         │                                    │ (A 재개)
    └─ 트랜잭션 A 커밋 ───────────────────────┘
```

**사용 예시: 로깅**

```java
@Service
public class OrderService {

    @Transactional
    public void createOrder(OrderDto dto) {
        orderRepository.save(dto);
        logService.saveLog("주문 생성");  // 주문 실패해도 로그는 남김
    }
}

@Service
public class LogService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveLog(String message) {
        // 독립적인 트랜잭션
        // 메인 트랜잭션이 롤백되어도 로그는 커밋됨
        logRepository.save(message);
    }
}
```

### SUPPORTS

```java
@Transactional(propagation = Propagation.SUPPORTS)
public User getUser(Long id) {
    // 트랜잭션이 있으면 그 안에서 실행
    // 없으면 트랜잭션 없이 실행
    return userRepository.findById(id);
}
```

### NOT_SUPPORTED

```java
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public List<String> getStaticCodes() {
    // 트랜잭션 없이 실행
    // 기존 트랜잭션이 있으면 일시 중단
    return Arrays.asList("A", "B", "C");
}
```

### MANDATORY

```java
@Transactional(propagation = Propagation.MANDATORY)
public void updateBalance(Long accountId, int amount) {
    // 반드시 트랜잭션 내에서 호출되어야 함
    // 트랜잭션 없이 호출하면 IllegalTransactionStateException
    accountRepository.updateBalance(accountId, amount);
}
```

### NESTED

```java
@Transactional
public void methodA() {
    // 메인 트랜잭션
    try {
        methodB();  // savepoint 생성
    } catch (Exception e) {
        // methodB만 롤백, methodA는 계속 진행 가능
    }
}

@Transactional(propagation = Propagation.NESTED)
public void methodB() {
    // 중첩 트랜잭션 (savepoint)
    // 롤백 시 savepoint까지만 롤백
}
```

```
methodA() 호출
    └─ 트랜잭션 시작 ─────────────────────────┐
         │                                    │
         └─ SAVEPOINT 생성                    │
         └─ methodB() 실행                    │
         └─ 실패 시 SAVEPOINT로 롤백          │
         │                                    │
         └─ methodA 계속 진행 가능            │
    └─ 커밋 ──────────────────────────────────┘
```

### 전파 옵션 선택 가이드

| 상황                               | 추천 Propagation |
|------------------------------------|------------------|
| 일반적인 비즈니스 로직             | REQUIRED         |
| 로깅, 알림 등 독립 작업            | REQUIRES_NEW     |
| 조회만 하는 메서드                 | SUPPORTS         |
| DB 작업 없는 유틸 메서드           | NOT_SUPPORTED    |
| 트랜잭션 필수 보장                 | MANDATORY        |
| 부분 롤백이 필요한 경우            | NESTED           |

---

## 멀티 데이터소스 환경에서의 @Transactional

### transactionManager 지정이 필요한 이유

하나의 애플리케이션에서 여러 DB에 접속하는 경우, 각 DB마다 별도의 설정이 필요하다.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Spring Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   MembersSqlSessionConfig                FaxSqlSessionConfig     │
│   ┌─────────────────────────┐           ┌─────────────────────┐ │
│   │ membersDataSource       │           │ faxDataSource       │ │
│   │ membersTransactionManager│          │ faxTransactionManager│ │
│   └─────────────────────────┘           └─────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 설정 예시

```java
public class MembersSqlSessionConfig {
    public static final String DATA_SOURCE_NAME = "membersDataSource";
    public static final String TRANSACTION_MANAGER_NAME = "membersTransactionManager";

    @Bean(DATA_SOURCE_NAME)
    @ConfigurationProperties(prefix = "auth.datasource.members")
    public DataSource dataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean(TRANSACTION_MANAGER_NAME)
    public PlatformTransactionManager transactionManager(
            @Qualifier(DATA_SOURCE_NAME) DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }
}
```

### 서비스에서 사용

```java
// 이름 지정 안하면
@Transactional
public void verifyUserPwd() {
    // Spring이 "기본" TransactionManager를 찾음
    // 어떤 DB 커넥션을 쓸지 모름!
}

// 이름 지정하면
@Transactional(transactionManager = "membersTransactionManager")
public void verifyUserPwd() {
    // membersDataSource의 커넥션을 사용
    // Members DB에 트랜잭션이 정확히 적용됨
}
```

### 잘못된 사용 예시

```java
// Members DB 쿼리를 날리는데...
@Transactional  // 기본 TransactionManager 사용 (다른 DB일 수도 있음!)
public void updateMember() {
    memberMapper.update(...);  // Members DB에 쿼리
}
```

이 경우:
1. memberMapper는 membersSqlSessionFactory → membersDataSource 사용
2. @Transactional은 기본 TransactionManager → 다른 DataSource의 커넥션 사용
3. **트랜잭션과 실제 쿼리가 다른 커넥션!** → 롤백 안됨

---

## AWS Read Replica 활용

### 기존 단일 서버 vs AWS RDS 구조

```
[기존 단일 서버]
┌─────────────────────────────────┐
│         단일 DB 서버             │
│   (읽기/쓰기 모두 여기서 처리)    │
└─────────────────────────────────┘
         ↑
    모든 쿼리


[AWS RDS - Aurora 등]
┌─────────────────────────────────┐
│      Primary (Writer)           │
│   INSERT, UPDATE, DELETE        │
└─────────────────────────────────┘
         ↑ 쓰기 쿼리

┌─────────────────────────────────┐
│      Read Replica (Reader)      │  ← 자동 동기화
│         SELECT 전용             │
└─────────────────────────────────┘
         ↑ 읽기 쿼리
```

### @Transactional(readOnly = true)의 진짜 의미

AWS 환경에서:

```
readOnly = true  → Read Replica로 라우팅  → 부하 분산
readOnly = false → Primary(Writer)로 라우팅
```

장점:

| 항목       | 설명                                       |
|------------|-------------------------------------------|
| 부하 분산  | 읽기 쿼리를 Replica로 보내서 Primary 부담 감소 |
| 비용 효율  | Read Replica는 상대적으로 저렴              |
| 확장성     | Replica 여러 대 추가 가능                   |
| 성능       | 읽기/쓰기 경합 감소                         |

### AbstractRoutingDataSource 구현

```java
public class ReplicationRoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        boolean isReadOnly = TransactionSynchronizationManager
            .isCurrentTransactionReadOnly();

        return isReadOnly ? "replica" : "primary";
    }
}

@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource routingDataSource() {
        ReplicationRoutingDataSource routingDataSource =
            new ReplicationRoutingDataSource();

        Map<Object, Object> targetDataSources = new HashMap<>();
        targetDataSources.put("primary", primaryDataSource());   // Writer
        targetDataSources.put("replica", replicaDataSource());   // Reader

        routingDataSource.setTargetDataSources(targetDataSources);
        routingDataSource.setDefaultTargetDataSource(primaryDataSource());

        return routingDataSource;
    }
}
```

### 흐름 정리

```
@Transactional(readOnly = true)
public User getUserById() { }
         │
         ▼
┌─────────────────────────────────┐
│  TransactionSynchronizationManager
│  isCurrentTransactionReadOnly() = true
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   ReplicationRoutingDataSource  │
│   → "replica" 반환               │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Read Replica 연결          │
└─────────────────────────────────┘
```

---

## 클래스 기본값 vs 모든 메서드 명시적 작성

### 방식 비교

**방식 1: 클래스 기본값 + 필요한 메서드만 오버라이드**

```java
@Service
@Transactional(transactionManager = "faxTransactionManager")
public class FaxServiceImpl {

    @Transactional(readOnly = true)
    public Fax getFax() { }

    @Transactional(readOnly = true)
    public List<Fax> searchFaxes() { }

    // 클래스 설정 상속 (쓰기)
    public void send() { }
    public void cancel() { }
}
```

**방식 2: 모든 메서드에 명시적 작성**

```java
@Service
public class FaxServiceImpl {

    @Transactional(transactionManager = "faxTransactionManager", readOnly = true)
    public Fax getFax() { }

    @Transactional(transactionManager = "faxTransactionManager", readOnly = true)
    public List<Fax> searchFaxes() { }

    @Transactional(transactionManager = "faxTransactionManager")
    public void send() { }

    @Transactional(transactionManager = "faxTransactionManager")
    public void cancel() { }
}
```

### 비교표

| 항목           | 클래스 기본값               | 모든 메서드 명시     |
|----------------|-----------------------------|-----------------------|
| 코드량         | 적음                        | 많음 (중복)           |
| 가독성         | 기본값 파악 필요            | 한눈에 보임           |
| 실수 가능성    | 빠뜨려도 기본값 적용        | 빠뜨리면 트랜잭션 없음|
| 의도 명확성    | 암묵적                      | 명시적                |
| 유지보수       | 기본값 변경 시 영향도 파악 어려움 | 개별 수정 필요   |
| 신규 메서드 추가| 자동 적용 (편함/위험)      | 직접 추가 필요        |
| 코드 리뷰      | 클래스 설정 확인 필요       | 메서드만 보면 됨      |

### 상세 장단점

**방식 1: 클래스 기본값의 장점**

```java
// 1. 중복 제거
@Service
@Transactional(transactionManager = "faxTransactionManager")
public class FaxServiceImpl {
    public void send() { }     // 깔끔
    public void cancel() { }   // 깔끔
}

// 2. 실수 방지 - 새 메소드 추가해도 트랜잭션 보장
public void newMethod() { }  // 자동으로 트랜잭션 적용됨

// 3. transactionManager 일괄 변경 용이
@Transactional(transactionManager = "newFaxTransactionManager")  // 한 곳만 수정
```

**방식 1: 클래스 기본값의 단점**

```java
// 1. 의도치 않은 트랜잭션 적용
public List<String> getStaticCodes() {  // DB 안 쓰는데 트랜잭션 생김
    return Arrays.asList("A", "B", "C");
}

// 2. 암묵적 동작 - 코드 리뷰 시 클래스까지 확인 필요
public void send() { }  // 이게 쓰기인지 읽기인지 메서드만 봐서는 모름
```

**방식 2: 모든 메서드 명시의 장점**

```java
// 1. 의도가 명확함
@Transactional(transactionManager = "faxTransactionManager", readOnly = true)
public Fax getFax() { }  // 읽기 전용임이 바로 보임

@Transactional(transactionManager = "faxTransactionManager")
public void send() { }   // 쓰기임이 바로 보임

// 2. 트랜잭션 불필요한 메서드는 명확히 제외
public List<String> getStaticCodes() { }  // 트랜잭션 없음 (의도적)

// 3. 코드 리뷰 용이 - 메서드만 보면 됨
```

**방식 2: 모든 메서드 명시의 단점**

```java
// 1. 중복이 많음
@Transactional(transactionManager = "faxTransactionManager", readOnly = true)
public Fax getFax() { }

@Transactional(transactionManager = "faxTransactionManager", readOnly = true)
public Fax getFaxByCustomKey() { }

@Transactional(transactionManager = "faxTransactionManager", readOnly = true)
public List<Fax> searchFaxes() { }
// ... 계속 반복

// 2. 실수 가능성
public void newMethod() {  // 깜빡하면 트랜잭션 없음!
    faxMapper.update(...);  // 트랜잭션 없이 실행됨
}
```

---

## 커스텀 어노테이션 패턴 (권장)

커스텀 어노테이션으로 중복을 제거하고 안전하게 사용할 수 있다.

### 어노테이션 정의

```java
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Transactional(transactionManager = FaxSqlSessionConfig.TRANSACTION_MANAGER_NAME)
public @interface FaxTransactional {
    boolean readOnly() default false;
}

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Transactional(transactionManager = HanafaxSqlSessionConfig.TRANSACTION_MANAGER_NAME)
public @interface HanafaxTransactional {
    boolean readOnly() default false;
}
```

### 서비스에서 사용

```java
@Service
@FaxTransactional  // 클래스 기본값: 쓰기
public class FaxServiceImpl {

    @FaxTransactional(readOnly = true)  // 읽기 메서드만 오버라이드
    public Fax getFax() { }

    @FaxTransactional(readOnly = true)
    public List<Fax> searchFaxes() { }

    // 쓰기는 클래스 설정 상속
    public void send() { }
    public void cancel() { }

    // 트랜잭션 불필요한 메서드는 명시적 제외
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public List<String> getStaticCodes() { }
}
```

### 장점

- transactionManager 중복 제거
- readOnly 지원
- AWS 이전해도 어노테이션 정의만 수정하면 되고, 서비스 코드는 변경 없이 유지

---

## @Transactional 관리 - 다양한 방법들

### 방법 3: 인터페이스에 선언

```java
// 인터페이스에 트랜잭션 선언
public interface FaxService {

    @FaxTransactional(readOnly = true)
    Fax getFax(long faxSeq);

    @FaxTransactional(readOnly = true)
    List<Fax> searchFaxes(Pageable pageable, FaxSearchDto dto);

    @FaxTransactional
    Fax send(Session session, FaxSendDto dto);
}

// 구현체는 깔끔
@Service
@RequiredArgsConstructor
public class FaxServiceImpl implements FaxService {

    @Override
    public Fax getFax(long faxSeq) { }  // 인터페이스 설정 상속

    @Override
    public List<Fax> searchFaxes(...) { }

    @Override
    public Fax send(...) { }
}
```

| 장점                             | 단점                              |
|----------------------------------|-----------------------------------|
| 구현체 깔끔                      | 인터페이스 필수                   |
| 계약(Contract)으로서 트랜잭션 명시 | 인터페이스-구현체 둘 다 봐야 함 |
| 여러 구현체에 동일 적용          | Spring 권장 아님 (클래스 선언 권장) |

### 방법 4: AOP로 패턴 기반 자동 적용

```java
@Configuration
@EnableTransactionManagement
public class TransactionConfig {

    @Bean
    public TransactionInterceptor faxTransactionInterceptor(
            @Qualifier("faxTransactionManager") PlatformTransactionManager tm) {

        // 메서드 이름 패턴별 트랜잭션 속성 정의
        NameMatchTransactionAttributeSource source =
            new NameMatchTransactionAttributeSource();

        // 읽기 전용
        RuleBasedTransactionAttribute readOnly = new RuleBasedTransactionAttribute();
        readOnly.setReadOnly(true);

        // 쓰기
        RuleBasedTransactionAttribute write = new RuleBasedTransactionAttribute();
        write.setRollbackRules(List.of(new RollbackRuleAttribute(Exception.class)));

        // 패턴 매칭
        source.addTransactionalMethod("get*", readOnly);      // get으로 시작
        source.addTransactionalMethod("find*", readOnly);     // find로 시작
        source.addTransactionalMethod("search*", readOnly);   // search로 시작
        source.addTransactionalMethod("count*", readOnly);    // count로 시작
        source.addTransactionalMethod("exists*", readOnly);   // exists로 시작
        source.addTransactionalMethod("*", write);            // 나머지는 쓰기

        return new TransactionInterceptor(tm, source);
    }

    @Bean
    public Advisor faxTransactionAdvisor(
            @Qualifier("faxTransactionInterceptor") TransactionInterceptor interceptor) {

        // 적용 대상 패키지/클래스 지정
        AspectJExpressionPointcut pointcut = new AspectJExpressionPointcut();
        pointcut.setExpression(
            "execution(* com.knet.msa.fax.fax.service..*.*(..))");

        return new DefaultPointcutAdvisor(pointcut, interceptor);
    }
}
```

서비스에 어노테이션 불필요:

```java
@Service
@RequiredArgsConstructor
public class FaxServiceImpl implements FaxService {

    public Fax getFax(long faxSeq) { }         // 자동으로 readOnly=true

    public List<Fax> findAll() { }             // 자동으로 readOnly=true

    public List<Fax> searchFaxes(...) { }      // 자동으로 readOnly=true

    public void send(...) { }                   // 자동으로 쓰기 트랜잭션

    public void update(...) { }                 // 자동으로 쓰기 트랜잭션
}
```

| 장점                | 단점                         |
|---------------------|------------------------------|
| 서비스 코드 완전 깔끔 | 설정 복잡                   |
| 네이밍 컨벤션 강제  | 메서드명 실수 시 잘못 적용   |
| 일괄 정책 적용      | 예외 케이스 처리 어려움      |
| 어노테이션 없음     | 동작 파악하려면 설정 확인 필요 |

### 방법 5: 추상 클래스 상속

```java
// 추상 클래스에 공통 설정
@FaxTransactional
public abstract class AbstractFaxService {
    // 공통 메서드나 설정
}

// 상속받아 사용
@Service
public class FaxServiceImpl extends AbstractFaxService {

    @FaxTransactional(readOnly = true)
    public Fax getFax() { }

    public void send() { }  // 부모 클래스 설정 상속
}
```

| 장점           | 단점                     |
|----------------|--------------------------|
| 공통 설정 재사용 | 단일 상속 제한          |
| 계층 구조 명확 | 상속 구조 복잡해질 수 있음 |

### 방법 6: TransactionTemplate (프로그래밍 방식)

```java
@Service
@RequiredArgsConstructor
public class FaxServiceImpl {

    private final TransactionTemplate faxTransactionTemplate;
    private final TransactionTemplate faxReadOnlyTransactionTemplate;

    // 쓰기
    public Fax send(FaxSendDto dto) {
        return faxTransactionTemplate.execute(status -> {
            // 트랜잭션 내부 로직
            return faxMapper.insert(dto);
        });
    }

    // 읽기
    public Fax getFax(long faxSeq) {
        return faxReadOnlyTransactionTemplate.execute(status -> {
            return faxMapper.selectById(faxSeq);
        });
    }

    // 트랜잭션 불필요
    public List<String> getCodes() {
        return List.of("A", "B", "C");
    }
}
```

TransactionTemplate 설정:

```java
@Configuration
public class TransactionTemplateConfig {

    @Bean
    public TransactionTemplate faxTransactionTemplate(
            @Qualifier("faxTransactionManager") PlatformTransactionManager tm) {
        return new TransactionTemplate(tm);
    }

    @Bean
    public TransactionTemplate faxReadOnlyTransactionTemplate(
            @Qualifier("faxTransactionManager") PlatformTransactionManager tm) {
        TransactionTemplate template = new TransactionTemplate(tm);
        template.setReadOnly(true);
        return template;
    }
}
```

| 장점               | 단점                   |
|--------------------|------------------------|
| 세밀한 제어 가능   | 코드량 많음            |
| 트랜잭션 범위 명확 | 콜백 구조로 가독성 저하 |
| 조건부 트랜잭션 쉬움 | 보일러플레이트        |
| 프록시 이슈 없음   | 선언적 방식보다 번거로움 |

### 방법 7: 메서드 그룹별 내부 클래스 분리 (Reader/Writer)

```java
@Service
@RequiredArgsConstructor
public class FaxService {

    private final FaxReader reader;
    private final FaxWriter writer;

    // 위임만 함
    public Fax getFax(long id) { return reader.getFax(id); }
    public void send(FaxSendDto dto) { writer.send(dto); }

    // 읽기 전용 내부 서비스
    @Service
    @FaxTransactional(readOnly = true)
    @RequiredArgsConstructor
    static class FaxReader {
        private final FaxMapper faxMapper;

        public Fax getFax(long id) { return faxMapper.selectById(id); }
        public List<Fax> search(...) { return faxMapper.search(...); }
    }

    // 쓰기 내부 서비스
    @Service
    @FaxTransactional
    @RequiredArgsConstructor
    static class FaxWriter {
        private final FaxMapper faxMapper;

        public void send(FaxSendDto dto) { faxMapper.insert(dto); }
        public void cancel(long id) { faxMapper.updateStatus(id); }
    }
}
```

| 장점                     | 단점         |
|--------------------------|--------------|
| 읽기/쓰기 명확히 분리    | 클래스 많아짐 |
| 각 그룹에 클래스 레벨 설정 | 구조 복잡   |
| 내부 호출 문제 해결      | 위임 코드 필요 |

---

## 전체 비교

| 방법              | 코드량 | 명확성 | 유연성 | 복잡도 | 추천 상황             |
|-------------------|--------|--------|--------|--------|-----------------------|
| 클래스 기본값     | ⭐     | ⭐⭐   | ⭐⭐⭐ | ⭐     | 일반적인 상황         |
| 모든 메서드 명시  | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐     | 안전 최우선           |
| 인터페이스 선언   | ⭐⭐   | ⭐⭐   | ⭐⭐   | ⭐⭐   | 인터페이스 기반 설계  |
| AOP 패턴 기반     | ⭐     | ⭐     | ⭐⭐   | ⭐⭐⭐ | 네이밍 컨벤션 엄격한 팀 |
| 추상 클래스 상속  | ⭐⭐   | ⭐⭐   | ⭐⭐   | ⭐⭐   | 공통 로직 있을 때     |
| TransactionTemplate | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 세밀한 제어 필요     |
| Reader/Writer 분리 | ⭐⭐  | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐  | CQRS 패턴            |

---

## 실무 추천

| 상황                   | 추천 방식                               |
|------------------------|-----------------------------------------|
| 일반적인 경우          | 커스텀 어노테이션 + 클래스 기본값       |
| 네이밍 컨벤션 강한 팀  | AOP 패턴 기반                           |
| 복잡한 트랜잭션 로직   | TransactionTemplate 부분 도입          |
| 대부분 쓰기 작업 서비스 | 클래스 기본값 (쓰기) + 읽기만 오버라이드 |
| 대부분 읽기 작업 서비스 | 클래스 기본값 (읽기) + 쓰기만 오버라이드 |
| 트랜잭션 필요 메서드가 일부만 | 모든 메서드 명시                  |
| 안전 최우선            | 모든 메서드 명시                        |
