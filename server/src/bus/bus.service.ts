import { Injectable } from '@nestjs/common';

import { TileCacheService } from './cache/tile-cache.service';
import type { BusStop } from './domain/bus-stop';
import { StationRepository } from './stations/station.repository';

@Injectable()
export class BusService {
  constructor(
    private readonly stations: StationRepository,
    private readonly cache: TileCacheService,
  ) {}

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
