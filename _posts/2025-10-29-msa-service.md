---
layout: post
title: Maintenance 모듈 설계 정리 (with DTO vs Domain Validation) 
tags: [domain, clean-code]
---

## 전체 개요

이번에 `Maintenance` 모듈을 리팩터링하면서,  
**DTO와 Domain(Entity) 간 검증 책임 분리**,  
**API 구조 정리**,  
**Enum/네이밍 일관성 확보**  
이 세 가지를 중심으로 정리했다.

결론부터 말하면,  
> DTO는 **입력값의 올바름**을 보장하고,  
> Entity는 **비즈니스 규칙성**을 보장한다.  

이 기준 하나로, 전체 구조가 단순해지고,  
불필요한 Validator나 Layer도 줄어들었다.

---

## 검증 구조 설계

### DTO (Request 검증)

- Controller 단에서 직접 `dto.validate()` 호출  
- JSR-303 (`@Valid`)는 회사 MSA 표준에서 사용하지 않음  
- 따라서 명시적으로 호출하는 것이 명확하고 제어 가능함  

```java
@PostMapping("/Maintenances")
public Object registerMaintenance(Session session,
                               @RequestBody MaintenanceRegisterDto dto) {
    dto.validate(); // 입력값 검증
    return maintenanceApiService.registerMaintenance(session, dto);
}
````

DTO는 "형식적 유효성"만 책임진다.

```java
public void validate() {
    if (endDT.isBefore(startDT) || endDT.equals(startDT)) {
        throw new BusinessException(MaintenanceApiErrorCode.INVALID_PERIOD);
    }
}
```

---

### Domain (비즈니스 규칙 검증)

* `Maintenance.of()` 정적 메서드 내부에서 `validate()` 호출
* Entity 스스로 자신의 상태 일관성을 보장
* Domain은 외부 DTO를 몰라야 함

```java
public static Maintenance of(Session session, MaintenanceRegisterDto dto) {
    dto.validate(); // DTO 검증 (Controller 단계에서도 가능)
    Maintenance maintenance = Maintenance.builder()
            .serviceType(dto.getServiceType())
            .targetVendor(dto.getTargetVendor())
            .startDT(dto.getStartDT())
            .endDT(dto.getEndDT())
            .replacementVendor(dto.getReplacementVendor())
            .memo(dto.getMemo())
            .session(session)
            .isDeleted(false)
            .build();

    maintenance.validate(); // 도메인 규칙 검증
    return maintenance;
}
```

도메인의 `validate()`는 **비즈니스 규칙성**만 검증한다.

```java
private void validate() {
    if (targetVendor.getServiceType() != serviceType) {
        throw new BusinessException(MaintenanceApiErrorCode.INVALID_TARGET_VENDOR);
    }

    if (replacementVendor != null && replacementVendor == targetVendor) {
        throw new BusinessException(MaintenanceApiErrorCode.VENDOR_SAME_REPLACEMENT);
    }

    if (session == null) {
        throw new BusinessException(MaintenanceApiErrorCode.EMPTY_SESSION);
    }
}
```

---

## 이번 프로젝트를 통해 배운 점

| 항목                                 | 결정                                        | 이유                               |
|:-----------------------------------|:------------------------------------------| :------------------------------- |
| **DTO 검증**                         | Controller 단에서 명시적 호출                     | 회사 MSA 표준에서 Bean Validation 미사용  |
| **Domain 검증**                      | `of()` 내부에서 `validate()` 호출               | 도메인 상태의 일관성 보장                   |
| **Validator 클래스 분리 여부**            | 사용 안 함                                   | 도메인이 단순하여 과설계 불필요                |
| **@Builder 생성자**                   | 테스트 전용 + `@Deprecated` 처리                 | 의도 명시 및 실사용 방지                   |
| **MaintenanceApiErrorCode Prefix** | `MAINTENACE_` 제거                            | 모듈 내부 enum, prefix 불필요           |
| **MaintenanceTargetVendor 네이밍**    | Suffix 가 아닌 Prefix 방식 (`FAX_LG`)          | Java 식별자 규칙            |
| **/api/maintenances/current**      | 페이징 제거                                    | 실제 운영 환경상 페이징 필요 없음              |
| **maintenance-after-wait-time 로직** | 종료시간 + 대기시간 이후만 점검 해제                     | 명확한 비즈니스 룰 반영                    |
| **@PageableDefault(size)**         | 명시 안 함                                    | 외부 호출 시 항상 명시적으로 전달됨             |
| **MSSQL datetime 반올림 대응**          | `DateTimeRange.getEndDT().plusSeconds(1)` | `23:59:59.997 → 00:00:00` 반올림 보정 |
| **테스트 데이터**                        | 시나리오 기반 최소 구성                             | 불필요 객체 생성 방지                     |
| **Enum 테스트**                       | 신규 추가 시 누락 방지 주석                          | 테스트 일관성 유지                       |
| **// region 주석 활용**                | 코드 영역 시각적 구분                              | 가독성 및 유지보수성 향상                   |

---


