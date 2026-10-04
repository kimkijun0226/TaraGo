# Metropolitan Bus Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store metropolitan bus stops in PostGIS, serve them through NestJS without map-time public API calls, cache map tiles in TanStack Query, and route live arrivals through regional provider adapters.

**Architecture:** An import worker normalizes official Seoul, Gyeonggi, Incheon, and TAGO station data into `bus_stations` and `station_sources`. The map queries PostGIS through the existing NestJS endpoint; live arrivals select a provider from persisted station sources and use short shared caches.

**Tech Stack:** NestJS 12, TypeScript 6, PostgreSQL 17 + PostGIS, `pg`, Jest, React Native 0.86, Expo 57, TanStack Query 5, Axios, Naver Maps

**Spec:** `docs/superpowers/specs/2026-10-01-metropolitan-bus-data-design.md`

## Global Constraints

- External API keys remain in the NestJS server only.
- All Public Data Portal adapters use `PUBLIC_DATA_SERVICE_KEY`; the Seoul subway key remains separate.
- Bus stops are visible and fetched only when map zoom is at least `20`.
- The bus marker is `22 × 22px`, with a white rounded background, blue `1px` border, and one pixel less inner spacing than the current asset.
- TanStack Query owns station and arrival server state; Zustand must not duplicate it.
- A normal empty-arrival response is not an upstream failure and must not trigger fallback.
- Do not add Redis in this milestone; use bounded process memory and replace it only when multiple server instances exist.

## Review Focus

- A longitude/latitude order swap must fail a repository test instead of silently returning another area.
- Duplicate station sources within 20m must not produce two map markers.
- Zooming below `20` must both hide existing markers and prevent new requests.
- Concurrent requests for the same arrival cache key must execute one provider request.
- Provider errors may use fallback, while a successful empty result must remain empty.

---

### Task 1: Consolidate public data configuration and marker presentation

**Files:**
- Modify: `server/.env.local`
- Modify: `server/.env.example`
- Modify: `server/src/bus/bus.service.ts`
- Modify: `server/src/bus/bus.service.spec.ts`
- Modify: `src/app/index.tsx`
- Modify: `src/features/bus-stop/ui/bus-stop-marker.tsx`
- Replace: `assets/images/bus-stop-marker.png`

**Interfaces:**
- Consumes: existing `ConfigService` and `NaverMapMarkerOverlay`.
- Produces: `PUBLIC_DATA_SERVICE_KEY`, `BUS_STOP_MIN_ZOOM = 20`, and the final 22px marker asset.

- [ ] **Step 1: Change the BusService test configuration to expose only `PUBLIC_DATA_SERVICE_KEY` and verify the Seoul request still receives the decoded service key.**
- [ ] **Step 2: Run `npm test -- bus.service.spec.ts` in `server/` and verify it fails because the service still requests the old variable.**
- [ ] **Step 3: Replace service-specific public-data variables in `.env.local`, `.env.example`, and `BusService` with `PUBLIC_DATA_SERVICE_KEY`; retain `SEOUL_SUBWAY_REALTIME_ARRIVAL_API_KEY`.**
- [ ] **Step 4: Regenerate the marker at 66 × 66 source pixels for a 22 × 22 display: 1px-equivalent border, one pixel less padding, white rounded background, blue bus.**
- [ ] **Step 5: Set marker width and height to `22`; set the map visibility threshold constant to `20`.**
- [ ] **Step 6: Run the server unit test, root typecheck, and root lint; expect all to pass.**
- [ ] **Step 7: Commit only Task 1 files with `feat: consolidate transit configuration`.**

### Task 2: Add deterministic map tile keys and session caching

**Files:**
- Create: `src/features/bus-stop/model/bus-stop-tile.ts`
- Create: `src/features/bus-stop/model/bus-stop-tile.test.ts`
- Modify: `src/features/bus-stop/model/use-nearby-bus-stops.ts`
- Modify: `src/app/index.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `getBusStopTile(latitude: number, longitude: number): { tileX: number; tileY: number; center: Coordinate }` and `useNearbyBusStops(tile: BusStopTile | null)`.
- Consumes: zoom gate from Task 1 and existing Axios request function.

- [ ] **Step 1: Add a Node test asserting nearby coordinates in the same 200m cell share a key, a boundary crossing changes the key, and negative coordinates remain deterministic.**
- [ ] **Step 2: Run the new test and verify it fails because `getBusStopTile` does not exist.**
- [ ] **Step 3: Implement the Web Mercator tile calculation at a fixed internal grid size; return the stable tile center used for requests.**
- [ ] **Step 4: Change the TanStack Query key to `["bus-stops", "tile", tileX, tileY]`, request the tile center, and set `staleTime` and `gcTime` to `Infinity`.**
- [ ] **Step 5: Use `placeholderData: keepPreviousData`; when zoom is below 20 pass `null` and render no markers.**
- [ ] **Step 6: Run the tile test, root typecheck, and root lint; expect all to pass.**
- [ ] **Step 7: Commit Task 2 files with `feat: cache bus stops by map tile`.**

### Task 3: Add PostgreSQL/PostGIS infrastructure

**Files:**
- Create: `server/compose.yaml`
- Create: `server/db/migrations/001_bus_stations.sql`
- Create: `server/src/database/database.module.ts`
- Create: `server/src/database/database.service.ts`
- Create: `server/src/database/database.service.spec.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `DatabaseService.query<T>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>` and `DATABASE_URL`.
- Consumes: no feature modules.

- [ ] **Step 1: Write a DatabaseService test that verifies one pool instance is created, queries are delegated, and shutdown closes the pool.**
- [ ] **Step 2: Run the test and verify it fails because the database module is absent.**
- [ ] **Step 3: Install `pg` and its types; add a PostGIS compose service with a named volume and health check.**
- [ ] **Step 4: Add migration SQL enabling PostGIS and creating `bus_stations`, `station_sources`, unique source constraints, timestamps, and a GiST location index.**
- [ ] **Step 5: Implement the global DatabaseModule and lifecycle-managed pool from `DATABASE_URL`.**
- [ ] **Step 6: Start the database, apply the migration, and verify `SELECT PostGIS_Version()` succeeds.**
- [ ] **Step 7: Run server tests, lint, and build; expect all to pass.**
- [ ] **Step 8: Commit Task 3 files with `feat: add PostGIS station storage`.**

### Task 4: Implement the station repository and deduplication

**Files:**
- Create: `server/src/bus/domain/bus-stop.ts`
- Create: `server/src/bus/stations/station.repository.ts`
- Create: `server/src/bus/stations/station.repository.spec.ts`
- Modify: `server/src/bus/bus.module.ts`

**Interfaces:**
- Produces: `StationRepository.findNearby(latitude, longitude, radius, limit): Promise<BusStop[]>` and `StationRepository.upsertSource(input: StationSourceInput): Promise<string>`.
- Consumes: `DatabaseService` from Task 3.

- [ ] **Step 1: Write repository tests for WGS84 longitude/latitude parameter order, distance sorting, radius filtering, and provider array aggregation.**
- [ ] **Step 2: Add an upsert test asserting the same provider ID reuses its station and a same-name source within 20m links to the existing station.**
- [ ] **Step 3: Run the repository tests and verify they fail because the repository is absent.**
- [ ] **Step 4: Implement `findNearby` using parameterized `ST_DWithin` and `ST_Distance` queries with a hard result limit.**
- [ ] **Step 5: Implement source upsert in a transaction; find duplicate candidates with normalized name and 20m distance before creating a station.**
- [ ] **Step 6: Run repository tests, server lint, and build; expect all to pass.**
- [ ] **Step 7: Commit Task 4 files with `feat: add spatial bus station repository`.**

### Task 5: Add provider adapters and station import worker

**Files:**
- Create: `server/src/bus/providers/station-provider.ts`
- Create: `server/src/bus/providers/tago-station.provider.ts`
- Create: `server/src/bus/providers/seoul-station.provider.ts`
- Create: `server/src/bus/providers/gyeonggi-station.provider.ts`
- Create: `server/src/bus/providers/incheon-station.provider.ts`
- Create: `server/src/bus/providers/provider-response.spec.ts`
- Create: `server/src/bus/sync/station-sync.service.ts`
- Create: `server/src/bus/sync/station-sync.service.spec.ts`
- Create: `server/src/commands/sync-stations.ts`
- Modify: `server/src/bus/bus.module.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `StationProvider.fetchPage(cursor?: string): Promise<StationPage>` and `StationSyncService.sync(provider: TransitProvider): Promise<SyncResult>`.
- Consumes: `PUBLIC_DATA_SERVICE_KEY` and `StationRepository.upsertSource`.

- [ ] **Step 1: Write fixture-based parser tests for one valid, empty, singleton, and malformed response from each provider.**
- [ ] **Step 2: Run parser tests and verify they fail because adapters are absent.**
- [ ] **Step 3: Implement the common provider interface and normalize IDs, ARS IDs, city codes, names, and WGS84 coordinates.**
- [ ] **Step 4: Write a sync test asserting pages are processed sequentially, rows are upserted, a failed page preserves earlier data, and the key never appears in logs.**
- [ ] **Step 5: Implement StationSyncService and a Nest application-context command accepting one of `SEOUL`, `GYEONGGI`, `INCHEON`, or `TAGO`.**
- [ ] **Step 6: Run fixture and sync tests, then perform a one-page diagnostic request for each configured provider.**
- [ ] **Step 7: Run server lint and build; expect all to pass.**
- [ ] **Step 8: Commit Task 5 files with `feat: sync metropolitan bus stations`.**

### Task 6: Switch nearby station API to PostGIS and add server tile cache

**Files:**
- Create: `server/src/bus/cache/tile-cache.service.ts`
- Create: `server/src/bus/cache/tile-cache.service.spec.ts`
- Modify: `server/src/bus/bus.service.ts`
- Modify: `server/src/bus/bus.service.spec.ts`
- Modify: `server/src/bus/bus.controller.ts`

**Interfaces:**
- Produces: existing `GET /bus/stations/nearby` backed by PostGIS.
- Consumes: `StationRepository.findNearby` and tile keys compatible with Task 2.

- [ ] **Step 1: Write tests asserting a cache miss queries the repository, a hit does not, concurrent misses share one Promise, and capacity eviction is bounded.**
- [ ] **Step 2: Change BusService tests to assert the external Seoul API is no longer called during map requests.**
- [ ] **Step 3: Run tests and verify they fail against the current external-API implementation.**
- [ ] **Step 4: Implement the bounded in-memory tile cache and PostGIS-backed BusService.**
- [ ] **Step 5: Preserve controller validation and response shape expected by the mobile app.**
- [ ] **Step 6: Run server tests, lint, build, and a curl request at Seoul, Bucheon, and Incheon coordinates.**
- [ ] **Step 7: Commit Task 6 files with `feat: serve nearby stops from PostGIS`.**

### Task 7: Add arrival provider routing and shared short cache

**Files:**
- Create: `server/src/bus/arrivals/arrival-provider.ts`
- Create: `server/src/bus/arrivals/arrival-router.service.ts`
- Create: `server/src/bus/arrivals/arrival-router.service.spec.ts`
- Create: `server/src/bus/arrivals/arrival-cache.service.ts`
- Create: `server/src/bus/arrivals/arrival-cache.service.spec.ts`
- Modify: `server/src/bus/bus.controller.ts`
- Modify: `server/src/bus/bus.module.ts`

**Interfaces:**
- Produces: `GET /bus/stations/:stationId/arrivals` and normalized `BusArrival[]`.
- Consumes: station sources from Task 4 and regional provider clients from Task 5.

- [ ] **Step 1: Write router tests for Seoul, Gyeonggi, Incheon, fallback on upstream error, and no fallback on a successful empty result.**
- [ ] **Step 2: Write cache tests proving same-key concurrency coalescing, 3–10 second TTL behavior, and stale cache fallback.**
- [ ] **Step 3: Run tests and verify they fail because the arrival subsystem is absent.**
- [ ] **Step 4: Implement provider selection from persisted station sources, not coordinates.**
- [ ] **Step 5: Implement normalized arrivals and add the controller endpoint without exposing provider credentials or raw responses.**
- [ ] **Step 6: Run all server tests, lint, and build; expect all to pass.**
- [ ] **Step 7: Commit Task 7 files with `feat: route regional bus arrivals`.**

### Task 8: End-to-end verification

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified metropolitan bus station vertical slice.

- [ ] **Step 1: Start PostGIS and NestJS, import representative Seoul, Gyeonggi, and Incheon station data, and record counts.**
- [ ] **Step 2: Verify the same tile request twice produces one repository lookup and no public station API request.**
- [ ] **Step 3: Verify zoom 19 hides markers and sends no request; zoom 20 displays 22px markers; returning to a visited tile uses TanStack Query cache.**
- [ ] **Step 4: Verify a border-area query returns stations from both sides without duplicate physical markers.**
- [ ] **Step 5: Verify arrival routing and concurrent-request coalescing with provider fixtures or approved live diagnostic calls.**
- [ ] **Step 6: Run root typecheck and lint, all server tests, server lint, and server build.**
- [ ] **Step 7: Review the final diff for unrelated changes and secrets, then commit fixes with `fix: complete metropolitan bus verification`.**
