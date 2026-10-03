import { useQuery } from '@tanstack/react-query';

import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';

export function useBusArrivals(stationId: string) {
  return useQuery({
    queryKey: ['bus-stops', stationId, 'arrivals'],
    queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
