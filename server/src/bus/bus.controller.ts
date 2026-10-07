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
import { BusRouteService } from './routes/bus-route.service';

/** 앱에 안정적인 정류장·도착 정보 계약을 제공하는 HTTP 경계. */
@Controller('bus')
export class BusController {
  constructor(
    private readonly busService: BusService,
    private readonly arrivals: ArrivalRouterService,
    private readonly routes: BusRouteService,
  ) {}

  /**
   * 서버 정류장 UUID로 해당 정류장의 도착 정보를 반환한다.
   *
   * 클라이언트는 TAGO 도시코드나 경기도 원본 정류장 ID를 알 필요가 없다.
   * @param stationId 서버에 저장된 정류장 UUID.
   * @returns 차량별 도착 정보와 도착 예정 차량이 없는 경유노선.
   * @throws UUID가 잘못되었거나 조회 가능한 출처가 없으면 4xx 오류.
   */
  @Get('stations/:stationId/arrivals')
  getArrivals(@Param('stationId', ParseUUIDPipe) stationId: string) {
    return this.arrivals.getArrivals(stationId);
  }

  /** 같은 노선의 왕복 정류장 중 사용자가 고른 경유 순번을 정확히 조회한다. */
  @Get('stations/:stationId/routes/:routeId')
  getRouteDetail(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('routeId') routeId: string,
    @Query('stationSeq', ParseIntPipe) stationSeq: number,
  ) {
    if (stationSeq < 1 || !/^\d+$/.test(routeId)) {
      throw new BadRequestException('노선 ID 또는 정류장 순번이 올바르지 않습니다.');
    }
    return this.routes.getDetail(stationId, routeId, stationSeq);
  }

  /**
   * 입력 좌표와 반경을 검증한 뒤 DB에서 주변 정류장을 조회한다.
   *
   * 지도 이동마다 외부 API를 호출하지 않으며, 응답은 HTTP 캐시도 허용한다.
   * @param latitude 조회 중심 위도. -90~90 범위.
   * @param longitude 조회 중심 경도. -180~180 범위.
   * @param radius 조회 반경(미터). 기본값 500m, 허용 범위 1~1000m.
   * @returns 중심에서 가까운 순서의 정류장 목록.
   * @throws 범위를 벗어난 입력은 400 오류.
   */
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
