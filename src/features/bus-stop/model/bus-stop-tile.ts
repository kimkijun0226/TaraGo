import type { Coordinate } from '@/hooks/use-current-location';

const EARTH_RADIUS_METERS = 6_378_137;
const TILE_SIZE_METERS = 200;

export type BusStopTile = {
  tileX: number;
  tileY: number;
  center: Coordinate;
};

export function getBusStopTile(
  latitude: number,
  longitude: number,
): BusStopTile {
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const mercatorX = EARTH_RADIUS_METERS * longitudeRadians;
  const mercatorY =
    EARTH_RADIUS_METERS *
    Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
  const tileX = Math.floor(mercatorX / TILE_SIZE_METERS);
  const tileY = Math.floor(mercatorY / TILE_SIZE_METERS);
  const centerX = (tileX + 0.5) * TILE_SIZE_METERS;
  const centerY = (tileY + 0.5) * TILE_SIZE_METERS;

  return {
    tileX,
    tileY,
    center: {
      longitude: (centerX / EARTH_RADIUS_METERS) * (180 / Math.PI),
      latitude:
        (2 * Math.atan(Math.exp(centerY / EARTH_RADIUS_METERS)) - Math.PI / 2) *
        (180 / Math.PI),
    },
  };
}
