import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { StationSourceInput } from '../domain/bus-stop';
import { asArray, type NearbyStationProvider } from './station-provider';

type TagoStation = {
  nodeid?: string;
  nodenm?: string;
  gpslati?: number | string;
  gpslong?: number | string;
  citycode?: number | string;
};

type TagoResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: TagoStation | TagoStation[] } | '' };
  };
};

export function parseTagoStations(data: TagoResponse): StationSourceInput[] {
  const header = data.response?.header;
  if (header?.resultCode !== '00') {
    throw new BadGatewayException(header?.resultMsg ?? 'TAGO 정류소 API 오류');
  }

  const items = data.response?.body?.items;
  if (!items || typeof items === 'string') return [];

  return asArray(items.item).flatMap((station) => {
    const latitude = Number(station.gpslati);
    const longitude = Number(station.gpslong);
    if (!station.nodeid || !station.nodenm || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return [];
    }

    return [{
      provider: 'TAGO',
      providerStationId: station.nodeid,
      providerCityCode: station.citycode == null ? undefined : String(station.citycode),
      name: station.nodenm,
      latitude,
      longitude,
      rawMetadata: station,
    }];
  });
}

@Injectable()
export class TagoStationProvider implements NearbyStationProvider {
  readonly provider = 'TAGO' as const;

  constructor(private readonly config: ConfigService) {}

  async fetchNearby(latitude: number, longitude: number, _radius: number) {
    const url = new URL(
      'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList',
    );
    url.searchParams.set(
      'serviceKey',
      decodeURIComponent(this.config.getOrThrow('PUBLIC_DATA_SERVICE_KEY')),
    );
    url.searchParams.set('_type', 'json');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('numOfRows', '100');
    url.searchParams.set('gpsLati', String(latitude));
    url.searchParams.set('gpsLong', String(longitude));

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`TAGO 정류소 API 요청 실패: HTTP ${response.status}`);
    }

    return parseTagoStations((await response.json()) as TagoResponse);
  }
}
