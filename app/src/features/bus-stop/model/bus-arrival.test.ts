import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatEta,
  formatRemainingStops,
  groupBusArrivals,
} from './bus-arrival.ts';

test('도착까지 1분 이하면 곧 도착으로 표시한다', () => {
  assert.equal(formatEta(60), '곧 도착');
});

test('회차 대기 차량에는 추측한 도착시간 대신 상태를 표시한다', () => {
  assert.equal(formatEta(null, 'turnaround_waiting'), '회차지 대기 중');
});

test('회차 전 차량은 분 단위 ETA를 만들지 않고 운행 상태를 표시한다', () => {
  assert.equal(formatEta(null, 'before_turnaround'), '운행정보 확인 중');
});

test('차량이 아직 공급자에 나타나지 않아도 노선을 숨기지 않고 확인 중으로 표시한다', () => {
  assert.equal(formatEta(null), '운행정보 확인 중');
});

test('10분 이하는 초까지, 초과하면 올림한 분으로 표시한다', () => {
  assert.equal(formatEta(156), '2분 36초');
  assert.equal(formatEta(600), '10분 0초');
  assert.equal(formatEta(730), '13분');
  assert.equal(formatEta(480, undefined, 'minutes'), '약 8분');
});

test('회차 전 차량은 추정 출처와 분·초를 함께 표시한다', () => {
  assert.equal(formatEta(793, undefined, undefined, 'turnaround_estimate'), '예상 13분 13초');
  assert.equal(formatEta(50, undefined, undefined, 'turnaround_estimate'), '예상 0분 50초');
});

test('남은 정류장 수를 정류장 문구로 표시한다', () => {
  assert.equal(formatRemainingStops(3), '3정류장 전');
});

test('같은 노선의 가까운 버스 두 대를 하나로 묶는다', () => {
  const groups = groupBusArrivals([
    {
      routeId: 'route-52',
      busNumber: '52',
      routeType: '일반버스',
      etaSeconds: 659,
      remainingStops: 9,
      vehicleType: '저상버스',
    },
    {
      routeId: 'route-52',
      busNumber: '52',
      routeType: '일반버스',
      etaSeconds: 194,
      remainingStops: 3,
      vehicleType: '저상버스',
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.first.etaSeconds, 194);
  assert.equal(groups[0]?.second?.etaSeconds, 659);
});

test('같은 노선이 왕복으로 지나는 정류장은 경유 순번별로 구별한다', () => {
  const groups = groupBusArrivals([
    { routeId: '52', stationSeq: 12, busNumber: '52', routeType: '일반버스', etaSeconds: 300, remainingStops: 3, vehicleType: '' },
    { routeId: '52', stationSeq: 43, busNumber: '52', routeType: '일반버스', etaSeconds: 900, remainingStops: 9, vehicleType: '' },
  ]);

  assert.deepEqual(groups.map((group) => group.stationSeq), [12, 43]);
});

test('도착 예정이 없는 노선은 운행 중인 노선 뒤에 남긴다', () => {
  const groups = groupBusArrivals([
    { routeId: '12', busNumber: '12', routeType: '일반버스', etaSeconds: null, remainingStops: null, vehicleType: '' },
    { routeId: '52', busNumber: '52', routeType: '일반버스', etaSeconds: 59, remainingStops: 1, vehicleType: '' },
  ]);

  assert.deepEqual(groups.map((group) => group.busNumber), ['52', '12']);
  assert.equal(groups[1]?.first.etaSeconds, null);
});
