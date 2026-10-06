import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapArrowheadPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from "@mj-studio/react-native-naver-map";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BusStop } from "@/features/bus-stop/api/get-nearby-bus-stops";
import { useNearbyBusStops } from "@/features/bus-stop/model/use-nearby-bus-stops";
import {
  getVisibleBusStopTiles,
  type BusStopTile,
} from "@/features/bus-stop/model/bus-stop-tile";
import { BusStopMarker } from "@/features/bus-stop/ui/bus-stop-marker";
import { BusStopBottomSheet } from "@/features/bus-stop/ui/bus-stop-bottom-sheet";
import { BusRouteBottomSheet } from "@/features/bus-stop/ui/bus-route-bottom-sheet";
import { useBusRouteDetail } from "@/features/bus-stop/model/use-bus-route-detail";
import { isRouteBusStop, type RouteSheetSnap } from "@/features/bus-stop/model/bus-route-presentation";
import { useMapTabVisibility } from "@/components/map-tab-visibility";
import { useCurrentLocation } from "@/hooks/use-current-location";

const DEFAULT_CAMERA = {
  latitude: 37.4883019,
  longitude: 126.8168934,
  zoom: 17,
};
const BUS_POSITION_MARKER = require('../../assets/images/bus-stop-selected-marker.png');
const ROUTE_STOP_MARKER = require('../../assets/images/bus-stop-marker.png');

/**
 * 지도 카메라의 보이는 영역으로 정류장 타일을 조회하고 선택한 정류장을 연다.
 *
 * 초기 카메라는 역곡 인근을 가리킨다. 실제 위치를 얻으면 현재 위치로 이동하며,
 * 위치 조회에 실패해도 사용자는 기본 지도에서 정류장을 탐색할 수 있다.
 * 카메라 이동 중 이벤트는 150ms로 제한하고, 이동 종료 시 최종 영역을 반영한다.
 */
export default function MapScreen() {
  const mapRef = useRef<NaverMapViewRef>(null);
  const initializedRef = useRef(false);
  const lastTileUpdateRef = useRef(0);
  const fittedRouteRef = useRef<string | null>(null);
  const [busStopTiles, setBusStopTiles] = useState<BusStopTile[]>([]);
  const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<{ routeId: string; stationSeq: number } | null>(null);
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>('full');
  const [sheetHeight, setSheetHeight] = useState(0);
  const { setMapTabHidden } = useMapTabVisibility();
  const { getCurrentLocation, loading, position } = useCurrentLocation();
  const busStops = useNearbyBusStops(busStopTiles);
  const insets = useSafeAreaInsets();
  const { data: routeDetail } = useBusRouteDetail(
    selectedBusStop?.id ?? '', selectedRoute?.routeId ?? '', selectedRoute?.stationSeq ?? 0,
    Boolean(selectedBusStop && selectedRoute),
  );

  useEffect(() => {
    if (!routeDetail || !selectedRoute || !initializedRef.current) return;
    const key = `${routeDetail.routeId}:${selectedRoute.stationSeq}:${routeSheetSnap === 'compact' ? 'compact' : 'sheet'}`;
    if (fittedRouteRef.current === key) return;
    fittedRouteRef.current = key;
    const points = routeDetail.geometry.points;
    const coordinates = points.length > 1 ? points : routeDetail.stops;
    if (coordinates.length < 2) return;
    const latitudes = coordinates.map((item) => item.latitude);
    const longitudes = coordinates.map((item) => item.longitude);
    mapRef.current?.animateRegionTo({
      latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      latitudeDelta: Math.max(0.01, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.2),
      longitudeDelta: Math.max(0.01, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.2),
      duration: 450,
    });
  }, [routeDetail, selectedRoute, routeSheetSnap]);

  useEffect(() => () => setMapTabHidden(false), [setMapTabHidden]);

  /** 지도 패딩으로 시트 위의 빈 영역 가운데에 선택 정류장을 맞춘다. */
  useEffect(() => {
    if (!selectedBusStop || selectedRoute || sheetHeight === 0 || !initializedRef.current)
      return;
    mapRef.current?.animateCameraTo({
      latitude: selectedBusStop.latitude,
      longitude: selectedBusStop.longitude,
      duration: 350,
    });
  }, [selectedBusStop, selectedRoute, sheetHeight]);

  function closeBusStop() {
    fittedRouteRef.current = null;
    setSelectedRoute(null);
    setSelectedBusStop(null);
    setSheetHeight(0);
    setMapTabHidden(false);
  }

  function selectBusStop(busStop: BusStop) {
    fittedRouteRef.current = null;
    setSelectedRoute(null);
    setSheetHeight(0);
    setSelectedBusStop(busStop);
    setMapTabHidden(true);
  }

  /** 노선 지도에서 돌아가면 원래 선택한 정류장 목록을 다시 보여 준다. */
  function closeRoute() {
    fittedRouteRef.current = null;
    setSheetHeight(0);
    setSelectedRoute(null);
    setRouteSheetSnap('full');
  }

  /**
   * 보이는 타일이 바뀐 경우에만 조회 대상을 갱신한다.
   * @param zoom 정류장 노출 여부와 타일 크기를 결정할 지도 줌.
   * @param region 지도 화면의 지리적 범위.
   */
  function updateVisibleTiles(
    zoom: number | undefined,
    region: Parameters<typeof getVisibleBusStopTiles>[1],
  ) {
    const nextTiles = getVisibleBusStopTiles(zoom, region);
    if (nextTiles.length === 0 && !selectedRoute) closeBusStop();
    setBusStopTiles((currentTiles) =>
      haveSameTiles(currentTiles, nextTiles) ? currentTiles : nextTiles,
    );
  }

  /** 지도 초기화와 위치 조회가 모두 끝난 경우에만 현재 좌표로 이동한다. */
  async function moveToMyLocation() {
    if (!initializedRef.current) return;

    const coordinate = await getCurrentLocation();
    if (!coordinate) return;

    mapRef.current?.animateCameraTo({
      ...coordinate,
      zoom: 20,
      duration: 500,
    });
  }

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={styles.container}
        initialCamera={DEFAULT_CAMERA}
        isShowLocationButton={false}
        isShowZoomControls={false}
        mapPadding={{
          bottom: selectedBusStop ? sheetHeight + insets.bottom + 8 : 0,
        }}
        locationOverlay={{
          isVisible: position !== null,
          position: position ?? DEFAULT_CAMERA,
        }}
        onInitialized={() => {
          /** 네이티브 지도가 준비되기 전에는 카메라 명령을 보내지 않는다. */
          if (initializedRef.current) return;
          initializedRef.current = true;
          void moveToMyLocation();
        }}
        onCameraChanged={({ zoom, region }) => {
          if (Date.now() - lastTileUpdateRef.current < 150) return;
          lastTileUpdateRef.current = Date.now();
          updateVisibleTiles(zoom, region);
        }}
        onCameraIdle={({ zoom, region }) => updateVisibleTiles(zoom, region)}
      >
        {routeDetail?.geometry.source === 'official' && routeDetail.geometry.points.length > 1 ? (
          <>
            <NaverMapPathOverlay coords={routeDetail.geometry.points} color="#12A6AF" width={6} outlineColor="#FFFFFF" outlineWidth={2} />
            <NaverMapArrowheadPathOverlay coords={routeDetail.geometry.points} color="#6ACDD2" width={2}
              headSizeRatio={3} minZoom={18} />
          </>
        ) : null}
        {routeDetail?.vehicles.map((vehicle) => {
          const stop = routeDetail.stops.find((item) => item.stationSeq === vehicle.stationSeq);
          return stop && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) ? (
            <NaverMapMarkerOverlay key={`${vehicle.vehicleId}:${vehicle.stationSeq}`} latitude={stop.latitude} longitude={stop.longitude}
              caption={{ text: '버스 위치 추정' }} image={BUS_POSITION_MARKER} width={32} height={38} />
          ) : null;
        })}
        {busStops.map((busStop) => (
          <BusStopMarker
            key={busStop.id}
            busStop={busStop}
            selected={selectedBusStop?.id === busStop.id}
            onRoute={Boolean(routeDetail && isRouteBusStop(busStop, routeDetail.stops))}
            onSelect={selectBusStop}
          />
        ))}
        {routeDetail?.stops.filter((stop, index, stops) =>
          Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
          && stops.findIndex((item) => item.stationId === stop.stationId) === index
          && !isRouteBusStop(stop, busStops),
        ).map((stop) => (
          <NaverMapMarkerOverlay key={`route-stop:${stop.stationId}`} latitude={stop.latitude} longitude={stop.longitude}
            image={ROUTE_STOP_MARKER} width={24} height={24} tintColor="#0B608D" minZoom={17} zIndex={4} />
        ))}
        {selectedBusStop && !busStops.some((stop) => stop.id === selectedBusStop.id) ? (
          <BusStopMarker busStop={selectedBusStop} selected onSelect={selectBusStop} />
        ) : null}
      </NaverMapView>

      {selectedRoute ? <Pressable accessibilityRole="button" accessibilityLabel="정류장 버스 목록으로 돌아가기"
        onPress={closeRoute} style={[styles.backButton, { top: insets.top + 12 }]}>
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={24} tintColor="#15171A" />
      </Pressable> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="현재 위치로 지도 이동"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={() => void moveToMyLocation()}
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

      {selectedBusStop && selectedRoute ? (
        <BusRouteBottomSheet stationId={selectedBusStop.id} routeId={selectedRoute.routeId}
          stationSeq={selectedRoute.stationSeq} snap={routeSheetSnap}
          onChangeSnap={setRouteSheetSnap}
          onClose={closeRoute}
          onHeightChange={setSheetHeight} />
      ) : selectedBusStop ? (
        <BusStopBottomSheet
          key={selectedBusStop.id}
          busStop={selectedBusStop}
          onClose={closeBusStop}
          onHeightChange={setSheetHeight}
          onSelectRoute={(routeId, stationSeq) => {
            setSelectedRoute({ routeId, stationSeq });
            setRouteSheetSnap('full');
          }}
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
    position: 'absolute', left: 16, width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
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
