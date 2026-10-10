import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { getNearbyBusStops } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { combineBusStops } from './combine-bus-stops';
import type { BusStopTile } from '@/features/bus-stop/model/bus-stop-tile';

/**
 * 지도 타일마다 독립된 Query를 만들고 정류장 ID를 기준으로 결과를 합친다.
 *
 * 타일 크기와 인덱스를 Query 키로 사용해 화면이 조금 움직여도 결과를 재사용한다.
 * 30분 동안 stale·GC 시간을 유지하므로 같은 지역을 다시 볼 때 불필요한
 * 서버 요청을 줄인다. 이 시간은 데이터의 실시간 도착 ETA에는 적용되지 않는다.
 * 서로 겹치는 반경에서 같은 정류장이 와도 마커는 한 번만 표시한다.
 * @param tiles 현재 화면과 선조회 여유 영역을 덮는 타일 목록.
 * @returns 타일 응답을 합쳐 중복을 제거한 정류장 목록.
 */
export function useNearbyBusStops(tiles: BusStopTile[]) {
  const queries = useMemo(() => tiles.map((tile) => ({
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
    })), [tiles]);
  return useQueries({ queries, combine: combineBusStops });
}
