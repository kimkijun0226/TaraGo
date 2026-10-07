import { Injectable } from '@nestjs/common';

import { TileCacheService } from './cache/tile-cache.service';
import type { BusStop } from './domain/bus-stop';
import { StationRepository } from './stations/station.repository';

/** 공공 API 대신 적재된 정류장 DB를 조회해 지도 요청 비용을 일정하게 유지한다. */
@Injectable()
export class BusService {
  constructor(
    private readonly stations: StationRepository,
    private readonly cache: TileCacheService,
  ) {}

  /**
   * 같은 좌표와 반경의 정류장 조회를 하나로 합쳐 캐시한다.
   *
   * 좌표를 소수 6자리로 정규화해 미세한 부동소수점 차이로
   * 동일한 영역이 서로 다른 캐시 키가 되는 것을 줄인다.
   * @param latitude 조회 중심 위도.
   * @param longitude 조회 중심 경도.
   * @param radius 조회 반경(미터).
   * @returns DB에서 읽은 거리순 정류장 목록.
   */
  getNearbyStations(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<BusStop[]> {
    const cacheKey = `${latitude.toFixed(6)}:${longitude.toFixed(6)}:${radius}`;

    return this.cache.getOrLoad(cacheKey, () =>
      this.stations.findNearby(latitude, longitude, radius),
    );
  }
}
