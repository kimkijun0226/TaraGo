import type { BusArrival } from '../../bus-stop/api/get-bus-arrivals';
import { formatEta, groupBusArrivals } from '../../bus-stop/model/bus-arrival.ts';

export type AlertStop = { id: string; name: string; arsId?: string | null; latitude: number; longitude: number };
export type BusAlertInput = {
  stationId: string; routeId: string; stationSeq?: number; days: number[];
  startTime: string; endTime: string; thresholdMinutes: number;
  scheduledEnabled: boolean; proximityEnabled: boolean; radius: number; enabled: boolean;
};
export type BusAlert = BusAlertInput & { id: string; stop: AlertStop; busNumber: string };

/** 같은 정류장의 여러 노선은 지오펜스 한 개로 묶어 iOS 20개 제한을 지킨다. */
export function proximityRegions(alerts: Pick<BusAlert, 'stop' | 'enabled' | 'proximityEnabled' | 'radius'>[]) {
  const stops = new Map<string, { identifier: string; latitude: number; longitude: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean }>();
  for (const alert of alerts) {
    if (!alert.enabled || !alert.proximityEnabled) continue;
    const previous = stops.get(alert.stop.id);
    stops.set(alert.stop.id, { identifier: alert.stop.id, latitude: alert.stop.latitude, longitude: alert.stop.longitude,
      radius: Math.max(previous?.radius ?? 0, alert.radius), notifyOnEnter: true, notifyOnExit: true });
  }
  return [...stops.values()];
}

/** 접근 알림은 설정 노선에 한정하지 않고 정류소 전체의 최신 도착 정보를 요약한다. */
export function proximityMessage(arrivals: BusArrival[]) {
  const groups = groupBusArrivals(arrivals);
  if (!groups.length) return '현재 도착정보가 없습니다. 알림을 눌러 다시 확인하세요.';
  const summary = groups.slice(0,8).map(group => `${group.busNumber}번 ${formatEta(group.first.etaSeconds,group.first.serviceStatus,group.first.etaPrecision,group.first.etaSource)}`).join(' · ');
  return summary + (groups.length > 8 ? ` · 외 ${groups.length - 8}개 노선` : '');
}

/** 5분의 재진입 간격은 GPS 경계 흔들림에 의한 반복 알림을 막는다. */
export function shouldNotifyVisit(state:{inside?:boolean;lastSent?:number},now:number) {
  return !state.inside && (state.lastSent === undefined || now-state.lastSent >= 5*60_000);
}
