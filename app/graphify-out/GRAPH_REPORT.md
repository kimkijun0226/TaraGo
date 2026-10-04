# Graph Report - tarago  (2026-09-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 210 nodes · 306 edges · 14 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bef12abb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13

## God Nodes (most connected - your core abstractions)
1. `react-native` - 17 edges
2. `expo` - 13 edges
3. `scripts` - 9 edges
4. `useTheme()` - 9 edges
5. `react` - 8 edges
6. `ThemedText()` - 7 edges
7. `ThemedView()` - 7 edges
8. `Spacing` - 6 edges
9. `adaptiveIcon` - 5 edges
10. `expo-image` - 5 edges

## Surprising Connections (you probably didn't know these)
- `TabTwoScreen()` --calls--> `useTheme()`  [EXTRACTED]
  src/app/explore.tsx → src/hooks/use-theme.ts
- `MapScreen()` --calls--> `useCurrentLocation()`  [EXTRACTED]
  src/app/index.tsx → src/hooks/use-current-location.ts
- `moveToMyLocation()` --calls--> `getCurrentLocation()`  [EXTRACTED]
  src/app/index.tsx → src/hooks/use-current-location.ts
- `ThemedText()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/themed-text.tsx → src/hooks/use-theme.ts
- `ThemedView()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/themed-view.tsx → src/hooks/use-theme.ts

## Import Cycles
- None detected.

## Communities (14 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (27): expo-image, ref_expo_package_json, ref_expo_router_ui, expo-symbols, styles, TabTwoScreen(), styles, HintRowProps (+19 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): main, name, private, version, eslint, eslint-config-expo, expo, expo-build-properties (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (28): dependencies, expo, expo-build-properties, expo-constants, expo-dev-client, expo-device, expo-font, expo-glass-effect (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (22): reactCompiler, typedRoutes, expo, experiments, icon, ios, name, orientation (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (10): ref_expo_router_unstable_native_tabs, expo-splash-screen, react-native, react-native-worklets, AnimatedSplashOverlay(), glowKeyframe, keyframe, logoKeyframe (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (11): expo-location, @mj-studio/react-native-naver-map, react, react-native-safe-area-context, DEFAULT_CAMERA, MapScreen(), moveToMyLocation(), styles (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (10): ref_fs, ref_path, ref_readline, exampleDirPath, fs, oldDirs, path, readline (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): scripts, android, ios, lint, reset-project, simulator, start, start:simulator (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (6): react-native-reanimated, src_components_animated_icon_module, glowKeyframe, keyframe, logoKeyframe, styles

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (8): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, android

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (7): expo/tsconfig.base, compilerOptions, paths, strict, extends, include, @/assets/*

### Community 11 - "Community 11"
Cohesion: 0.40
Nodes (4): { defineConfig }, expoConfig, ref_eslint_config, ref_eslint_config_expo_flat

### Community 12 - "Community 12"
Cohesion: 0.40
Nodes (5): devDependencies, eslint, eslint-config-expo, @types/react, typescript

### Community 13 - "Community 13"
Cohesion: 0.70
Nodes (4): getServerSnapshot(), getSnapshot(), subscribe(), useColorScheme()

## Knowledge Gaps
- **119 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+114 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 140 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react-native` connect `Community 4` to `Community 0`, `Community 1`, `Community 5`, `Community 8`, `Community 13`?**
  _High betweenness centrality (0.180) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `scripts` connect `Community 7` to `Community 1`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _119 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._