# Tarago Cloudflare 무료 배포 설계

## 목적과 합의

사용자는 NestJS/PostgreSQL 서버를 Cloudflare Workers/D1으로 이전하고 예약 알림 확인 주기를 15초에서 1분으로 바꾸는 방향에 동의했다. 앱의 지도·노선·도착정보·알림 설정 동작과 기존 HTTP 계약을 유지한다. 위치 접근 알림은 휴대폰의 기존 위치 감지와 Expo 알림을 유지한다. 무료 한도 안에서 동작하도록 설계하며 영구적인 무제한 무료 운영을 보장하지 않는다.

## 현황과 선택

현재 주변 정류소 검색은 PostGIS ST_DWithin/ST_Distance를 사용한다. 정류소는 UUID, 공급자별 식별자는 station_sources에 저장된다. 알림은 기기 bearer 인증과 JSON 설정을 사용하며 서버 setInterval이 15초마다 시간 조건과 도착정보를 검사한다.

대안은 외부 PostgreSQL을 유지하는 Workers 배포, 유료 Containers에 기존 서버 배포, Workers+D1 전체 이전이다. 사용자가 Cloudflare만 사용하는 무료 구성을 선택했으므로 Workers+D1을 적용한다. 기존 Nest 서버와 Docker DB는 검증·복구용으로 보존한다.

## HTTP 서버

server 안에 Workers 진입점과 Wrangler 설정을 추가한다. 기존 bus/alerts URL, 응답 필드, HTTP 오류 상태와 입력 검증을 유지한다. Worker의 fetch 핸들러가 요청을 처리하며 기존 상시 HTTP 서버와 interval을 시작하지 않는다. 기존 도착정보 공급자·노선 변환·알림 조건 로직은 재사용한다. Nest HTTP 어댑터와 전체 DI 컨테이너를 기동하지 않는 최소 진입점을 우선하고, 재사용 코드의 Workers 번들 호환성을 검사한다. 새로운 프레임워크나 ORM은 필요하지 않다.

PUBLIC_DATA_SERVICE_KEY와 선택적인 EXPO_ACCESS_TOKEN은 Worker secrets에 저장한다. DB와 인증 정보를 앱에 공개하지 않는다. API 기본 도메인의 HTTPS를 사용하고 앱 EXPO_PUBLIC_API_BASE_URL만 전환한다.

## D1 데이터와 검색

bus_stations, station_sources, alert_devices, bus_alerts, alert_deliveries를 SQLite 문법으로 만든다. UUID는 text, 좌표는 latitude/longitude REAL, JSON 설정은 text로 저장한다. 외래키·고유 제약·기기 소유권 검증을 유지한다. SQL 자리표시자와 바인딩을 사용한다.

주변 검색은 정류소 좌표에 공간 격자 키와 인덱스를 두고 요청 반경과 겹치는 격자의 후보만 조회한다. 후보에 Haversine 거리 필터·정렬을 적용하고 기존 같은 이름·5m 임시 정류소 중복 제거를 유지한다. 전국 전체 테이블 스캔과 요청별 데이터 덤프는 금지한다. 반경/좌표 입력 범위와 기본 반경은 현재 계약을 따른다.

로컬 PostgreSQL을 읽기 전용으로 내보내는 도구를 만든다. 정류소·공급자 UUID를 그대로 유지해 앱의 기존 저장 참조가 끊기지 않게 한다. 기존 알림·기기·발송 이력도 필요한 경우 UUID와 자격 증명 해시를 보존하여 이전한다. 기기/알림 데이터가 포함된 내보내기 파일은 민감 데이터로 취급하고 git에 저장하지 않는다. 작은 배치로 초기 데이터를 적재하고 행 수·외래키·대표 정류소 좌표를 대조한다. 기존 PostgreSQL을 삭제하거나 재설정하지 않는다.

D1 무료 한도는 계정 전체 5GB지만 DB 하나는 500MB다. 초기 데이터와 인덱스 크기를 측정해 500MB 안에 들어가는지 확인한다. 하루 쓰기 10만 행에 인덱스 변경도 포함되므로 전국 정류소 최초 적재는 무료 한도와 적재 행 수에 따라 여러 날로 분할한다. 한도를 넘는 적재를 자동 반복하지 않는다. 기존 CSV 전체 교체 도구를 원격 Worker에서 실행하지 않고 로컬 동기화 도구로 대체한다.

## 예약 알림

Cron Triggers를 매분 실행한다. 한국 시간·설정 요일·시작/종료 시간·자정 경계·도착 기준을 기존 규칙대로 적용한다. 활성 시간대의 알림만 조회하고 동일 정류소는 묶어 도착 API를 한 번 조회한다. 1분 확인은 조건 감지가 최대 약 1분 늦어질 수 있고 외부 API/푸시 지연도 발생한다.

D1의 원자적인 발송 키 등록으로 겹친 실행의 중복 발송을 막는다. 완료·재시도 상태, 최대 재시도 횟수, 토큰 만료/인증 오류 처리와 Expo 발송 영수증 확인을 보존한다. 예약 작업의 단일 실행에 모든 사용자를 처리하려 하지 않고 D1에 진행 상태를 기록해 다음 분으로 이어갈 수 있도록 쿼리·외부 요청 예산을 제한한다. 무료 Worker는 호출당 CPU 10ms, 하위 요청 50개 제한이 있어 작은 규모부터 실제 CPU·요청·읽기/쓰기 사용량을 검증한다. 과부하 때 알림 확인이 더 늦어질 수 있음을 문서화한다.

## 검증과 전환

- 기존 앱 API 계약·상태 코드, 잘못된 입력, 기기 간 권한 차단 테스트.
- D1 실제 SQLite 스키마에 주변 검색, 외래키, CRUD, 발송 키 중복 테스트.
- 거리/격자 경계와 기존 임시 정류소 중복 제거 테스트.
- 예약 시간·요일·자정·1분 주기, 중복 Cron, 재시도, 무효 푸시 토큰 테스트.
- 기존 서버 테스트와 타입·린트, Wrangler 로컬 실행·dry-run 번들 확인.
- 원격 데이터 이전 뒤 대표 정류소/노선/도착정보를 기존 API와 대조하고 앱 연결 전환.
- 실제 기기 예약/접근 알림은 Expo 프로젝트·푸시 자격 증명·위치 권한과 함께 확인.

Cloudflare 로그인은 사용자가 진행한다. 인증이 준비되면 무료 D1 생성, secrets 등록, 데이터 이전, Worker 배포, 앱 URL 전환을 순서대로 수행한다. 각 단계가 검증되기 전에는 배포 완료로 보고하지 않는다. 실패하면 앱 URL을 기존 서버로 되돌릴 수 있게 기존 실행 구성을 보존한다. 기능별 커밋과 푸시는 사용자의 기존 요청에 따라 수행한다.

## 공식 자료

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
