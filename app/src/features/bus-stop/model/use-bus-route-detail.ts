import { useQuery } from '@tanstack/react-query';

import { getBusRouteDetail } from '../api/get-bus-route-detail';

/** 상세 화면이 열린 동안만 차량 순번을 갱신한다. */
export function useBusRouteDetail(stationId: string, routeId: string, stationSeq: number, enabled = true) {
  return useQuery({
    queryKey: ['bus-route', stationId, routeId, stationSeq],
    queryFn: ({ signal }) => getBusRouteDetail(stationId, routeId, stationSeq, signal),
    enabled,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
