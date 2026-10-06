/** 원본 공급자와 무관하게 앱에 전달하는 차량별 도착 정보. */
export type BusArrival = {
  routeId: string;
  /** 동일 노선이 같은 정류장을 두 번 지날 때 방향을 구별하는 순번. */
  stationSeq?: number;
  busNumber: string;
  routeType: string;
  /** 도착 예정 시간(초). 차량이 아직 없으면 null. */
  etaSeconds: number | null;
  /** 분 단위 원본을 환산한 경우 초 단위 정밀도로 오인하지 않도록 전달한다. */
  etaPrecision?: 'minutes';
  /** 공식 목표 정류장 ETA가 없을 때 회차점 ETA와 남은 경로로 계산한 값. */
  etaSource?: 'turnaround_estimate';
  /** 도착 전 남은 정류장 수. 차량이 아직 없으면 null. */
  remainingStops: number | null;
  vehicleType: string;
  /** 공급자 차량 ID. 회차점을 지나는 동안 같은 차량의 ETA를 유지하는 데 사용한다. */
  vehicleId?: string;
  /** ETA 없이 확인된 회차 대기·노선 위치 상태. 도착시간 추정에는 사용하지 않는다. */
  serviceStatus?: 'turnaround_waiting' | 'before_turnaround' | 'on_route';
};
