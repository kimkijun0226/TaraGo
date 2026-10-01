import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { StationSourceInput } from '../domain/bus-stop';
import { asArray, type NearbyStationProvider } from './station-provider';

type SeoulStation = {
  stationId?: string;
  arsId?: string;
  stationNm?: string;
  gpsY?: string;
  gpsX?: string;
  stationTp?: string;
  dist?: string;
};

type SeoulResponse = {
  msgHeader?: { headerCd?: string; headerMsg?: string };
  msgBody?: { itemList?: SeoulStation | SeoulStation[] };
};

export function parseSeoulStations(data: SeoulResponse): StationSourceInput[] {
  if (data.msgHeader?.headerCd !== '0') {
    throw new BadGatewayException(
      data.msgHeader?.headerMsg ?? '서울 정류소 API 오류',
    );
  }

  return asArray(data.msgBody?.itemList).flatMap((station) => {
    const latitude = Number(station.gpsY);
    const longitude = Number(station.gpsX);
    if (
      !station.stationId ||
      !station.stationNm ||
      station.arsId === '0' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude === 0 ||
      longitude === 0
    ) {
      return [];
    }

    return [{
      provider: 'SEOUL',
      providerStationId: station.stationId,
      arsId: station.arsId,
      name: station.stationNm,
      latitude,
      longitude,
      type: station.stationTp,
      rawMetadata: station,
    }];
  });
}

@Injectable()
export class SeoulStationProvider implements NearbyStationProvider {
  readonly provider = 'SEOUL' as const;

  constructor(private readonly config: ConfigService) {}

  async fetchNearby(latitude: number, longitude: number, radius: number) {
    const url = new URL('http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos');
    url.searchParams.set(
      'serviceKey',
      decodeURIComponent(this.config.getOrThrow('PUBLIC_DATA_SERVICE_KEY')),
    );
    url.searchParams.set('tmX', String(longitude));
    url.searchParams.set('tmY', String(latitude));
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('resultType', 'json');

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`서울 정류소 API 요청 실패: HTTP ${response.status}`);
    }

    return parseSeoulStations((await response.json()) as SeoulResponse);
  }
}
