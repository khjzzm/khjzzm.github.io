---
layout: post
title: Spring Batch 완전 가이드
tags: [spring, java]
---

Spring Batch는 대용량 데이터 처리를 위한 경량 배치 프레임워크다. 로깅/추적, 트랜잭션 관리, 작업 재시작, 건너뛰기, 리소스 관리 등 엔터프라이즈 배치 처리에 필수적인 기능을 제공한다.

---

## Spring Batch란?

### 배치 처리의 특징

```
배치 처리 (Batch Processing):
- 대량의 데이터를 일괄 처리
- 사용자 개입 없이 자동 실행
- 정해진 시간에 실행 (스케줄링)
- 실패 시 재시작 및 복구 지원
```

### 배치 애플리케이션 요구사항

| 요구사항 | 설명 |
|----------|------|
| 대용량 처리 | 수백만 건의 데이터를 효율적으로 처리 |
| 자동화 | 사용자 개입 없이 실행 |
| 견고성 | 잘못된 데이터로 인한 중단 방지 |
| 신뢰성 | 로깅, 알림을 통한 추적 |
| 성능 | 지정된 시간 내 처리 완료 |

### Spring Batch vs Quartz

```
Spring Batch:
- "무엇을" 처리할지 정의
- 대용량 데이터 처리 로직
- 재시작, 건너뛰기, 청크 처리

Quartz:
- "언제" 실행할지 정의
- 스케줄링 (Cron 표현식)
- Spring Batch와 함께 사용
```

---

## 아키텍처

### 계층 구조

```
┌─────────────────────────────────────────────┐
│              Application Layer              │
│         (개발자가 작성하는 Job, Step)         │
├─────────────────────────────────────────────┤
│               Core Layer                    │
│    (JobLauncher, Job, Step, Flow 등)        │
├─────────────────────────────────────────────┤
│           Infrastructure Layer              │
│  (ItemReader, ItemWriter, JobRepository)    │
└─────────────────────────────────────────────┘
```

### 핵심 컴포넌트 관계

```
JobLauncher
    │
    ▼
   Job ──────────────────────────────┐
    │                                │
    ├── Step 1                       │
    │    ├── ItemReader              │
    │    ├── ItemProcessor           │
    │    └── ItemWriter              ▼
    │                           JobRepository
    ├── Step 2                  (메타데이터 저장)
    │    └── Tasklet                 │
    │                                │
    └── Step 3 ──────────────────────┘
```

---

## 핵심 개념

### Job

Job은 배치 처리의 최상위 단위로, 하나 이상의 Step으로 구성된다.

```java
@Configuration
public class JobConfig {

    @Bean
    public Job sampleJob(JobRepository jobRepository, Step step1, Step step2) {
        return new JobBuilder("sampleJob", jobRepository)
                .start(step1)
                .next(step2)
                .build();
    }
}
```

### JobInstance

```
Job 실행의 논리적 단위

예시:
- Job: 일별 정산 배치
- JobInstance (1월 1일): 1월 1일 데이터 처리
- JobInstance (1월 2일): 1월 2일 데이터 처리

→ 동일한 JobParameters로 성공한 JobInstance는 재실행 불가
→ 실패한 JobInstance는 재실행 가능
```

### JobParameters

```java
// JobParameters로 JobInstance 식별
JobParameters params = new JobParametersBuilder()
        .addString("date", "2024-01-01")
        .addLong("seq", 1L)
        .addLocalDateTime("runTime", LocalDateTime.now())
        .toJobParameters();

jobLauncher.run(job, params);
```

### JobExecution

```
JobInstance의 실제 실행 시도

JobInstance (1월 1일)
├── JobExecution #1 (실패)
├── JobExecution #2 (실패)
└── JobExecution #3 (성공)

JobExecution 정보:
- 상태 (COMPLETED, FAILED, STOPPED 등)
- 시작 시간, 종료 시간
- ExitStatus
- ExecutionContext
```

### Step

Step은 Job의 독립적인 처리 단위다.

```java
@Bean
public Step sampleStep(JobRepository jobRepository,
                       PlatformTransactionManager transactionManager,
                       ItemReader<String> reader,
                       ItemProcessor<String, String> processor,
                       ItemWriter<String> writer) {
    return new StepBuilder("sampleStep", jobRepository)
            .<String, String>chunk(100, transactionManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
}
```

### StepExecution

```
Step의 실제 실행 시도

StepExecution 정보:
- readCount: 읽은 아이템 수
- writeCount: 쓴 아이템 수
- commitCount: 커밋 횟수
- rollbackCount: 롤백 횟수
- skipCount: 건너뛴 아이템 수
- filterCount: 필터링된 아이템 수
```

### ExecutionContext

Step 또는 Job 간 데이터를 공유하는 저장소.

```java
// StepExecutionContext - Step 범위
@BeforeStep
public void beforeStep(StepExecution stepExecution) {
    ExecutionContext context = stepExecution.getExecutionContext();
    context.put("key", "value");
}

// JobExecutionContext - Job 범위 (Step 간 공유)
@BeforeStep
public void saveToJobContext(StepExecution stepExecution) {
    ExecutionContext jobContext = stepExecution.getJobExecution().getExecutionContext();
    jobContext.put("sharedData", data);
}
```

---

## Chunk 기반 처리

### Chunk란?

```
Chunk: 한 번에 처리할 아이템 묶음

처리 흐름:
1. ItemReader가 chunk size만큼 읽기
2. 각 아이템을 ItemProcessor로 처리
3. 처리된 아이템을 ItemWriter로 일괄 쓰기
4. 트랜잭션 커밋

예시 (chunk size = 10):
┌─────────────────────────────────────────────┐
│ Read 10 items → Process each → Write all    │
│                    ↓                        │
│               COMMIT                        │
├─────────────────────────────────────────────┤
│ Read 10 items → Process each → Write all    │
│                    ↓                        │
│               COMMIT                        │
└─────────────────────────────────────────────┘
```

### Chunk 처리 코드

```java
@Bean
public Step chunkStep(JobRepository jobRepository,
                      PlatformTransactionManager transactionManager) {
    return new StepBuilder("chunkStep", jobRepository)
            .<InputType, OutputType>chunk(100, transactionManager)  // chunk size
            .reader(itemReader())
            .processor(itemProcessor())
            .writer(itemWriter())
            .build();
}
```

### Chunk Size 결정 기준

```
고려 사항:
- 메모리 사용량: 클수록 메모리 많이 사용
- 트랜잭션 크기: 클수록 롤백 시 손실 큼
- 처리 속도: 클수록 커밋 횟수 감소
- I/O 효율: 클수록 배치 I/O 효율적

일반적인 권장:
- 시작: 100 ~ 1000
- 성능 테스트 후 조정
```

---

## ItemReader

### 주요 ItemReader 구현체

| 구현체 | 용도 |
|--------|------|
| JdbcCursorItemReader | JDBC 커서로 DB 조회 |
| JdbcPagingItemReader | 페이징으로 DB 조회 |
| JpaPagingItemReader | JPA 페이징 조회 |
| JpaCursorItemReader | JPA 커서 조회 |
| FlatFileItemReader | 파일 읽기 (CSV, 고정길이) |
| JsonItemReader | JSON 파일 읽기 |
| StaxEventItemReader | XML 파일 읽기 |

### JdbcCursorItemReader

```java
@Bean
public JdbcCursorItemReader<Customer> jdbcCursorReader(DataSource dataSource) {
    return new JdbcCursorItemReaderBuilder<Customer>()
            .name("customerReader")
            .dataSource(dataSource)
            .sql("SELECT id, name, email FROM customer WHERE status = ?")
            .preparedStatementSetter(ps -> ps.setString(1, "ACTIVE"))
            .rowMapper((rs, rowNum) -> Customer.builder()
                    .id(rs.getLong("id"))
                    .name(rs.getString("name"))
                    .email(rs.getString("email"))
                    .build())
            .build();
}
```

### JdbcPagingItemReader

```java
@Bean
public JdbcPagingItemReader<Customer> jdbcPagingReader(DataSource dataSource) {
    Map<String, Object> params = new HashMap<>();
    params.put("status", "ACTIVE");

    return new JdbcPagingItemReaderBuilder<Customer>()
            .name("customerPagingReader")
            .dataSource(dataSource)
            .selectClause("SELECT id, name, email")
            .fromClause("FROM customer")
            .whereClause("WHERE status = :status")
            .sortKeys(Map.of("id", Order.ASCENDING))
            .parameterValues(params)
            .pageSize(100)
            .rowMapper(new BeanPropertyRowMapper<>(Customer.class))
            .build();
}
```

### JpaPagingItemReader

```java
@Bean
public JpaPagingItemReader<Customer> jpaPagingReader(EntityManagerFactory emf) {
    return new JpaPagingItemReaderBuilder<Customer>()
            .name("customerJpaReader")
            .entityManagerFactory(emf)
            .queryString("SELECT c FROM Customer c WHERE c.status = :status")
            .parameterValues(Map.of("status", "ACTIVE"))
            .pageSize(100)
            .build();
}
```

### JpaCursorItemReader (Spring Batch 5.0+)

```java
@Bean
public JpaCursorItemReader<Customer> jpaCursorReader(EntityManagerFactory emf) {
    return new JpaCursorItemReaderBuilder<Customer>()
            .name("customerCursorReader")
            .entityManagerFactory(emf)
            .queryString("SELECT c FROM Customer c WHERE c.status = :status")
            .parameterValues(Map.of("status", "ACTIVE"))
            .build();
}
```

### FlatFileItemReader

```java
@Bean
public FlatFileItemReader<Customer> flatFileReader() {
    return new FlatFileItemReaderBuilder<Customer>()
            .name("customerFileReader")
            .resource(new ClassPathResource("customers.csv"))
            .encoding("UTF-8")
            .linesToSkip(1)  // 헤더 스킵
            .delimited()
            .delimiter(",")
            .names("id", "name", "email", "phone")
            .targetType(Customer.class)
            .build();
}
```

### 커스텀 ItemReader

```java
public class CustomItemReader implements ItemReader<String> {

    private final Iterator<String> iterator;

    public CustomItemReader(List<String> items) {
        this.iterator = items.iterator();
    }

    @Override
    public String read() {
        if (iterator.hasNext()) {
            return iterator.next();
        }
        return null;  // null 반환 시 읽기 종료
    }
}
```

---

## ItemProcessor

### 기본 ItemProcessor

```java
@Bean
public ItemProcessor<Customer, CustomerDto> customerProcessor() {
    return customer -> {
        // null 반환 시 해당 아이템은 Writer로 전달되지 않음 (필터링)
        if (!customer.isActive()) {
            return null;
        }

        return CustomerDto.builder()
                .id(customer.getId())
                .name(customer.getName().toUpperCase())
                .email(customer.getEmail())
                .build();
    };
}
```

### ValidatingItemProcessor

```java
@Bean
public ValidatingItemProcessor<Customer> validatingProcessor() {
    ValidatingItemProcessor<Customer> processor = new ValidatingItemProcessor<>();
    processor.setValidator(new CustomerValidator());
    processor.setFilter(true);  // 검증 실패 시 필터링 (예외 대신)
    return processor;
}

public class CustomerValidator implements Validator<Customer> {
    @Override
    public void validate(Customer customer) throws ValidationException {
        if (customer.getEmail() == null || !customer.getEmail().contains("@")) {
            throw new ValidationException("Invalid email");
        }
    }
}
```

### CompositeItemProcessor

```java
@Bean
public CompositeItemProcessor<Customer, CustomerDto> compositeProcessor() {
    return new CompositeItemProcessorBuilder<Customer, CustomerDto>()
            .delegates(
                    validatingProcessor(),
                    transformProcessor(),
                    enrichProcessor()
            )
            .build();
}
```

### ClassifierCompositeItemProcessor

```java
@Bean
public ClassifierCompositeItemProcessor<Customer, CustomerDto> classifierProcessor() {
    ClassifierCompositeItemProcessor<Customer, CustomerDto> processor =
            new ClassifierCompositeItemProcessor<>();

    processor.setClassifier(customer -> {
        if ("VIP".equals(customer.getGrade())) {
            return vipProcessor();
        } else {
            return normalProcessor();
        }
    });

    return processor;
}
```

---

## ItemWriter

### 주요 ItemWriter 구현체

| 구현체 | 용도 |
|--------|------|
| JdbcBatchItemWriter | JDBC 배치 INSERT/UPDATE |
| JpaItemWriter | JPA persist/merge |
| FlatFileItemWriter | 파일 쓰기 |
| JsonFileItemWriter | JSON 파일 쓰기 |
| CompositeItemWriter | 여러 Writer 조합 |

### JdbcBatchItemWriter

```java
@Bean
public JdbcBatchItemWriter<Customer> jdbcBatchWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Customer>()
            .dataSource(dataSource)
            .sql("INSERT INTO customer (id, name, email) VALUES (:id, :name, :email)")
            .beanMapped()
            .build();
}
```

```java
// ItemPreparedStatementSetter 사용
@Bean
public JdbcBatchItemWriter<Customer> jdbcBatchWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Customer>()
            .dataSource(dataSource)
            .sql("INSERT INTO customer (id, name, email) VALUES (?, ?, ?)")
            .itemPreparedStatementSetter((customer, ps) -> {
                ps.setLong(1, customer.getId());
                ps.setString(2, customer.getName());
                ps.setString(3, customer.getEmail());
            })
            .build();
}
```

### JpaItemWriter

```java
@Bean
public JpaItemWriter<Customer> jpaWriter(EntityManagerFactory emf) {
    JpaItemWriter<Customer> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    writer.setUsePersist(true);  // persist 사용 (기본: merge)
    return writer;
}
```

### FlatFileItemWriter

```java
@Bean
public FlatFileItemWriter<Customer> fileWriter() {
    BeanWrapperFieldExtractor<Customer> fieldExtractor = new BeanWrapperFieldExtractor<>();
    fieldExtractor.setNames(new String[]{"id", "name", "email"});

    DelimitedLineAggregator<Customer> lineAggregator = new DelimitedLineAggregator<>();
    lineAggregator.setDelimiter(",");
    lineAggregator.setFieldExtractor(fieldExtractor);

    return new FlatFileItemWriterBuilder<Customer>()
            .name("customerFileWriter")
            .resource(new FileSystemResource("output/customers.csv"))
            .encoding("UTF-8")
            .headerCallback(writer -> writer.write("ID,NAME,EMAIL"))
            .lineAggregator(lineAggregator)
            .footerCallback(writer -> writer.write("Total: " + count))
            .build();
}
```

### CompositeItemWriter

```java
@Bean
public CompositeItemWriter<Customer> compositeWriter() {
    return new CompositeItemWriterBuilder<Customer>()
            .delegates(
                    jpaWriter(),
                    kafkaWriter(),
                    cacheWriter()
            )
            .build();
}
```

### 커스텀 ItemWriter

```java
public class CustomItemWriter implements ItemWriter<Customer> {

    private final CustomerRepository repository;

    @Override
    public void write(Chunk<? extends Customer> chunk) {
        for (Customer customer : chunk) {
            repository.save(customer);
        }
        // 또는 repository.saveAll(chunk.getItems());
    }
}
```

---

## Tasklet

Chunk 방식이 아닌 단순 작업에 사용.

### 기본 Tasklet

```java
@Bean
public Step taskletStep(JobRepository jobRepository,
                        PlatformTransactionManager transactionManager) {
    return new StepBuilder("taskletStep", jobRepository)
            .tasklet((contribution, chunkContext) -> {
                // 단순 작업 수행
                log.info("Tasklet 실행");
                return RepeatStatus.FINISHED;
            }, transactionManager)
            .build();
}
```

### Tasklet 구현

```java
@Component
public class CleanupTasklet implements Tasklet {

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                 ChunkContext chunkContext) throws Exception {
        // 임시 파일 삭제
        Files.walk(Path.of("/tmp/batch"))
                .filter(Files::isRegularFile)
                .forEach(path -> {
                    try {
                        Files.delete(path);
                    } catch (IOException e) {
                        log.error("Failed to delete: {}", path, e);
                    }
                });

        return RepeatStatus.FINISHED;
    }
}
```

### RepeatStatus

```java
RepeatStatus.FINISHED    // 완료, 다음 Step으로 이동
RepeatStatus.CONTINUABLE // 반복 실행 (조건 충족까지)
```

---

## Flow 제어

### 순차 실행

```java
@Bean
public Job sequentialJob(JobRepository jobRepository) {
    return new JobBuilder("sequentialJob", jobRepository)
            .start(step1())
            .next(step2())
            .next(step3())
            .build();
}
```

### 조건부 분기

```java
@Bean
public Job conditionalJob(JobRepository jobRepository) {
    return new JobBuilder("conditionalJob", jobRepository)
            .start(step1())
                .on("FAILED").to(failureStep())
                .from(step1()).on("*").to(step2())
            .from(step2())
                .on("COMPLETED").to(successStep())
                .from(step2()).on("*").to(errorStep())
            .end()
            .build();
}
```

### ExitStatus 커스터마이징

```java
@Bean
public Step decisionStep(JobRepository jobRepository,
                         PlatformTransactionManager transactionManager) {
    return new StepBuilder("decisionStep", jobRepository)
            .tasklet((contribution, chunkContext) -> {
                // 조건에 따라 ExitStatus 설정
                if (someCondition) {
                    contribution.setExitStatus(new ExitStatus("SKIP"));
                }
                return RepeatStatus.FINISHED;
            }, transactionManager)
            .build();
}

@Bean
public Job jobWithCustomExit(JobRepository jobRepository) {
    return new JobBuilder("jobWithCustomExit", jobRepository)
            .start(decisionStep())
                .on("SKIP").to(skipStep())
                .from(decisionStep()).on("*").to(normalStep())
            .end()
            .build();
}
```

### JobExecutionDecider

```java
public class MyDecider implements JobExecutionDecider {

    @Override
    public FlowExecutionStatus decide(JobExecution jobExecution,
                                       StepExecution stepExecution) {
        String status = someService.checkStatus();

        if ("PROCESS".equals(status)) {
            return new FlowExecutionStatus("PROCESS");
        } else if ("SKIP".equals(status)) {
            return new FlowExecutionStatus("SKIP");
        }
        return FlowExecutionStatus.COMPLETED;
    }
}

@Bean
public Job deciderJob(JobRepository jobRepository) {
    return new JobBuilder("deciderJob", jobRepository)
            .start(initialStep())
            .next(myDecider())
                .on("PROCESS").to(processStep())
                .on("SKIP").to(skipStep())
                .from(myDecider()).on("*").to(defaultStep())
            .end()
            .build();
}
```

### Flow 분리

```java
@Bean
public Flow flow1() {
    return new FlowBuilder<SimpleFlow>("flow1")
            .start(step1())
            .next(step2())
            .build();
}

@Bean
public Flow flow2() {
    return new FlowBuilder<SimpleFlow>("flow2")
            .start(step3())
            .next(step4())
            .build();
}

@Bean
public Job flowJob(JobRepository jobRepository) {
    return new JobBuilder("flowJob", jobRepository)
            .start(flow1())
            .next(flow2())
            .end()
            .build();
}
```

---

## Skip과 Retry

### Skip 설정

```java
@Bean
public Step skipStep(JobRepository jobRepository,
                     PlatformTransactionManager transactionManager) {
    return new StepBuilder("skipStep", jobRepository)
            .<String, String>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            .skipLimit(10)  // 최대 10개까지 스킵
            .skip(ValidationException.class)
            .skip(FlatFileParseException.class)
            .noSkip(FileNotFoundException.class)  // 이 예외는 스킵하지 않음
            .build();
}
```

### Skip Policy

```java
@Bean
public Step customSkipStep(JobRepository jobRepository,
                           PlatformTransactionManager transactionManager) {
    return new StepBuilder("customSkipStep", jobRepository)
            .<String, String>chunk(100, transactionManager)
            .reader(reader())
            .writer(writer())
            .faultTolerant()
            .skipPolicy(new CustomSkipPolicy())
            .build();
}

public class CustomSkipPolicy implements SkipPolicy {

    private static final int MAX_SKIP = 100;
    private int skipCount = 0;

    @Override
    public boolean shouldSkip(Throwable t, long skipCount) {
        if (t instanceof ValidationException && this.skipCount < MAX_SKIP) {
            this.skipCount++;
            return true;
        }
        return false;
    }
}
```

### Retry 설정

```java
@Bean
public Step retryStep(JobRepository jobRepository,
                      PlatformTransactionManager transactionManager) {
    return new StepBuilder("retryStep", jobRepository)
            .<String, String>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            .retryLimit(3)  // 최대 3번 재시도
            .retry(DeadlockLoserDataAccessException.class)
            .retry(TransientDataAccessException.class)
            .noRetry(ValidationException.class)  // 이 예외는 재시도하지 않음
            .build();
}
```

### Retry + Skip 조합

```java
@Bean
public Step faultTolerantStep(JobRepository jobRepository,
                              PlatformTransactionManager transactionManager) {
    return new StepBuilder("faultTolerantStep", jobRepository)
            .<Customer, Customer>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            // Retry 설정
            .retryLimit(3)
            .retry(TransientDataAccessException.class)
            // Skip 설정 (Retry 실패 후 Skip)
            .skipLimit(10)
            .skip(ValidationException.class)
            .skip(TransientDataAccessException.class)
            .build();
}
```

---

## Listener

### JobExecutionListener

```java
@Component
public class JobLoggingListener implements JobExecutionListener {

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("Job 시작: {}", jobExecution.getJobInstance().getJobName());
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        log.info("Job 종료: {} - 상태: {}",
                jobExecution.getJobInstance().getJobName(),
                jobExecution.getStatus());

        if (jobExecution.getStatus() == BatchStatus.FAILED) {
            // 알림 발송
            notificationService.sendAlert(jobExecution);
        }
    }
}
```

### StepExecutionListener

```java
@Component
public class StepLoggingListener implements StepExecutionListener {

    @Override
    public void beforeStep(StepExecution stepExecution) {
        log.info("Step 시작: {}", stepExecution.getStepName());
    }

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        log.info("Step 종료: {} - Read: {}, Write: {}, Skip: {}",
                stepExecution.getStepName(),
                stepExecution.getReadCount(),
                stepExecution.getWriteCount(),
                stepExecution.getSkipCount());

        // ExitStatus 변경 가능
        return stepExecution.getExitStatus();
    }
}
```

### ChunkListener

```java
@Component
public class ChunkLoggingListener implements ChunkListener {

    @Override
    public void beforeChunk(ChunkContext context) {
        log.debug("Chunk 처리 시작");
    }

    @Override
    public void afterChunk(ChunkContext context) {
        StepExecution stepExecution = context.getStepContext().getStepExecution();
        log.info("Chunk 처리 완료 - 누적 Write: {}", stepExecution.getWriteCount());
    }

    @Override
    public void afterChunkError(ChunkContext context) {
        log.error("Chunk 처리 중 오류 발생");
    }
}
```

### ItemReadListener / ItemProcessListener / ItemWriteListener

```java
@Component
public class ItemLoggingListener implements ItemReadListener<Customer>,
                                            ItemProcessListener<Customer, CustomerDto>,
                                            ItemWriteListener<CustomerDto> {

    @Override
    public void onReadError(Exception ex) {
        log.error("읽기 오류: {}", ex.getMessage());
    }

    @Override
    public void onProcessError(Customer item, Exception ex) {
        log.error("처리 오류 - ID: {}, Error: {}", item.getId(), ex.getMessage());
    }

    @Override
    public void onWriteError(Exception ex, Chunk<? extends CustomerDto> items) {
        log.error("쓰기 오류 - 건수: {}, Error: {}", items.size(), ex.getMessage());
    }
}
```

### SkipListener

```java
@Component
public class SkipLoggingListener implements SkipListener<Customer, CustomerDto> {

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("읽기 중 스킵: {}", t.getMessage());
    }

    @Override
    public void onSkipInProcess(Customer item, Throwable t) {
        log.warn("처리 중 스킵 - ID: {}, 사유: {}", item.getId(), t.getMessage());
        // 스킵된 데이터 별도 저장
        skipRepository.save(new SkipRecord(item.getId(), t.getMessage()));
    }

    @Override
    public void onSkipInWrite(CustomerDto item, Throwable t) {
        log.warn("쓰기 중 스킵 - ID: {}, 사유: {}", item.getId(), t.getMessage());
    }
}
```

### Listener 등록

```java
@Bean
public Step stepWithListeners(JobRepository jobRepository,
                              PlatformTransactionManager transactionManager) {
    return new StepBuilder("stepWithListeners", jobRepository)
            .<Customer, CustomerDto>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .listener(stepLoggingListener)
            .listener(chunkLoggingListener)
            .listener(itemLoggingListener)
            .listener(skipLoggingListener)
            .build();
}

@Bean
public Job jobWithListeners(JobRepository jobRepository, Step step) {
    return new JobBuilder("jobWithListeners", jobRepository)
            .listener(jobLoggingListener)
            .start(step)
            .build();
}
```

---

## 스케일링

### Multi-threaded Step

```java
@Bean
public Step multiThreadedStep(JobRepository jobRepository,
                              PlatformTransactionManager transactionManager) {
    return new StepBuilder("multiThreadedStep", jobRepository)
            .<Customer, Customer>chunk(100, transactionManager)
            .reader(synchronizedReader())  // Thread-safe Reader 필요
            .processor(processor())
            .writer(writer())
            .taskExecutor(taskExecutor())
            .throttleLimit(4)  // 동시 실행 스레드 수 제한
            .build();
}

@Bean
public TaskExecutor taskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(8);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("batch-");
    return executor;
}

@Bean
@StepScope
public SynchronizedItemStreamReader<Customer> synchronizedReader() {
    JdbcCursorItemReader<Customer> reader = new JdbcCursorItemReaderBuilder<Customer>()
            // ... 설정
            .build();

    SynchronizedItemStreamReader<Customer> syncReader = new SynchronizedItemStreamReader<>();
    syncReader.setDelegate(reader);
    return syncReader;
}
```

### Parallel Steps

```java
@Bean
public Job parallelJob(JobRepository jobRepository) {
    Flow flow1 = new FlowBuilder<SimpleFlow>("flow1")
            .start(step1())
            .build();

    Flow flow2 = new FlowBuilder<SimpleFlow>("flow2")
            .start(step2())
            .build();

    Flow flow3 = new FlowBuilder<SimpleFlow>("flow3")
            .start(step3())
            .build();

    Flow parallelFlow = new FlowBuilder<SimpleFlow>("parallelFlow")
            .split(taskExecutor())
            .add(flow1, flow2, flow3)
            .build();

    return new JobBuilder("parallelJob", jobRepository)
            .start(parallelFlow)
            .next(finalStep())
            .end()
            .build();
}
```

### Partitioning

```java
@Bean
public Step partitionedStep(JobRepository jobRepository) {
    return new StepBuilder("partitionedStep", jobRepository)
            .partitioner("workerStep", partitioner())
            .step(workerStep())
            .gridSize(4)  // 파티션 수
            .taskExecutor(taskExecutor())
            .build();
}

@Bean
public Partitioner partitioner() {
    return gridSize -> {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            context.putLong("minId", i * 10000L);
            context.putLong("maxId", (i + 1) * 10000L - 1);
            partitions.put("partition" + i, context);
        }

        return partitions;
    };
}

@Bean
public Step workerStep(JobRepository jobRepository,
                       PlatformTransactionManager transactionManager) {
    return new StepBuilder("workerStep", jobRepository)
            .<Customer, Customer>chunk(100, transactionManager)
            .reader(partitionedReader(null, null))  // @StepScope로 주입
            .writer(writer())
            .build();
}

@Bean
@StepScope
public JdbcPagingItemReader<Customer> partitionedReader(
        @Value("#{stepExecutionContext['minId']}") Long minId,
        @Value("#{stepExecutionContext['maxId']}") Long maxId) {

    Map<String, Object> params = new HashMap<>();
    params.put("minId", minId);
    params.put("maxId", maxId);

    return new JdbcPagingItemReaderBuilder<Customer>()
            .name("partitionedReader")
            .dataSource(dataSource)
            .selectClause("SELECT *")
            .fromClause("FROM customer")
            .whereClause("WHERE id BETWEEN :minId AND :maxId")
            .sortKeys(Map.of("id", Order.ASCENDING))
            .parameterValues(params)
            .pageSize(100)
            .rowMapper(new BeanPropertyRowMapper<>(Customer.class))
            .build();
}
```

---

## 메타데이터 스키마

### 주요 테이블

```sql
-- Job 관련
BATCH_JOB_INSTANCE      -- JobInstance 정보
BATCH_JOB_EXECUTION     -- JobExecution 정보
BATCH_JOB_EXECUTION_PARAMS  -- JobParameters

-- Step 관련
BATCH_STEP_EXECUTION    -- StepExecution 정보
BATCH_STEP_EXECUTION_CONTEXT  -- Step ExecutionContext

-- 공통
BATCH_JOB_EXECUTION_CONTEXT  -- Job ExecutionContext
```

### 테이블 관계

```
BATCH_JOB_INSTANCE (1) ─────┬───── (*) BATCH_JOB_EXECUTION
                            │              │
                            │              ├── (*) BATCH_JOB_EXECUTION_PARAMS
                            │              │
                            │              └── (1) BATCH_JOB_EXECUTION_CONTEXT
                            │
                            └───── (*) BATCH_STEP_EXECUTION
                                           │
                                           └── (1) BATCH_STEP_EXECUTION_CONTEXT
```

### 스키마 초기화

```yaml
# application.yml
spring:
  batch:
    jdbc:
      initialize-schema: always  # always, embedded, never
      table-prefix: BATCH_       # 테이블 접두사
```

---

## Spring Batch 5.x 변경사항

### JobBuilderFactory, StepBuilderFactory 제거

```java
// Spring Batch 4.x (Deprecated)
@Autowired
private JobBuilderFactory jobBuilderFactory;
@Autowired
private StepBuilderFactory stepBuilderFactory;

@Bean
public Job oldJob() {
    return jobBuilderFactory.get("oldJob")
            .start(step())
            .build();
}

// Spring Batch 5.x
@Bean
public Job newJob(JobRepository jobRepository) {
    return new JobBuilder("newJob", jobRepository)
            .start(step())
            .build();
}

@Bean
public Step newStep(JobRepository jobRepository,
                    PlatformTransactionManager transactionManager) {
    return new StepBuilder("newStep", jobRepository)
            .<String, String>chunk(100, transactionManager)
            .reader(reader())
            .writer(writer())
            .build();
}
```

### @EnableBatchProcessing 변경

```java
// Spring Batch 5.x - Spring Boot 3.x에서는 자동 설정
// @EnableBatchProcessing 생략 가능

@SpringBootApplication
public class BatchApplication {
    public static void main(String[] args) {
        SpringApplication.run(BatchApplication.class, args);
    }
}
```

### ItemWriter Chunk 파라미터

```java
// Spring Batch 4.x
public void write(List<? extends Customer> items)

// Spring Batch 5.x
public void write(Chunk<? extends Customer> chunk)
```

### JobParameter 타입 확장

```java
// Spring Batch 4.x: String, Long, Double, Date만 지원

// Spring Batch 5.x: 모든 타입 지원
JobParameters params = new JobParametersBuilder()
        .addLocalDate("date", LocalDate.now())
        .addLocalDateTime("dateTime", LocalDateTime.now())
        .addJobParameter("custom", new CustomType(), CustomType.class)
        .toJobParameters();
```

---

## 실행 설정

### 애플리케이션 설정

```yaml
spring:
  batch:
    job:
      enabled: true            # 자동 실행 여부 (기본: true)
      name: myJob              # 실행할 Job 이름 지정
    jdbc:
      initialize-schema: always
      isolation-level-for-create: default
```

### 프로그래밍 방식 실행

```java
@Component
@RequiredArgsConstructor
public class BatchScheduler {

    private final JobLauncher jobLauncher;
    private final Job myJob;

    @Scheduled(cron = "0 0 2 * * *")  // 매일 02:00
    public void runJob() {
        try {
            JobParameters params = new JobParametersBuilder()
                    .addLocalDateTime("runTime", LocalDateTime.now())
                    .toJobParameters();

            JobExecution execution = jobLauncher.run(myJob, params);
            log.info("Job 완료: {}", execution.getStatus());
        } catch (Exception e) {
            log.error("Job 실행 실패", e);
        }
    }
}
```

### CommandLineRunner로 실행

```java
@Component
@RequiredArgsConstructor
public class BatchRunner implements CommandLineRunner {

    private final JobLauncher jobLauncher;
    private final Job myJob;

    @Override
    public void run(String... args) throws Exception {
        JobParameters params = new JobParametersBuilder()
                .addString("inputFile", args[0])
                .addLocalDateTime("runTime", LocalDateTime.now())
                .toJobParameters();

        jobLauncher.run(myJob, params);
    }
}
```

---

## Best Practices

### 1. 멱등성 보장

```java
// 동일한 데이터를 다시 처리해도 결과가 같도록
@Bean
public JdbcBatchItemWriter<Customer> idempotentWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Customer>()
            .dataSource(dataSource)
            .sql("""
                INSERT INTO customer (id, name, email, updated_at)
                VALUES (:id, :name, :email, :updatedAt)
                ON DUPLICATE KEY UPDATE
                    name = :name,
                    email = :email,
                    updated_at = :updatedAt
                """)
            .beanMapped()
            .build();
}
```

### 2. 적절한 Chunk Size 설정

```java
// 성능 테스트로 최적 chunk size 결정
// 일반적으로 100 ~ 1000 사이에서 시작

@Bean
public Step optimizedStep(JobRepository jobRepository,
                          PlatformTransactionManager transactionManager) {
    return new StepBuilder("optimizedStep", jobRepository)
            .<Customer, Customer>chunk(500, transactionManager)
            .reader(reader())
            .writer(writer())
            .build();
}
```

### 3. Reader 최적화

```java
// Paging Reader 사용 시 정렬 키 지정 필수
@Bean
public JdbcPagingItemReader<Customer> optimizedReader(DataSource dataSource) {
    return new JdbcPagingItemReaderBuilder<Customer>()
            .name("optimizedReader")
            .dataSource(dataSource)
            .fetchSize(1000)  // JDBC fetch size
            .pageSize(1000)   // 페이지 크기
            .selectClause("SELECT id, name, email")
            .fromClause("FROM customer")
            .whereClause("WHERE status = 'ACTIVE'")
            .sortKeys(Map.of("id", Order.ASCENDING))  // 정렬 키 필수
            .rowMapper(new BeanPropertyRowMapper<>(Customer.class))
            .build();
}
```

### 4. 에러 처리 전략

```java
@Bean
public Step robustStep(JobRepository jobRepository,
                       PlatformTransactionManager transactionManager) {
    return new StepBuilder("robustStep", jobRepository)
            .<Customer, Customer>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            // 네트워크/DB 일시 오류는 재시도
            .retryLimit(3)
            .retry(TransientDataAccessException.class)
            .retry(DeadlockLoserDataAccessException.class)
            // 데이터 오류는 스킵
            .skipLimit(100)
            .skip(ValidationException.class)
            // 스킵된 항목 로깅
            .listener(skipLoggingListener)
            .build();
}
```

### 5. 트랜잭션 관리

```java
// Reader: 트랜잭션 외부 (각 청크마다 새로운 커서)
// Processor + Writer: 트랜잭션 내부

// Writer에서 외부 API 호출 시 주의
@Bean
public Step transactionAwareStep(JobRepository jobRepository,
                                  PlatformTransactionManager transactionManager) {
    return new StepBuilder("transactionAwareStep", jobRepository)
            .<Order, Order>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(items -> {
                // DB 저장 (트랜잭션 내)
                repository.saveAll(items);

                // 외부 API 호출은 별도 처리 권장
                // (트랜잭션 롤백 시 API 호출은 되돌릴 수 없음)
            })
            .build();
}
```

---

## 실무 예제

### CSV to Database

```java
@Configuration
@RequiredArgsConstructor
public class CsvToDbJobConfig {

    private final JobRepository jobRepository;
    private final PlatformTransactionManager transactionManager;
    private final DataSource dataSource;

    @Bean
    public Job csvToDbJob() {
        return new JobBuilder("csvToDbJob", jobRepository)
                .start(csvToDbStep())
                .build();
    }

    @Bean
    public Step csvToDbStep() {
        return new StepBuilder("csvToDbStep", jobRepository)
                .<Customer, Customer>chunk(1000, transactionManager)
                .reader(csvReader())
                .processor(validatingProcessor())
                .writer(jdbcWriter())
                .faultTolerant()
                .skipLimit(100)
                .skip(FlatFileParseException.class)
                .skip(ValidationException.class)
                .listener(skipListener())
                .build();
    }

    @Bean
    @StepScope
    public FlatFileItemReader<Customer> csvReader() {
        return new FlatFileItemReaderBuilder<Customer>()
                .name("csvReader")
                .resource(new ClassPathResource("customers.csv"))
                .linesToSkip(1)
                .delimited()
                .names("id", "name", "email", "phone")
                .targetType(Customer.class)
                .build();
    }

    @Bean
    public ItemProcessor<Customer, Customer> validatingProcessor() {
        return customer -> {
            if (customer.getEmail() == null || !customer.getEmail().contains("@")) {
                throw new ValidationException("Invalid email: " + customer.getId());
            }
            return customer;
        };
    }

    @Bean
    public JdbcBatchItemWriter<Customer> jdbcWriter() {
        return new JdbcBatchItemWriterBuilder<Customer>()
                .dataSource(dataSource)
                .sql("INSERT INTO customer (id, name, email, phone) VALUES (:id, :name, :email, :phone)")
                .beanMapped()
                .build();
    }
}
```

### 대용량 데이터 마이그레이션

```java
@Configuration
@RequiredArgsConstructor
public class MigrationJobConfig {

    @Bean
    public Job migrationJob(JobRepository jobRepository, Step partitionedStep) {
        return new JobBuilder("migrationJob", jobRepository)
                .start(partitionedStep)
                .build();
    }

    @Bean
    public Step partitionedStep(JobRepository jobRepository,
                                 Step workerStep,
                                 TaskExecutor taskExecutor) {
        return new StepBuilder("partitionedStep", jobRepository)
                .partitioner("workerStep", rangePartitioner())
                .step(workerStep)
                .gridSize(10)
                .taskExecutor(taskExecutor)
                .build();
    }

    @Bean
    public Partitioner rangePartitioner() {
        return gridSize -> {
            long min = jdbcTemplate.queryForObject("SELECT MIN(id) FROM source_table", Long.class);
            long max = jdbcTemplate.queryForObject("SELECT MAX(id) FROM source_table", Long.class);
            long range = (max - min) / gridSize + 1;

            Map<String, ExecutionContext> partitions = new HashMap<>();
            for (int i = 0; i < gridSize; i++) {
                ExecutionContext context = new ExecutionContext();
                context.putLong("minId", min + (i * range));
                context.putLong("maxId", Math.min(min + ((i + 1) * range) - 1, max));
                partitions.put("partition" + i, context);
            }
            return partitions;
        };
    }

    @Bean
    public Step workerStep(JobRepository jobRepository,
                           PlatformTransactionManager transactionManager) {
        return new StepBuilder("workerStep", jobRepository)
                .<SourceEntity, TargetEntity>chunk(1000, transactionManager)
                .reader(partitionedReader(null, null))
                .processor(migrationProcessor())
                .writer(jpaWriter())
                .build();
    }

    @Bean
    @StepScope
    public JpaPagingItemReader<SourceEntity> partitionedReader(
            @Value("#{stepExecutionContext['minId']}") Long minId,
            @Value("#{stepExecutionContext['maxId']}") Long maxId) {

        return new JpaPagingItemReaderBuilder<SourceEntity>()
                .name("partitionedReader")
                .entityManagerFactory(entityManagerFactory)
                .queryString("SELECT s FROM SourceEntity s WHERE s.id BETWEEN :minId AND :maxId ORDER BY s.id")
                .parameterValues(Map.of("minId", minId, "maxId", maxId))
                .pageSize(1000)
                .build();
    }
}
```

---

## 정리

| 구성요소 | 역할 |
|----------|------|
| Job | 배치 처리의 최상위 단위 |
| Step | Job의 독립적인 처리 단위 |
| ItemReader | 데이터 읽기 |
| ItemProcessor | 데이터 변환/필터링 |
| ItemWriter | 데이터 쓰기 |
| JobRepository | 메타데이터 저장 |
| JobLauncher | Job 실행 |

### Chunk vs Tasklet

| 방식 | 사용 시점 |
|------|----------|
| Chunk | 대량 데이터 처리 (읽기-처리-쓰기 반복) |
| Tasklet | 단순 작업 (파일 삭제, 초기화 등) |

### 스케일링 전략

| 전략 | 설명 | 사용 시점 |
|------|------|----------|
| Multi-threaded | Step 내 병렬 처리 | 간단한 병렬화 |
| Parallel Steps | Step 간 병렬 실행 | 독립적인 Step들 |
| Partitioning | 데이터 분할 처리 | 대용량 데이터 |

> Spring Batch는 대용량 데이터 처리의 표준 프레임워크다.
> Chunk 기반 처리, Skip/Retry, Partitioning을 활용하면 안정적이고 확장 가능한 배치 시스템을 구축할 수 있다.
