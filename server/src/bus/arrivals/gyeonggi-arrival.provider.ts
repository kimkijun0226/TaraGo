import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { BusArrival } from './arrival-provider';

type Station = { stationId: number; mobileNo: string; x: number; y: number };
export type Route = { routeId: number; routeName: string | number; routeTypeName?: string; staOrder?: number };
type Arrival = {
  routeId: number;
  staOrder?: number;
  flag?: string;
  vehId1?: number | string;
  vehId2?: number | string;
  predictTime1?: number | string;
  predictTime2?: number | string;
  predictTimeSec1?: number | string;
  predictTimeSec2?: number | string;
  locationNo1?: number | string;
  locationNo2?: number | string;
};
export type RouteStop = { stationId: number; stationSeq: number; stationName?: string; mobileNo?: string | number; turnYn?: string; x?: number; y?: number };
type RouteVehicle = { vehId: number; stationSeq: number };
type RouteLinePoint = { lineSeq: number; x: number; y: number };
type GyeonggiResponse<T> = {
  response?: {
    msgHeader?: { resultCode?: number; resultMessage?: string };
    msgBody?: T;
  };
};

/** 경기도 정류소 ID를 찾고 경유노선·실시간 차량을 결합한다. */
@Injectable()
export class GyeonggiArrivalProvider {
  private readonly logger = new Logger(GyeonggiArrivalProvider.name);
  private readonly stationIds = new Map<string, { value: number | null; expiresAt: number }>();
  private readonly routes = new Map<number, { value: Route[]; expiresAt: number }>();
  private readonly routeStops = new Map<number, { value: RouteStop[]; expiresAt: number }>();
  private readonly routeLines = new Map<number, { value: RouteLinePoint[]; expiresAt: number }>();
  private readonly routeVehicles = new Map<number, { value: RouteVehicle[]; expiresAt: number }>();
  private readonly liveRouteVehicles = new Map<number, { value: RouteVehicle[]; expiresAt: number }>();
  private readonly turnaroundItems = new Map<number, { value: Arrival | null; expiresAt: number }>();
  private readonly turnaroundRequests = new Map<number, Promise<Arrival | null>>();
  private readonly recentTurnaroundPredictions = new Map<string, Map<string, {
    arrival: BusArrival; dueAt: number; seenAt: number;
  }>>();
  private readonly trackingRequests = new Map<string, Promise<RouteStop[] | RouteVehicle[] | RouteLinePoint[]>>();

  constructor(private readonly config: ConfigService) {}

  /** ARS 번호는 지역 간 중복되므로 좌표가 일치하는 경기도 ID만 채택한다. */
  async findStationId(arsId: string, latitude: number, longitude: number): Promise<number | null> {
    const key = `${arsId}:${latitude}:${longitude}`;
    const cached = this.stationIds.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const body = await this.request<{ busStationList?: Station[] }>(
      'busstationservice/v2/getBusStationListv2', { keyword: arsId },
    );
    const station = body.busStationList?.find((candidate) => {
      if (candidate.mobileNo.trim() !== arsId) return false;
      const north = (Number(candidate.y) - latitude) * 111_320;
      const east = (Number(candidate.x) - longitude) * 111_320 * Math.cos(latitude * Math.PI / 180);
      return north * north + east * east < 100 * 100;
    });
    this.stationIds.set(key, { value: station?.stationId ?? null, expiresAt: Date.now() + 60 * 60_000 });
    return station?.stationId ?? null;
  }

  /** 정적 경유노선은 재사용하고 도착정보만 매 요청에서 새로 가져온다. */
  async fetchArrivals(stationId: number): Promise<BusArrival[]> {
    const routes = await this.getStationRoutes(stationId);
    const body = await this.request<{ busArrivalList?: Arrival[] }>(
      'busarrivalservice/v2/getBusArrivalListv2', { stationId },
    );
    // 목록에 예측이 없는 노선만 방향이 명확한 항목조회로 보완한다.
    // 동일 정류장의 동시 요청은 상위 ArrivalCacheService에서 공유한다.
    const resolved = await Promise.all(routes.map(async (route) => {
      const listed = (body.busArrivalList ?? []).filter((item) => item.routeId === route.routeId);
      if (parseGyeonggiArrivals([route], listed).some((item) => item.etaSeconds !== null)
        || !Number.isInteger(route.staOrder) || route.staOrder! <= 0) return listed;
      try {
        const detail = await this.request<{ busArrivalItem?: Arrival }>(
          'busarrivalservice/v2/getBusArrivalItemv2',
          { stationId, routeId: route.routeId, staOrder: route.staOrder! },
        );
        const item = detail.busArrivalItem;
        if (item?.routeId === route.routeId && item.staOrder === route.staOrder
          && parseGyeonggiArrivals([route], [item]).some((arrival) => arrival.etaSeconds !== null)) {
          return [item];
        }
      } catch {
        this.logger.warn(`경기도 노선 ${route.routeId} 개별 도착조회 실패; 목록 정보 유지`);
      }
      return listed;
    }));
    const arrivalsByRoute = await Promise.all(routes.map(async (route, index) => {
      const listed = resolved[index] ?? [];
      const direct = parseGyeonggiArrivals([route], listed);
      if (direct.filter((arrival) => arrival.etaSeconds !== null).length >= 2) return direct;
      try {
        const stops = await this.getRouteStops(route.routeId);
        const turn = stops.find((stop) => stop.turnYn === 'Y');
        const target = stops.find((stop) => stop.stationSeq === route.staOrder && stop.stationId === stationId);
        if (turn && target && target.stationSeq > turn.stationSeq) {
          const turnArrival = await this.getTurnaroundArrival(route.routeId, turn).catch(() => {
            this.logger.warn(`경기도 노선 ${route.routeId} 회차점 조회 실패; 이전 차량 위치 확인`);
            return null;
          });
          const targetItem = listed.find((item) => item.staOrder === route.staOrder);
          const knownIds = [1, 2].flatMap((number) => {
            const item = targetItem;
            const eta = readEta(
              item?.[`predictTimeSec${number}` as 'predictTimeSec1' | 'predictTimeSec2'],
              item?.[`predictTime${number}` as 'predictTime1' | 'predictTime2'],
            );
            const id = Number(item?.[`vehId${number}` as 'vehId1' | 'vehId2']);
            return eta !== null && Number.isFinite(id) && id > 0 ? [id] : [];
          });
          const estimated = turnArrival
            ? estimateTurnaroundArrivals(route, stationId, stops, turnArrival, knownIds)
            : [];
          const combined = await this.keepArrivingVehicles(
            route, stationId, stops, turn.stationSeq, target.stationSeq, direct, estimated,
          );
          if (combined.some((arrival) => arrival.etaSeconds !== null)) return combined;
        }
        if (direct.some((arrival) => arrival.etaSeconds !== null)) return direct;
        const vehicles = await this.getRouteVehicles(route.routeId);
        const serviceStatus = findApproachingRouteStatus(stationId, stops, vehicles);
        return serviceStatus ? [{ ...direct[0], serviceStatus }] : direct;
      } catch {
        this.logger.warn(`경기도 노선 ${route.routeId} 회차 예측 조회 실패; 공식 정류장 도착정보 유지`);
        return direct;
      }
    }));
    return arrivalsByRoute.flatMap((items, index) => items.map((item) => ({
      ...item, stationSeq: routes[index]?.staOrder,
    })));
  }

  /** 정류장 경유 노선을 한 시간 동안 재사용한다. */
  async getStationRoutes(stationId: number): Promise<Route[]> {
    const cached = this.routes.get(stationId);
    const routes = cached && cached.expiresAt > Date.now()
      ? cached.value
      : (await this.request<{ busRouteList?: Route[] }>(
          'busstationservice/v2/getBusStationViaRouteListv2', { stationId },
        )).busRouteList ?? [];
    if (!cached || cached.expiresAt <= Date.now()) {
      this.routes.set(stationId, { value: routes, expiresAt: Date.now() + 60 * 60_000 });
    }
    return routes;
  }

  /** 회차점 목록에서 빠진 차량을 ID와 현재 위치로 추적해 ETA 전환의 공백을 메운다. */
  private async keepArrivingVehicles(
    route: Route, stationId: number, stops: RouteStop[], turnSeq: number, targetSeq: number,
    direct: BusArrival[], estimated: BusArrival[],
  ): Promise<BusArrival[]> {
    const routeId = route.routeId;
    const key = `${routeId}:${stationId}:${targetSeq}`;
    const now = Date.now();
    const previous = this.recentTurnaroundPredictions.get(key) ?? new Map();
    const official = direct.filter((arrival) => arrival.etaSeconds !== null);
    const visibleIds = new Set([...official, ...estimated].map((arrival) => arrival.vehicleId).filter(Boolean));
    for (const arrival of official) if (arrival.vehicleId) previous.delete(arrival.vehicleId);
    for (const arrival of estimated) {
      if (arrival.vehicleId && arrival.etaSeconds !== null) {
        previous.set(arrival.vehicleId, { arrival, dueAt: now + arrival.etaSeconds * 1000, seenAt: now });
      }
    }

    const missing = [...previous.entries()].filter(([id, value]) =>
      !visibleIds.has(id) && now - value.seenAt <= 3 * 60_000 && value.dueAt > now,
    );
    const retained: BusArrival[] = [];
    const located: BusArrival[] = [];
    let locations: RouteVehicle[] = [];
    try {
      locations = await this.getLiveRouteVehicles(routeId);
    } catch {
      this.logger.warn(`경기도 노선 ${routeId} 차량 위치조회 실패; 현재 도착정보 유지`);
    }
    if (locations.length) {
      for (const [id, value] of missing) {
        const vehicle = locations.find((item) => String(item.vehId) === id);
        if (!vehicle || vehicle.stationSeq >= targetSeq) {
          previous.delete(id);
          continue;
        }
        retained.push({ ...value.arrival,
          etaSeconds: Math.ceil((value.dueAt - now) / 1000),
          remainingStops: targetSeq - vehicle.stationSeq,
        });
      }
      const represented = new Set([...official, ...estimated, ...retained]
        .map((arrival) => arrival.vehicleId).filter(Boolean));
      const ordered = [...stops].sort((left, right) => left.stationSeq - right.stationSeq);
      const targetIndex = ordered.findIndex((stop) => stop.stationSeq === targetSeq);
      for (const vehicle of locations) {
        if (vehicle.stationSeq < turnSeq || vehicle.stationSeq >= targetSeq
          || represented.has(String(vehicle.vehId))) continue;
        const currentIndex = ordered.findIndex((stop) => stop.stationSeq === vehicle.stationSeq);
        if (currentIndex < 0 || targetIndex <= currentIndex) continue;
        const travelSeconds = estimateRouteTravelSeconds(ordered, currentIndex, targetIndex);
        if (travelSeconds === null) continue;
        located.push({
          routeId: String(routeId), busNumber: String(route.routeName),
          routeType: route.routeTypeName ?? '', vehicleType: '',
          vehicleId: String(vehicle.vehId), etaSeconds: travelSeconds,
          remainingStops: targetSeq - vehicle.stationSeq,
          etaSource: 'turnaround_estimate',
        });
      }
    }
    for (const [id, value] of previous) {
      if (now - value.seenAt > 3 * 60_000 || value.dueAt <= now) previous.delete(id);
    }
    if (previous.size) this.recentTurnaroundPredictions.set(key, previous);
    else this.recentTurnaroundPredictions.delete(key);
    return [...official, ...estimated, ...retained, ...located]
      .sort((left, right) => left.etaSeconds! - right.etaSeconds!).slice(0, 2);
  }

  /** 전환 공백에 있는 차량만 최신 위치로 확인한다. */
  private getLiveRouteVehicles(routeId: number): Promise<RouteVehicle[]> {
    return this.getTrackingData(
      `live:${routeId}`, routeId, this.liveRouteVehicles, 10_000,
      async () => (await this.request<{ busLocationList?: RouteVehicle[] }>(
        'buslocationservice/v2/getBusLocationListv2', { routeId },
      )).busLocationList ?? [],
    );
  }

  /** 같은 노선의 회차점 조회를 10초 동안 공유해 정류장별 중복 요청을 줄인다. */
  private getTurnaroundArrival(routeId: number, turn: RouteStop): Promise<Arrival | null> {
    const cached = this.turnaroundItems.get(routeId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    const pending = this.turnaroundRequests.get(routeId);
    if (pending) return pending;
    const request = this.request<{ busArrivalItem?: Arrival }>(
      'busarrivalservice/v2/getBusArrivalItemv2',
      { stationId: turn.stationId, routeId, staOrder: turn.stationSeq },
    ).then((body) => {
      const item = body.busArrivalItem;
      const value = item?.routeId === routeId && item.staOrder === turn.stationSeq ? item : null;
      this.turnaroundItems.set(routeId, { value, expiresAt: Date.now() + 10_000 });
      return value;
    }).finally(() => this.turnaroundRequests.delete(routeId));
    this.turnaroundRequests.set(routeId, request);
    return request;
  }

  /** 노선의 정류장 순서는 정적 정보이므로 하루 동안 공유한다. */
  getRouteStops(routeId: number): Promise<RouteStop[]> {
    return this.getTrackingData(
      `stops:${routeId}`, routeId, this.routeStops, 24 * 60 * 60_000,
      async () => (await this.request<{ busRouteStationList?: RouteStop[] }>(
        'busrouteservice/v2/getBusRouteStationListv2', { routeId },
      )).busRouteStationList ?? [],
    );
  }

  /** 공식 노선형상은 정류장 직선 연결 대신 도로를 따르는 좌표로 제공한다. */
  getRouteLine(routeId: number): Promise<RouteLinePoint[]> {
    return this.getTrackingData(
      `line:${routeId}`, routeId, this.routeLines, 24 * 60 * 60_000,
      async () => (await this.request<{ busRouteLineList?: RouteLinePoint[] }>(
        'busrouteservice/v2/getBusRouteLineListv2', { routeId },
      )).busRouteLineList ?? [],
    );
  }

  /** 경기도 공식 차량위치 응답에는 GPS가 아닌 경유 정류장 순번이 있다. */
  getRouteVehiclePositions(routeId: number): Promise<RouteVehicle[]> {
    return this.getLiveRouteVehicles(routeId);
  }

  /** 위치는 ETA가 없는 노선에만 조회하고 5분간 재사용해 할당량을 보호한다. */
  private getRouteVehicles(routeId: number): Promise<RouteVehicle[]> {
    return this.getTrackingData(
      `vehicles:${routeId}`, routeId, this.routeVehicles, 5 * 60_000,
      async () => (await this.request<{ busLocationList?: RouteVehicle[] }>(
        'buslocationservice/v2/getBusLocationListv2', { routeId },
      )).busLocationList ?? [],
    );
  }

  /** 동일 노선을 여러 정류장에서 동시에 보면 외부 요청을 하나로 합친다. */
  private getTrackingData<T extends RouteStop[] | RouteVehicle[] | RouteLinePoint[]>(
    key: string, routeId: number, cache: Map<number, { value: T; expiresAt: number }>,
    ttl: number, load: () => Promise<T>,
  ): Promise<T> {
    const cached = cache.get(routeId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    const pending = this.trackingRequests.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const request = load()
      .then((value) => {
        cache.set(routeId, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => this.trackingRequests.delete(key));
    this.trackingRequests.set(key, request);
    return request;
  }

  /** 외부 인증키가 오류 메시지에 섞이지 않도록 요청 실패를 정리한다. */
  private async request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`https://apis.data.go.kr/6410000/${path}`);
    url.searchParams.set('serviceKey', decodeURIComponent(this.config.getOrThrow('PUBLIC_DATA_SERVICE_KEY')));
    url.searchParams.set('format', 'json');
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new BadGatewayException('경기도 버스 API에 연결하지 못했습니다.');
    }
    if (!response.ok) throw new BadGatewayException(`경기도 버스 API HTTP ${response.status}`);
    const data = await response.json() as GyeonggiResponse<T>;
    if (data.response?.msgHeader?.resultCode === 4) return {} as T;
    if (data.response?.msgHeader?.resultCode !== 0) {
      throw new BadGatewayException(`경기도 버스 API 오류: ${data.response?.msgHeader?.resultMessage ?? '응답 형식 오류'}`);
    }
    const body = (data.response.msgBody ?? {}) as Record<string, unknown>;
    // 공공 API는 결과가 한 건이면 목록 필드에도 단일 객체를 반환한다.
    for (const key of ['busStationList', 'busRouteList', 'busArrivalList', 'busRouteStationList', 'busRouteLineList', 'busLocationList']) {
      if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) body[key] = [body[key]];
    }
    return body as T;
  }
}

/** 회차 전 차량은 ETA를 만들지 않고 운행 상태로만 분류한다. */
export function findApproachingRouteStatus(
  stationId: number, stops: RouteStop[], vehicles: RouteVehicle[],
): BusArrival['serviceStatus'] {
  const target = stops.find((stop) => stop.stationId === stationId);
  if (!target) return undefined;
  const turnSeq = stops.find((stop) => stop.turnYn === 'Y')?.stationSeq;
  const approaching = vehicles
    .filter((vehicle) => Number.isFinite(vehicle.vehId) && Number.isFinite(vehicle.stationSeq))
    .filter((vehicle) => vehicle.stationSeq < target.stationSeq)
    .sort((left, right) => right.stationSeq - left.stationSeq)[0];
  if (!approaching) return undefined;
  return turnSeq !== undefined && target.stationSeq > turnSeq && approaching.stationSeq < turnSeq
    ? 'before_turnaround'
    : 'on_route';
}

/** 목록에 없는 차량은 ETA 없이 남기고, 두 번째 차량까지 각 노선에 붙인다. */
export function parseGyeonggiArrivals(routes: Route[], arrivals: Arrival[]): BusArrival[] {
  return routes.flatMap((route) => {
    const arrival = arrivals.find((item) => item.routeId === route.routeId
      && (route.staOrder === undefined || item.staOrder === route.staOrder));
    const base = {
      routeId: String(route.routeId),
      stationSeq: route.staOrder,
      busNumber: String(route.routeName),
      routeType: route.routeTypeName ?? '',
      vehicleType: '',
    };
    const first = readEta(arrival?.predictTimeSec1, arrival?.predictTime1);
    const second = readEta(arrival?.predictTimeSec2, arrival?.predictTime2);
    const vehicles: BusArrival[] = [];
    if (first !== null) {
      vehicles.push({ ...base, etaSeconds: first, remainingStops: Number(arrival?.locationNo1) || 0,
        ...(Number(arrival?.vehId1) > 0 ? { vehicleId: String(arrival?.vehId1) } : {}),
        ...(readEta(arrival?.predictTimeSec1, undefined) === null ? { etaPrecision: 'minutes' as const } : {}),
      });
    }
    if (second !== null) {
      vehicles.push({ ...base, etaSeconds: second, remainingStops: Number(arrival?.locationNo2) || 0,
        ...(Number(arrival?.vehId2) > 0 ? { vehicleId: String(arrival?.vehId2) } : {}),
        ...(readEta(arrival?.predictTimeSec2, undefined) === null ? { etaPrecision: 'minutes' as const } : {}),
      });
    }
    return vehicles.length ? vehicles : [{
      ...base,
      etaSeconds: null,
      remainingStops: null,
      ...(arrival?.flag === 'WAIT' ? { serviceStatus: 'turnaround_waiting' as const } : {}),
    }];
  });
}

/** 회차점까지의 공식 ETA에 회차 후 경로의 예상 이동시간을 더한다. */
export function estimateTurnaroundArrivals(
  route: Route, stationId: number, stops: RouteStop[], turnArrival: Arrival,
  knownVehicleIds: number[],
): BusArrival[] {
  const ordered = [...stops].sort((left, right) => left.stationSeq - right.stationSeq);
  const turnIndex = ordered.findIndex((stop) => stop.turnYn === 'Y');
  const targetIndex = ordered.findIndex((stop) => stop.stationId === stationId
    && stop.stationSeq === route.staOrder);
  if (turnIndex < 0 || targetIndex <= turnIndex || turnArrival.staOrder !== ordered[turnIndex].stationSeq
    || turnArrival.flag === 'WAIT' || turnArrival.flag === 'STOP') return [];

  const travelSeconds = estimateRouteTravelSeconds(ordered, turnIndex, targetIndex);
  if (travelSeconds === null) return [];
  const candidates = [1, 2].flatMap((number) => {
    const vehicleId = Number(turnArrival[`vehId${number}` as 'vehId1' | 'vehId2']);
    const etaSeconds = readEta(
      turnArrival[`predictTimeSec${number}` as 'predictTimeSec1' | 'predictTimeSec2'],
      turnArrival[`predictTime${number}` as 'predictTime1' | 'predictTime2'],
    );
    if (!Number.isFinite(vehicleId) || vehicleId <= 0 || knownVehicleIds.includes(vehicleId) || etaSeconds === null) return [];
    const remainingToTurn = Number(turnArrival[`locationNo${number}` as 'locationNo1' | 'locationNo2']);
    return [{
      routeId: String(route.routeId),
      busNumber: String(route.routeName),
      routeType: route.routeTypeName ?? '',
      vehicleType: '',
      vehicleId: String(vehicleId),
      etaSeconds: etaSeconds + travelSeconds,
      remainingStops: Number.isFinite(remainingToTurn) && remainingToTurn > 0
        ? remainingToTurn + targetIndex - turnIndex : null,
      etaSource: 'turnaround_estimate' as const,
    }];
  });
  return candidates.sort((left, right) => left.etaSeconds - right.etaSeconds).slice(0, 2);
}

/** 회차 후 현재 정류장부터 목표 정류장까지 좌표 기반 이동시간을 추정한다. */
function estimateRouteTravelSeconds(stops: RouteStop[], fromIndex: number, targetIndex: number): number | null {
  let distanceMeters = 0;
  for (let index = fromIndex; index < targetIndex; index++) {
    const from = stops[index];
    const to = stops[index + 1];
    if (![from.x, from.y, to.x, to.y].every((value) => Number.isFinite(value))) return null;
    const latitudeRadians = (from.y! + to.y!) * Math.PI / 360;
    const north = (to.y! - from.y!) * 111_320;
    const east = (to.x! - from.x!) * 111_320 * Math.cos(latitudeRadians);
    distanceMeters += Math.hypot(north, east);
  }
  // 첫 단계의 보수적 이동 모델: 평균 18km/h, 중간 정류장당 18초, 회차 45초.
  // 실제 차량 통과 기록이 쌓이면 이 구간 시간을 관측값으로 대체한다.
  return Math.ceil((distanceMeters / 5 + (targetIndex - fromIndex - 1) * 18
    + (stops[fromIndex].turnYn === 'Y' ? 45 : 0)) / 30) * 30;
}

/** 초 정보가 누락된 응답은 공식 분 값을 환산하고, 빈 값은 도착으로 오인하지 않는다. */
function readEta(seconds: number | string | undefined, minutes: number | string | undefined): number | null {
  for (const [value, multiplier] of [[seconds, 1], [minutes, 60]] as const) {
    if (value == null || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return Math.floor(number * multiplier);
  }
  return null;
}
