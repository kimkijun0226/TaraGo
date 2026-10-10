import { useQuery } from '@tanstack/react-query';

import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';

/**
 * 선택한 정류장의 차량별 도착 정보를 서버 상태로 관리한다.
 *
 * 시트가 열려 있는 동안 10초마다 갱신한다. 앱이 background에 있을 때는
 * 이 폴링에 의존하지 않으며, 예약 알림 감시는 추후 서버 Worker가 맡는다.
 * @param stationId 서버 DB의 정류장 UUID.
 * @returns 도착 목록, 조회·오류 상태, 수동 재조회 함수를 담은 Query 결과.
 */
export function useBusArrivals(stationId: string) {
  return useQuery({
    queryKey: ['bus-stops', stationId, 'arrivals'],
    queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
    enabled: Boolean(stationId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
