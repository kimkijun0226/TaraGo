import { BadRequestException } from '@nestjs/common';
import type { BusArrival } from '../bus/arrivals/arrival-provider';

export type AlertInput = {
  stationId: string; routeId: string; stationSeq?: number; days: number[];
  startTime: string; endTime: string; thresholdMinutes: number;
  enabled: boolean; proximityEnabled: boolean; radius: number;
  scheduledEnabled?: boolean;
};

/** HTTP 입력은 타입 선언과 별개로 시간·요일·노선 범위를 검증한다. */
export function validateAlert(value: unknown): AlertInput {
  if (!value || typeof value !== 'object') throw new BadRequestException('알림 설정이 필요합니다.');
  const v = value as AlertInput;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof v.stationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.stationId)
    || typeof v.routeId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.routeId)
    || (v.stationSeq !== undefined && (!Number.isInteger(v.stationSeq) || v.stationSeq < 1))
    || !Array.isArray(v.days) || v.days.length < 1 || v.days.length > 7 || new Set(v.days).size !== v.days.length
    || v.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)
    || typeof v.startTime !== 'string' || typeof v.endTime !== 'string'
    || !time.test(v.startTime) || !time.test(v.endTime) || v.startTime === v.endTime
    || !Number.isInteger(v.thresholdMinutes) || v.thresholdMinutes < 1 || v.thresholdMinutes > 30
    || typeof v.enabled !== 'boolean' || typeof v.proximityEnabled !== 'boolean'
    || (v.scheduledEnabled !== undefined && typeof v.scheduledEnabled !== 'boolean')
    || ![100, 200, 300].includes(v.radius)) {
    throw new BadRequestException('시간, 요일, 도착 기준 또는 접근 반경을 확인해주세요.');
  }
  return {
    stationId: v.stationId, routeId: v.routeId, ...(v.stationSeq === undefined ? {} : { stationSeq: v.stationSeq }),
    days: [...v.days].sort((a,b) => a-b), startTime: v.startTime, endTime: v.endTime,
    thresholdMinutes: v.thresholdMinutes, enabled: v.enabled, proximityEnabled: v.proximityEnabled,
    radius: v.radius, ...(v.scheduledEnabled === undefined ? {} : { scheduledEnabled: v.scheduledEnabled }),
  };
}

/** 자정 이후의 감시는 시작일의 요일을 따르며 한국 시간으로 고정한다. */
export function activeServiceDate(alert: AlertInput, now: Date): string | null {
  if (!alert.enabled || alert.scheduledEnabled === false) return null;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const clock = kst.toISOString().slice(11,16);
  if (alert.startTime < alert.endTime) {
    if (clock < alert.startTime || clock >= alert.endTime) return null;
  } else {
    if (clock >= alert.endTime && clock < alert.startTime) return null;
    if (clock < alert.endTime) kst.setUTCDate(kst.getUTCDate()-1);
  }
  return alert.days.includes(kst.getUTCDay()) ? kst.toISOString().slice(0,10) : null;
}

/** 노선의 왕복 경유 순번을 구별하고 ETA 없는 차량은 계속 감시한다. */
export function eligibleArrivals(alert: AlertInput, arrivals: BusArrival[]): BusArrival[] {
  if (!alert.enabled) return [];
  return arrivals.filter(a => a.routeId === alert.routeId
    && (alert.stationSeq === undefined || a.stationSeq === alert.stationSeq)
    && a.etaSeconds !== null && Number.isFinite(a.etaSeconds) && a.etaSeconds >= 0
    && a.etaSeconds <= alert.thresholdMinutes * 60);
}
