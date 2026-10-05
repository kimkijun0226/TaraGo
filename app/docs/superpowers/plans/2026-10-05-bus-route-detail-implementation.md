# Bus Route Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a bus at a stop opens a draggable route sheet with the selected stop's ETA, ordered stops, live bus positions, and the official road-aligned route on the map.

**Architecture:** Keep API keys and supplier response parsing in NestJS. Resolve the supplier using the selected stop UUID and route ID; serve static route geometry/stops separately from short-lived vehicle positions, while reusing the existing arrival query for ETA. TanStack Query owns all three datasets; MapScreen owns selected route and sheet state.

**Tech Stack:** NestJS/TypeScript, Expo SDK 57/React Native, Expo Router, `@mj-studio/react-native-naver-map` 2.9, TanStack Query, existing gesture-handler/Reanimated.

**Spec:** `app/docs/superpowers/specs/2026-10-05-bus-route-detail-design.md`

## Global Constraints

- Official route-shape coordinates come first; never present stop-to-stop straight lines as the driven route.
- Official coordinates appear at their reported position; station-sequence-only locations must be labeled as segment-based.
- Keep estimated turnaround ETA labeled `예상`; do not create another ETA calculator.
- Reuse existing dependencies; verify versioned Expo 57 and Naver Map 2.9 overlay/camera APIs before writing UI code.
- Preserve existing dirty worktree changes. Stage/commit only task-owned files. Run server tests/build/lint and app tests/typecheck/lint before completion.

## Review Focus

- A bus number shared by two routes must not open the wrong route: Task 1 test resolves exact route ID and selected stop.
- A stop occurring twice on a circular route must highlight the chosen direction/sequence: Task 1 and Task 4 tests assert stop ID plus sequence.
- Empty or invalid shape data must not become a straight line: Task 2 test returns `unavailable` with no points.
- A vehicle leaving service or disappearing must not remain on the map indefinitely: Task 3 test returns only current IDs and marks freshness.
- A new route selection while an earlier request is pending must not render the old route: Task 4 query key/cancellation test.

---

### Task 1: Route identity and ordered stops

**Files:**
- Modify: `server/src/bus/arrivals/gyeonggi-arrival.provider.ts`
- Modify: `server/src/bus/arrivals/arrival-router.service.ts`
- Create: `server/src/bus/routes/bus-route.types.ts`
- Create: `server/src/bus/routes/bus-route.service.ts`
- Modify: `server/src/bus/bus.controller.ts`
- Modify: `server/src/bus/bus.module.ts`
- Test: `server/src/bus/routes/bus-route.service.spec.ts`

**Interfaces:**
- `BusRouteService.getDetail(stationUuid: string, routeId: string, stationSeq: number): Promise<BusRouteDetail>`; `BusRouteDetail` includes `routeId`, `busNumber`, `routeType`, `selectedStationId`, `selectedStationSeq`, `turnStationSeq`, ordered `stops: { stationId: string; stationSeq: number; name: string; latitude: number; longitude: number; isStop: boolean }[]`, and geometry fields supplied by Task 2.
- `GET /bus/stations/:stationId/routes/:routeId?stationSeq=...` returns that type. Validate UUID, numeric route ID, and positive station sequence at the controller boundary. Add the source `staOrder` to the arrival response so a tapped row carries its direction/occurrence.

- [ ] **Step 1: Write failing tests** for valid 52 route/stop, wrong route ID, and the same station ID occurring at two different sequences; assert target sequence matches the selected direction.
- [ ] **Step 2: Run** `npm test -- --runInBand --watchman=false bus-route.service.spec.ts`; verify failures are missing route behavior, not test setup.
- [ ] **Step 3: Implement** `getDetail` using existing `StationRepository.findStation`, `GyeonggiArrivalProvider.findStationId`, and official `getBusStationViaRouteListv2`/`getBusRouteStationListv2`; reject route IDs not returned for that stop. Add only the small provider methods needed to expose cached route stops. Return `404` for mismatches.
- [ ] **Step 4: Run** focused tests, `npm run build`, `npm run lint`; verify pass.
- [ ] **Step 5: Commit** only Task 1 files with `feat(server): expose ordered bus route stops`.

### Task 2: Official shape and static caching

**Files:**
- Modify: `server/src/bus/arrivals/gyeonggi-arrival.provider.ts`
- Modify: `server/src/bus/routes/bus-route.types.ts`
- Modify: `server/src/bus/routes/bus-route.service.ts`
- Test: `server/src/bus/routes/bus-route.service.spec.ts`

**Interfaces:**
- `geometry: { status: 'available' | 'unavailable'; source: 'gyeonggi_official' | null; points: { latitude: number; longitude: number }[] }` on `BusRouteDetail`.

- [ ] **Step 1: Write failing tests** with out-of-order official `lineSeq` and invalid/empty coordinates; assert sorted valid road-shape points and `unavailable` without a fabricated line.
- [ ] **Step 2: Run** focused test and verify the expected failures.
- [ ] **Step 3: Implement** `getBusRouteLineListv2` parsing in the Gyeonggi provider, normalize x/y to longitude/latitude, cache one result per route for 24 hours and coalesce concurrent loads; do not make this request on every vehicle poll.
- [ ] **Step 4: Run** focused tests/build/lint and verify pass.
- [ ] **Step 5: Commit** Task 2 files with `feat(server): provide official Gyeonggi route shape`.

### Task 3: Live vehicles and freshness

**Files:**
- Modify: `server/src/bus/arrivals/gyeonggi-arrival.provider.ts`
- Modify: `server/src/bus/routes/bus-route.types.ts`
- Modify: `server/src/bus/routes/bus-route.service.ts`
- Modify: `server/src/bus/bus.controller.ts`
- Test: `server/src/bus/routes/bus-route.service.spec.ts`

**Interfaces:**
- `BusRouteService.getVehicles(stationUuid: string, routeId: string, stationSeq: number): Promise<{ updatedAt: string; vehicles: { vehicleId: string; stationSeq: number; positionBasis: 'station_segment'; stateCode?: number }[] }>`.
- `GET /bus/stations/:stationId/routes/:routeId/vehicles?stationSeq=...` returns it. No interpolated GPS coordinates are returned from the Gyeonggi source.

- [ ] **Step 1: Write failing tests** for same vehicle ID in route lookup, disappearing vehicle, wrong route ID, and concurrent users sharing one upstream vehicle request.
- [ ] **Step 2: Run** focused test and verify the expected failures.
- [ ] **Step 3: Implement** using existing Gyeonggi `getBusLocationListv2` and its shared short TTL cache. Preserve official station sequence and server fetch timestamp; never use a previous vehicle snapshot as current after TTL if refresh fails.
- [ ] **Step 4: Run** focused tests/build/lint and verify pass.
- [ ] **Step 5: Commit** Task 3 files with `feat(server): expose live route vehicle segments`.

### Task 4: Mobile data contract and route selection

**Files:**
- Create: `app/src/features/bus-route/api/get-bus-route.ts`
- Create: `app/src/features/bus-route/api/get-route-vehicles.ts`
- Create: `app/src/features/bus-route/model/use-bus-route.ts`
- Create: `app/src/features/bus-route/model/use-route-vehicles.ts`
- Modify: `app/src/features/bus-stop/ui/bus-stop-bottom-sheet.tsx`
- Modify: `app/src/app/index.tsx`
- Test: `app/src/features/bus-route/model/bus-route.test.ts`

**Interfaces:**
- `useBusRoute(stationUuid: string, routeId: string, stationSeq: number)` caches static detail by all three IDs.
- `useRouteVehicles(stationUuid: string, routeId: string, stationSeq: number, enabled: boolean)` polls only while route detail is visible in foreground; vehicle data stays in TanStack Query.
- `BusStopBottomSheet` gains `onSelectRoute(routeId: string, stationSeq: number): void`; MapScreen locally stores that selection. The selected stop remains available for the existing `useBusArrivals` query.

- [ ] **Step 1: Write failing test** for query identity of stop+route, selection change, and duplicate stop ID/sequence matching; assert stale route response cannot become the new route.
- [ ] **Step 2: Run** `npm test` in `app` and verify the expected failure.
- [ ] **Step 3: Add** Axios request functions and TanStack Query hooks; add route-row press handling without copying API responses into local/Zustand state.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run lint` in `app`; verify pass.
- [ ] **Step 5: Commit** Task 4 files with `feat(app): select route and query detail`.

### Task 5: Draggable route sheet

**Files:**
- Create: `app/src/features/bus-route/ui/bus-route-bottom-sheet.tsx`
- Modify: `app/src/app/index.tsx`
- Test: `app/src/features/bus-route/model/bus-route.test.ts`

**Interfaces:**
- `BusRouteBottomSheet` receives selected stop, `BusRouteDetail`, vehicle response, arrival group, `onClose`, and `onHeightChange`. It renders compact map view and expanded ordered-stop list, highlighting `stationId` **and** `stationSeq`.

- [ ] **Step 1: Write failing model test** for ETA-to-vehicle matching by ID and selected occurrence highlighting; manually enumerate expected compact/expanded sheet states for iOS/Android QA.
- [ ] **Step 2: Run** app tests and verify failure.
- [ ] **Step 3: Implement** two snap positions with already-installed gesture-handler/Reanimated after checking current Expo 57 docs; keep list scrolling and drag handle interactions distinct. Preserve existing selected-stop map padding and tab hiding.
- [ ] **Step 4: Run** app tests/typecheck/lint and visually check both simulator states; record any platform limitation.
- [ ] **Step 5: Commit** Task 5 files with `feat(app): add draggable bus route sheet`.

### Task 6: Official map overlays and camera

**Files:**
- Create: `app/src/features/bus-route/ui/bus-route-map-overlays.tsx`
- Modify: `app/src/app/index.tsx`
- Test: `app/src/features/bus-route/model/bus-route.test.ts`

**Interfaces:**
- Overlay takes official shape, ordered stops, current vehicle segments, selected stop sequence; no shape points means no route line.

- [ ] **Step 1: Write failing tests** for geometry unavailable, ordered official points, and vehicle removal when absent from the newest response.
- [ ] **Step 2: Run** app tests and verify failure.
- [ ] **Step 3: Check** current Naver Map 2.9 overlay/camera documentation; render official polyline and markers with verified APIs, fit the route to the visible map area above the sheet, and prevent route-camera motion from triggering unnecessary nearby-stop tile loads.
- [ ] **Step 4: Run** app tests/typecheck/lint; visually check 52 route line and vehicle positions on both simulators against official GBIS map. Do not claim GPS precision for segment-based positions.
- [ ] **Step 5: Commit** Task 6 files with `feat(app): display official bus route and vehicles`.

### Task 7: Regional coverage verification and adapters

**Files:**
- Update this plan or create a follow-up implementation plan **after** verifying the authoritative response shape and usage terms for each missing region.

**Interfaces:**
- Reuse Task 1/3 HTTP contracts; each adapter declares whether geometry is official, licensed external, or unavailable and whether vehicle positions are GPS or segment-based.

- [ ] **Step 1: Verify** official Seoul route-shape availability and the actual coordinate reference system of official `tmX`/`tmY`; verify TAGO and other region coverage against official docs and real non-secret responses.
- [ ] **Step 2: Identify** a licensed external *bus-route-shape* provider only for a region without official shape. Do not substitute ordinary driving directions without labeling and accuracy review.
- [ ] **Step 3: Write** exact per-provider tasks/tests and obtain review before extending regional adapters. Until then, show ordered stops and `지도 경로 준비 중` where accurate geometry is unavailable.

## Final verification

- [ ] Run `npm test -- --runInBand --watchman=false`, `npm run build`, `npm run lint` in `server`.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint` in `app`.
- [ ] Check `git diff --check` and diff against the spec; confirm unrelated dirty files remain untouched.
- [ ] Inspect 52 route on both simulators; confirm selected stop ETA, live refresh, two sheet snap points, official road-aligned path, and no stale vehicle marker.
- [ ] State explicitly which regions have verified official geometry and which currently show no line; do not call partial regional coverage complete.
