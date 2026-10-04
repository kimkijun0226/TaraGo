import { useQueries } from '@tanstack/react-query';

import { getNearbyBusStops } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { BusStopTile } from '@/features/bus-stop/model/bus-stop-tile';

/** 보이는 지도 타일만 조회하고 중복된 정류장 ID는 한 번만 표시한다. */
export function useNearbyBusStops(tiles: BusStopTile[]) {
  const queries = useQueries({
    queries: tiles.map((tile) => ({
      queryKey: [
        'bus-stops',
        'tile',
        'complete-coverage-v2',
        tile.sizeMeters,
        tile.tileX,
        tile.tileY,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getNearbyBusStops({
          latitude: tile.center.latitude,
          longitude: tile.center.longitude,
          radius: tile.radiusMeters,
          signal,
        }),
      staleTime: 30 * 60_000,
      gcTime: 30 * 60_000,
    })),
  });

  const busStops = new Map(
    queries.flatMap(({ data = [] }) => data).map((stop) => [stop.id, stop]),
  );

  return [...busStops.values()];
}
