import assert from 'node:assert/strict';
import test from 'node:test';
import { proximityRegions, proximityMessage, shouldNotifyVisit } from './bus-alert.ts';

const stop = { id: 'stop', name: '역곡', latitude: 37.488, longitude: 126.816 };
test('정류소별 접근 감지는 노선을 합치고 가장 큰 반경을 사용한다', () => {
  const regions = proximityRegions([
    { stop, enabled: true, proximityEnabled: true, radius: 100 },
    { stop, enabled: true, proximityEnabled: true, radius: 200 },
    { stop: { ...stop, id: 'off' }, enabled: false, proximityEnabled: true, radius: 200 },
  ]);
  assert.deepEqual(regions, [{ identifier: 'stop', latitude: 37.488, longitude: 126.816, radius: 200, notifyOnEnter: true, notifyOnExit: true }]);
});
test('접근 알림에는 설정한 노선뿐 아니라 정류소 전체 버스의 최신 ETA가 들어간다', () => {
  assert.equal(proximityMessage([
    { routeId: '12', busNumber: '12', routeType: '일반', etaSeconds: 120, remainingStops: 2, vehicleType: '' },
    { routeId: '52', busNumber: '52', routeType: '일반', etaSeconds: null, remainingStops: null, vehicleType: '' },
  ]), '12번 2분 0초 · 52번 운행정보 확인 중');
});
test('조회된 차량이 없어도 임의 ETA를 만들지 않는다', () => {
  assert.equal(proximityMessage([]), '현재 도착정보가 없습니다. 알림을 눌러 다시 확인하세요.');
});

test('머무르는 동안과 GPS 흔들림으로 5분 안에 재진입할 때는 중복 알림을 막는다', () => {
  const now=1_000_000;
  assert.equal(shouldNotifyVisit({},now),true);
  assert.equal(shouldNotifyVisit({inside:true,lastSent:1},now),false);
  assert.equal(shouldNotifyVisit({inside:false,lastSent:now-60_000},now),false);
  assert.equal(shouldNotifyVisit({inside:false,lastSent:now-300_000},now),true);
});
