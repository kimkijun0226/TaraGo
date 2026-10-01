import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { StationRepository } from './stations/station.repository';

@Module({
  controllers: [BusController],
  providers: [BusService, StationRepository],
  exports: [StationRepository],
})
export class BusModule {}
