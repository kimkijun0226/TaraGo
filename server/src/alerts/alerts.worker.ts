import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ArrivalRouterService } from '../bus/arrivals/arrival-router.service';
import { activeServiceDate, eligibleArrivals } from './alert-rules';
import type { ActiveAlert, SavedAlert } from './alerts.service';

type PushTicket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };

/** 서버가 시간 감시를 맡고 DB 발송 키로 재시작·다중 프로세스의 중복을 막는다. */
@Injectable()
export class AlertsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly db: DatabaseService, private readonly arrivals: ArrivalRouterService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.db.query<{id:string; settings:SavedAlert; push_token:string}>(
        `SELECT a.id,a.settings,d.push_token FROM bus_alerts a JOIN alert_devices d ON d.id=a.device_id
         WHERE a.settings->>'enabled'='true' AND a.settings->>'scheduledEnabled'='true' AND d.push_token IS NOT NULL AND d.push_error IS NULL`);
      const now = new Date();
      const alerts: ActiveAlert[] = result.rows.map(r => ({ ...r.settings, id:r.id, pushToken:r.push_token }));
      const groups = new Map<string, ActiveAlert[]>();
      for (const alert of alerts) {
        if (!activeServiceDate(alert,now)) continue;
        groups.set(alert.stationId,[...(groups.get(alert.stationId) ?? []),alert]);
      }
      for (const [stationId, group] of groups) {
        try {
          const arrivals = await this.arrivals.getArrivals(stationId);
          for (const alert of group) {
            const date = activeServiceDate(alert,new Date());
            if (!date) continue;
            for (const arrival of eligibleArrivals(alert,arrivals)) {
              // ponytail: 차량 ID 없는 공급자는 감시일·노선당 한 번, 운행 ID 제공 시 확장한다.
              const key = `${date}:${alert.startTime}:${alert.endTime}:${alert.thresholdMinutes}:${arrival.vehicleId ?? 'unknown'}`;
              const {id: alertId, pushToken, ...snapshot} = alert;
              const claim = await this.db.query(
                `INSERT INTO alert_deliveries(alert_id,delivery_key)
                 SELECT $1,$2 FROM bus_alerts a JOIN alert_devices d ON d.id=a.device_id
                 WHERE a.id=$1 AND a.settings=$4::jsonb AND a.settings->>'enabled'='true'
                 AND d.push_token=$3 AND d.push_error IS NULL
                 ON CONFLICT(alert_id,delivery_key) DO UPDATE SET status='pending',attempts=alert_deliveries.attempts+1,updated_at=now()
                 WHERE alert_deliveries.status IN ('pending','retry') AND alert_deliveries.attempts<3
                 AND alert_deliveries.updated_at<now()-interval '2 minutes' RETURNING alert_id`,[alertId,key,pushToken,JSON.stringify(snapshot)]);
              if (!claim.rowCount) continue;
              try {
                const eta = Math.max(1,Math.ceil(arrival.etaSeconds! / 60));
                const response = await fetch('https://exp.host/--/api/v2/push/send', {
                  method:'POST',headers:{'Content-Type':'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`} : {})},
                  body:JSON.stringify({to:alert.pushToken,title:`${alert.busNumber}번 버스 도착 알림`,
                    body:`${alert.stop.name} · ${arrival.etaSource ? '예상 ' : ''}${eta}분 후 도착`,sound:'default',channelId:'bus-arrivals',ttl:120,
                    data:{alertId:alert.id,stationId:alert.stationId}}),signal:AbortSignal.timeout(10_000),
                });
                if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
                const body = await response.json() as { data?:PushTicket; errors?:unknown[] };
                const ticket = body.data;
                if (!ticket || ticket.status !== 'ok' || !ticket.id) {
                  if (ticket?.details?.error === 'DeviceNotRegistered') {
                    await this.db.query('UPDATE alert_devices SET push_token=NULL WHERE push_token=$1',[alert.pushToken]);
                    await this.db.query("UPDATE alert_deliveries SET status='error',updated_at=now() WHERE alert_id=$1 AND delivery_key=$2",[alert.id,key]);
                    continue;
                  }
                  if (ticket?.details?.error === 'InvalidCredentials') {
                    await this.db.query('UPDATE alert_devices SET push_error=$2 WHERE push_token=$1',[alert.pushToken,'InvalidCredentials']);
                    await this.db.query("UPDATE alert_deliveries SET status='error',updated_at=now() WHERE alert_id=$1 AND delivery_key=$2",[alert.id,key]);
                    continue;
                  }
                  throw new Error(`Expo push ${ticket?.details?.error ?? 'invalid ticket'}`);
                }
                await this.db.query("UPDATE alert_deliveries SET status='sent',ticket_id=$3,push_token=$4,updated_at=now() WHERE alert_id=$1 AND delivery_key=$2",[alert.id,key,ticket.id,alert.pushToken]);
              } catch (error) {
                this.logger.warn(`푸시 발송 실패: ${error instanceof Error ? error.message : 'unknown error'}`);
                await this.db.query("UPDATE alert_deliveries SET status='retry',updated_at=now() WHERE alert_id=$1 AND delivery_key=$2",[alert.id,key]);
              }
            }
          }
        } catch (error) { this.logger.warn(`정류장 감시 실패 (${stationId}): ${error instanceof Error ? error.message : 'unknown error'}`); }
      }
      await this.checkReceipts();
    } catch (error) { this.logger.error(`알림 감시 실패: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { this.running = false; }
  }

  private async checkReceipts() {
    const result = await this.db.query<{alert_id:string;delivery_key:string;ticket_id:string;device_id:string;push_token:string}>(
      `SELECT x.alert_id,x.delivery_key,x.ticket_id,a.device_id,x.push_token FROM alert_deliveries x JOIN bus_alerts a ON a.id=x.alert_id
       WHERE x.status='sent' AND x.updated_at<now()-interval '15 minutes' LIMIT 100`);
    if (!result.rows.length) return;
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method:'POST',headers:{'Content-Type':'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`} : {})},
      body:JSON.stringify({ids:result.rows.map(r => r.ticket_id)}),signal:AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Expo receipts HTTP ${response.status}`);
    const body = await response.json() as {data?:Record<string,PushTicket>};
    for (const row of result.rows) {
      const receipt = body.data?.[row.ticket_id];
      if (!receipt) continue;
      await this.db.query('UPDATE alert_deliveries SET status=$3,updated_at=now() WHERE alert_id=$1 AND delivery_key=$2',
        [row.alert_id,row.delivery_key,receipt.status === 'ok' ? 'delivered' : 'error']);
      if (receipt.status === 'error') {
        this.logger.warn(`푸시 전달 실패: ${receipt.details?.error ?? 'unknown'}`);
        if (receipt.details?.error === 'InvalidCredentials') await this.db.query('UPDATE alert_devices SET push_error=$3 WHERE id=$1 AND push_token=$2',[row.device_id,row.push_token,'InvalidCredentials']);
        if (receipt.details?.error === 'DeviceNotRegistered') await this.db.query('UPDATE alert_devices SET push_token=NULL WHERE id=$1 AND push_token=$2',[row.device_id,row.push_token]);
      }
    }
    await this.db.query("DELETE FROM alert_deliveries WHERE updated_at<now()-interval '7 days'");
  }
}
