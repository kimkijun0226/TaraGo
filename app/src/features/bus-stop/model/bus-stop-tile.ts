import type { Coordinate } from '@/hooks/use-current-location';

const EARTH_RADIUS_METERS = 6_378_137;
const BUS_STOP_MIN_ZOOM = 15;

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** 지도 영역을 나눠 서버 응답을 재사용하기 위한 타일의 조회 단위. */
export type BusStopTile = {
  tileX: number;
  tileY: number;
  center: Coordinate;
  sizeMeters: number;
  radiusMeters: number;
};

/**
 * WGS84 좌표를 고정 크기의 Web Mercator 타일 인덱스로 변환한다.
 *
 * 화면 이동 중 좌표가 조금 바뀌어도 같은 타일이면 동일한 Query 키를 쓰기 위한 변환이다.
 * @param latitude 타일에 포함될 위도(도).
 * @param longitude 타일에 포함될 경도(도).
 * @param sizeMeters 타일 한 변의 길이. 기본값 200m.
 * @param radiusMeters 서버에 요청할 타일 중심 반경. 기본값 250m.
 * @returns 타일 인덱스와 서버 조회에 사용할 중심 좌표·반경.
 */
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

/**
 * 지도 영역 안에 걸친 타일을 인덱스 순서대로 계산한다.
 *
 * 입력 region의 위도·경도는 남서쪽 시작점이며 delta는 북동쪽까지의 범위다.
 * @param region 화면의 남서쪽 좌표와 위도·경도 범위.
 * @param sizeMeters 타일 한 변의 길이. 기본값 200m.
 * @param radiusMeters 각 타일 중심에서 조회할 반경. 기본값 250m.
 * @returns 지도 영역을 덮는 중복 없는 타일 목록.
 */
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

/**
 * 현재 줌에서 표시할 정류장 타일과 화면 밖 선조회 타일을 고른다.
 *
 * 줌 15 미만에는 정류장 조회를 중단한다. 멀리 볼수록 큰 타일을 사용해
 * 화면을 덮는 요청 수를 줄이고, 화면 밖 한 타일을 미리 받아 이동 시 공백을 줄인다.
 * @param zoom 네이버 지도 줌. 없거나 15 미만이면 목록은 비어 있다.
 * @param region 현재 화면의 남서쪽 좌표와 범위.
 * @returns 화면과 가장자리 한 타일을 포함한 조회 목록.
 */
export function getVisibleBusStopTiles(
  zoom: number | undefined,
  region: MapRegion,
) {
  if (zoom === undefined || zoom < BUS_STOP_MIN_ZOOM) return [];
  const sizeMeters = zoom < 16 ? 1_000 : zoom < 17 ? 500 : 200;
  const radiusMeters = zoom < 16 ? 750 : zoom < 17 ? 400 : 250;
  /** 화면이 타일 경계를 넘자마자 마커가 사라지지 않도록 가장자리도 조회한다. */
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

/**
 * Web Mercator 타일 중심을 서버가 받는 WGS84 위도·경도로 되돌린다.
 * @param tileX 가로 타일 인덱스.
 * @param tileY 세로 타일 인덱스.
 * @param sizeMeters 타일 한 변의 길이.
 * @param radiusMeters 서버 조회에 사용할 반경.
 * @returns 타일 식별자와 위도·경도 중심 좌표.
 */
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
