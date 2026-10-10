import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { GyeonggiArrivalProvider } from '../arrivals/gyeonggi-arrival.provider';
import { StationRepository } from '../stations/station.repository';
import type { BusRouteDetail } from './bus-route.types';

/** 선택한 정류장과 실제 경유 순번에 일치하는 노선만 공개한다. */
@Injectable()
export class BusRouteService {
  private readonly logger = new Logger(BusRouteService.name);
  constructor(
    private readonly stations: StationRepository,
    private readonly gyeonggi: GyeonggiArrivalProvider,
  ) {}

  async getDetail(stationUuid: string, routeId: string, stationSeq: number): Promise<BusRouteDetail> {
    const station = await this.stations.findStation(stationUuid);
    if (!station?.arsId) throw new NotFoundException('정류장을 찾을 수 없습니다.');
    const sourceStationId = await this.gyeonggi.findStationId(
      station.arsId, station.latitude, station.longitude,
    );
    if (!sourceStationId) throw new NotFoundException('이 정류장의 노선 상세를 제공하지 않습니다.');

    const routes = await this.gyeonggi.getStationRoutes(sourceStationId);
    const route = routes.find((item) => String(item.routeId) === routeId && item.staOrder === stationSeq);
    if (!route) throw new NotFoundException('선택 정류장을 경유하는 노선을 찾을 수 없습니다.');

    const stops = await this.gyeonggi.getRouteStops(route.routeId);
    if (!stops.some((item) => item.stationId === sourceStationId && item.stationSeq === stationSeq)) {
      throw new NotFoundException('선택 정류장의 노선 순번이 일치하지 않습니다.');
    }
    const [line, vehicles] = await Promise.all([
      this.gyeonggi.getRouteLine(route.routeId).catch(() => {
        this.logger.warn(`노선 ${route.routeId} 공식 형상을 가져오지 못했습니다.`);
        return [];
      }),
      this.gyeonggi.getRouteVehiclePositions(route.routeId).catch(() => {
        this.logger.warn(`노선 ${route.routeId} 차량 위치를 가져오지 못했습니다.`);
        return [];
      }),
    ]);
    const points = [...line].sort((a, b) => a.lineSeq - b.lineSeq)
      .filter((item) => Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .map((item) => ({ latitude: Number(item.y), longitude: Number(item.x) }));
    return {
      routeId, busNumber: String(route.routeName), routeType: route.routeTypeName ?? '',
      selectedStationId: String(sourceStationId), selectedStationSeq: stationSeq,
      turnStationSeq: stops.find((item) => item.turnYn === 'Y')?.stationSeq ?? null,
      stops: [...stops].sort((a, b) => a.stationSeq - b.stationSeq).map((item) => ({
        stationId: String(item.stationId), stationSeq: item.stationSeq,
        mobileNo: item.mobileNo == null ? null : String(item.mobileNo).trim(),
        name: item.stationName ?? '이름 없는 정류장',
        latitude: Number(item.y), longitude: Number(item.x),
      })),
      geometry: { source: points.length > 1 ? 'official' : 'unavailable', points },
      vehicles: vehicles.map((item) => ({
        vehicleId: String(item.vehId), stationSeq: item.stationSeq,
        positionSource: 'station_sequence' as const,
      })),
    };
  }
}
