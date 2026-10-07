import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { StationRepository } from './stations/station.repository';
import { TileCacheService } from './cache/tile-cache.service';
import { StationImportService } from './stations/station-import.service';
import { ArrivalCacheService } from './arrivals/arrival-cache.service';
import { ArrivalRouterService } from './arrivals/arrival-router.service';
import { TagoArrivalProvider } from './arrivals/tago-arrival.provider';
import { GyeonggiArrivalProvider } from './arrivals/gyeonggi-arrival.provider';
import { BusRouteService } from './routes/bus-route.service';

/** 정류장 DB와 TAGO·경기도 도착정보 조회에 필요한 의존성을 묶는다. */
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
    GyeonggiArrivalProvider,
    BusRouteService,
  ],
})
export class BusModule {}
