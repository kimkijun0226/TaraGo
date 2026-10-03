import type { Coordinate } from '@/hooks/use-current-location';

const EARTH_RADIUS_METERS = 6_378_137;
const BUS_STOP_MIN_ZOOM = 15;

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type BusStopTile = {
  tileX: number;
  tileY: number;
  center: Coordinate;
  sizeMeters: number;
  radiusMeters: number;
};

export function getBusStopTile(
  latitude: number,
  longitude: number,
  sizeMeters = 200,
  radiusMeters = 250,
): BusStopTile {
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const mercatorX = EARTH_RADIUS_METERS * longitudeRadians;
  const mercatorY =
    EARTH_RADIUS_METERS *
    Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
  const tileX = Math.floor(mercatorX / sizeMeters);
  const tileY = Math.floor(mercatorY / sizeMeters);
  return getBusStopTileFromIndex(
    tileX,
    tileY,
    sizeMeters,
    radiusMeters,
  );
}

export function getBusStopTilesForRegion(
  region: MapRegion,
  sizeMeters = 200,
  radiusMeters = 250,
): BusStopTile[] {
  const southWest = getBusStopTile(
    region.latitude,
    region.longitude,
    sizeMeters,
    radiusMeters,
  );
  const northEast = getBusStopTile(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
    sizeMeters,
    radiusMeters,
  );
  const tiles: BusStopTile[] = [];

  for (let tileX = southWest.tileX; tileX <= northEast.tileX; tileX += 1) {
    for (let tileY = southWest.tileY; tileY <= northEast.tileY; tileY += 1) {
      tiles.push(
        getBusStopTileFromIndex(
          tileX,
          tileY,
          sizeMeters,
          radiusMeters,
        ),
      );
    }
  }

  return tiles;
}

export function getVisibleBusStopTiles(
  zoom: number | undefined,
  region: MapRegion,
) {
  if (zoom === undefined || zoom < BUS_STOP_MIN_ZOOM) return [];
  const sizeMeters = zoom < 16 ? 1_000 : zoom < 17 ? 500 : 200;
  const radiusMeters = zoom < 16 ? 750 : zoom < 17 ? 400 : 250;
  // 한 타일 여유를 두어 화면을 움직이는 동안 다음 영역을 미리 받아 둔다.
  const southWest = getBusStopTile(region.latitude, region.longitude, sizeMeters, radiusMeters);
  const northEast = getBusStopTile(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
    sizeMeters,
    radiusMeters,
  );
  const tiles: BusStopTile[] = [];
  for (let tileX = southWest.tileX - 1; tileX <= northEast.tileX + 1; tileX += 1) {
    for (let tileY = southWest.tileY - 1; tileY <= northEast.tileY + 1; tileY += 1) {
      tiles.push(getBusStopTileFromIndex(tileX, tileY, sizeMeters, radiusMeters));
    }
  }
  return tiles;
}

function getBusStopTileFromIndex(
  tileX: number,
  tileY: number,
  sizeMeters: number,
  radiusMeters: number,
): BusStopTile {
  const centerX = (tileX + 0.5) * sizeMeters;
  const centerY = (tileY + 0.5) * sizeMeters;

  return {
    tileX,
    tileY,
    sizeMeters,
    radiusMeters,
    center: {
      longitude: (centerX / EARTH_RADIUS_METERS) * (180 / Math.PI),
      latitude:
        (2 * Math.atan(Math.exp(centerY / EARTH_RADIUS_METERS)) - Math.PI / 2) *
        (180 / Math.PI),
    },
  };
}
