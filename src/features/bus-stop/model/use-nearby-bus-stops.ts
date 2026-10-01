import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getNearbyBusStops } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { BusStopTile } from '@/features/bus-stop/model/bus-stop-tile';

const NEARBY_RADIUS_METERS = 250;

export function useNearbyBusStops(tile: BusStopTile | null) {
  return useQuery({
    queryKey: ['bus-stops', 'tile', tile?.tileX, tile?.tileY],
    queryFn: ({ signal }) => {
      if (!tile) return [];

      return getNearbyBusStops({
        latitude: tile.center.latitude,
        longitude: tile.center.longitude,
        radius: NEARBY_RADIUS_METERS,
        signal,
      });
    },
    enabled: tile !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
