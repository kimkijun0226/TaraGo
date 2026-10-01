import assert from 'node:assert/strict';
import test from 'node:test';

import { getBusStopTile } from './bus-stop-tile.ts';

test('가까운 좌표는 같은 200m 타일을 사용한다', () => {
  const first = getBusStopTile(37.4883019, 126.8168934);
  const nearby = getBusStopTile(37.4883519, 126.8169434);

  assert.equal(first.tileX, nearby.tileX);
  assert.equal(first.tileY, nearby.tileY);
});

test('200m보다 멀리 이동하면 다른 타일을 사용한다', () => {
  const first = getBusStopTile(37.4883019, 126.8168934);
  const moved = getBusStopTile(37.4913019, 126.8168934);

  assert.notEqual(`${first.tileX}:${first.tileY}`, `${moved.tileX}:${moved.tileY}`);
});

test('음수 좌표도 항상 같은 타일과 중심을 반환한다', () => {
  assert.deepEqual(
    getBusStopTile(-33.8688, -151.2093),
    getBusStopTile(-33.8688, -151.2093),
  );
});
