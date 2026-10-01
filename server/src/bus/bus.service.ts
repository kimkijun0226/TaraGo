import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SeoulBusStation = {
  arsId: string;
  dist: string;
  gpsX: string;
  gpsY: string;
  stationId: string;
  stationNm: string;
  stationTp: string;
};

type SeoulBusResponse = {
  msgHeader?: {
    headerCd?: string;
    headerMsg?: string;
  };
  msgBody?: {
    itemList?: SeoulBusStation | SeoulBusStation[];
  };
};

@Injectable()
export class BusService {
  constructor(private readonly configService: ConfigService) {}

  //   반경 내 서울 버스 정류장 조회
  async getNearbyStations(latitude: number, longitude: number, radius: number) {
    const rawServiceKey = this.configService.getOrThrow<string>(
      'PUBLIC_DATA_SERVICE_KEY',
    );

    const serviceKey = decodeURIComponent(rawServiceKey);

    const url = new URL(
      'http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos',
    );

    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('tmX', String(longitude));
    url.searchParams.set('tmY', String(latitude));
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('resultType', 'json');

    const response = await fetch(url);

    if (!response.ok) {
      throw new BadGatewayException(
        `서울 버스 API 요청 실패: HTTP ${response.status}`,
      );
    }

    // 응답값 내려주기
    const data = (await response.json()) as SeoulBusResponse;

    if (data.msgHeader?.headerCd !== '0') {
      throw new BadGatewayException(
        data.msgHeader?.headerMsg ?? '서울 버스 API 처리 오류',
      );
    }

    const items = data.msgBody?.itemList;

    if (!items) {
      return [];
    }

    const stations = Array.isArray(items) ? items : [items];

    // 시정교차로(미정차) 제외하고 반경 내 정류장만 반환 & 지정된 반경 내 정류장만 필터링
    return stations
      .filter(
        (station) => station.arsId !== '0' && Number(station.dist) <= radius,
      )
      .map((station) => ({
        id: station.stationId,
        arsId: station.arsId,
        name: station.stationNm,
        latitude: Number(station.gpsY),
        longitude: Number(station.gpsX),
        distanceMeters: Number(station.dist),
        type: station.stationTp,
      }));
  }
}
