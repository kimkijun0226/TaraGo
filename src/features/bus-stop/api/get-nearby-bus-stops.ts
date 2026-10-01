import { apiClient } from '@/shared/api/client';

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
