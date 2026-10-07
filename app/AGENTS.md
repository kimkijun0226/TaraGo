This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## State Management

- Use **TanStack Query** for all server state, including bus stops, arrivals, routes, subway data, and saved alerts.
- TanStack Query owns fetching, caching, loading and error states, retries, polling, and cache invalidation.
- Use **Zustand** only for shared client state, such as the selected stop or route, map UI state, and BottomSheet state.
- Use local React state for state that belongs to only one component.
- Never copy TanStack Query response data into Zustand. Keep a single source of truth.
- After a server mutation, update or invalidate the relevant TanStack Query cache.

## API Client

- Use **Axios** for HTTP requests through one shared client in `src/shared/api/`.
- Configure the API base URL, timeout, and truly shared request behavior on that client.
- Keep feature-specific request functions in each feature's `api/` directory and call them from TanStack Query query or mutation functions.
- Do not call Axios directly from screens or store server responses in the API client.
- Never put secret API keys in `EXPO_PUBLIC_` variables or the mobile application. External service keys stay on the backend.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- Add concise `/** ... */` comments to non-obvious modules, public functions, and data-flow boundaries; explain their purpose or reason, not syntax. Do not add comments to trivial code.
- Before adding a service, parser, hook, or test, check whether the same behavior already exists and whether it is called by the running app.
- Naver Map 선택 마커는 iOS에서 React View 스냅샷이나 기존 마커의 `image` 속성 교체만으로 갱신되지 않을 수 있다. 일반·선택 상태에 로컬 이미지 자산을 쓰고 상태 변경 시 네이티브 오버레이를 새 `key`로 다시 마운트한다.
- Keep tests for behavior with real regression risk (for example data replacement and map coverage), not generated starter examples or one-line wiring.
- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
