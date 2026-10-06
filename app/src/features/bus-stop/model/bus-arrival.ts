import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';

/** 같은 노선의 첫 번째·두 번째 도착 차량을 화면에 함께 표시하는 형태. */
export type BusArrivalGroup = {
  routeId: string;
  stationSeq?: number;
  busNumber: string;
  routeType: string;
  first: BusArrival;
  second?: BusArrival;
};

/**
 * 도착 예정 초를 사용자에게 표시할 문구로 바꾼다.
 * @param etaSeconds 도착까지 남은 시간(초).
 * @param serviceStatus 공급자 도착·차량위치 정보로 확인한 운행 상태.
 * @param precision 분 단위 원본에는 존재하지 않는 초 정밀도를 표시하지 않는다.
 * @param source 회차점의 공식 ETA와 경로 기반 이동시간으로 계산한 예상값인지 여부.
 * @returns ETA가 없으면 확인된 상태를 우선 표시하고, 있으면 도착 시간 문구.
 */
export function formatEta(etaSeconds: number | null, serviceStatus?: BusArrival['serviceStatus'], precision?: BusArrival['etaPrecision'], source?: BusArrival['etaSource']) {
  if (etaSeconds === null) {
    if (serviceStatus === 'turnaround_waiting') return '회차지 대기 중';
    if (serviceStatus === 'before_turnaround') return '운행정보 확인 중';
    if (serviceStatus === 'on_route') return '노선 운행 중';
    return '운행정보 확인 중';
  }
  if (source === 'turnaround_estimate') return `예상 ${Math.floor(etaSeconds / 60)}분 ${Math.floor(etaSeconds % 60)}초`;
  if (etaSeconds <= 60) return '곧 도착';
  if (precision === 'minutes') return `약 ${Math.ceil(etaSeconds / 60)}분`;
  if (etaSeconds <= 600) return `${Math.floor(etaSeconds / 60)}분 ${Math.floor(etaSeconds % 60)}초`;
  return `${Math.ceil(etaSeconds / 60)}분`;
}

/**
 * 남은 정류장 수를 도착 정보 문구로 바꾼다.
 * @param remainingStops 버스가 도착 전까지 남은 정류장 수.
 * @returns 정류장 수 또는 도착 정보 확인 중 문구.
 */
export function formatRemainingStops(remainingStops: number | null) {
  if (remainingStops === null) return '';
  return remainingStops <= 0 ? '도착 정보 확인 중' : `${remainingStops}정류장 전`;
}

/**
 * 같은 노선의 차량을 묶고 가장 가까운 두 대만 도착 순서로 남긴다.
 *
 * 서버 응답은 차량 단위이므로 그대로 렌더링하면 같은 버스 번호가
 * 여러 줄 나온다. 노선별로 묶은 뒤 첫 차 ETA 기준으로 목록을 정렬한다.
 * @param arrivals 서버에서 받은 차량별 도착 정보.
 * @returns 첫 차 도착이 빠른 순서의 노선 목록.
 */
export function groupBusArrivals(arrivals: BusArrival[]): BusArrivalGroup[] {
  const byRoute = new Map<string, BusArrival[]>();

  for (const arrival of arrivals) {
    const key = `${arrival.routeId}:${arrival.stationSeq ?? ''}`;
    const routeArrivals = byRoute.get(key) ?? [];
    routeArrivals.push(arrival);
    byRoute.set(key, routeArrivals);
  }

  const groups = [...byRoute.entries()]
    .map(([, routeArrivals]) => {
      const [first, second] = [...routeArrivals]
        .sort((left, right) => (left.etaSeconds ?? Infinity) - (right.etaSeconds ?? Infinity))
        .slice(0, 2);

      return {
        routeId: first.routeId,
        stationSeq: first.stationSeq,
        busNumber: first.busNumber,
        routeType: first.routeType,
        first,
        second,
      };
    });

  return groups.sort(
    (left, right) => (left.first.etaSeconds ?? Infinity) - (right.first.etaSeconds ?? Infinity),
  );
}
