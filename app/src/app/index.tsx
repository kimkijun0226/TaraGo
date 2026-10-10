import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from "@mj-studio/react-native-naver-map";
import { SymbolView } from "expo-symbols";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getNearbyBusStops,
  type BusStop,
} from "@/features/bus-stop/api/get-nearby-bus-stops";
import type { BusRouteDetail } from "@/features/bus-stop/api/get-bus-route-detail";
import { useNearbyBusStops } from "@/features/bus-stop/model/use-nearby-bus-stops";
import {
  getVisibleBusStopTiles,
  type BusStopTile,
} from "@/features/bus-stop/model/bus-stop-tile";
import { RouteBusStopMarker } from "@/features/bus-stop/ui/route-bus-stop-marker";
import { BusStopMarker } from "@/features/bus-stop/ui/bus-stop-marker";
import { BusStopBottomSheet } from "@/features/bus-stop/ui/bus-stop-bottom-sheet";
import { BusRouteBottomSheet } from "@/features/bus-stop/ui/bus-route-bottom-sheet";
import { useBusRouteDetail } from "@/features/bus-stop/model/use-bus-route-detail";
import {
  isRouteBusStop,
  getRouteStopOccurrence,
  type RouteSheetSnap,
} from "@/features/bus-stop/model/bus-route-presentation";
import {
  alignRouteToStops,
  getRouteDirectionMarkers,
} from "@/features/bus-stop/model/route-direction-markers";
import { useMapTabVisibility } from "@/components/map-tab-visibility";
import { useCurrentLocation } from "@/hooks/use-current-location";

const DEFAULT_CAMERA = {
  latitude: 37.4883019,
  longitude: 126.8168934,
  zoom: 17,
};
const ROUTE_DIRECTION_PATTERN = require("../../assets/images/route-direction-triangle.png");

/**
 * 지도 카메라의 보이는 영역으로 정류장 타일을 조회하고 선택한 정류장을 연다.
 *
 * 초기 카메라는 역곡 인근을 가리킨다. 실제 위치를 얻으면 현재 위치로 이동하며,
 * 위치 조회에 실패해도 사용자는 기본 지도에서 정류장을 탐색할 수 있다.
 * 카메라 이동 중 이벤트는 150ms로 제한하고, 이동 종료 시 최종 영역을 반영한다.
 */
export default function MapScreen() {
  const mapRef = useRef<NaverMapViewRef>(null);
  const selectionRequest = useRef(0);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const lastTileUpdateRef = useRef(0);
  const [busStopTiles, setBusStopTiles] = useState<BusStopTile[]>([]);
  const [directionCamera, setDirectionCamera] = useState<{
    zoom: number;
    region: Parameters<typeof getVisibleBusStopTiles>[1];
  } | null>(null);
  const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
  const [showRouteSheet, setShowRouteSheet] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<{
    stationId: string;
    routeId: string;
    stationSeq: number;
  } | null>(null);
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>("half");
  const [sheetHeight, setSheetHeight] = useState(0);
  const { setMapTabHidden } = useMapTabVisibility();
  const { getCurrentLocation, loading, position } = useCurrentLocation();
  const busStops = useNearbyBusStops(busStopTiles);
  const insets = useSafeAreaInsets();
  const { data: routeDetail } = useBusRouteDetail(
    selectedRoute?.stationId ?? "",
    selectedRoute?.routeId ?? "",
    selectedRoute?.stationSeq ?? 0,
    Boolean(selectedRoute),
  );

  const routeCoordinates = useMemo(
    () =>
      routeDetail?.geometry.source === "official"
        ? alignRouteToStops(routeDetail.geometry.points, routeDetail.stops)
        : [],
    [routeDetail],
  );
  const directionMarkers = useMemo(
    () =>
      directionCamera
        ? getRouteDirectionMarkers(
            routeCoordinates,
            directionCamera.zoom,
            directionCamera.region,
          )
        : [],
    [routeCoordinates, directionCamera],
  );

  const visibleBusStops = useMemo(() => busStops.filter((stop) =>
    !selectedRoute || !routeDetail || !isRouteBusStop(stop, routeDetail.stops)
  ), [busStops, selectedRoute, routeDetail]);
  const routeStops = useMemo(() => {
    const ids = new Set<string>();
    return (routeDetail?.stops ?? []).filter((stop) => {
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) || ids.has(stop.stationId)) return false;
      ids.add(stop.stationId);
      return true;
    });
  }, [routeDetail?.stops]);

  useEffect(() => () => setMapTabHidden(false), [setMapTabHidden]);

  // 패딩으로 시트 위의 지도 영역을 정하고, 줌은 유지한 채 선택 좌표만 이동한다.
  useEffect(() => {
    if (!selectedBusStop || sheetHeight === 0 || !initializedRef.current)
      return;
    const frame = requestAnimationFrame(() => {
      mapRef.current?.animateCameraTo({
        latitude: selectedBusStop.latitude,
        longitude: selectedBusStop.longitude,
        duration: 350,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedBusStop, sheetHeight]);

  const closeBusStop = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(null);
    setSheetHeight(0);
    setMapTabHidden(false);
  }, [setMapTabHidden]);

  const selectBusStop = useCallback((busStop: BusStop) => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(busStop);
    setMapTabHidden(true);
  }, [setMapTabHidden]);

  /** 활성화 정류소의 전체 버스 목록을 열면서 지도에는 현재 노선을 유지한다. */
  const selectRouteStop = useCallback(async (stop: BusRouteDetail["stops"][number]) => {
    if (!selectedRoute || !routeDetail) return;
    const request = ++selectionRequest.current;
    const occurrence = getRouteStopOccurrence(
      routeDetail.stops,
      stop.stationId,
      selectedRoute.stationSeq,
    );
    if (!occurrence) return;
    try {
      let station = busStops.find((item) => isRouteBusStop(item, [stop]));
      if (!station) {
        const nearby = await queryClient.fetchQuery({
          queryKey: ["bus-stops", "route-stop", stop.stationId],
          queryFn: ({ signal }) =>
            getNearbyBusStops({
              latitude: stop.latitude,
              longitude: stop.longitude,
              radius: 100,
              signal,
            }),
          staleTime: 30 * 60_000,
        });
        station = nearby.find((item) => isRouteBusStop(item, [stop]));
      }
      if (request !== selectionRequest.current) return;
      if (!station)
        throw new Error("선택한 정류소의 서버 정보를 찾을 수 없습니다.");
      setSelectedBusStop(station);
      setSelectedRoute({
        stationId: station.id,
        routeId: selectedRoute.routeId,
        stationSeq: occurrence.stationSeq,
      });
      setShowRouteSheet(false);
      setRouteSheetSnap("half");
      setMapTabHidden(true);
    } catch (error) {
      if (request !== selectionRequest.current) return;
      Alert.alert(
        "정류소를 열 수 없습니다",
        error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
      );
    }
  }, [busStops, queryClient, selectedRoute, routeDetail, setMapTabHidden]);

  /** 노선 지도에서 돌아가면 원래 선택한 정류장 목록을 다시 보여 준다. */
  const closeRoute = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedRoute(null);
    setRouteSheetSnap("half");
  }, []);

  /**
   * 보이는 타일이 바뀐 경우에만 조회 대상을 갱신한다.
   * @param zoom 정류장 노출 여부와 타일 크기를 결정할 지도 줌.
   * @param region 지도 화면의 지리적 범위.
   */
  const updateVisibleTiles = useCallback((zoom: number | undefined, region: Parameters<typeof getVisibleBusStopTiles>[1]) => {
    if (zoom !== undefined) setDirectionCamera({ zoom, region });
    const nextTiles = getVisibleBusStopTiles(zoom, region);
    if (nextTiles.length === 0 && !selectedRoute) closeBusStop();
    setBusStopTiles((currentTiles) =>
      haveSameTiles(currentTiles, nextTiles) ? currentTiles : nextTiles,
    );
  }, [closeBusStop, selectedRoute]);

  /** 지도 초기화와 위치 조회가 모두 끝난 경우에만 현재 좌표로 이동한다. */
  const moveToMyLocation = useCallback(async () => {
    if (!initializedRef.current) return;

    const coordinate = await getCurrentLocation();
    if (!coordinate) return;

    mapRef.current?.animateCameraTo({
      ...coordinate,
      zoom: 17,
      duration: 500,
    });
  }, [getCurrentLocation]);

  const onCameraChanged = useCallback(({ zoom, region }: {
    zoom?: number; region: Parameters<typeof getVisibleBusStopTiles>[1];
  }) => {
    if (Date.now() - lastTileUpdateRef.current < 150) return;
    lastTileUpdateRef.current = Date.now();
    updateVisibleTiles(zoom, region);
  }, [updateVisibleTiles]);
  const onCameraIdle = useCallback(({ zoom, region }: {
    zoom?: number; region: Parameters<typeof getVisibleBusStopTiles>[1];
  }) => updateVisibleTiles(zoom, region), [updateVisibleTiles]);
  const onMapInitialized = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void moveToMyLocation();
  }, [moveToMyLocation]);

  const selectSelectedStop = useCallback((station: BusStop) => {
    const routeStop = selectedRoute && routeDetail?.stops.find((stop) => isRouteBusStop(station, [stop]));
    if (routeStop) void selectRouteStop(routeStop);
    else selectBusStop(station);
  }, [selectedRoute, routeDetail, selectRouteStop, selectBusStop]);
  const selectBusRoute = useCallback((routeId: string, stationSeq: number) => {
    if (!selectedBusStop) return;
    setSelectedRoute({ stationId: selectedBusStop.id, routeId, stationSeq });
    setShowRouteSheet(true);
    setRouteSheetSnap("half");
  }, [selectedBusStop]);

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={styles.container}
        initialCamera={DEFAULT_CAMERA}
        mapPadding={{
          top: insets.top,
          bottom: selectedBusStop ? sheetHeight + insets.bottom + 8 : 0,
        }}
        isShowLocationButton={false}
        isShowZoomControls={false}
        locationOverlay={{
          isVisible: position !== null,
          position: position ?? DEFAULT_CAMERA,
        }}
        onInitialized={onMapInitialized}
        onCameraChanged={onCameraChanged}
        onCameraIdle={onCameraIdle}
      >
        {selectedRoute && routeCoordinates.length > 1 ? (
          <NaverMapPathOverlay
            key={`route:${selectedRoute.routeId}`}
            coords={routeCoordinates}
            color="#12A6AF"
            passedColor="#12A6AF"
            width={8}
            outlineColor="#FFFFFF"
            passedOutlineColor="#FFFFFF"
            outlineWidth={2}
            globalZIndex={100000}
            zIndex={0}
          />
        ) : null}
        {selectedRoute &&
          directionMarkers.map((marker) => (
            <NaverMapMarkerOverlay
              key={`direction:${marker.id}`}
              latitude={marker.latitude}
              longitude={marker.longitude}
              image={ROUTE_DIRECTION_PATTERN}
              width={8}
              height={8}
              anchor={{ x: 0.5, y: 0.5 }}
              angle={marker.angle}
              isFlatEnabled
              globalZIndex={100000}
              zIndex={2}
            />
          ))}
        {visibleBusStops
          .map((busStop) => (
            <BusStopMarker
              key={busStop.id}
              busStop={busStop}
              selected={false}
              onRoute={Boolean(
                selectedRoute &&
                routeDetail &&
                isRouteBusStop(busStop, routeDetail.stops),
              )}
              onSelect={selectBusStop}
            />
          ))}
        {selectedRoute && routeStops.map((stop) => (
          <RouteBusStopMarker key={stop.stationId} stop={stop} onSelect={selectRouteStop} />
        ))}
        {selectedBusStop ? (
          <BusStopMarker
            key={`selected-stop:${selectedBusStop.id}`}
            busStop={selectedBusStop}
            selected
            onRoute={Boolean(
              selectedRoute &&
              routeDetail &&
              isRouteBusStop(selectedBusStop, routeDetail.stops),
            )}
            onSelect={selectSelectedStop}
          />
        ) : null}
      </NaverMapView>

      {selectedRoute ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
          onPress={closeRoute}
          style={[styles.backButton, { top: insets.top + 12 }]}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={24}
            tintColor="#15171A"
          />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="현재 위치로 지도 이동"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={moveToMyLocation}
        style={({ pressed }) => [
          styles.locationButton,
          {
            bottom: selectedBusStop
              ? sheetHeight + insets.bottom + 24
              : insets.bottom + 16,
          },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#1769E0" />
        ) : (
          <SymbolView
            name={{
              ios: "location.north.fill",
              android: "my_location",
              web: "my_location",
            }}
            size={24}
            tintColor="#1769E0"
          />
        )}
      </Pressable>

      {selectedBusStop && selectedRoute && showRouteSheet ? (
        <BusRouteBottomSheet
          key={`${selectedBusStop.id}:${selectedRoute.routeId}:${selectedRoute.stationSeq}`}
          stationId={selectedRoute.stationId}
          routeId={selectedRoute.routeId}
          stationSeq={selectedRoute.stationSeq}
          snap={routeSheetSnap}
          onChangeSnap={setRouteSheetSnap}
          onClose={closeRoute}
          onHeightChange={setSheetHeight}
        />
      ) : selectedBusStop ? (
        <BusStopBottomSheet
          key={selectedBusStop.id}
          busStop={selectedBusStop}
          onClose={closeBusStop}
          onHeightChange={setSheetHeight}
          onSelectRoute={selectBusRoute}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DADCE0",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    left: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});

/**
 * 같은 타일 집합이면 React 상태 갱신을 건너뛰어 불필요한 조회를 막는다.
 * @param currentTiles 현재 조회 중인 타일.
 * @param nextTiles 새 카메라 영역에서 계산한 타일.
 * @returns 타일 개수·인덱스·크기가 모두 같으면 `true`.
 */
function haveSameTiles(currentTiles: BusStopTile[], nextTiles: BusStopTile[]) {
  return (
    currentTiles.length === nextTiles.length &&
    currentTiles.every(
      (tile, index) =>
        tile.tileX === nextTiles[index]?.tileX &&
        tile.tileY === nextTiles[index]?.tileY &&
        tile.sizeMeters === nextTiles[index]?.sizeMeters,
    )
  );
}
