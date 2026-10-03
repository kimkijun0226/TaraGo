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

test('도착 예정 초를 올림한 분으로 표시한다', () => {
  assert.equal(formatEta(301), '6분');
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
