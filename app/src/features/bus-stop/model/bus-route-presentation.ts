type RouteStopCoordinate = { latitude: number; longitude: number; arsId?: string | null; mobileNo?: string | null };
export type RouteSheetSnap = 'compact' | 'half' | 'full';

/** 노선 시트의 세 높이 사이를 이동한다. */
export function nextRouteSheetSnap(current: RouteSheetSnap, direction: 'up' | 'down'): RouteSheetSnap {
  const order: RouteSheetSnap[] = ['compact', 'half', 'full'];
  const index = order.indexOf(current) + (direction === 'up' ? 1 : -1);
  return order[Math.max(0, Math.min(index, order.length - 1))];
}

/** 공급자 정류장 ID와 앱 UUID가 달라도 같은 실제 위치를 알아본다. */
export function isRouteBusStop(marker: RouteStopCoordinate, routeStops: RouteStopCoordinate[]) {
  return routeStops.some((stop) => {
    if (marker.arsId && stop.mobileNo && marker.arsId !== stop.mobileNo) return false;
    if (marker.arsId && stop.mobileNo && marker.arsId === stop.mobileNo) return true;
    const north = (marker.latitude - stop.latitude) * 111_320;
    const east = (marker.longitude - stop.longitude) * 111_320 * Math.cos(marker.latitude * Math.PI / 180);
    return north * north + east * east <= 10 * 10;
  });
}
