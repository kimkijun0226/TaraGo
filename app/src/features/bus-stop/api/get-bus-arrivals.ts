import { apiClient } from '@/shared/api/client';

/** 서버가 공급자별 차량 도착정보와 도착정보 없는 노선을 정규화한 형태. */
export type BusArrival = {
  routeId: string;
  stationSeq?: number;
  busNumber: string;
  routeType: string;
  etaSeconds: number | null;
  etaPrecision?: 'minutes';
  etaSource?: 'turnaround_estimate';
  remainingStops: number | null;
  vehicleType: string;
  vehicleId?: string;
  serviceStatus?: 'turnaround_waiting' | 'before_turnaround' | 'on_route';
};

type GetBusArrivalsParams = {
  stationId: string;
  signal?: AbortSignal;
};

/**
 * 선택한 정류장의 경유노선·차량별 도착 정보를 TaraGo 서버에서 가져온다.
 *
 * 이 함수는 API 응답만 반환한다. 재조회 주기와 캐시는 `useBusArrivals`가 관리한다.
 * @param params.stationId 서버 DB의 정류장 UUID. TAGO 원본 ID가 아니다.
 * @param params.signal 정류장 변경 시 이전 요청을 취소하는 신호.
 * @returns 같은 노선의 여러 차량을 포함할 수 있는 도착 정보 목록.
 * @throws 서버 요청이 실패하면 Axios 오류를 그대로 전달한다.
 */
export async function getBusArrivals({
  stationId,
  signal,
}: GetBusArrivalsParams): Promise<BusArrival[]> {
  const response = await apiClient.get<BusArrival[]>(
    `/bus/stations/${stationId}/arrivals`,
    { signal },
  );

  return response.data;
}
