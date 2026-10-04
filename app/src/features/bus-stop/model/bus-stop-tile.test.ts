import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBusStopTile,
  getBusStopTilesForRegion,
  getVisibleBusStopTiles,
} from './bus-stop-tile.ts';

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

test('보이는 지도 영역을 덮는 여러 타일을 중복 없이 반환한다', () => {
  const tiles = getBusStopTilesForRegion({
    latitude: 37.4883019,
    longitude: 126.8168934,
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  });
  const tileKeys = tiles.map(({ tileX, tileY }) => `${tileX}:${tileY}`);

  assert.ok(tiles.length > 1);
  assert.equal(new Set(tileKeys).size, tiles.length);
  assert.ok(
    tiles.every((tile) => {
      const centerTile = getBusStopTile(
        tile.center.latitude,
        tile.center.longitude,
      );
      return centerTile.tileX === tile.tileX && centerTile.tileY === tile.tileY;
    }),
  );
});

test('줌 레벨 15 미만에서는 정류장 타일을 모두 숨긴다', () => {
  const region = {
    latitude: 37.4883019,
    longitude: 126.8168934,
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  };

  assert.deepEqual(getVisibleBusStopTiles(14.99, region), []);
  assert.ok(getVisibleBusStopTiles(15, region).length > 0);
});

test('줌 레벨 15에서는 큰 타일을 사용해 화면 요청 수를 제한한다', () => {
  const tiles = getVisibleBusStopTiles(15, {
    latitude: 37.4883019,
    longitude: 126.8168934,
    latitudeDelta: 0.02,
    longitudeDelta: 0.012,
  });

  assert.ok(tiles.length <= 25);
  assert.ok(tiles.every((tile) => tile.radiusMeters === 750));
});

test('region 남서쪽부터 북동쪽까지 실제 화면과 한 타일 여유를 덮는다', () => {
  const region = {
    latitude: 37.4883,
    longitude: 126.8169,
    latitudeDelta: 0.003,
    longitudeDelta: 0.004,
  };
  const tiles = getVisibleBusStopTiles(17, region);
  const xs = tiles.map((tile) => tile.tileX);
  const ys = tiles.map((tile) => tile.tileY);
  const southWest = getBusStopTile(region.latitude, region.longitude);
  const northEast = getBusStopTile(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
  );

  assert.equal(Math.min(...xs), southWest.tileX - 1);
  assert.equal(Math.max(...xs), northEast.tileX + 1);
  assert.equal(Math.min(...ys), southWest.tileY - 1);
  assert.equal(Math.max(...ys), northEast.tileY + 1);
});
