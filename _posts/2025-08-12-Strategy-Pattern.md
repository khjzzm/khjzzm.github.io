---
layout: post
title: 달라이브 출석체크 이벤트 전략패턴 적용
tags: [design-pattern, interface]
---

# 출석체크(방송/청취) 이벤트 코드 리뷰
## /attendance/status 엔드포인트의 전략패턴(Strategy Pattern) 적용 사례

---

## [1] 배경 및 문제 상황

### **기존 문제점**
- 거대한 if-else 구조로 이벤트 타입별 처리
- 새로운 이벤트 추가 시 기존 코드 수정 필요
- 각 이벤트 로직이 한 곳에 집중되어 복잡도 증가
- 테스트와 유지보수 어려움

### **해결 목표**
- 이벤트별 로직 분리 및 독립성 확보
- 새 이벤트 추가 시 기존 코드 수정 없이 확장 가능
- 코드 가독성과 유지보수성 향상

---

## 1. Strategy Pattern 소개

**이벤트를 클래스로 캡슐화하여 런타임에 동적으로 교체할 수 있게 하는 패턴**

- 알고리즘 군을 정의하고 각각 캡슐화하여 상호 교체 가능하게 만듦
- 클라이언트 코드 수정 없이 알고리즘을 변경할 수 있음
- 동일한 문제를 해결하는 여러 방법 중 상황에 맞는 방법을 선택

### **AttendanceType - 이벤트 타입 정의**

먼저 우리가 다루는 이벤트 타입들을 살펴보겠습니다:

```java
@Getter
public enum AttendanceType {
    HOMERUN("homerun", "달라 야구장", "/event/daily?tab=tab-1", "/floating_icon/webp/baseball.webp"),
    SHOOTING("shooting", "달라 사격장", "/event/daily?tab=tab-1", "/floating_icon/webp/shooting.webp"),
    LOTTO("lotto", "달비 로또", "/event/attendance?tab=lotto", "/floating_icon/webp/lotto.webp");

    private final String code;        // API 응답에서 사용되는 코드
    private final String description; // 이벤트 설명
    private final String pathUrl;     // 이벤트 페이지 URL
    private final String imageUrl;    // 플로팅 아이콘 이미지 경로

    /**
     * 현재 활성화된 이벤트인지 확인
     * 여기서 진행 중인 이벤트들을 관리합니다
     */
    public boolean isActiveEvent() {
        return this == HOMERUN;  // 현재 야구장 이벤트만 활성화
    }
}
```

**이벤트별 특징:**
- **HOMERUN**: 방망이가 필요한 특별 이벤트 (현재 활성화)
- **SHOOTING**: 총알이 필요한 특별 이벤트 (비활성화)
- **LOTTO**: 항상 참여 가능한 기본 이벤트

**활성화 제어:**
- `isActiveEvent()` 메서드로 중앙 집중식 이벤트 제어
- enum 수정만으로 배포 없이 이벤트 on/off 가능

### **기존 구현 vs Strategy Pattern 적용**

#### **기존 구현 (if-else 구조)**
```java
// 기존 callAttendanceCheck() 메서드의 이벤트 선택 로직
int userEventCheck;
boolean isHomeRunTicketUsed = homeRunService.useTicketForAttendanceCheck();  // 방망이 1개 이상
boolean isLottoTicketUsed = lottoService.useLottoForAttendanceCheck();      // 로또응모권 1개 이상

if (isHomeRunTicketUsed) {          // 방망이 1개 이상 있는 경우
    userEventCheck = 6;             // 달라야구장
} else if (isLottoTicketUsed) {     // 방망이 없고 로또 응모권 1개이상 있는 경우
    userEventCheck = 4;             // 로또페이지
} else {                            // 방망이 없고 로또 없는 경우
    userEventCheck = 6;             // 기본값: 달라야구장
}
```

#### **Strategy Pattern 적용한 현재 구현**
```java
// 깔끔한 Stream API + Strategy Pattern 활용
return attendanceCheckServices.stream()
        .filter(service -> service.getAttendanceType().isActiveEvent())
        .filter(AttendanceCheckStrategy::hasTicket)
        .map(AttendanceCheckStrategy::getAttendanceType)
        .findFirst();
```

**개선된 점:**
- **확장성**: 새로운 이벤트 추가 시 기존 if-else 수정 불필요
- **가독성**: 복잡한 조건문이 간결한 Stream 처리로 변경
- **유지보수**: 각 이벤트 로직이 독립적인 클래스로 분리
- **클라이언트 독립성**: 기존 `userEventCheck` 숫자 코드에서 의미있는 문자열로 변경
    - 기존: 네이티브/프론트에서 `6`=야구장, `4`=로또로 하드코딩 체크
    - 현재: API에서 `"homerun"`, `"lotto"` 등 명확한 문자열 제공
    - **장점**: API만 수정하면 클라이언트 코드 변경 없이 새 이벤트 추가 가능

---

## 2. 현재 구현 분석

### 1. Strategy Interface
```java
public interface AttendanceCheckStrategy {
    AttendanceType getAttendanceType();    // 타입 반환
    boolean hasTicket();                   // 참여권 확인
    String getServiceName();               // 서비스명
}
```

### 2. Concrete Strategy 구현체들

#### 2-1. HomeRunAttendanceCheckService (야구장)
```java
@Service
public class HomeRunAttendanceCheckService implements AttendanceCheckStrategy {
    private final HomeRunService homeRunService;
    
    @Override
    public AttendanceType getAttendanceType() {
        return AttendanceType.HOMERUN;  // 야구장 이벤트
    }
    
    @Override
    public boolean hasTicket() {
        // 실제 방망이 보유 여부 확인 로직
        return homeRunService.useTicketForAttendanceCheck();
    }
    
    @Override
    public String getServiceName() {
        return "HomeRun Attendance Check Service";
    }
}
```

#### 2-2. ShootingAttendanceCheckService (사격장)
```java
@Service
public class ShootingAttendanceCheckService implements AttendanceCheckStrategy {
    private final ShootingService shootingService;
    
    @Override
    public AttendanceType getAttendanceType() {
        return AttendanceType.SHOOTING;  // 사격장 이벤트
    }
    
    @Override
    public boolean hasTicket() {
        // 실제 총알 보유 여부 확인 로직
        return shootingService.useTicketForAttendanceCheck();
    }
    
    @Override
    public String getServiceName() {
        return "Shooting Attendance Check Service";
    }
}
```

#### 2-3. LottoAttendanceCheckService (로또)
```java
@Service
public class LottoAttendanceCheckService implements AttendanceCheckStrategy {
    
    @Override
    public AttendanceType getAttendanceType() {
        return AttendanceType.LOTTO;  // 로또 이벤트
    }
    
    @Override
    public boolean hasTicket() {
        // 로또는 항상 참여 가능 (기본 이벤트)
        return true;
    }
    
    @Override
    public String getServiceName() {
        return "Lotto Attendance Check Service";
    }
}
```

**구현체별 특징:**
- **HomeRun/Shooting**: 실제 서비스에 의존하여 티켓(방망이/총알) 확인
- **Lotto**: 항상 `true` 반환 (기본 이벤트로 항상 참여 가능)
- **확장성**: 새로운 이벤트 추가 시 동일한 패턴으로 구현

## 3. Context (AttendanceService) - Strategy 활용

#### 3-1. 메인 메소드: attendanceStatus()
```java
@Service
public class AttendanceService {
    private final List<AttendanceCheckStrategy> attendanceCheckServices;
    
    public ResVO<AttendanceStatusResponse> attendanceStatus(HttpServletRequest request) {
        // 1. 로그인 체크
        boolean isLogin = DalbitUtil.isLogin(request);
        if (!isLogin) {
            return createEmptyResponse();  // 로그인 안됐으면 빈 응답
        }

        // 2. Strategy Pattern 활용: 활성화된 특별 이벤트 확인
        Optional<AttendanceType> activeSpecialEvent = getActiveSpecialEvent();
        
        // 3. 우선순위 로직: 특별이벤트 > 기본 로또
        if (activeSpecialEvent.isPresent()) {
            return createResponse(activeSpecialEvent.get());
        } else {
            return createResponse(AttendanceType.LOTTO);  // 기본값
        }
    }
}
```

#### 3-2. 핵심 로직: getActiveSpecialEvent()
```java
private Optional<AttendanceType> getActiveSpecialEvent() {
    // 현재 로그인한 회원 번호 가져오기
    long memNo = Long.parseLong(MemberUtil.getMemNo());
    
    return attendanceCheckServices.stream()  // ⭐️ 여기서 모든 구현체들이 나옴!
            .filter(service -> {
                String className = service.getClass().getSimpleName();
                return !className.startsWith("$Proxy");  // 프록시 객체 제외
            })
            .filter(service -> {
                AttendanceType attendanceType = service.getAttendanceType();
                boolean isActiveEvent = attendanceType.isActiveEvent();
                
                if (isActiveEvent) {
                    // ⭐️ Strategy Pattern의 핵심: 각 전략의 hasTicket() 호출
                    boolean hasTicket = service.hasTicket();
                    log.warn("회원 {}의 {} 티켓 보유: {}", memNo, attendanceType, hasTicket);
                    return hasTicket;
                }
                return false;
            })
            .map(AttendanceCheckStrategy::getAttendanceType)
            .findFirst();  // 첫 번째 매칭되는 이벤트 반환
}
```

**attendanceCheckServices에서 나오는 구현체들:**
```java
@Service
public class AttendanceService {
    // Spring이 AttendanceCheckStrategy 구현체들을 자동으로 주입
    private final List<AttendanceCheckStrategy> attendanceCheckServices;
}
```

**실제 주입되는 구현체들:**
1. `HomeRunAttendanceCheckService` - 야구장 방망이 체크
2. `ShootingAttendanceCheckService` - 사격장 총알 체크
3. `LottoAttendanceCheckService` - 로또 (항상 true)

**Spring 자동 등록 메커니즘:**
- `@Service` 어노테이션이 붙은 모든 `AttendanceCheckStrategy` 구현체
- 자동으로 `List<AttendanceCheckStrategy>`에 주입
- 새로운 구현체 추가 시 자동으로 리스트에 포함됨

**실행 시 동작:**
```java
// getActiveSpecialEvent() 호출 시
attendanceCheckServices.stream()  // 3개 구현체 모두 순회
├── HomeRunAttendanceCheckService.hasTicket() 실행
├── ShootingAttendanceCheckService.hasTicket() 실행
└── LottoAttendanceCheckService.hasTicket() 실행
```

**이벤트 활성화 상태 관리**

앞서 정의한 AttendanceType enum의 `isActiveEvent()` 메서드를 통해 중앙 집중식으로 이벤트 상태를 관리합니다.

**동작 방식:**
```java
.filter(service -> {
    AttendanceType attendanceType = service.getAttendanceType();
    boolean isActiveEvent = attendanceType.isActiveEvent();  // ⭐️ 여기서 활성화 체크
    
    if (isActiveEvent) {  // 활성화된 이벤트만 티켓 확인
        boolean hasTicket = service.hasTicket();
        return hasTicket;
    }
    return false;  // 비활성화된 이벤트는 제외
})
```

**현재 상태:**
-  `HOMERUN` - 활성화 (야구장 이벤트 진행 중)
-  `SHOOTING` - 비활성화
-  `LOTTO` - 기본 이벤트 (특별 이벤트 아님)

**장점:**
- **중앙 집중식 관리**: 한 곳에서 모든 이벤트 상태 제어
- **배포 없는 이벤트 제어**: enum만 수정하면 이벤트 on/off 가능
- **명확한 우선순위**: 활성화된 특별 이벤트 > 기본 로또

---

## 4. 아키텍처 구조

### **전체 구조 개요**

Strategy Pattern의 핵심은 **Context(맥락)**, **Strategy(전략 인터페이스)**, **Concrete Strategy(구체적 전략)** 3개 요소로 구성됩니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                  │
│                 (AttendanceController)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ 요청
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Context                                      │
│               (AttendanceService)                               │
│                                                                 │
│  + attendanceStatus()                                           │
│  + getActiveSpecialEvent()                                      │
│  - List<AttendanceCheckStrategy>                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │ uses
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              <<interface>>                                      │
│           AttendanceCheckStrategy                               │
│                                                                 │
│  + getAttendanceType(): AttendanceType                          │
│  + hasTicket(): boolean                                         │
│  + getServiceName(): String                                     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ implements
        ┌─────────────────┼────────────────┐
        ▼                 ▼                ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│HomeRun         │ │Shooting        │ │Lotto           │
│Attendance      │ │Attendance      │ │Attendance      │
│CheckService    │ │CheckService    │ │CheckService    │
│                │ │                │ │                │
│Condition Check │ │Condition Check │ │True            │
└────────────────┘ └────────────────┘ └────────────────┘
```

### **각 구성 요소 역할**

1. **AttendanceService (Context 역할)**
    - 클라이언트(AttendanceController)의 요청을 받아 적절한 전략을 선택하고 실행
    - `List<AttendanceCheckStrategy>`를 통해 모든 전략 구현체를 관리
    - 비즈니스 로직(로그인 체크, 우선순위 처리)과 전략 실행을 조율

2. **AttendanceCheckStrategy (Strategy Interface 역할)**
    - 모든 구체적 전략이 구현해야 할 공통 인터페이스 정의
    - `getAttendanceType()`, `hasTicket()`, `getServiceName()` 메서드 제공
    - 새로운 이벤트 추가 시 구현해야 할 계약(Contract) 역할

3. **Concrete Strategy 구현체들**
    - **HomeRunAttendanceCheckService**: 야구장 이벤트의 방망이 보유 여부 확인
    - **ShootingAttendanceCheckService**: 사격장 이벤트의 총알 보유 여부 확인
    - **LottoAttendanceCheckService**: 로또 이벤트(항상 참여 가능한 기본 이벤트)

### **데이터 흐름**

1. **요청 접수**: `AttendanceController` → `AttendanceService`
2. **전략 수집**: Spring DI가 모든 `AttendanceCheckStrategy` 구현체를 List로 주입
3. **전략 필터링**: 활성화된 이벤트만 선별 (`isActiveEvent()` 체크)
4. **전략 실행**: 각 전략의 `hasTicket()` 메서드 호출하여 참여 가능 여부 확인
5. **결과 반환**: 첫 번째 조건을 만족하는 이벤트 타입 반환

---

## 5. 동작 흐름

1. **클라이언트 요청** → `AttendanceController.getAttendanceStatus()`
2. **전략 선택** → `AttendanceService.getActiveSpecialEvent()`
3. **전략 실행** → 각 `Strategy.hasTicket()` 호출
4. **결과 반환** → 첫 번째 매칭되는 이벤트 타입 반환

---

## 6. 예외 처리 - hasTicket() 안전성

각 Strategy 구현체의 `hasTicket()` 메소드에서 **DB 프로시저 오류 시 안전하게 `false` 처리**

### HomeRunService.useTicketForAttendanceCheck()
```java
public boolean useTicketForAttendanceCheck() {
    try {
        HomeRunAttendanceCheck.EventInfoVO schedule = this.findSchedule();
        if (schedule == null) return false;  // 스케줄 없으면 false
        
        String memNo = MemberUtil.getMemNo();
        HomeRunBallDispenseVO.DataSel dataSel = homeRun.pEvtHomeRunMemBallDataSel(schedule.getEvtNo() - 1, memNo);
        return dataSel != null && dataSel.getTicketCnt() >= 1;
        
    } catch (Exception e) {
        log.warn("useTicketForAttendanceCheck 실패: {}", e.getMessage());
        return false;  // ⭐️ 오류 발생 시 안전하게 false 반환
    }
}
```

### ShootingService.useTicketForAttendanceCheck()
```java
public boolean useTicketForAttendanceCheck() {
    String memNo = MemberUtil.getMemNo();
    try {
        // 현재 사격장 이벤트 회차 정보 조회
        ShootingScheduleVo schedule = getShootingSchedule();
        if (schedule == null) {
            log.warn("사격장 이벤트 회차 정보가 없습니다.");
            return false;
        }

        // 회원 정보 조회
        ShootingMemberVo member = shootingRepository.getShootingMember(schedule.getEvtNo(), memNo);
        if (member == null) {
            log.warn("사격장 회원 정보가 없습니다. - 회원: {}, 회차: {}", memNo, schedule.getEvtNo());
            return false;
        }

        // bullet_cnt가 1개 이상이면 참여 가능
        boolean hasTicket = member.getBulletCnt() != null && member.getBulletCnt() >= 1;
        log.info("사격장 참여 티켓 확인 - 회원: {}, 총알수: {}, 참여가능: {}", memNo, member.getBulletCnt(), hasTicket);
        return hasTicket;

    } catch (Exception e) {
        log.error("사격장 참여 티켓 확인 중 오류 발생 - 회원: {}", memNo, e);
        return false;  // ⭐️ 오류 발생 시 안전하게 false 반환
    }
}
```

### LottoAttendanceCheckService.hasTicket()
```java
@Override
public boolean hasTicket() {
    // 로또는 항상 사용 가능 (기본값) - 예외 처리 불필요
    return true;
}
```

**[안전성 보장]**
1. **DB 프로시저 오류**: try-catch로 감싸서 false 반환
2. **데이터 null 체크**: 각 단계별로 null 검증
3. **명확한 로깅**: 오류 원인 추적 가능
4. **Fallback 전략**: 오류 시 기본 로또 이벤트로 처리

**[예외 처리의 장점]**
- **서비스 안정성**: 일부 이벤트 오류가 전체 서비스에 영향 없음
- **사용자 경험**: 오류 시에도 최소한 로또 이벤트는 참여 가능
- **운영 편의성**: 오류 로그로 문제 상황 빠른 파악
- **확장성**: 새로운 이벤트 추가 시 동일한 패턴 적용 가능

#### 3-3. 헬퍼 메소드들 - 응답 객체 생성
```java
// 응답 객체 생성
private ResVO<AttendanceStatusResponse> createResponse(AttendanceType attendanceType) {
    AttendanceStatusResponse response = new AttendanceStatusResponse();
    response.setStatus(attendanceType.getCode());         // "homerun"
    response.setPathUrl(attendanceType.getPathUrl());     // "/event/daily?tab=tab-1"
    response.setImageUrl(attendanceType.getImageUrl());   // "/floating_icon/webp/baseball.webp"
    return ResUtil.convert(CommonStatus.조회, response);
}

// 로그인하지 않은 사용자용 빈 응답
private ResVO<AttendanceStatusResponse> createEmptyResponse() {
    AttendanceStatusResponse response = new AttendanceStatusResponse();
    response.setStatus("");      // 빈 문자열
    response.setPathUrl("");     // 빈 문자열
    response.setImageUrl("");    // 빈 문자열
    return ResUtil.convert(CommonStatus.조회, response);
}
```

**실제 응답 객체 예제:**

#### 1. 야구장 이벤트 활성화 시 (방망이 보유한 경우)
```json
{
  "result": 200,
  "message": "조회 성공",
  "data": {
    "status": "homerun",
    "pathUrl": "/event/daily?tab=tab-1",
    "imageUrl": "/floating_icon/webp/baseball.webp"
  }
}
```

#### 2. 특별 이벤트 없거나 티켓 없는 경우 (기본 로또)
```json
{
  "result": 200,
  "message": "조회 성공", 
  "data": {
    "status": "lotto",
    "pathUrl": "/event/attendance?tab=lotto",
    "imageUrl": "/floating_icon/webp/lotto.webp"
  }
}
```

#### 3. 로그인하지 않은 경우 (빈 응답)
```json
{
  "result": 200,
  "message": "조회 성공",
  "data": {
    "status": "",
    "pathUrl": "",
    "imageUrl": ""
  }
}
```

**AttendanceService 메소드 분석:**
- **attendanceStatus()**: 메인 진입점, 로그인 체크 + Strategy 활용
- **getActiveSpecialEvent()**: Strategy Pattern의 핵심 로직
- **createResponse()/createEmptyResponse()**: 응답 객체 생성 헬퍼

**응답 객체 활용:**
- **status**: 프론트엔드에서 이벤트 타입 구분
- **pathUrl**: 해당 이벤트 페이지로 이동할 URL
- **imageUrl**: 플로팅 버튼에 표시할 이미지 경로

---

## 7. 적용 효과 및 장점

### **1. 확장성**
```java
// 새로운 이벤트 추가 시
@Service
public class NewEventAttendanceCheckService implements AttendanceCheckStrategy {
    // 기존 코드 수정 없이 새로운 전략 추가 가능
}
```

### **2. 의존성 주입을 통한 자동 등록**
```java
// Spring이 모든 구현체를 자동으로 List에 주입
private final List<AttendanceCheckStrategy> attendanceCheckServices;
```

### **3. SOLID 원칙 준수**
- **단일 책임 원칙 (SRP)**: 각 이벤트별 로직이 독립적인 클래스로 분리
- **개방-폐쇄 원칙 (OCP)**: 새로운 이벤트 추가 시 기존 코드 수정 불필요
- **의존성 역전 원칙 (DIP)**: 인터페이스에 의존, 구현체에 의존하지 않음

### **4. 핵심 개선 효과**
1. **유지보수성** 향상 - 각 이벤트 로직이 분리되어 수정이 용이
2. **테스트 용이성** 향상 - 각 전략을 독립적으로 테스트 가능
3. **코드 가독성** 향상 - 복잡한 조건문 제거
4. **확장성** 향상 - 새로운 이벤트 타입 추가가 간단

---

## 8. 기술적 이슈 해결 - 프록시 객체 필터링

### **문제 상황**

```java
.filter(service -> {
    String className = service.getClass().getSimpleName();
    return !className.startsWith("$Proxy");  // 프록시 객체 제외
})
```

### **문제의 원인: @MapperScan 광범위 스캔**

`ReplicationDatabaseConfig.java:31`에서:
```java
@Configuration
@MapperScan(basePackages= "com.dalbit")  // 전체 패키지 스캔!
public class ReplicationDatabaseConfig {
    // MyBatis 설정
}
```

### **발생하는 문제**

MyBatis의 `@MapperScan`이 **`com.dalbit` 전체 패키지**를 스캔하면서:

1. **정상적인 Mapper 인터페이스**를 찾아 프록시 생성 (정상)
2. **AttendanceCheckStrategy 인터페이스**도 Mapper로 오인하여 **빈 프록시 생성** (문제)

### **실제 주입되는 List 상황**

```java
// Spring이 주입하는 List<AttendanceCheckStrategy>
List<AttendanceCheckStrategy> attendanceCheckServices = [
    HomeRunAttendanceCheckService,           // [정상] 정상 구현체
    ShootingAttendanceCheckService,          // [정상] 정상 구현체  
    LottoAttendanceCheckService,             // [정상] 정상 구현체
    $Proxy456@AttendanceCheckStrategy       // [문제] MyBatis 빈 프록시!
];
```

### **해결 방법**

#### **현재 방어적 코딩 (운영 중)**
```java
.filter(service -> {
    String className = service.getClass().getSimpleName();
    return !className.startsWith("$Proxy");  // 빈 프록시 제외
})
```

#### **근본적 해결책 (권장)**
```java
// @MapperScan 범위 축소
@MapperScan(basePackages = {
    "com.dalbit.*.dao",      // DAO 패키지만
    "com.dalbit.*.mapper"    // Mapper 패키지만
})
```

**결론**: 현재 프록시 필터링은 **@MapperScan의 광범위한 스캔**으로 인한 **합리적인 방어 코드**입니다. MyBatis가 잘못 생성한 빈 프록시 객체를 제외하여 시스템의 안정성을 보장합니다.

---

## 9. 토론 포인트

### **개선 및 확장 방향**
1. **현재 구조에서 개선할 점은?**
    - @MapperScan 범위 축소를 통한 근본적 해결
    - 이벤트별 우선순위 로직 외부 설정 가능 여부

2. **다른 도메인에서 적용 가능한 부분은?**
    - 결제 수단 선택 로직
    - 알림 발송 방식 선택
    - 보상 지급 방식 다양화

### **패턴 비교 및 고려사항**
1. **Strategy Pattern vs Factory Pattern**
    - Strategy: 런타임 동적 선택 (현재 구조)
    - Factory: 객체 생성 시점 결정

2. **새로운 이벤트 추가 시 고려사항**
    - AttendanceType enum에 새 타입 추가
    - isActiveEvent() 로직 업데이트
    - 새로운 Strategy 구현체 생성

---

## 10. 참고자료

- **Design Patterns**: GoF Design Patterns - Strategy Pattern
- **Spring Framework**: Dependency Injection & Component Scanning
- **MyBatis**: @MapperScan Configuration Best Practices
- **Clean Architecture**: SOLID Principles Application