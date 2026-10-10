const fs = require('node:fs');
const assert = require('node:assert/strict');
const {Pool} = require('pg');
const {resolve} = require('node:path');
const env=resolve(__dirname,'../.env.local');
if(fs.existsSync(env)) process.loadEnvFile(env);
(async () => {
 const url = new URL(process.env.DATABASE_URL);
 if (!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)) throw new Error('로컬 DB가 아니므로 마이그레이션을 적용하지 않았습니다.');
 const base='http://127.0.0.1:3000';
 async function request(path,method='GET',body,credential) {
  const r = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(credential ? {Authorization:'Bearer '+credential} : {})},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(30000)});
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await request('/alerts')).status,401);
 const a=await request('/alerts/devices','POST'), b=await request('/alerts/devices','POST');
 assert.equal(a.status,201); assert.equal(b.status,201);
 const ca=a.data.credential,cb=b.data.credential;
 try {
 assert.equal((await request('/alerts/devices/status','GET',undefined,ca)).data.ready,false);
 await request('/alerts/devices/push-token','PUT',{token:'ExpoPushToken[tarago-test-only]'},ca);
 assert.equal((await request('/alerts/devices/status','GET',undefined,ca)).data.ready,true);
 const statusPool=new Pool({connectionString:process.env.DATABASE_URL});
 try {
  const {createHash}=require('node:crypto');
  await statusPool.query("UPDATE alert_devices SET push_error='InvalidCredentials' WHERE credential_hash=$1",[createHash('sha256').update(ca).digest('hex')]);
 } finally {await statusPool.end();}
 const invalidStatus=await request('/alerts/devices/status','GET',undefined,ca);
 assert.equal(invalidStatus.data.ready,false);assert.equal(invalidStatus.data.error,'InvalidCredentials');
 await request('/alerts/devices/push-token','PUT',{token:'ExpoPushToken[tarago-test-only]'},ca);
 assert.equal((await request('/alerts/devices/status','GET',undefined,ca)).data.ready,true);
 const stops = await request('/bus/stations/nearby?latitude=37.4886167&longitude=126.8168667&radius=100');
 assert.equal(stops.status,200);
 const stop=stops.data.find(s => s.arsId==='11400') ?? stops.data[0];
 assert.ok(stop);
 const routes = await request('/bus/stations/'+stop.id+'/arrivals');
 assert.equal(routes.status,200);
 const route=routes.data[0];
 assert.ok(route,'노선이 없어 CRUD 검증을 진행할 수 없습니다.');
 const input={stationId:stop.id,routeId:route.routeId,...(route.stationSeq ? {stationSeq:route.stationSeq} : {}),days:[1,2,3,4,5],startTime:'07:00',endTime:'09:00',thresholdMinutes:5,enabled:true,scheduledEnabled:false,proximityEnabled:true,radius:200};
 const created=await request('/alerts','POST',input,ca);
 assert.equal(created.status,201);const id=created.data.id;
 try {
  const mine=await request('/alerts','GET',undefined,ca);assert.ok(mine.data.some(x=>x.id===id));
  const other=await request('/alerts','GET',undefined,cb);assert.ok(!other.data.some(x=>x.id===id));
  assert.equal((await request('/alerts/'+id,'PUT',{...input,thresholdMinutes:3},cb)).status,404);
  assert.equal((await request('/alerts/'+id,'PUT',{...input,startTime:'99:00'},ca)).status,400);
  const updated=await request('/alerts/'+id,'PUT',{...input,enabled:false,thresholdMinutes:3},ca);assert.equal(updated.status,200);assert.equal(updated.data.enabled,false);
  const {AlertsWorker}=require(resolve(__dirname,'../dist/alerts/alerts.worker.js'));
  const workerPool=new Pool({connectionString:process.env.DATABASE_URL});
  const now=new Date(Date.now()+9*60*60*1000);
  const stale={...created.data,enabled:true,scheduledEnabled:true,days:[now.getUTCDay()],startTime:'00:00',endTime:'23:59'};
  const originalFetch=global.fetch;let pushed=0;
  try {
   const database={query:async(sql,args)=>sql.includes('SELECT x.alert_id') ? {rows:[]} : sql.includes('d.push_token FROM') ? {rows:[{id,settings:stale,push_token:'ExpoPushToken[tarago-test-only]'}]} : workerPool.query(sql,args)};
   global.fetch=async () => {pushed++;return new Response(JSON.stringify({data:{status:'ok',id:'test-ticket'}}));};
   const worker=new AlertsWorker(database,{getArrivals:async()=>[{...route,etaSeconds:120}]});
   await worker.tick();assert.equal(pushed,0,'비활성화된 알림은 이전 감시 스냅샷에서 발송되지 않아야 합니다.');
  } finally {global.fetch=originalFetch;await workerPool.end();}
  await request('/alerts/'+id,'DELETE',undefined,cb);assert.ok((await request('/alerts','GET',undefined,ca)).data.some(x=>x.id===id));
 } finally {await request('/alerts/'+id,'DELETE',undefined,ca);}
 assert.ok(!(await request('/alerts','GET',undefined,ca)).data.some(x=>x.id===id));
 } finally {
 const cleanup=new Pool({connectionString:process.env.DATABASE_URL});
 try {const {createHash}=require('node:crypto');for(const c of [ca,cb])await cleanup.query('DELETE FROM alert_devices WHERE credential_hash=$1',[createHash('sha256').update(c).digest('hex')]);}
 finally {await cleanup.end();}
 }
 console.log('HTTP checks passed: unauthorized access, CRUD, invalid input, ownership isolation, push error recovery, stale snapshot suppression, cleanup.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
