import assert from 'node:assert/strict';
import test from 'node:test';

import * as presentation from './bus-route-presentation.ts';

test('시트는 최소·중간·최대 순서로만 이동한다', () => {
  assert.equal(presentation.nextRouteSheetSnap?.('compact', 'up'), 'half');
  assert.equal(presentation.nextRouteSheetSnap?.('half', 'up'), 'full');
  assert.equal(presentation.nextRouteSheetSnap?.('full', 'down'), 'half');
  assert.equal(presentation.nextRouteSheetSnap?.('half', 'down'), 'compact');
});

test('노선 정류장은 서버 UUID가 달라도 실제 좌표로 구분한다', () => {
  const stops = [{ stationId: 'gyeonggi-123', stationSeq: 7, latitude: 37.4883, longitude: 126.8168 }];
  assert.equal(presentation.isRouteBusStop?.({ latitude: 37.48832, longitude: 126.81681 }, stops), true);
  assert.equal(presentation.isRouteBusStop?.({ latitude: 37.4892, longitude: 126.8178 }, stops), false);
});

test('길 건너 정류장 번호가 다르면 가까워도 노선 정류장으로 표시하지 않는다', () => {
  const stops = [{ stationId: 'gyeonggi-123', mobileNo: '11399', stationSeq: 7, latitude: 37.4883, longitude: 126.8168 }];
  assert.equal(presentation.isRouteBusStop?.({ arsId: '11400', latitude: 37.48831, longitude: 126.81681 }, stops), false);
  assert.equal(presentation.isRouteBusStop?.({ arsId: '11399', latitude: 37.48831, longitude: 126.81681 }, stops), true);
});
