# TaraGo 시스템 설계

## 1. 제품 목표

TaraGo는 사용자가 선택한 버스 정류장과 노선의 도착 시간을 감시하고, 설정한 시간 범위 안에서 버스가 지정한 임계 시간에 진입하면 알림을 보내는 대중교통 알림 앱이다.

첫 MVP의 중심은 지도 탐색 자체보다 다음 흐름이다.

1. 현재 위치 주변 정류장을 찾는다.
2. 정류장을 선택해 경유 노선과 도착 정보를 본다.
3. 특정 노선에 감시 시간과 알림 임계값을 설정한다.
4. 앱이 종료되어도 서버가 도착 정보를 감시하고 푸시 알림을 보낸다.

버스가 차고지에서 아직 출발하지 않아 도착정보가 없더라도 감시 시간 동안 조회를 계속해야 한다.

## 2. 전체 아키텍처

```text
React Native 앱
  ├─ 네이버 지도와 현재 위치
  ├─ 정류장·노선·도착정보 조회 UI
  ├─ 알림 설정과 목록 관리
  └─ 푸시 토큰 등록
          │
          ▼
Node.js API 서버 ───── PostgreSQL
  ├─ 사용자와 기기 토큰
  ├─ 정류장·노선 조회 프록시
  └─ BusAlert CRUD
          │
          ▼
Monitoring Worker ─── 공유 캐시
  ├─ 활성 감시 대상 묶기
  ├─ 서울시 버스 API 조회
  ├─ ETA와 임계값 판정
  ├─ 중복 발송 방지
  └─ FCM/APNs 푸시 발송
```

## 3. 앱과 서버의 역할

### React Native 앱

- 네이버 지도 표시와 현재 위치 이동
- 주변 버스 정류장과 지하철역 표시 및 선택
- 정류장 경유 버스와 도착정보 표시
- 요일, 감시 시간, 알림 임계값 입력
- 저장된 알림 목록과 활성 상태 관리
- foreground 화면 갱신
- 푸시 알림 수신과 관련 화면 이동

서버에서 받은 데이터는 TanStack Query로 관리하고, 선택 상태·지도 상태·BottomSheet 상태 같은 UI 상태만 Zustand로 관리한다.

### Backend API

- 서울시 버스 API 키 보호와 응답 정규화
- 사용자, 기기 푸시 토큰, 알림 설정 저장
- 앱에서 필요한 정류장·노선·도착정보 API 제공
- Worker가 사용할 활성 알림 조회

### Monitoring Worker

- 설정된 요일과 감시 시간에만 작업 활성화
- 동일한 `stationId + routeId`를 하나의 감시 키로 묶기
- 도착정보가 없어도 감시 종료 시각까지 계속 조회
- ETA가 임계값을 처음 통과할 때만 알림 생성
- 같은 차량 운행과 임계값 조합의 중복 발송 방지

## 4. 외부 서비스

- Naver Cloud Maps Dynamic Map: 모바일 지도
- 서울시 버스 Open API: 정류장 검색, 경유 노선, 도착정보, 차량 위치
- Expo Location: foreground 현재 위치
- FCM: Android 푸시
- APNs: iOS 푸시
- 필요하면 Expo Notifications를 푸시 클라이언트 계층에 사용

지하철 데이터 제공처와 범위는 버스 MVP가 안정된 뒤 별도로 결정한다.

## 5. 주요 데이터 흐름

### 지도 탐색

1. 앱이 foreground 위치 권한을 요청한다.
2. 현재 좌표를 얻으면 지도 카메라를 이동한다.
3. 지도 범위 또는 현재 위치를 기준으로 주변 정류장을 요청한다.
4. 서버가 외부 API 응답을 정규화해 반환한다.
5. 앱이 정류장 마커를 표시하고 선택 결과를 BottomSheet에 보여준다.

### 알림 설정

1. 사용자가 정류장과 노선을 선택한다.
2. 요일, 감시 시작·종료 시각, 임계값을 입력한다.
3. 앱이 서버에 BusAlert를 저장한다.
4. Worker가 활성 시간에 해당 설정을 감시한다.

### 알림 판정

1. Worker가 활성 알림을 `stationId + routeId` 기준으로 묶는다.
2. 같은 묶음은 서울시 API를 한 번만 호출한다.
3. 도착정보가 없으면 간격을 두고 재조회한다.
4. 도착정보가 생기면 차량 식별자와 ETA를 추출한다.
5. 설정한 임계값을 처음 통과한 사용자에게 푸시를 보낸다.
6. 발송 기록을 저장해 같은 운행의 같은 임계값을 다시 보내지 않는다.

## 6. DB 스키마 초안

### users

- `id`
- `created_at`

### devices

- `id`
- `user_id`
- `platform`: android | ios
- `push_token`
- `enabled`
- `last_seen_at`

### bus_alerts

- `id`
- `user_id`
- `station_id`
- `station_name`
- `route_id`
- `bus_number`
- `days_of_week`
- `start_time`
- `end_time`
- `timezone`
- `alert_thresholds`
- `enabled`
- `created_at`
- `updated_at`

### alert_deliveries

- `id`
- `alert_id`
- `service_date`
- `vehicle_run_key`
- `threshold_minutes`
- `eta_seconds`
- `sent_at`
- `status`

중복 방지를 위해 `(alert_id, service_date, vehicle_run_key, threshold_minutes)`에 unique 제약을 둔다.

## 7. Monitoring 알고리즘

1. 현재 요일과 시간이 일치하는 활성 BusAlert를 찾는다.
2. `stationId + routeId` 기준으로 그룹화한다.
3. 그룹별 최신 도착정보 캐시가 유효하면 재사용하고, 아니면 외부 API를 호출한다.
4. 응답이 없으면 감시 상태를 유지하고 다음 조회를 예약한다.
5. 응답이 있으면 첫 번째와 두 번째 도착 차량을 정규화한다.
6. 각 차량의 ETA가 임계값 이하가 되었는지 확인한다.
7. 발송 unique 키를 먼저 기록하거나 원자적으로 생성한다.
8. 새 기록을 만든 경우에만 푸시를 발송한다.
9. 감시 종료 시각 이후에는 다음 활성 일정까지 중단한다.

## 8. Adaptive Polling

- 도착정보 없음: 10~15초
- ETA 20분 이상: 10초
- ETA 10분 이하: 5초
- ETA 5분 이하: 필요할 때 3초

실제 운영 간격은 서울시 API 갱신주기와 호출 제한을 측정한 뒤 조정한다. 사용자별 호출을 만들지 않고 감시 키별 결과를 짧게 캐시한다.

## 9. 폴더 구조 방향

```text
src/
  app/                  # Expo Router 화면과 layout
  features/
    map/
    bus-stop/
    bus-arrival/
    bus-alert/
  entities/
    bus/
    bus-stop/
    alert/
  shared/
    api/
    config/
    lib/
    types/
    ui/
  hooks/                # 현재의 공용 훅, 구조가 커지면 feature로 이동
```

폴더는 기능이 실제로 생길 때 추가한다. 현재 MVP 초기 단계에서는 빈 디렉터리나 추상 계층을 미리 만들지 않는다.

## 10. 구현 단계와 완료 조건

### Phase 1 — 앱 기반과 지도

- Expo Router 기반 Android·iOS Development Build가 실행된다.
- 네이버 지도가 표시된다.
- 위치 권한을 허용하면 현재 위치로 이동한다.
- 오른쪽 아래 버튼으로 현재 위치를 다시 찾을 수 있다.

현재 상태: 구현과 기본 검증이 진행된 상태다.

### Phase 2 — 고정 정류장 도착정보

- 서버 또는 안전한 개발 프록시를 통해 서울시 버스 API를 호출한다.
- 코드에 고정한 정류장의 도착정보를 화면에 표시한다.
- 로딩, 빈 응답, 오류 상태가 구분된다.

### Phase 3 — 주변 정류장

- 지도 중심 또는 현재 위치 주변 정류장을 조회한다.
- 정류장 마커가 표시된다.
- 지도 이동 시 과도한 요청을 만들지 않는다.

### Phase 4 — 정류장 선택

- 정류장 마커를 누르면 정류장 정보와 경유 버스를 표시한다.
- 각 버스의 현재 도착예정시간을 확인할 수 있다.

### Phase 5 — 특정 버스 foreground 갱신

- 선택한 버스 도착정보를 화면이 열린 동안 갱신한다.
- 도착정보 없음 상태에서도 조회를 계속한다.

### Phase 6 — 알림 설정

- 요일, 감시 시간, 임계값, 활성 상태를 입력하고 저장한다.
- 알림 목록에서 수정·활성화·비활성화할 수 있다.

### Phase 7 — Backend Monitoring Worker

- 앱이 종료되어도 서버가 활성 알림을 감시한다.
- 정보 없음 상태를 감시 종료로 처리하지 않는다.

### Phase 8 — Push Notification

- Android와 iOS 실기기에서 푸시를 받는다.
- 알림을 누르면 관련 노선/정류장 화면으로 이동한다.

### Phase 9 — 호출 최적화와 중복 방지

- 같은 정류장·노선 조회를 여러 사용자가 공유한다.
- adaptive polling이 적용된다.
- 동일 운행과 임계값 알림이 한 번만 발송된다.

### Phase 10 — UX 개선

- 지도, BottomSheet, 검색, 즐겨찾기 등 핵심 흐름을 실제 사용성에 맞게 다듬는다.

## 11. 예상 기술 문제

- 서울시 API의 갱신주기, 호출량 제한, 간헐적인 빈 응답
- 차량 식별자가 불안정하거나 첫 번째·두 번째 도착 순서가 바뀌는 문제
- 자정이 포함된 감시 시간과 한국 시간대 처리
- 차고지 출발 차량의 장시간 도착정보 없음
- 시뮬레이터 가상 위치와 실기기 GPS의 차이
- Android 제조사별 백그라운드 제한
- iOS 앱 종료 상태에서 앱 자체 polling 불가
- 푸시 토큰 갱신과 만료
- 버스 정류장 데이터와 지하철역 데이터의 서로 다른 식별 체계

## 12. 모바일 Background 대응

앱의 background task를 핵심 감시 수단으로 사용하지 않는다. Android와 iOS 모두 실행 주기와 지속 실행을 운영체제가 제한하기 때문이다. 앱은 설정과 결과 표시를 담당하고, 지속적인 도착 감시는 서버 Worker가 담당한다.

## 13. API 호출량 절감

- 사용자 대신 `stationId + routeId` 단위로 조회
- 짧은 TTL 캐시로 같은 결과 공유
- 감시 시간 밖에는 호출하지 않기
- ETA에 따른 adaptive polling
- 지도 이동 이벤트 debounce
- 화면에서 보이는 영역의 정류장만 조회
- 외부 API 실패 시 지수 backoff와 jitter 적용

## 14. MVP 제외 범위

- 완전한 네이버지도 수준의 검색·길찾기·내비게이션
- 전국 버스와 전국 지하철 통합
- 실시간 이동 경로 추적
- 백그라운드 GPS 수집
- 복잡한 회원가입과 소셜 기능
- 관리자 대시보드와 고급 통계
- AI 도착시간 예측
- 오프라인 지도

## 15. 현재 구현 상태

- React Native + TypeScript + Expo SDK 57
- Expo Router 기본 탭 구조
- Expo Development Build 환경
- 네이버 Dynamic Map 등록과 네이티브 지도 연동
- Android·iOS 시뮬레이터 빌드 환경
- foreground 위치 권한 요청
- 지도 초기 현재 위치 이동
- 현재 위치 오버레이와 이동 버튼
- 위치 조회 로직을 `useCurrentLocation` 훅으로 분리

