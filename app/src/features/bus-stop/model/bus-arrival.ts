import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';

export type BusArrivalGroup = {
  routeId: string;
  busNumber: string;
  routeType: string;
  first: BusArrival;
  second?: BusArrival;
};

export function formatEta(etaSeconds: number) {
  if (etaSeconds <= 60) return '곧 도착';
  return `${Math.ceil(etaSeconds / 60)}분`;
}

export function formatRemainingStops(remainingStops: number) {
  return remainingStops <= 0 ? '도착 정보 확인 중' : `${remainingStops}정류장 전`;
}

export function groupBusArrivals(arrivals: BusArrival[]): BusArrivalGroup[] {
  const byRoute = new Map<string, BusArrival[]>();

  for (const arrival of arrivals) {
    const routeArrivals = byRoute.get(arrival.routeId) ?? [];
    routeArrivals.push(arrival);
    byRoute.set(arrival.routeId, routeArrivals);
  }

  const groups = [...byRoute.entries()]
    .map(([routeId, routeArrivals]) => {
      const [first, second] = [...routeArrivals]
        .sort((left, right) => left.etaSeconds - right.etaSeconds)
        .slice(0, 2);

      return {
        routeId,
        busNumber: first.busNumber,
        routeType: first.routeType,
        first,
        second,
      };
    });

  return groups.sort(
    (left, right) => left.first.etaSeconds - right.first.etaSeconds,
  );
}
