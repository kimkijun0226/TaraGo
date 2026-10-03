import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { StationRepository } from './stations/station.repository';
import { SeoulStationProvider } from './providers/seoul-station.provider';
import { TagoStationProvider } from './providers/tago-station.provider';
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
    SeoulStationProvider,
    TagoStationProvider,
    TileCacheService,
    StationImportService,
    ArrivalCacheService,
    ArrivalRouterService,
    TagoArrivalProvider,
  ],
  exports: [StationRepository, SeoulStationProvider, TagoStationProvider],
})
export class BusModule {}
