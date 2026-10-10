# Cloudflare Workers + D1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarago의 기존 API를 유지하는 Workers/D1 배포와 1분 예약 알림을 구현한다.

**Architecture:** 기존 Nest 서버는 유지하고 server/cloudflare에 Worker 진입점과 D1 저장소를 추가한다. 공급자·도착정보·노선 표현·알림 규칙은 기존 구현을 재사용하며 DB 의존성을 명시적인 저장소 인터페이스로 분리한다. Wrangler 로컬 D1에서 검증한 뒤 원격 데이터와 앱 URL을 전환한다.

**Tech Stack:** TypeScript, Cloudflare Workers/D1/Cron Triggers, Wrangler, 기존 Jest/Nest 공급자, Expo Push.

**Spec:** ../specs/2026-10-10-cloudflare-migration-design.md

## Global Constraints

- 기존 API 경로·응답·오류 상태, 정류소 UUID와 기기 credential_hash를 유지한다.
- 기존 PostgreSQL과 Docker 실행 구성을 삭제·재설정하지 않는다.
- 예약 확인은 매분, 시간 판정은 한국 시간, 접근 알림은 기존 기기 위치 감지를 유지한다.
- D1 DB당 500MB, 계정 전체 5GB, 하루 읽기 500만/쓰기 10만 행, 호출당 SQL/하위 요청 50개, Worker CPU 10ms를 기준으로 검증한다.
- 공간 격자 인덱스로 후보를 줄이고 Haversine 거리로 필터·정렬한다. 전국 테이블 전체 스캔을 요청에 사용하지 않는다.
- 키는 Worker secrets에 저장한다. 알림·기기 내보내기와 로컬 D1 상태는 git에서 제외한다.
- 새 ORM/HTTP 프레임워크를 추가하지 않는다. Wrangler와 Workers 타입은 배포·검증 개발 의존성으로만 추가한다.
- 실제 Cloudflare 로그인·배포·기기 검증 전에는 배포 완료로 보고하지 않는다.

## Review Focus

- 격자 경계 바로 건너의 정류소도 반경에 포함되고 반경 밖 정류소는 제외돼야 한다(Task 1).
- 다른 기기의 알림 UUID를 알아도 읽거나 수정할 수 없어야 한다(Task 3).
- 겹친 Cron 실행과 설정 변경 중에도 같은 발송 키는 한 번만 선점돼야 한다(Task 4).
- 전국 정류소 적재가 무료 쓰기 한도를 넘으면 진행 상태를 보존하고 다음 날 재개할 수 있어야 한다(Task 5).
- 외부 버스 API 장애와 누락된 secrets는 명확한 오류를 남기고 기존 앱 연결을 끊지 않아야 한다(Task 2/6).

---

### Task 1: D1 정류소 저장소

**Files:** Create server/cloudflare/migrations/0001_initial.sql, server/cloudflare/stations.ts, server/cloudflare/spatial.ts, server/cloudflare/stations.spec.ts, server/cloudflare/tsconfig.json; Modify server/package.json, server/package-lock.json, .gitignore.

**Interfaces:** StationLookup의 findStation(id), findSources(id), findNearby(latitude,longitude,radius)는 기존 StationRepository의 반환 타입을 사용한다. D1Stations(db: D1Database)가 이를 구현한다. spatial.ts는 gridKey(latitude,longitude): string, nearbyGridKeys(latitude,longitude,radius): string[], distanceMeters(a,b): number를 제공한다. 0.01도 격자 키와 grid_key 인덱스를 사용한다.

- [ ] 기존 Jest에 cloudflare 테스트를 포함시키고 Wrangler/Workers 타입 및 별도 tsconfig를 설정한다.
- [ ] 실제 로컬 D1에 스키마를 적용하는 테스트를 작성한다. 격자 경계 양쪽 100m 정류소 포함, 반경 밖 제외, 거리순 정렬, 같은 이름 5m 임시 ARS 제거, 공급자와 UUID 보존을 단언하고 미구현 상태에서 실패를 확인한다.
- [ ] SQLite 테이블을 만든다. 좌표 REAL, UUID/JSON TEXT, 외래키·고유 제약·격자/기기/알림 시간 조회 인덱스를 추가한다. JSON에서 scheduledEnabled/enabled를 조회하기 위한 인덱스와 알림 시간 필터를 반영한다.
- [ ] 격자 후보 조회와 거리 필터를 구현하고 동일 테스트를 통과시킨다. latitude 경계/극점과 longitude 경계에서도 키 계산이 유효한지 테스트한다.
- [ ] 실행: npm test -- --runInBand --watchman=false --cacheDirectory=/tmp/tarago-jest-cache, npx tsc --noEmit -p cloudflare/tsconfig.json. PASS 확인 후 feat(d1): add indexed station storage 커밋.

### Task 2: 기존 버스 API를 제공하는 Worker

**Files:** Create server/cloudflare/index.ts, server/cloudflare/bus-api.ts, server/cloudflare/runtime.ts, server/cloudflare/api.spec.ts, server/wrangler.jsonc; Modify server/src/bus/arrivals/arrival-router.service.ts, server/src/bus/routes/bus-route.service.ts, server/src/bus/stations/station.repository.ts.

**Interfaces:** 기존 StationRepository가 StationLookup 인터페이스를 구현하며 ArrivalRouterService/BusRouteService는 인터페이스에 의존하되 Nest 주입 토큰을 보존한다. Worker Env는 DB: D1Database, PUBLIC_DATA_SERVICE_KEY: string, EXPO_ACCESS_TOKEN?: string. fetch(request,env,ctx): Promise<Response>가 현재 bus API를 처리한다. createRuntime(env)는 D1Stations, 공급자, ArrivalRouterService, BusRouteService를 결합한다.

- [ ] 주변/도착/노선 API 계약, 잘못된 UUID·좌표·반경·순번, 알 수 없는 URL과 누락된 키의 상태 코드 테스트를 먼저 작성하고 실패 확인.
- [ ] Nest 컨테이너를 띄우지 않고 기존 공급자와 캐시를 재사용한다. 환경별 런타임의 키/DB가 섞이지 않게 구성하고 공유 캐시는 수명을 제한한다.
- [ ] fetch 라우팅과 오류 JSON 응답을 구현한다. 주변 조회 Cache-Control은 기존 값을 유지한다. PUBLIC_DATA_SERVICE_KEY 누락은 비밀 값 노출 없이 실패시킨다.
- [ ] Wrangler compatibility_date와 nodejs_compat를 공식 현재 문서 기준으로 고정하고 D1 바인딩/로컬 개발 설정을 추가한다. placeholder DB ID로 원격 deploy를 시도하지 않는다.
- [ ] 기존 공급자/노선 회귀 테스트와 Worker 계약 테스트, npx wrangler deploy --dry-run 통과 후 feat(workers): serve existing bus API 커밋.

### Task 3: D1 알림 설정과 기기 인증

**Files:** Create server/cloudflare/alerts.ts, server/cloudflare/alerts.spec.ts; Modify server/cloudflare/index.ts; Reuse server/src/alerts/alert-rules.ts와 SavedAlert 타입.

**Interfaces:** D1Alerts(db,arrivals)는 registerDevice(), authenticate(auth): Promise<string>, pushStatus(deviceId), setPushToken(deviceId,token), list(deviceId): Promise<SavedAlert[]>, save(deviceId,body,id?): Promise<SavedAlert>, remove(deviceId,id)를 제공한다. 현재 AlertsController의 HTTP 계약을 따른다.

- [ ] 인증 누락/위조, 기기 간 읽기·수정·삭제 차단, UUID 유지, 푸시 토큰 검증, 기기당 20개 제한과 동시 생성 제한 테스트를 작성하고 실패 확인.
- [ ] Web Crypto로 32바이트 기기 자격 증명과 SHA-256 해시를 생성한다. 저장소 SQL은 소유권 조건을 포함한다.
- [ ] 현재 validateAlert와 노선 검증을 재사용하고 JSON 설정 직렬화/파싱을 구현한다. 생성 제한은 원자적인 SQL 조건으로 적용한다. 업데이트 시 station_id도 설정과 함께 갱신한다.
- [ ] fetch에 기존 alerts 경로를 추가하고 테스트/타입 검사를 통과시킨 뒤 feat(d1): persist authenticated bus alerts 커밋.

### Task 4: 매분 예약 알림과 발송 영수증

**Files:** Create server/cloudflare/scheduled.ts, server/cloudflare/scheduled.spec.ts; Modify server/wrangler.jsonc, server/cloudflare/index.ts, server/cloudflare/migrations/0001_initial.sql.

**Interfaces:** runScheduled(env,now: Date): Promise<void>는 시간 조건 조회·도착정보·발송 선점·푸시·영수증을 처리한다. Worker scheduled 핸들러는 ctx.waitUntil(runScheduled(env,new Date(controller.scheduledTime)))을 사용한다. 런타임 서비스는 Task 2/3 인터페이스를 사용한다.

- [ ] 한국 시간·자정·요일, 겹친 실행 선점, 설정 변경/삭제, 중복 방지, 최대 3회 재시도, 잘못된 토큰, 영수증 처리 테스트를 먼저 작성하고 실패 확인.
- [ ] Cron을 '* * * * *'로 설정한다. activeServiceDate/eligibleArrivals를 재사용하고 활성 시간대의 알림만 조회한다. 같은 정류소를 묶는다.
- [ ] 발송 선점은 기존 키 구성과 설정 스냅샷/토큰 검증을 유지하는 원자적 INSERT/UPSERT 조건으로 구현한다. 2분 후 재시도와 15분 후 영수증 확인, 7일 이력 정리를 보존한다.
- [ ] D1 진행 상태 테이블에 마지막 처리 커서를 저장한다. 호출당 하위 요청 합계를 40 이하로 제한해 여유를 남기고 한 정류소/발송 처리 전 잔여 예산을 확인한다. 처리하지 못한 알림은 다음 분에 계속한다. 실제 CPU 측정이 무료 한도를 넘으면 통과로 보고하지 않고 원인을 줄인다.
- [ ] wrangler dev --test-scheduled로 실제 scheduled 핸들러를 호출하고 테스트/사용량 확인 후 feat(alerts): check arrivals with minute cron 커밋.

### Task 5: PostgreSQL 데이터 이전 도구

**Files:** Create server/scripts/export-d1.cjs, server/scripts/import-d1.cjs, server/cloudflare/migration.spec.ts; Modify .gitignore, server/package.json.

**Interfaces:** export-d1은 DATABASE_URL에서 읽기 전용 스냅샷을 JSONL로 내보낸다. import-d1은 로컬/원격 대상을 명시적으로 받아 UUID를 보존한 파라미터 바인딩 배치를 적용하며 진행 상태 파일을 남긴다. --remote는 명시해야 원격에 쓴다. 내보내기/진행 파일은 git에서 제외한다.

- [ ] UUID/기기 credential_hash/알림/발송 상태 보존, 손상된 입력 거부, 실패한 배치 재개, 기존 DB 미변경, 무료 일일 쓰기 예산 중단 테스트를 먼저 작성하고 실패 확인.
- [ ] PostgreSQL repeatable-read 읽기 전용 트랜잭션으로 스냅샷을 만들고 D1에 작은 UPSERT 배치로 적재한다. 일일 예산에는 인덱스 쓰기를 포함하고 D1 실제 meta.rows_written/사용량을 확인한다. 최초 전국 적재는 여러 날 재개 가능한 상태를 저장한다.
- [ ] 로컬 D1에 실제 데이터 이전, 테이블 행 수·외래키·샘플 위치/ARS·DB 크기 확인. 500MB를 초과하거나 무료 쓰기 한도가 부족하면 원격 적재를 중단하고 정확한 상태를 보고한다.
- [ ] 검증 통과 후 feat(migration): export and resume D1 data import 커밋.

### Task 6: 배포 문서와 최종 전환

**Files:** Create server/docs/cloudflare.md; Modify README.md, app/docs/bus-alerts.md; 앱 EXPO_PUBLIC_API_BASE_URL은 로컬 설정에서만 수정하고 비밀 환경 파일은 커밋하지 않는다.

- [ ] Cloudflare 로그인, 무료 D1 생성/ID 반영, secret 등록, 분할 적재, Worker 배포, 앱 URL 전환과 기존 URL 복구 절차를 문서화한다. 한도·1분 감지 지연·실제 기기 권한 조건을 명시한다.
- [ ] server 기존/신규 테스트, 서버 빌드·타입·린트, Worker dry-run, app 타입·린트·관련 테스트를 실행한다. git diff --check와 최종 diff에서 비밀 정보/생성 데이터가 없는지 검토한다.
- [ ] 인증이 준비돼 있으면 원격 생성·이전·배포 후 HTTPS API와 기존 서버의 샘플 응답을 대조한다. 인증이 없으면 로그인 단계만 사용자에게 요청하고 배포 준비와 로컬 검증은 완료한다.
- [ ] 실제 기기에서 예약/접근 알림 확인 가능 여부를 보고한다. 실행하지 못한 검증을 명시한다.
- [ ] 문서 커밋 후 기능별 커밋을 origin에 푸시하고 원격 SHA와 깨끗한 작업 트리를 확인한다.
