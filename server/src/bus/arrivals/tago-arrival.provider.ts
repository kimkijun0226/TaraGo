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

/** 공공데이터포털 인증키를 서버에 보관하고 TAGO 도착 API 응답을 정규화한다. */
@Injectable()
export class TagoArrivalProvider {
  constructor(private readonly config: ConfigService) {}

  /**
   * 도시코드와 원본 정류장 ID로 TAGO 도착 예정 정보를 요청한다.
   *
   * 인증키는 서버 설정에서만 읽는다. HTTP 실패와 응답 본문의 오류는
   * 서로 다른 경로로 검사하되 모두 클라이언트에 게이트웨이 오류로 전달한다.
   * @param cityCode 공공데이터포털이 요구하는 도시 코드.
   * @param stationId 공공데이터포털 원본 정류장 ID. 서버 UUID가 아니다.
   * @returns 정규화한 차량별 도착 예정 정보.
   * @throws HTTP 요청이나 TAGO 응답이 실패하면 BadGatewayException.
   */
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

/**
 * TAGO의 단일 객체·배열 응답을 같은 형태의 도착 목록으로 바꾼다.
 *
 * 도착 정보가 없는 정상 응답은 빈 목록이다. 노선 ID·번호·ETA가 없는
 * 불완전한 차량은 제외하고, 남은 정류장 수가 유효하지 않으면 0으로 둔다.
 * @param data TAGO API JSON 응답.
 * @returns 앱과 서버가 공유하는 형태의 차량별 도착 목록.
 * @throws TAGO 응답 헤더가 성공 코드가 아니면 BadGatewayException.
 */
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
