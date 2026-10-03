import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import {
  formatEta,
  formatRemainingStops,
  groupBusArrivals,
  type BusArrivalGroup,
} from '@/features/bus-stop/model/bus-arrival';
import { getBusStopSheetDetails } from '@/features/bus-stop/model/bus-stop-sheet';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';

type BusStopBottomSheetProps = {
  busStop: BusStop;
  onClose: () => void;
};

export function BusStopBottomSheet({
  busStop,
  onClose,
}: BusStopBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const details = getBusStopSheetDetails(busStop);
  const {
    data: arrivals = [],
    dataUpdatedAt,
    isError,
    isFetching,
    isPending,
    refetch,
  } = useBusArrivals(busStop.id);
  const arrivalGroups = groupBusArrivals(arrivals);

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.stationText}>
          <Text style={styles.title}>{details.title}</Text>
          <Text style={styles.subtitle}>{details.subtitle}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 정보 닫기"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.refreshRow}>
        <Text style={styles.updatedAt}>
          {dataUpdatedAt
            ? `${new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })} 갱신`
            : '도착정보 조회 중'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="버스 도착정보 새로고침"
          disabled={isFetching}
          onPress={() => void refetch()}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.refreshText}>{isFetching ? '갱신 중' : '새로고침'}</Text>
        </Pressable>
      </View>

      {isPending ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#1769E0" />
          <Text style={styles.stateText}>도착정보를 불러오고 있습니다.</Text>
        </View>
      ) : isError ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>도착정보를 불러오지 못했습니다.</Text>
          <Pressable onPress={() => void refetch()}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : arrivalGroups.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>현재 도착 예정인 버스가 없습니다.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.arrivalList}
          showsVerticalScrollIndicator={false}
          style={styles.arrivalScroll}
        >
          {arrivalGroups.map((group) => (
            <View key={group.routeId} style={styles.arrivalRow}>
              <View style={styles.routeHeader}>
                <Text style={styles.busNumber}>{group.busNumber}</Text>
                <Text style={styles.routeType}>{group.routeType}</Text>
              </View>
              <View style={styles.arrivalTimes}>
                <ArrivalTime label="첫 번째" arrival={group.first} />
                {group.second ? (
                  <ArrivalTime label="두 번째" arrival={group.second} />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: 18,
    borderRadius: 2,
    backgroundColor: '#AEB4BC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stationText: {
    flex: 1,
  },
  title: {
    color: '#15171A',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    color: '#69717C',
    fontSize: 14,
  },
  closeButton: {
    width: 40,
    height: 40,
    marginLeft: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F5',
  },
  closeText: {
    marginTop: -2,
    color: '#343A40',
    fontSize: 30,
    fontWeight: '300',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DEE2E6',
  },
  updatedAt: {
    color: '#8A919B',
    fontSize: 12,
  },
  refreshText: {
    color: '#1769E0',
    fontSize: 13,
    fontWeight: '600',
  },
  stateContainer: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: {
    color: '#69717C',
    fontSize: 14,
  },
  retryText: {
    color: '#1769E0',
    fontSize: 14,
    fontWeight: '600',
  },
  arrivalScroll: {
    maxHeight: 260,
  },
  arrivalList: {
    paddingVertical: 4,
  },
  arrivalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9ECEF',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  busNumber: {
    color: '#1769E0',
    fontSize: 19,
    fontWeight: '700',
  },
  routeType: {
    color: '#8A919B',
    fontSize: 12,
  },
  arrivalTimes: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 10,
  },
  etaText: {
    minWidth: 90,
  },
  etaLabel: {
    color: '#8A919B',
    fontSize: 11,
  },
  eta: {
    marginTop: 3,
    color: '#E5484D',
    fontSize: 17,
    fontWeight: '700',
  },
  remainingStops: {
    marginTop: 3,
    color: '#69717C',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.65,
  },
});

function ArrivalTime({
  label,
  arrival,
}: {
  label: string;
  arrival: BusArrivalGroup['first'];
}) {
  return (
    <View style={styles.etaText}>
      <Text style={styles.etaLabel}>{label}</Text>
      <Text style={styles.eta}>{formatEta(arrival.etaSeconds)}</Text>
      <Text style={styles.remainingStops}>
        {formatRemainingStops(arrival.remainingStops)}
      </Text>
    </View>
  );
}
