import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { StationRepository } from './stations/station.repository';
import { SeoulStationProvider } from './providers/seoul-station.provider';
import { TagoStationProvider } from './providers/tago-station.provider';

@Module({
  controllers: [BusController],
  providers: [
    BusService,
    StationRepository,
    SeoulStationProvider,
    TagoStationProvider,
  ],
  exports: [StationRepository, SeoulStationProvider, TagoStationProvider],
})
export class BusModule {}
