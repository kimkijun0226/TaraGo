import { useRef } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatEta, formatRemainingStops } from '../model/bus-arrival';
import { nextRouteSheetSnap, type RouteSheetSnap } from '../model/bus-route-presentation';
import { useBusArrivals } from '../model/use-bus-arrivals';
import { useBusRouteDetail } from '../model/use-bus-route-detail';

type Props = {
  stationId: string;
  routeId: string;
  stationSeq: number;
  snap: RouteSheetSnap;
  onChangeSnap: (snap: RouteSheetSnap) => void;
  onClose: () => void;
  onHeightChange: (height: number) => void;
};

/** 선택 노선의 경유 순서·회차점·차량의 마지막 확인 위치를 세 단계 시트에 표시한다. */
export function BusRouteBottomSheet({ stationId, routeId, stationSeq, snap, onChangeSnap, onClose, onHeightChange }: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const dragStartY = useRef<number | null>(null);
  const handledDrag = useRef(false);
  const listRef = useRef<ScrollView>(null);
  const initialScrollDone = useRef(false);
  const { data, isPending, isError, refetch: refetchRoute } = useBusRouteDetail(stationId, routeId, stationSeq);
  const { data: arrivals = [], refetch: refetchArrivals } = useBusArrivals(stationId);
  const arriving = arrivals.filter((item) => item.routeId === routeId && item.stationSeq === stationSeq && item.etaSeconds !== null)
    .sort((a, b) => a.etaSeconds! - b.etaSeconds!).slice(0, 2);
  const height = snap === 'full' ? screenHeight * 0.83 : snap === 'half' ? screenHeight * 0.47 : 150;

  return (
    <View onLayout={({ nativeEvent }) => onHeightChange(nativeEvent.layout.height)}
      style={[styles.sheet, { bottom: insets.bottom + 8, height }]}>
      <Pressable
        onPress={() => { if (!handledDrag.current) onChangeSnap(nextRouteSheetSnap(snap, 'up')); }}
        onTouchStart={(event) => { handledDrag.current = false; dragStartY.current = event.nativeEvent.pageY; }}
        onTouchEnd={(event) => {
          if (dragStartY.current === null) return;
          const distance = event.nativeEvent.pageY - dragStartY.current;
          dragStartY.current = null;
          if (Math.abs(distance) > 40) {
            handledDrag.current = true;
            onChangeSnap(nextRouteSheetSnap(snap, distance < 0 ? 'up' : 'down'));
          }
        }}
        accessibilityRole="button" accessibilityLabel="노선 시트 높이 변경">
        <View style={styles.handle} />
      </Pressable>
      <View style={styles.header}>
        <View style={styles.routeTitle}>
          <Text style={styles.routeBadge}>{data?.routeType.includes('마을') ? '마을' : '일반'}</Text>
          <Text style={styles.title}>{data?.busNumber ?? '노선'}</Text>
        </View>
        <Pressable onPress={() => onChangeSnap(snap === 'compact' ? 'full' : 'compact')}
          accessibilityRole="button" accessibilityLabel={snap === 'compact' ? '노선 목록 보기' : '지도 크게 보기'}>
          <Text style={styles.action}>{snap === 'compact' ? '노선 보기' : '지도 크게 보기'}</Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="정류장 버스 목록으로 돌아가기">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {snap === 'compact' ? (
        <Text style={styles.compactHint}>선택 정류장 · {arriving[0]
          ? formatEta(arriving[0].etaSeconds, arriving[0].serviceStatus, arriving[0].etaPrecision, arriving[0].etaSource)
          : '도착정보 확인 중'}</Text>
      ) : isPending ? <ActivityIndicator color="#1769E0" /> : isError ? (
        <Pressable onPress={() => void refetchRoute()}><Text style={styles.notice}>노선 정보를 불러오지 못했습니다. 다시 시도</Text></Pressable>
      ) : data ? <>
        {data.geometry.source === 'unavailable' ? <Text style={styles.notice}>공식 도로 경로 정보가 없습니다.</Text> : null}
        <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {data.stops.map((stop, index) => {
            const vehicles = data.vehicles.filter((vehicle) => vehicle.stationSeq === stop.stationSeq);
            const selected = stop.stationSeq === stationSeq && stop.stationId === data.selectedStationId;
            const color = stop.stationSeq <= (data.turnStationSeq ?? Infinity) ? '#E8AF25' : '#13B976';
            return <View key={`${stop.stationId}:${stop.stationSeq}`} style={[styles.row, selected && styles.selectedRow]}
              onLayout={selected ? ({ nativeEvent }) => {
                if (initialScrollDone.current || snap !== 'full') return;
                initialScrollDone.current = true;
                listRef.current?.scrollTo({ y: Math.max(0, nativeEvent.layout.y - 140), animated: false });
              } : undefined}>
              <View style={styles.rail}>
                <View style={[styles.railLine, { backgroundColor: color }, index === 0 && styles.railStart,
                  index === data.stops.length - 1 && styles.railEnd]} />
                <View style={[styles.railDot, selected && styles.selectedDot]} />
                {vehicles.length ? <View style={styles.busOnRail}>
                  <SymbolView name={{ ios: 'bus.fill', android: 'directions_bus', web: 'directions_bus' }} size={20} tintColor="#FFFFFF" />
                </View> : null}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitle}>
                  <Text style={[styles.stopName, selected && styles.selectedName]}>{stop.name}</Text>
                  {stop.stationSeq === data.turnStationSeq ? <Text style={styles.turnBadge}>회차 ↪</Text> : null}
                </View>
                {selected ? <>
                  <Text style={styles.selectedLabel}>선택한 정류장</Text>
                  {arriving.map((arrival, arrivalIndex) => <Text key={arrival.vehicleId ?? arrivalIndex} style={styles.arrivalText}>
                    {formatEta(arrival.etaSeconds, arrival.serviceStatus, arrival.etaPrecision, arrival.etaSource)}
                    {arrival.remainingStops !== null ? ` · ${formatRemainingStops(arrival.remainingStops)}` : ''}
                  </Text>)}
                </> : null}
                {vehicles.length ? <Text style={styles.vehicleText}>{vehicles.length}대 마지막 위치 확인 · 정확한 GPS 아님</Text> : null}
              </View>
            </View>;
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Text style={styles.footerHint}>차량 위치는 정류장 순번 기준</Text>
          <Pressable onPress={() => { void refetchRoute(); void refetchArrivals(); }} accessibilityRole="button" accessibilityLabel="노선 정보 새로고침">
            <Text style={styles.action}>새로고침 ↻</Text>
          </Pressable>
        </View>
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 12, right: 12, backgroundColor: '#FFF', borderRadius: 28,
    overflow: 'hidden', elevation: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 },
  handle: { alignSelf: 'center', width: 44, height: 5, marginVertical: 12, borderRadius: 3, backgroundColor: '#AEB4BC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9ECEF' },
  routeTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeBadge: { backgroundColor: '#00A4B1', color: '#FFF', fontSize: 13, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 3 },
  title: { fontSize: 23, fontWeight: '700', color: '#15171A' },
  action: { color: '#1769E0', fontSize: 14, fontWeight: '600' },
  close: { fontSize: 30, color: '#343A40' },
  compactHint: { paddingHorizontal: 20, paddingTop: 8, fontSize: 14, color: '#69717C' },
  notice: { paddingHorizontal: 20, paddingVertical: 12, color: '#69717C' },
  list: { flex: 1 },
  listContent: { paddingBottom: 10 },
  row: { flexDirection: 'row', minHeight: 67, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9ECEF' },
  selectedRow: { backgroundColor: '#F3F7FC' },
  rail: { width: 72, alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 5, top: 0, bottom: 0, left: 35 },
  railStart: { top: '50%' },
  railEnd: { bottom: '50%' },
  railDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#AEB4BC', zIndex: 1 },
  selectedDot: { width: 15, height: 15, borderRadius: 8, borderColor: '#1769E0', borderWidth: 3 },
  busOnRail: { position: 'absolute', left: 22, top: 6, width: 28, height: 28, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#00A4B1', zIndex: 2 },
  rowBody: { flex: 1, justifyContent: 'center', paddingVertical: 13, paddingRight: 16 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { fontSize: 17, color: '#15171A' },
  selectedName: { fontWeight: '700' },
  turnBadge: { borderRadius: 10, borderWidth: 1, borderColor: '#ADB5BD', paddingHorizontal: 5,
    paddingVertical: 1, color: '#69717C', fontSize: 11 },
  selectedLabel: { marginTop: 4, color: '#1769E0', fontSize: 12 },
  arrivalText: { marginTop: 4, color: '#F04438', fontSize: 14 },
  vehicleText: { marginTop: 4, color: '#008F99', fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9ECEF' },
  footerHint: { fontSize: 12, color: '#8A919B' },
});
