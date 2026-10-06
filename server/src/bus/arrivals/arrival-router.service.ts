import { Injectable, NotFoundException } from '@nestjs/common';

import { StationRepository } from '../stations/station.repository';
import { ArrivalCacheService } from './arrival-cache.service';
import { TagoArrivalProvider } from './tago-arrival.provider';
import { GyeonggiArrivalProvider } from './gyeonggi-arrival.provider';

/** 앱의 정류장 UUID를 좌표로 대조해 경기도 또는 TAGO 원본 ID에 연결한다. */
@Injectable()
export class ArrivalRouterService {
  constructor(
    private readonly stations: StationRepository,
    private readonly tago: TagoArrivalProvider,
    private readonly cache: ArrivalCacheService,
    private readonly gyeonggi: GyeonggiArrivalProvider,
  ) {}

  /**
   * 경기도 정류장과 일치하면 전체 경유노선·도착정보를, 아니면 TAGO를 조회한다.
   *
   * 동일 정류장의 동시 요청은 캐시에서 합친다. 경기도 ARS 번호는
   * 전국에서 중복될 수 있어 좌표가 100m 안에 일치할 때만 사용한다.
   * @param stationId 서버 정류장 UUID.
   * @returns 해당 정류장의 차량별 버스 도착 정보.
   * @throws TAGO 도시코드·정류장 ID 연결이 없으면 NotFoundException.
   */
  getArrivals(stationId: string) {
    return this.cache.getOrLoad(stationId, async () => {
      const station = await this.stations.findStation(stationId);
      if (!station) throw new NotFoundException('정류장을 찾을 수 없습니다.');
      if (station.arsId && /^\d{5}$/.test(station.arsId)) {
        const gyeonggiId = await this.gyeonggi.findStationId(
          station.arsId, station.latitude, station.longitude,
        );
        if (gyeonggiId !== null) return this.gyeonggi.fetchArrivals(gyeonggiId);
      }
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
