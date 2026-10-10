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

test('선택 정류소는 중간 크기·전체 크기 목록의 중앙으로 오고 양 끝에서는 범위를 넘지 않는다', () => {
  assert.equal(presentation.getSelectedStopScrollOffset(1000, 100, 300, 3000), 900);
  assert.equal(presentation.getSelectedStopScrollOffset(1000, 100, 600, 3000), 750);
  assert.equal(presentation.getSelectedStopScrollOffset(0, 100, 300, 3000), 0);
  assert.equal(presentation.getSelectedStopScrollOffset(2900, 100, 300, 3000), 2700);
  assert.equal(presentation.getSelectedStopScrollOffset(0, 100, 300, 100), 0);
});

test('다른 활성화 정류소를 선택해도 현재 보고 있는 왕복 구간의 순번을 사용한다', () => {
  const stops = [{ stationId: 'a', stationSeq: 5 }, { stationId: 'a', stationSeq: 45 }, { stationId: 'b', stationSeq: 30 }];
  assert.equal(presentation.getRouteStopOccurrence(stops, 'a', 10)?.stationSeq, 5);
  assert.equal(presentation.getRouteStopOccurrence(stops, 'a', 40)?.stationSeq, 45);
  assert.equal(presentation.getRouteStopOccurrence(stops, 'b', 40)?.stationSeq, 30);
  assert.equal(presentation.getRouteStopOccurrence(stops, 'missing', 40), undefined);
  assert.equal(stops[0].stationSeq, 5);
});

test('공공 API 정류소 번호의 앞뒤 공백과 임시 번호는 활성화 정류소 연결을 막지 않는다', () => {
  const marker = { arsId: '11071', latitude: 37.4875, longitude: 126.814 };
  assert.equal(presentation.isRouteBusStop(marker, [{ mobileNo: ' 11071 ', latitude: 37.48752, longitude: 126.81402 }]), true);
  assert.equal(presentation.isRouteBusStop({ ...marker, arsId: '0' }, [{ mobileNo: '11071', latitude: 37.48752, longitude: 126.81402 }]), true);
  assert.equal(presentation.isRouteBusStop(marker, [{ mobileNo: '11072', latitude: marker.latitude, longitude: marker.longitude }]), false);
});
