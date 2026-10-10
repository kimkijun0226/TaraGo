import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ArrivalRouterService } from '../bus/arrivals/arrival-router.service';
import { validateAlert, type AlertInput } from './alert-rules';

export type SavedAlert = AlertInput & {
  id: string; busNumber: string;
  stop: { id: string; name: string; arsId: string | null; latitude: number; longitude: number };
};
export type ActiveAlert = SavedAlert & { pushToken: string };

/** 계정 대신 기기별 무작위 bearer 자격 증명으로 자신의 알림만 관리한다. */
@Injectable()
export class AlertsService {
  constructor(private readonly db: DatabaseService, private readonly arrivals: ArrivalRouterService) {}

  async registerDevice() {
    const credential = randomBytes(32).toString('hex');
    await this.db.query('INSERT INTO alert_devices(credential_hash) VALUES($1)', [this.hash(credential)]);
    return { credential };
  }

  async authenticate(header: string | undefined): Promise<string> {
    const credential = header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!credential) throw new UnauthorizedException();
    const result = await this.db.query<{id: string}>('SELECT id FROM alert_devices WHERE credential_hash=$1', [this.hash(credential)]);
    if (!result.rows[0]) throw new UnauthorizedException();
    return result.rows[0].id;
  }

  async pushStatus(deviceId: string) {
    const result = await this.db.query<{ready:boolean;error:string|null}>('SELECT push_token IS NOT NULL AND push_error IS NULL AS ready, push_error AS error FROM alert_devices WHERE id=$1',[deviceId]);
    return { ready: result.rows[0]?.ready ?? false, error:result.rows[0]?.error ?? null };
  }

  async setPushToken(deviceId: string, token: unknown) {
    if (typeof token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,200}\]$/.test(token)) {
      throw new BadRequestException('푸시 토큰이 올바르지 않습니다.');
    }
    await this.db.query('UPDATE alert_devices SET push_token=$1,push_error=NULL WHERE id=$2', [token, deviceId]);
    return { ready: true };
  }

  async list(deviceId: string): Promise<SavedAlert[]> {
    const result = await this.db.query<{id: string; settings: SavedAlert}>('SELECT id, settings FROM bus_alerts WHERE device_id=$1 ORDER BY created_at DESC', [deviceId]);
    return result.rows.map(row => ({ ...row.settings, id: row.id }));
  }

  async save(deviceId: string, body: unknown, id?: string): Promise<SavedAlert> {
    const input = validateAlert(body);
    const count = await this.db.query<{count: string}>('SELECT count(*) FROM bus_alerts WHERE device_id=$1', [deviceId]);
    if (!id && Number(count.rows[0].count) >= 20) throw new BadRequestException('기기당 최대 20개의 알림을 설정할 수 있어요.');
    const station = await this.db.query<{ name: string; ars_id: string | null; latitude: number; longitude: number }>(
      'SELECT name, ars_id, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude FROM bus_stations WHERE id=$1', [input.stationId]);
    const row = station.rows[0];
    if (!row) throw new NotFoundException('정류장을 찾을 수 없습니다.');
    const existing = id ? (await this.list(deviceId)).find(a => a.id === id) : undefined;
    if (id && !existing) throw new NotFoundException('알림을 찾을 수 없습니다.');
    const unchangedRoute = existing?.stationId === input.stationId && existing.routeId === input.routeId && existing.stationSeq === input.stationSeq;
    const route = unchangedRoute ? existing : (await this.arrivals.getArrivals(input.stationId)).find(
      a => a.routeId === input.routeId && (input.stationSeq === undefined || a.stationSeq === input.stationSeq));
    if (!route) throw new BadRequestException('이 정류장을 지나는 노선을 다시 선택해주세요.');
    const settings = { ...input, scheduledEnabled: input.scheduledEnabled ?? true, busNumber: route.busNumber,
      stop: { id: input.stationId, name: row.name, arsId: row.ars_id, latitude: Number(row.latitude), longitude: Number(row.longitude) } };
    const result = id
      ? await this.db.query<{id: string}>('UPDATE bus_alerts SET settings=$1, updated_at=now() WHERE id=$2 AND device_id=$3 RETURNING id', [settings, id, deviceId])
      : await this.db.query<{id: string}>('INSERT INTO bus_alerts(device_id,station_id,settings) VALUES($1,$2,$3) RETURNING id', [deviceId,input.stationId,settings]);
    if (!result.rows[0]) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return { ...settings, id: result.rows[0].id };
  }

  async remove(deviceId: string, id: string) {
    await this.db.query('DELETE FROM bus_alerts WHERE id=$1 AND device_id=$2', [id,deviceId]);
    return { removed: true };
  }

  private hash(credential: string) { return createHash('sha256').update(credential).digest('hex'); }
}
