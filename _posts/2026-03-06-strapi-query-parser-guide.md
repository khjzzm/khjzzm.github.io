---
layout: post
title: Strapi 스타일 동적 쿼리 파서 - HTTP 파라미터를 DB 쿼리로 변환하기 (MyBatis + jOOQ)
tags: [ kotlin, spring, mybatis, jooq ]
---

HTTP 쿼리 파라미터를 DB 쿼리로 변환하는 파이프라인을 구현했다. Strapi 스타일의 필터 문법을 채택하여, 프론트엔드에서 유연하게 검색 조건을 전달하고 백엔드에서 MyBatis 또는 jOOQ로 SQL을 생성한다.

## 전체 흐름

```
HTTP 요청 파라미터
    |
    v
StrapiQueryParser  -- (1) 파싱
    |
    v
StrapiQuery (FilterNode 트리 포함)  -- (2) 중간 표현
    |
    |-->  MybatisSearchCriteria  -- (3a) MyBatis SQL 문자열로 변환
    |        +-- MybatisQueryBuilder (빌더)
    |        +-- MybatisSqlProvider (SQL 생성)
    |
    +-->  JooqSearchCriteria  -- (3b) jOOQ Condition 객체로 변환
             +-- JooqQueryBuilder (빌더)
             +-- JooqExtensions (유틸)
```

---

## 1단계: 기본 타입

### FilterOperator - 필터 연산자 enum

HTTP 쿼리 `filters[serviceType][$eq]=FAX`에서 `$eq` 부분을 이 enum으로 매핑한다.

```
filters[serviceType][$eq]=FAX
                     ^^^^
                     이 부분이 FilterOperator
```

#### 연산자별 SQL 매핑

| 연산자             | HTTP 예시                | 생성되는 SQL                               |
|-----------------|------------------------|----------------------------------------|
| `$eq`           | `[$eq]=FAX`            | `service_type = 'FAX'`                 |
| `$eqi`          | `[$eqi]=fax`           | `LOWER(service_type) = LOWER('fax')`   |
| `$ne`           | `[$ne]=FAX`            | `service_type != 'FAX'`                |
| `$nei`          | `[$nei]=fax`           | `LOWER(service_type) != LOWER('fax')`  |
| `$lt`           | `[$lt]=100`            | `amount < 100`                         |
| `$lte`          | `[$lte]=100`           | `amount <= 100`                        |
| `$gt`           | `[$gt]=100`            | `amount > 100`                         |
| `$gte`          | `[$gte]=100`           | `amount >= 100`                        |
| `$in`           | `[$in]=A,B,C`          | `service_type IN ('A','B','C')`        |
| `$notIn`        | `[$notIn]=A,B`         | `service_type NOT IN ('A','B')`        |
| `$contains`     | `[$contains]=test`     | `name LIKE '%test%'`                   |
| `$containsi`    | `[$containsi]=test`    | `LOWER(name) LIKE LOWER('%test%')`     |
| `$notContains`  | `[$notContains]=test`  | `name NOT LIKE '%test%'`               |
| `$notContainsi` | `[$notContainsi]=test` | `LOWER(name) NOT LIKE LOWER('%test%')` |
| `$startsWith`   | `[$startsWith]=test`   | `name LIKE 'test%'`                    |
| `$startsWithi`  | `[$startsWithi]=test`  | `LOWER(name) LIKE LOWER('test%')`      |
| `$endsWith`     | `[$endsWith]=test`     | `name LIKE '%test'`                    |
| `$endsWithi`    | `[$endsWithi]=test`    | `LOWER(name) LIKE LOWER('%test')`      |
| `$null`         | `[$null]=true`         | `service_type IS NULL`                 |
| `$notNull`      | `[$notNull]=true`      | `service_type IS NOT NULL`             |
| `$between`      | `[$between]=1,10`      | `amount BETWEEN 1 AND 10`              |

`i`가 붙은 것들(`$eqi`, `$containsi` 등)은 **대소문자 무시** 버전이다.

#### 주요 멤버

- `symbol`: 쿼리 파라미터에서 쓰이는 문자열 (`$eq`, `$ne` 등)
- `sqlTemplate`: SQL 템플릿 (참고용, 실제 SQL 생성은 QueryBuilder가 담당)

```kotlin
FilterOperator.fromSymbol("$eq")  // -> FilterOperator.EQ
FilterOperator.fromSymbol("$xyz") // -> null (없는 연산자)
FilterOperator.isLogicalOperator("$or")  // -> true
```

#### sqlTemplate이 참고용인 이유

```kotlin
EQ("$eq", "{column} = {value}"),
CONTAINS("$contains", "{column} LIKE {value}"),
```

실제 SQL은 각 QueryBuilder가 직접 만든다:

```kotlin
// MybatisQueryBuilder.kt (SQL 문자열을 직접 조립)
when (condition.operator) {
    FilterOperator.EQ -> "$column = #{params.$paramName}"
    FilterOperator.CONTAINS -> "$column LIKE CONCAT('%', #{params.$paramName}, '%')"
}

// JooqQueryBuilder.kt (jOOQ 객체를 직접 생성)
when (condition.operator) {
    FilterOperator.EQ -> column.eq(condition.value)
    FilterOperator.CONTAINS -> column.like("%${condition.value}%")
}
```

MyBatis와 jOOQ가 요구하는 형식이 서로 달라서 `sqlTemplate`의 단순한 템플릿으로는 둘 다 만족시킬 수 없다. `sqlTemplate`은 주석을 프로퍼티로 달아놓은 것에 가깝다.

---

### FilterNode - 필터 조건 트리

```kotlin
sealed class FilterNode
+--Condition(field, operator, value)      // 잎 노드: 단일 조건
+--LogicalGroup(logic, children)          // 가지 노드: AND/OR/NOT으로 묶음
+--Logic: AND, OR, NOT
```

#### sealed class란

`sealed class`는 **상속할 수 있는 하위 타입을 제한**하는 클래스다. 같은 파일 안에서만 하위 클래스를 정의할 수 있다.

```kotlin
sealed class FilterNode {
    data class Condition(...) : FilterNode()
    data class LogicalGroup(...) : FilterNode()
}
// 이 파일 밖에서 FilterNode를 상속하는 새 클래스를 만들 수 없다
```

#### enum과의 차이

```kotlin
// enum: 각 값이 고정된 싱글톤 (인스턴스 1개씩만 존재)
enum class Direction { UP, DOWN, LEFT, RIGHT }

// sealed class: 각 타입이 서로 다른 데이터를 가질 수 있음 (인스턴스 여러 개 가능)
sealed class FilterNode {
    data class Condition(val field: String, val operator: FilterOperator, val value: Any?)
    data class LogicalGroup(val logic: Logic, val children: List<FilterNode>)
}
```

enum은 `UP`, `DOWN` 각각 하나씩만 존재하지만, sealed class는 `Condition("serviceType", EQ, "FAX")`와 `Condition("status", NE, "DELETED")` 처럼 **같은 타입이지만 다른 데이터를 가진 인스턴스를 여러 개** 만들 수 있다.

#### when 분기의 장점

```kotlin
fun process(node: FilterNode): String = when (node) {
    is FilterNode.Condition -> "단일 조건"
    is FilterNode.LogicalGroup -> "논리 그룹"
    // else 불필요 - 컴파일러가 2개만 존재하는 걸 알고 있음
}
```

나중에 `FilterNode`에 새 하위 타입을 추가하면, 모든 `when` 분기에서 **컴파일 에러**가 발생하므로 누락을 방지할 수 있다.

#### sealed class + data class 조합

- **sealed class**: `when` 분기 안전성 + 타입 제한
- **data class**: `equals()`, `hashCode()`, `toString()`, `copy()` 자동 생성

```kotlin
val a = FilterNode.Condition("type", FilterOperator.EQ, "FAX")
val b = FilterNode.Condition("type", FilterOperator.EQ, "FAX")
a == b  // true (data class가 equals를 자동 생성)
println(a)  // Condition(field=type, operator=EQ, value=FAX)
```

#### FilterNode가 트리인 이유

핵심은 `LogicalGroup.children`의 타입이 `List<FilterNode>`라는 것이다.

```kotlin
sealed class FilterNode {
    data class Condition(...) : FilterNode()   // 잎 노드
    data class LogicalGroup(
        val logic: Logic,
        val children: List<FilterNode>   // <-- 자기 자신을 참조 (재귀)
    ) : FilterNode()
}
```

`children`이 `FilterNode`이므로 `Condition`도 들어갈 수 있고 `LogicalGroup`도 들어갈 수 있다. 그래서 **중첩이 가능**하다.

```kotlin
LogicalGroup(
    AND, [                          // 루트
        Condition("status", EQ, "ACTIVE"),       //   잎
        LogicalGroup(
            OR, [                       //   가지
                Condition("type", EQ, "FAX"),        //     잎
                Condition("type", EQ, "EMAIL")       //     잎
            ]
        )
    ]
)
```

```
            AND
           /   \
    status=ACTIVE   OR
                   /   \
            type=FAX  type=EMAIL
```

```sql
WHERE status = 'ACTIVE' AND (type = 'FAX' OR type = 'EMAIL')
```

#### 필터 조건 예시

**단순 조건:**

```
HTTP: filters[serviceType][$eq]=FAX
-> Condition("serviceType", EQ, "FAX")
SQL:  WHERE service_type = 'FAX'
```

**복합 조건 (여러 필터가 오면 자동으로 AND):**

```
HTTP: filters[serviceType][$eq]=FAX&filters[status][$ne]=DELETED
-> LogicalGroup(AND, [
       Condition("serviceType", EQ, "FAX"),
       Condition("status", NE, "DELETED")
   ])
SQL:  WHERE service_type = 'FAX' AND status != 'DELETED'
```

**OR 조건:**

```
HTTP: filters[$or][0][serviceType][$eq]=FAX&filters[$or][1][serviceType][$eq]=EMAIL
-> LogicalGroup(OR, [
       Condition("serviceType", EQ, "FAX"),
       Condition("serviceType", EQ, "EMAIL")
   ])
SQL:  WHERE (service_type = 'FAX' OR service_type = 'EMAIL')
```

**NOT 조건:**

```
HTTP: filters[$not][status][$eq]=DELETED
-> LogicalGroup(NOT, [Condition("status", EQ, "DELETED")])
SQL:  WHERE NOT (status = 'DELETED')
```

---

### StrapiQuery - 파싱 결과 전체를 담는 DTO

HTTP 요청 하나가 이 객체 하나로 변환된다.

```kotlin
data class StrapiQuery(
    val filters: FilterNode?,          // WHERE절 (위의 트리)
    val fields: List<String>,          // SELECT절 (빈 목록 = 전체)
    val page: Int,                     // 페이지 번호 (0부터)
    val size: Int,                     // 페이지 크기
    val sort: List<SortOrder>,         // ORDER BY절
    val unpaged: Boolean = false       // 페이징 무시 여부
)
```

```
HTTP: GET /domains?filters[serviceType][$eq]=FAX&fields=serviceType,status&sort=doDt,desc&page=0&size=20

-> StrapiQuery(
       filters = Condition("serviceType", EQ, "FAX"),
       fields = ["serviceType", "status"],
       page = 0, size = 20,
       sort = [SortOrder("doDt", DESC)]
   )
```

---

## 2단계: StrapiQueryParser

HTTP 쿼리 파라미터(flat Map)를 StrapiQuery로 변환하는 파서. 크게 **두 영역**으로 나뉜다.

### 전체 구조

```
StrapiQueryParser
|
|-- [companion object] 전처리 (정적 메서드)
|   |-- unflattenParams()   : flat 파라미터 -> 중첩 Map
|   |-- parseBracketPath()  : "[a][$eq]" -> ["a", "$eq"] 경로 분해
|   |-- setNestedValue()    : 경로를 따라 중첩 Map/List 구성
|   +-- parseValue()        : 문자열 -> Boolean/LocalDateTime/String 변환
|
+-- [인스턴스 메서드] 본격 파싱
    |-- parseFilters()          : 중첩 Map -> FilterNode 트리 (진입점)
    |-- parseLogicalGroup()     : $or/$and/$not 처리 (재귀)
    |-- parseFieldConditions()  : 필드의 연산자 Map -> Condition 리스트
    |-- parseFields()           : fields 파라미터 파싱
    +-- parseSort()             : sort 파라미터 파싱
```

### 처리 과정 (2단계)

```
1) unflattenParams(): flat 파라미터 -> 중첩 Map  (companion object)
   "filters[serviceType][$eq]" = "FAX"
   -> { "serviceType": { "$eq": "FAX" } }

2) parseFilters(): 중첩 Map -> FilterNode 트리  (인스턴스 메서드)
   { "serviceType": { "$eq": "FAX" } }
   -> Condition("serviceType", EQ, "FAX")
```

### companion object 영역 - 전처리

Spring의 `@RequestParam`은 쿼리 파라미터를 flat한 `Map<String, String>`으로 준다. 이걸 중첩 Map으로 변환해야 `parseFilters()`가 처리할 수 있다.

#### unflattenParams()

```kotlin
StrapiQueryParser.unflattenParams(
    mapOf("filters[serviceType][\$eq]" to "FAX"),
    "filters"
)
// 결과: { "serviceType": { "$eq": "FAX" } }
```

#### setNestedValue() - 경로를 따라 중첩 구조 생성

**다음 키가 숫자면 List, 문자열이면 Map**을 생성하는 것이 핵심이다.

```
경로: ["serviceType", "$eq"], 값: "FAX"

step 1: current = {} (빈 Map)
step 2: key="serviceType", 다음 키="$eq"(문자열) -> Map 생성
step 3: key="$eq"가 마지막 -> 값 설정
결과:   { "serviceType": { "$eq": "FAX" } }
```

OR 배열 예시:

```
경로: ["$or", "0", "serviceType", "$eq"], 값: "FAX"

step 1: key="$or", 다음 키="0"(숫자) -> List 생성
step 2: key="0", 다음 키="serviceType"(문자열) -> Map 생성
step 3: key="serviceType", 다음 키="$eq"(문자열) -> Map 생성
step 4: key="$eq"가 마지막 -> 값 설정
결과:   { "$or": [ { "serviceType": { "$eq": "FAX" } } ] }
```

#### parseValue() - 값 타입 자동 변환

```kotlin
parseValue("true")                    // -> Boolean: true
parseValue("false")                   // -> Boolean: false
parseValue("2024-01-15T10:30:00")     // -> LocalDateTime
parseValue("FAX")                     // -> String: "FAX"
parseValue("123")                     // -> String: "123" (숫자도 문자열 유지 - DB에서 자동 변환)
```

### 인스턴스 메서드 영역 - 본격 파싱

#### parseFilters() - 진입점

중첩 Map의 각 키를 보고 분기한다:

```kotlin
for ((key, value) in params) {
    when {
        key == "$or" -> // parseLogicalGroup() -> LogicalGroup(OR, ...) 생성
            key == "$and"
        -> // parseLogicalGroup() -> LogicalGroup(AND, ...) 생성
            key == "$not"
        -> // parseLogicalGroup() -> LogicalGroup(NOT, ...) 생성
            value is Map
        -> // parseFieldConditions() -> Condition 리스트 생성
        else -> // 단순 값 -> Condition(key, EQ, value)로 간주
    }
}
```

**최종 반환 규칙:**

```kotlin
return when {
    conditions.isEmpty() -> null                                      // 조건 없음
    conditions.size == 1 -> conditions.first()                        // 1개면 그냥 반환
    else -> FilterNode.LogicalGroup(FilterNode.Logic.AND, conditions) // 2개 이상이면 AND로 묶음
}
```

#### parseFieldConditions() - 필드 하나의 연산자 처리

```kotlin
parseFieldConditions("serviceType", { "$eq": "FAX" })
// -> [Condition("serviceType", EQ, "FAX")]

parseFieldConditions("amount", { "$gte": "100", "$lte": "500" })
// -> [Condition("amount", GTE, "100"), Condition("amount", LTE, "500")]
```

#### parseLogicalGroup() - 논리 연산자 재귀 처리

```kotlin
// $or의 값이 List -> 각 항목을 parseFilters()로 재귀 호출
// $or: [ { "status": { "$eq": "A" } }, { "status": { "$eq": "B" } } ]
//   -> LogicalGroup(OR, [Condition(status,EQ,A), Condition(status,EQ,B)])

// $not의 값이 Map -> 단일 항목으로 parseFilters() 재귀 호출
// $not: { "status": { "$eq": "DELETED" } }
//   -> LogicalGroup(NOT, [Condition(status,EQ,DELETED)])
```

#### 중첩 깊이 제한

`maxDepth` (기본 5)로 무한 재귀를 방지한다.

### 전체 흐름 예시

```
HTTP: ?filters[serviceType][$eq]=FAX&filters[$or][0][status][$eq]=ACTIVE&filters[$or][1][status][$eq]=PENDING

--- 1단계: unflattenParams() ---

{
    "serviceType": { "$eq": "FAX" },
    "$or": [
        { "status": { "$eq": "ACTIVE" } },
        { "status": { "$eq": "PENDING" } }
    ]
}

--- 2단계: parseFilters() ---

LogicalGroup(AND, [
    Condition("serviceType", EQ, "FAX"),
    LogicalGroup(OR, [
        Condition("status", EQ, "ACTIVE"),
        Condition("status", EQ, "PENDING")
    ])
])

SQL: WHERE service_type = 'FAX' AND (status = 'ACTIVE' OR status = 'PENDING')
```

---

## 3단계: MyBatis 트랙

### MybatisQueryBuilder

FilterNode를 **MyBatis SQL 문자열**로 변환하는 빌더.

#### 핵심 개념: columnMapper

```kotlin
class MybatisQueryBuilder(
    private val columnMapper: (String) -> String = { it.toSnakeCase() }
)
```

Kotlin 필드명(camelCase)을 DB 컬럼명(snake_case)으로 변환한다.

#### 핵심 개념: 파라미터 바인딩

MyBatis는 SQL에 값을 직접 넣지 않고 `#{params.xxx}` 플레이스홀더를 사용한다. (SQL Injection 방지)

```sql
-- 파라미터 바인딩:
WHERE "service_type" =
#{params.serviceType_0_0}
-- params Map에 { "serviceType_0_0": "FAX" } 저장
```

**파라미터 이름 규칙**: `{필드명}_{paramIndex}_{params.size}` 조합으로 이름 충돌 방지.

#### buildWhereClause() - 연산자별 SQL 생성

```kotlin
// 비교 연산자
Condition("serviceType", EQ, "FAX")
-> "\"service_type\" = #{params.serviceType_0_0}"

// 대소문자 무시
Condition("serviceType", EQ_CASE_INSENSITIVE, "fax")
-> "LOWER(\"service_type\") = LOWER(#{params.serviceType_0_0})"

// IN
Condition("serviceType", IN, ["FAX", "EMAIL"])
-> "\"service_type\" IN (<foreach ...>#{item}</foreach>)"

// LIKE 계열
Condition("name", CONTAINS, "test")
-> "\"name\" LIKE CONCAT('%', #{params.name_0_0}, '%')"

// NULL
Condition("serviceType", NULL, null)
-> "\"service_type\" IS NULL"

// BETWEEN
Condition("amount", BETWEEN, [100, 500])
-> "\"amount\" BETWEEN #{params.amount_0_0_0} AND #{params.amount_0_0_1}"
```

#### buildLogicalGroup() - AND/OR/NOT

```kotlin
LogicalGroup(AND, [조건1, 조건2])  -> "(조건1SQL AND 조건2SQL)"
LogicalGroup(OR, [조건1, 조건2])   -> "(조건1SQL OR 조건2SQL)"
LogicalGroup(NOT, [조건1])         -> "NOT (조건1SQL)"
```

#### buildSelectClause / buildOrderByClause

```kotlin
buildSelectClause(["serviceType", "status"])
-> "\"service_type\", \"status\""

buildSelectClause(
    ["serviceType", "session"],
    fieldExpansions = mapOf("session" to ["brand", "product"])
)
-> "\"service_type\", \"brand\", \"product\""

buildOrderByClause([SortOrder("doDt", DESC)])
-> "\"do_dt\" DESC"
```

---

### MybatisSearchCriteria

MybatisQueryBuilder가 만든 결과를 하나로 묶는 DTO.

```kotlin
data class MybatisSearchCriteria(
    val selectClause: String,
    val whereClause: String,
    val orderByClause: String,
    val params: Map<String, Any?>,
    val offset: Int,
    val limit: Int,
    val unpaged: Boolean = false
)
```

`from()` 팩토리 메서드가 내부에서 `MybatisQueryBuilder`를 생성하고 한번에 빌드한다:

```kotlin
// 도메인 클래스에 미리 필드 정보 정의
class Fax(...) {
    companion object {
        val FIELDS: Set<String> = Fax::class.primaryConstructor?.parameters
            ?.mapNotNull { it.name }?.toSet() ?: emptySet()
        val FIELD_EXPANSIONS = mapOf("session" to Session.columns())
    }
}

// Service에서 한 줄로 변환
val criteria = MybatisSearchCriteria.from(query, Fax.FIELDS, Fax.FIELD_EXPANSIONS)
```

---

### MybatisSqlProvider

criteria를 받아서 **최종 실행 가능한 SQL 문자열**을 만드는 추상 클래스.

#### 도메인별로 상속하여 사용

```kotlin
class FaxSqlProvider : MybatisSqlProvider(
    tableName = "faxes",
    defaultCondition = """"is_deleted" = FALSE""",
    defaultOrderBy = """"do_dt" DESC"""
)
```

MyBatis Mapper 연결:

```kotlin
@SelectProvider(type = FaxSqlProvider::class)
fun search(criteria: MybatisSearchCriteria): List<Fax>

@SelectProvider(type = FaxSqlProvider::class)
fun searchCount(criteria: MybatisSearchCriteria): Long
```

#### search() 결과 예시

```sql
SELECT "service_type", "status"
FROM "faxes"
WHERE "is_deleted" = FALSE
  AND "service_type" = #{params.serviceType_0_0}
ORDER BY
    "do_dt" DESC
LIMIT #{limit} OFFSET #{offset}
```

#### defaultCondition 조합

| defaultCondition | criteria WHERE | 결과                           |
|------------------|----------------|------------------------------|
| 있음               | 있음             | `WHERE default AND criteria` |
| 있음               | 없음             | `WHERE default`              |
| 없음               | 있음             | `WHERE criteria`             |
| 없음               | 없음             | WHERE절 없음                    |

#### buildWhereSql() - IN절 foreach 후처리

`<foreach>` 태그는 MyBatis XML에서만 동작하므로 실제 인덱스 참조로 변환한다:

```
변환 전: <foreach collection="params.serviceType_0_0" item="item" separator=",">#{item}</foreach>
변환 후: #{params.serviceType_0_0[0]}, #{params.serviceType_0_0[1]}, #{params.serviceType_0_0[2]}
```

#### MyBatis 트랙 전체 흐름

```
StrapiQuery
    |
    v
MybatisSearchCriteria.from()  -- MybatisQueryBuilder를 내부에서 사용
    |
    v
MybatisSearchCriteria (SELECT절 + WHERE절 + ORDER BY절 + params)
    |
    v
MybatisSqlProvider.search()   -- SQL() 빌더로 최종 SQL 조립 + foreach 후처리
    |
    v
완성된 SQL 문자열 -> MyBatis가 실행
```

---

## 4단계: jOOQ 트랙

MyBatis 트랙과 같은 역할이지만, SQL 문자열 대신 **jOOQ 타입 안전 객체**를 만든다.

### MyBatis와 jOOQ의 근본적 차이

```kotlin
// MyBatis: SQL 문자열을 만든다
"\"service_type\" = #{params.serviceType_0_0}"
// -> 오타가 있어도 컴파일 시 모른다. 실행해봐야 안다.

// jOOQ: 객체를 만든다
DOMAINS.SERVICE_TYPE.eq("FAX")
// -> 컴파일 시 타입 체크. 오타가 있으면 빌드 실패.
```

### JooqQueryBuilder

FilterNode를 **jOOQ Condition 객체**로 변환하는 빌더. `object` 클래스 (상태 없는 싱글톤).

#### 연산자별 jOOQ 메서드 매핑

| FilterOperator | jOOQ 코드                                  | 생성되는 SQL                      |
|----------------|------------------------------------------|-------------------------------|
| EQ             | `column.eq(value)`                       | `"col" = 'FAX'`               |
| NE             | `column.ne(value)`                       | `"col" != 'FAX'`              |
| LT             | `column.lt(value)`                       | `"col" < 100`                 |
| LTE            | `column.le(value)`                       | `"col" <= 100`                |
| GT             | `column.gt(value)`                       | `"col" > 100`                 |
| GTE            | `column.ge(value)`                       | `"col" >= 100`                |
| EQI            | `DSL.lower(column).eq(DSL.lower(value))` | `LOWER("col") = LOWER('fax')` |
| IN             | `` column.`in`(values) ``                | `"col" IN ('A', 'B')`         |
| NOT_IN         | `column.notIn(values)`                   | `"col" NOT IN ('A', 'B')`     |
| CONTAINS       | `column.like("%value%")`                 | `"col" LIKE '%test%'`         |
| STARTS_WITH    | `column.like("value%")`                  | `"col" LIKE 'test%'`          |
| ENDS_WITH      | `column.like("%value")`                  | `"col" LIKE '%test'`          |
| NULL           | `column.isNull`                          | `"col" IS NULL`               |
| NOT_NULL       | `column.isNotNull`                       | `"col" IS NOT NULL`           |
| BETWEEN        | `column.between(v0, v1)`                 | `"col" BETWEEN 1 AND 10`      |

MyBatis와 비교:

```kotlin
// MyBatis: 파라미터를 직접 관리해야 한다
params["serviceType_0_0"] = "FAX"
"\"service_type\" = #{params.serviceType_0_0}"

// jOOQ: 파라미터를 jOOQ가 알아서 관리한다
column.eq("FAX")  // 끝
```

#### LogicalGroup 처리

```kotlin
// AND: childConditions.reduce { acc, c -> acc.and(c) }
// OR:  childConditions.reduce { acc, c -> acc.or(c) }
// NOT: DSL.not(childConditions.reduce { acc, c -> acc.and(c) })
```

---

### JooqSearchCriteria

JooqQueryBuilder의 결과를 담는 데이터 클래스.

#### 필드 비교 (MyBatis vs jOOQ)

```kotlin
// MyBatis: 문자열
data class MybatisSearchCriteria(
    val selectClause: String,           // "\"service_type\", \"status\""
    val whereClause: String,            // "\"service_type\" = #{params.x}"
    val params: Map<String, Any?>,      // { "x": "FAX" }
    ...
)

// jOOQ: 객체
data class JooqSearchCriteria(
    val selectFields: List<Field<*>>,   // [DOMAINS.SERVICE_TYPE, DOMAINS.STATUS]
    val condition: Condition,            // DOMAINS.SERVICE_TYPE.eq("FAX")
    // params 불필요 - jOOQ가 내부 관리
    ...
)
```

#### jOOQ DSL에서 사용

MyBatis와 달리 **SQL Provider가 필요 없다**:

```kotlin
// 검색
dsl.select(criteria.selectFields)
    .from(FAXES)
    .where(FAXES.IS_DELETED.eq(false))     // defaultCondition에 해당
    .and(criteria.condition)                // 사용자 필터 (noCondition이면 무시됨)
    .orderBy(criteria.sortFields)
    .limit(criteria.limit)
    .offset(criteria.offset)
    .fetch()

// 카운트
dsl.selectCount()
    .from(FAXES)
    .where(FAXES.IS_DELETED.eq(false))
    .and(criteria.condition)
    .fetchOne(0, Long::class.java)
```

---

### JooqExtensions

jOOQ Record에 대한 Kotlin 확장 함수. 동적 필드 선택 시 없는 필드 접근을 안전하게 처리한다.

```kotlin
// 일반 get()은 필드 없으면 예외 발생
record.get(FAXES.BRAND)         // 예외!

// getOrNull()은 null 반환
record.getOrNull(FAXES.BRAND)   // null

// getOrDefault()는 기본값 반환
record.getOrDefault(FAXES.IS_DELETED, false)  // false
```

#### jOOQ 트랙 전체 흐름

```
StrapiQuery
    |
    v
JooqSearchCriteria.from()  -- JooqQueryBuilder를 내부에서 사용
    |
    v
JooqSearchCriteria (selectFields + condition + sortFields)
    |
    v
Service에서 jOOQ DSL에 직접 전달  -- SQL Provider 불필요
    |
    v
dsl.select(...).from(...).where(...).fetch()  -- jOOQ가 SQL 생성 + 실행
```

---

## 전체 사용 흐름

```
1) Controller: HTTP 파라미터 수신
   GET /domains?filters[serviceType][$eq]=FAX&sort=doDt,desc&page=0&size=20

2) Controller/ArgumentResolver:
   val filterParams = StrapiQueryParser.unflattenParams(params, "filters")
   val parser = StrapiQueryParser()
   val query = StrapiQuery(
       filters = parser.parseFilters(filterParams),
       fields = parser.parseFields(params),
       sort = parser.parseSort(sortParams),
       page = 0, size = 20
   )

3-a) MyBatis:
   val criteria = MybatisSearchCriteria.from(query, Domain.FIELDS)
   mapper.search(criteria)

3-b) jOOQ:
   val criteria = JooqSearchCriteria.from(query, Domain.FIELD_MAP)
   dsl.select(criteria.selectFields)
      .from(DOMAINS)
      .where(criteria.condition)
      .orderBy(criteria.sortFields)
      .limit(criteria.limit)
      .offset(criteria.offset)
```

---

## MyBatis vs jOOQ 비교

| 항목              | MyBatis                                  | jOOQ                             |
|-----------------|------------------------------------------|----------------------------------|
| WHERE 표현        | SQL 문자열 (`"service_type" = #{params.x}`) | Condition 객체 (`field.eq(value)`) |
| 파라미터            | `Map<String, Any?>` (직접 관리)              | jOOQ가 내부 관리                      |
| SELECT          | 컬럼명 문자열                                  | `Field<*>` 객체                    |
| SQL 생성          | MybatisSqlProvider가 조립                   | jOOQ DSL에서 직접 체이닝                |
| 타입 안전성          | 낮음 (문자열 기반)                              | 높음 (컴파일 타임 체크)                   |
| SQL Provider 필요 | 필요 (도메인별 상속)                             | 불필요 (DSL 직접 사용)                  |
| IN절 처리          | foreach 태그 -> 후처리 필요                     | `column.in(list)` 한 줄            |
