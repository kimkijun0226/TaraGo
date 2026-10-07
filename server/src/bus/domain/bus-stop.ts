/** 정류장 원본 데이터 제공처. 한 정류장에 여러 출처가 연결될 수 있다. */
export type TransitProvider = 'SEOUL' | 'GYEONGGI' | 'INCHEON' | 'TAGO';

/** 앱에 반환하는 정류장. 좌표는 WGS84, 거리는 요청 중심 기준 미터다. */
export type BusStop = {
  /** 앱이 도착정보를 요청할 때 사용하는 서버 UUID. */
  id: string;
  /** 이용자에게 보여 주는 정류장 번호. 없는 경우 `null`. */
  arsId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  type: string;
  /** 같은 정류장을 제공한 원본 데이터 출처. */
  providers: TransitProvider[];
};

/** CSV 등 외부 출처에서 정류장을 적재할 때 사용하는 입력 형태. */
export type StationSourceInput = {
  provider: TransitProvider;
  providerStationId: string;
  providerCityCode?: string;
  arsId?: string;
  name: string;
  latitude: number;
  longitude: number;
  type?: string;
  rawMetadata?: Record<string, unknown>;
};

/** 서버 정류장 UUID에서 도착 API 원본 ID로 연결할 때 쓰는 출처 정보. */
export type StationSource = {
  provider: TransitProvider;
  providerStationId: string;
  providerCityCode: string | null;
};
