import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  ParseFloatPipe,
  ParseIntPipe,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { BusService } from './bus.service';
import { ArrivalRouterService } from './arrivals/arrival-router.service';

@Controller('bus')
export class BusController {
  constructor(
    private readonly busService: BusService,
    private readonly arrivals: ArrivalRouterService,
  ) {}

  @Get('stations/:stationId/arrivals')
  getArrivals(@Param('stationId', ParseUUIDPipe) stationId: string) {
    return this.arrivals.getArrivals(stationId);
  }

  @Get('stations/nearby')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  getNearbyStations(
    @Query('latitude', ParseFloatPipe) latitude: number,
    @Query('longitude', ParseFloatPipe) longitude: number,
    @Query('radius', new DefaultValuePipe(500), ParseIntPipe) radius: number,
  ) {
    if (latitude < -90 || latitude > 90) {
      throw new BadRequestException('latitude가 올바르지 않습니다.');
    }

    if (longitude < -180 || longitude > 180) {
      throw new BadRequestException('longitude가 올바르지 않습니다.');
    }

    if (radius < 1 || radius > 1000) {
      throw new BadRequestException('radius는 1~1000이어야 합니다.');
    }

    return this.busService.getNearbyStations(latitude, longitude, radius);
  }
}
