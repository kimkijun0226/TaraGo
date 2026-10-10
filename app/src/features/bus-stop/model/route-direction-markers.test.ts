import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteDirectionMarkers, alignRouteToStops, roundRouteTurns } from './route-direction-markers.ts';

const points = [{ latitude: 37.5, longitude: 126.8 }, { latitude: 37.5, longitude: 126.81 }];
test('진행 방향은 노선 순서를 따르고 확대하면 더 촘촘해진다', () => {
  const markers = getRouteDirectionMarkers(points, 16);
  assert.ok(markers.length > 1);
  assert.equal(markers[0].angle, 90);
  assert.equal(getRouteDirectionMarkers([...points].reverse(), 16)[0].angle, 270);
  assert.ok(getRouteDirectionMarkers(points, 18).length > markers.length);
  assert.equal(getRouteDirectionMarkers(points, 15).length, 0);
});
test('보이는 영역 밖 마커와 길이 없는 구간은 표시하지 않는다', () => {
  assert.equal(getRouteDirectionMarkers(points, 16, { latitude: 38, longitude: 127, latitudeDelta: .01, longitudeDelta: .01 }).length, 0);
  assert.equal(getRouteDirectionMarkers([points[0], points[0]], 16).length, 0);
  assert.equal(getRouteDirectionMarkers([], 16).length, 0);
});

test('왕복 노선은 각 진행 방향의 오른쪽으로 분리되고 반대편 정류소로 교차하지 않는다', () => {
  const forward = alignRouteToStops(points, [{ latitude: 37.5001, longitude: 126.805, stationSeq: 1 }]);
  const backward = alignRouteToStops([...points].reverse(), []);
  assert.ok(forward.every((p) => p.latitude < 37.5));
  assert.ok(backward.every((p) => p.latitude > 37.5));
});
test('진행 방향 오른쪽의 정류소를 지나며 잘못된 먼 좌표는 무시한다', () => {
  const stop = { latitude: 37.4999, longitude: 126.805, stationSeq: 1 };
  const result = alignRouteToStops(points, [stop, { latitude: 38, longitude: 127, stationSeq: 2 }]);
  assert.ok(result.some((p) => Math.abs(p.latitude - stop.latitude) < 1e-9 && Math.abs(p.longitude - stop.longitude) < 1e-9));
  assert.ok(result.every((p) => Math.abs(p.latitude - 37.5) < .001));
});
test('좌회전 곡선은 우회전보다 넓게 돌고 모서리에 직접 닿지 않는다', () => {
  const start = { latitude: 37.5, longitude: 126.8 }, corner = { latitude: 37.5, longitude: 126.801 };
  const left = roundRouteTurns([start, corner, { latitude: 37.501, longitude: 126.801 }]);
  const right = roundRouteTurns([start, corner, { latitude: 37.499, longitude: 126.801 }]);
  assert.ok(left[1].longitude < right[1].longitude);
  assert.ok(!left.some((p) => p.latitude === corner.latitude && p.longitude === corner.longitude));
  assert.ok(!right.some((p) => p.latitude === corner.latitude && p.longitude === corner.longitude));
});
test('도로 형상이 없으면 정류소 직선을 대신 만들지 않는다', () => {
  assert.deepEqual(alignRouteToStops([], [{ ...points[0], stationSeq: 1 }]), []);
});

test('우회전 안쪽 선은 뒤로 말리지 않고 동쪽에서 남쪽으로 진행한다', () => {
  const result = alignRouteToStops([
    { latitude: 37.5, longitude: 126.8 },
    { latitude: 37.5, longitude: 126.801 },
    { latitude: 37.499, longitude: 126.801 },
  ], [{ latitude: 37.4999, longitude: 126.8004, stationSeq: 1 }]);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].longitude >= result[i - 1].longitude - 1e-10);
    assert.ok(result[i].latitude <= result[i - 1].latitude + 1e-10);
  }
});
test('직진 교차로의 작은 흔들림은 평행한 직선으로 표시한다', () => {
  const result = alignRouteToStops([
    { latitude: 37.5, longitude: 126.8 },
    { latitude: 37.50002, longitude: 126.8005 },
    { latitude: 37.5, longitude: 126.801 },
    { latitude: 37.5, longitude: 126.802 },
  ], []);
  assert.ok(result.every((p) => Math.abs(p.latitude - result[0].latitude) < 1e-10));
});
