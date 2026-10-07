/** 공식 공급자가 제공한 순서와 좌표를 유지하는 노선 상세 응답. */
export type BusRouteDetail = {
  routeId: string;
  busNumber: string;
  routeType: string;
  selectedStationId: string;
  selectedStationSeq: number;
  turnStationSeq: number | null;
  stops: Array<{
    stationId: string;
    stationSeq: number;
    mobileNo: string | null;
    name: string;
    latitude: number;
    longitude: number;
  }>;
  geometry: {
    source: 'official' | 'unavailable';
    points: Array<{ latitude: number; longitude: number }>;
  };
  vehicles: Array<{ vehicleId: string; stationSeq: number; positionSource: 'station_sequence' }>;
};
