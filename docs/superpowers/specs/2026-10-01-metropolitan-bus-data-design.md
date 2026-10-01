# TaraGo 수도권 버스 데이터 및 지도 캐시 설계

## 목적

TaraGo 지도에서 서울·경기·인천 버스 정류장을 제공하되, 지도 이동마다 외부 공공 API를 호출하지 않는다. 정류장 기본정보는 TaraGo 서버가 자체 보관하고, 실시간 도착정보만 지역별 제공자 API에서 조회한다.

이 문서는 기존 `2026-09-30-transit-map-arrivals-design.md` 중 버스 정류장 저장, 주변 조회, 외부 API 선택, 캐시와 환경변수 정책을 대체한다. 지하철과 알림 설계는 기존 문서를 유지한다.

## 원칙

- 모바일 앱에는 외부 API 인증키를 포함하지 않는다.
- 지도 탐색은 외부 공공 API의 가용성이나 호출 제한에 직접 의존하지 않는다.
- 정류장 기본정보와 실시간 도착정보의 수명주기를 분리한다.
- 외부 제공자의 서로 다른 식별자와 응답 형식은 NestJS 내부에서 정규화한다.
- 서버 데이터는 TanStack Query가 관리하며 Zustand에 복제하지 않는다.

## 전체 구조

```text
서울·경기·인천·TAGO 정류장 원본
        ↓ 동기화 Worker
PostgreSQL + PostGIS
        ↓ 공간 인덱스 조회
NestJS Transit API
        ↓ 타일 단위 Query 캐시
React Native 지도

정류장 선택
        ↓ station_sources.provider
지역별 Arrival Provider Adapter
        ↓ 짧은 서버 캐시
실시간 도착정보
```

정류장 마커를 표시하기 위한 주변 조회는 PostGIS만 사용한다. 서울·경기 경계에서도 별도의 지역 판별이나 외부 API 병렬 호출 없이 저장된 모든 정류장을 공간 범위로 조회한다.

## 데이터 공급자

```ts
type TransitProvider = "SEOUL" | "GYEONGGI" | "INCHEON" | "TAGO";
```

- 서울: 서울특별시 버스 API
- 경기: 경기버스정보(GBIS) API
- 인천: 인천 버스 API를 우선하며, 제공 범위가 부족한 기능은 TAGO로 보완
- TAGO: 지역 API 장애나 미지원 항목의 명시적인 fallback

각 Provider Adapter는 정류장 동기화와 도착정보 조회를 TaraGo 공통 타입으로 변환한다. 컨트롤러나 앱은 외부 API 필드명을 알지 않는다.

## 데이터 모델

### bus_stations

실제 지도상의 정류장을 나타낸다.

```text
id                uuid primary key
name              varchar
ars_id            varchar nullable
location          geography(Point, 4326)
created_at        timestamptz
updated_at        timestamptz
```

`location`에는 PostGIS 공간 인덱스를 생성한다. 주변 정류장은 `ST_DWithin` 또는 지도 bounds와 `ST_Intersects`로 조회한다.

### station_sources

한 정류장의 외부 제공자 식별자를 저장한다.

```text
id                    uuid primary key
station_id            uuid references bus_stations(id)
provider              enum
provider_station_id   varchar
city_code             varchar nullable
raw_ars_id             varchar nullable
last_synced_at         timestamptz
unique(provider, provider_station_id)
```

경계 지역에서 같은 물리 정류장이 여러 제공자에 존재하면 하나의 `bus_stations` 행에 여러 `station_sources`를 연결한다. 최초 동기화의 중복 후보는 정규화한 이름과 20m 이내 좌표로 찾고, 확정된 매핑은 DB에 유지한다.

## 정류장 동기화

초기 적재는 서울·경기·인천 순서로 실행한다. 이후에는 제공자 버전 정보나 변경 데이터가 있으면 증분 동기화하고, 없으면 하루 한 번 갱신한다.

동기화는 다음 순서를 따른다.

1. 제공자 원본을 페이지 단위로 수집한다.
2. 외부 응답을 Provider Adapter에서 정규화한다.
3. `provider + providerStationId`로 기존 출처를 찾는다.
4. 기존 출처면 정류장 이름과 좌표를 갱신한다.
5. 신규 출처면 20m 이내의 같은 이름 정류장을 중복 후보로 찾는다.
6. 안전하게 결합할 수 없으면 별도 정류장으로 저장한다.
7. 성공한 동기화 시각과 공급자 데이터 버전을 기록한다.

동기화 실패 시 기존 정류장 데이터를 삭제하지 않는다. 한 번의 전체 트랜잭션보다 페이지 단위 upsert를 사용해 부분 실패의 영향을 제한한다.

## 주변 정류장 API

```http
GET /bus/stations/nearby?latitude={latitude}&longitude={longitude}&radius={meters}
```

앱에는 다음 형태를 반환한다.

```ts
type BusStop = {
  id: string;
  name: string;
  arsId: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  providers: TransitProvider[];
};
```

응답은 거리순으로 정렬하고 현재 지도에서 필요한 상한을 둔다. 외부 제공자의 원본 식별자는 정류장 상세 및 도착정보 API 내부에서만 사용한다.

## 지도 타일 캐시

카메라의 미세한 좌표를 Query Key로 사용하지 않는다. 위도·경도를 고정 크기 타일로 변환한다.

```text
["bus-stops", "tile", zoomBucket, tileX, tileY]
```

- 버스 정류장은 지도 확대 단계가 `20` 이상일 때만 조회하고 표시한다.
- 확대 단계가 `20` 미만이 되면 Query를 비활성화하고 마커를 숨긴다.
- 새로운 타일은 한 번 조회한다.
- 방문했던 타일은 앱 세션 동안 TanStack Query 캐시에서 즉시 복원한다.
- 새 타일 로딩 중에는 직전 마커를 유지해 깜빡임을 방지한다.
- 화면과 충분히 멀어진 타일의 마커는 렌더링하지 않지만 캐시는 유지한다.

클라이언트 기본값은 `staleTime: Infinity`, `gcTime: Infinity`로 한다. 영구 오프라인 저장은 이번 범위에 포함하지 않는다.

서버는 PostGIS 조회 결과를 `zoomBucket + tileX + tileY`로 캐시한다. 단일 인스턴스 단계에서는 bounded in-memory cache를 사용하고, 다중 인스턴스로 전환할 때 Redis로 교체한다. 정류장 동기화가 완료되면 관련 타일 캐시를 무효화한다.

## 마커 표시

- 네이티브 PNG 마커를 사용한다.
- 화면 크기는 `22 × 22px`이다.
- 흰색 둥근 사각형 배경과 버스 색상의 `1px` 테두리를 사용한다.
- 테두리와 버스 아이콘 사이 여백은 현재 마커보다 1px 줄인다.
- 확대 단계가 기준 미만으로 내려가면 이전에 표시된 마커도 즉시 숨긴다.

네이버 지도 SDK는 축척 막대의 `5m` 문자열을 이벤트로 제공하지 않으므로 서울 위도에서 약 5m 축척에 해당하는 `zoom >= 20`을 초기 기준으로 사용한다. 실제 iOS·Android 화면에서 확인한 뒤 상수 하나만 조정한다.

## 실시간 도착정보 라우팅

사용자가 정류장을 선택하면 좌표로 지역을 다시 추측하지 않는다. `station_sources`에 저장된 제공자를 사용한다.

```text
SEOUL source     → SeoulArrivalProvider
GYEONGGI source  → GyeonggiArrivalProvider
INCHEON source   → IncheonArrivalProvider
미지원 또는 장애 → TagoArrivalProvider fallback
```

복수 출처 정류장은 주 공급자를 먼저 호출한다. 주 공급자가 정상적인 빈 결과를 반환하면 그대로 처리하며, 네트워크 오류·인증 오류·명세 오류일 때만 fallback을 사용한다. `도착정보 없음`은 실패로 취급하지 않는다.

도착정보 캐시 키는 `provider + providerStationId + routeId`를 사용한다. 여러 사용자가 같은 정류장과 노선을 조회하면 동일한 결과를 공유한다. 캐시 TTL은 데이터 갱신주기를 확인해 3~10초 범위에서 설정한다.

## 동시 요청과 장애 처리

- 같은 캐시 키의 동시 요청은 하나의 진행 중 Promise를 공유한다.
- 하나의 Provider 장애가 전체 주변 정류장 조회를 막지 않는다.
- 이전 도착정보 캐시가 있으면 `stale: true`와 함께 반환한다.
- 캐시가 없고 Provider도 실패하면 일관된 502 응답을 반환한다.
- 인증키와 외부 원문 응답은 클라이언트와 로그에 노출하지 않는다.
- Provider별 오류율, 응답 시간, 캐시 적중률과 외부 호출 횟수를 기록한다.

## 환경변수

공공데이터포털에서 발급된 동일한 Decoding 인증키는 하나만 저장한다.

```env
PUBLIC_DATA_SERVICE_KEY=
SEOUL_SUBWAY_REALTIME_ARRIVAL_API_KEY=
```

서울 지하철 키를 제외한 공공데이터포털 Provider Adapter는 모두 `PUBLIC_DATA_SERVICE_KEY`를 사용한다. 기존 서비스별 공공데이터 키 환경변수는 제거한다.

## 단계적 구현

1. 공통 환경변수와 Provider 인터페이스를 도입한다.
2. PostgreSQL에 PostGIS를 활성화하고 정류장·출처 Schema를 추가한다.
3. 기존 서울 정류장 변환 로직을 `SeoulStationProvider`로 이동한다.
4. 경기 GBIS와 인천/TAGO 정류장 Provider를 추가한다.
5. 정류장 초기 동기화 명령과 Worker를 구현한다.
6. 주변 조회를 외부 API 호출에서 PostGIS 공간 조회로 전환한다.
7. 앱의 좌표 Query Key를 타일 Query Key로 변경한다.
8. 확대 단계 표시 조건과 22px 마커를 적용한다.
9. 도착정보 Provider 라우팅과 짧은 서버 캐시를 구현한다.
10. 호출 횟수, 캐시 적중률과 Provider 장애 fallback을 검증한다.

## 검증 기준

- 서울, 부천, 인천 좌표에서 해당 지역 정류장이 조회된다.
- 서울·경기 경계 화면에서 양쪽 정류장이 함께 보인다.
- 같은 타일을 다시 방문해도 외부 정류장 API를 호출하지 않는다.
- 확대 단계가 기준 미만이면 정류장 Query와 마커가 모두 비활성화된다.
- 다시 확대하면 캐시된 타일은 로딩 표시 없이 나타난다.
- 같은 도착정보에 대한 동시 요청이 외부 API 한 번으로 합쳐진다.
- 지역 API 실패 시 기존 캐시 또는 TAGO fallback이 동작한다.
- 실제 빈 도착정보가 오류나 fallback으로 잘못 처리되지 않는다.
- 공공데이터 인증키가 앱 번들, 응답 또는 로그에 포함되지 않는다.
