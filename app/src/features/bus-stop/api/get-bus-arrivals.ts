import { apiClient } from '@/shared/api/client';

export type BusArrival = {
  routeId: string;
  busNumber: string;
  routeType: string;
  etaSeconds: number;
  remainingStops: number;
  vehicleType: string;
};

type GetBusArrivalsParams = {
  stationId: string;
  signal?: AbortSignal;
};

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
