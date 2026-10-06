import { apiClient } from '@/shared/api/client';

/** 지도에 표시할 정류장. `id`는 서버 UUID, `arsId`는 이용자용 정류장 번호다. */
export type BusStop = {
  id: string;
  arsId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  type: string;
  providers: ('SEOUL' | 'GYEONGGI' | 'INCHEON' | 'TAGO')[];
};

type GetNearbyBusStopsParams = {
  latitude: number;
  longitude: number;
  radius?: number;
  signal?: AbortSignal;
};

/**
 * 지도 타일의 중심과 반경으로 서버 DB의 정류장을 조회한다.
 *
 * 위치마다 외부 공공 API를 직접 호출하지 않는다. 타일별 캐시는 호출하는 Query가 맡는다.
 * @param params.latitude 조회 중심 위도.
 * @param params.longitude 조회 중심 경도.
 * @param params.radius 중심에서 검색할 거리(미터). 생략하면 500m.
 * @param params.signal 화면 이동으로 쓸모없어진 요청을 취소하는 신호.
 * @returns 해당 반경에서 서버가 찾은 정류장 목록.
 * @throws 서버 요청이 실패하면 Axios 오류를 그대로 전달한다.
 */
export async function getNearbyBusStops({
  latitude,
  longitude,
  radius = 500,
  signal,
}: GetNearbyBusStopsParams): Promise<BusStop[]> {
  const response = await apiClient.get<BusStop[]>('/bus/stations/nearby', {
    params: {
      latitude,
      longitude,
      radius,
    },
    signal,
  });

  return response.data;
}
