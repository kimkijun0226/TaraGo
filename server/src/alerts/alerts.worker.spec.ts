import { AlertsWorker } from './alerts.worker';
import type { DatabaseService } from '../database/database.service';
import type { ArrivalRouterService } from '../bus/arrivals/arrival-router.service';

/** DB 중복 키와 외부 전송만 대역으로 두고 Worker의 시간·ETA 판정을 실행한다. */
describe('AlertsWorker', () => {
  const settings = { stationId:'stop',routeId:'12',stationSeq:3,days:[1],startTime:'08:00',endTime:'09:00',thresholdMinutes:5,enabled:true,scheduledEnabled:true,proximityEnabled:true,radius:200,busNumber:'12',stop:{id:'stop',name:'역곡',latitude:37,longitude:126} };
  const base = { routeId:'12',stationSeq:3,busNumber:'12',routeType:'일반',remainingStops:2,vehicleType:'',vehicleId:'bus1' };
  let originalFetch:typeof fetch;
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-05T08:30:00+09:00'));originalFetch=global.fetch; });
  afterEach(() => {global.fetch=originalFetch;jest.useRealTimers();});

  function setup() {
    const claimed = new Set<string>();
    const deliveries:{title:string;body:string;data:{alertId:string}}[]=[];
    const db = {query:async (sql:string,args?:unknown[]) => {
      if (sql.includes('d.push_token FROM')) return { rows:[{id:'alert1',settings,push_token:'ExpoPushToken[test]'}] };
      if (sql.includes('RETURNING alert_id')) {const key=String(args?.[1]);if(claimed.has(key))return {rowCount:0,rows:[]};claimed.add(key);return {rowCount:1,rows:[]};}
      return {rowCount:1,rows:[]};
    }} as unknown as DatabaseService;
    let arrivals=[{...base,etaSeconds:120}];
    const provider={getArrivals:async () => arrivals} as unknown as ArrivalRouterService;
    global.fetch=async (_url,options) => {deliveries.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({data:{status:'ok',id:'ticket1'}}),{status:200});};
    return { worker:new AlertsWorker(db,provider),deliveries,setArrivals:(value:typeof arrivals) => {arrivals=value;} };
  }
  it('같은 차량을 반복 조회해도 알림을 한 번만 보내고 실제 정류소·노선·ETA를 담는다',async () => {
    const {worker,deliveries}=setup();await worker.tick();await worker.tick();
    expect(deliveries).toEqual([expect.objectContaining({title:'12번 버스 도착 알림',body:'역곡 · 2분 후 도착',data:{alertId:'alert1',stationId:'stop'}})]);
  });
  it('정보가 없다가 차량이 나타나도 감시를 계속한다',async () => {
    const {worker,deliveries,setArrivals}=setup();setArrivals([]);await worker.tick();expect(deliveries).toHaveLength(0);
    setArrivals([{...base,etaSeconds:60}]);await worker.tick();expect(deliveries).toHaveLength(1);
  });
  it('감시 시간 밖에는 푸시를 발송하지 않는다',async () => {
    const {worker,deliveries}=setup();jest.setSystemTime(new Date('2026-10-05T10:00:00+09:00'));await worker.tick();expect(deliveries).toHaveLength(0);
  });
});
