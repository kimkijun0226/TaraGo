import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { StationRepository } from './stations/station.repository';
import { TileCacheService } from './cache/tile-cache.service';
import { StationImportService } from './stations/station-import.service';
import { ArrivalCacheService } from './arrivals/arrival-cache.service';
import { ArrivalRouterService } from './arrivals/arrival-router.service';
import { TagoArrivalProvider } from './arrivals/tago-arrival.provider';

@Module({
  controllers: [BusController],
  providers: [
    BusService,
    StationRepository,
    TileCacheService,
    StationImportService,
    ArrivalCacheService,
    ArrivalRouterService,
    TagoArrivalProvider,
  ],
})
export class BusModule {}
