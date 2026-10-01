import { Injectable, NotFoundException } from '@nestjs/common';

import { StationRepository } from '../stations/station.repository';
import { ArrivalCacheService } from './arrival-cache.service';
import { TagoArrivalProvider } from './tago-arrival.provider';

@Injectable()
export class ArrivalRouterService {
  constructor(
    private readonly stations: StationRepository,
    private readonly tago: TagoArrivalProvider,
    private readonly cache: ArrivalCacheService,
  ) {}

  getArrivals(stationId: string) {
    return this.cache.getOrLoad(stationId, async () => {
      const sources = await this.stations.findSources(stationId);
      const source = sources.find(
        (candidate) =>
          candidate.provider === 'TAGO' && candidate.providerCityCode,
      );
      if (!source?.providerCityCode) {
        throw new NotFoundException('도착정보를 조회할 정류장 공급자 ID가 없습니다.');
      }

      return this.tago.fetchArrivals(
        source.providerCityCode,
        source.providerStationId,
      );
    });
  }
}
