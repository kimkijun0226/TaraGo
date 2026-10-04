import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { BusArrival } from './arrival-provider';

type TagoArrival = {
  routeid?: string;
  routeno?: string | number;
  routetp?: string;
  arrtime?: string | number;
  arrprevstationcnt?: string | number;
  vehicletp?: string;
};

type TagoArrivalResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: TagoArrival | TagoArrival[] } | '' };
  };
};

@Injectable()
export class TagoArrivalProvider {
  constructor(private readonly config: ConfigService) {}

  async fetchArrivals(cityCode: string, stationId: string): Promise<BusArrival[]> {
    const url = new URL(
      'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList',
    );
    url.searchParams.set(
      'serviceKey',
      decodeURIComponent(this.config.getOrThrow('PUBLIC_DATA_SERVICE_KEY')),
    );
    url.searchParams.set('_type', 'json');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('numOfRows', '100');
    url.searchParams.set('cityCode', cityCode);
    url.searchParams.set('nodeId', stationId);

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`TAGO 도착 API 요청 실패: HTTP ${response.status}`);
    }

    return parseTagoArrivals((await response.json()) as TagoArrivalResponse);
  }
}

export function parseTagoArrivals(data: TagoArrivalResponse): BusArrival[] {
  const header = data.response?.header;
  if (header?.resultCode !== '00') {
    throw new BadGatewayException(header?.resultMsg ?? 'TAGO 도착 API 오류');
  }

  const items = data.response?.body?.items;
  if (!items || typeof items === 'string') return [];

  /** TAGO는 결과가 한 건일 때 객체, 여러 건일 때 배열을 반환한다. */
  const arrivals = Array.isArray(items.item) ? items.item : items.item ? [items.item] : [];
  return arrivals.flatMap((arrival) => {
    const etaSeconds = Number(arrival.arrtime);
    const remainingStops = Number(arrival.arrprevstationcnt);
    if (!arrival.routeid || arrival.routeno == null || !Number.isFinite(etaSeconds)) {
      return [];
    }

    return [{
      routeId: arrival.routeid,
      busNumber: String(arrival.routeno),
      routeType: arrival.routetp ?? '',
      etaSeconds,
      remainingStops: Number.isFinite(remainingStops) ? remainingStops : 0,
      vehicleType: arrival.vehicletp ?? '',
    }];
  });
}
