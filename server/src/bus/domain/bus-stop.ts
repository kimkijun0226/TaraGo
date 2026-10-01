export type TransitProvider = 'SEOUL' | 'GYEONGGI' | 'INCHEON' | 'TAGO';

export type BusStop = {
  id: string;
  arsId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  type: string;
  providers: TransitProvider[];
};

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
