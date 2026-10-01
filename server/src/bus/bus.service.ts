import { Injectable } from '@nestjs/common';

import { TileCacheService } from './cache/tile-cache.service';
import type { BusStop, StationSourceInput } from './domain/bus-stop';
import { SeoulStationProvider } from './providers/seoul-station.provider';
import { TagoStationProvider } from './providers/tago-station.provider';
import { StationRepository } from './stations/station.repository';

const STATION_LIMIT = 500;

@Injectable()
export class BusService {
  constructor(
    private readonly stations: StationRepository,
    private readonly tago: TagoStationProvider,
    private readonly seoul: SeoulStationProvider,
    private readonly cache: TileCacheService,
  ) {}

  getNearbyStations(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<BusStop[]> {
    const cacheKey = `${latitude.toFixed(6)}:${longitude.toFixed(6)}:${radius}`;

    return this.cache.getOrLoad(cacheKey, async () => {
      const stored = await this.stations.findNearby(
        latitude,
        longitude,
        radius,
        STATION_LIMIT,
      );
      if (stored.length > 0) return stored;

      const tagoStations = await this.tago.fetchNearby(
        latitude,
        longitude,
        radius,
      );
      const seoulStations = tagoStations.some(isSeoulStation)
        ? await this.seoul
            .fetchNearby(latitude, longitude, radius)
            .catch(() => [] as StationSourceInput[])
        : [];

      await Promise.all(
        [...tagoStations, ...seoulStations].map((station) =>
          this.stations.upsertSource(station),
        ),
      );

      return this.stations.findNearby(
        latitude,
        longitude,
        radius,
        STATION_LIMIT,
      );
    });
  }
}

function isSeoulStation(station: StationSourceInput) {
  return station.providerCityCode === '11';
}
