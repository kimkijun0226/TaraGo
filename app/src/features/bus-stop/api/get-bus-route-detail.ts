import { apiClient } from '@/shared/api/client';

/** 도로 형상은 공식 데이터가 있을 때만 전달한다. 차량 순번은 GPS 좌표가 아니다. */
export type BusRouteDetail = {
  routeId: string;
  busNumber: string;
  routeType: string;
  selectedStationId: string;
  selectedStationSeq: number;
  turnStationSeq: number | null;
  stops: { stationId: string; stationSeq: number; mobileNo: string | null; name: string; latitude: number; longitude: number }[];
  geometry: { source: 'official' | 'unavailable'; points: { latitude: number; longitude: number }[] };
  vehicles: { vehicleId: string; stationSeq: number; positionSource: 'station_sequence' }[];
};

/** 선택 정류장의 정확한 경유 순번을 전달해 왕복 노선을 구별한다. */
export async function getBusRouteDetail(stationId: string, routeId: string, stationSeq: number, signal?: AbortSignal) {
  const response = await apiClient.get<BusRouteDetail>(
    `/bus/stations/${stationId}/routes/${routeId}`, { params: { stationSeq }, signal },
  );
  return response.data;
}
