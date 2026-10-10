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
    const arsId = marker.arsId?.trim();
    const mobileNo = stop.mobileNo?.trim();
    if (arsId && mobileNo && arsId !== '0' && mobileNo !== '0') return arsId === mobileNo;
    const north = (marker.latitude - stop.latitude) * 111_320;
    const east = (marker.longitude - stop.longitude) * 111_320 * Math.cos(marker.latitude * Math.PI / 180);
    return north * north + east * east <= 10 * 10;
  });
}

/** 선택 행의 가운데를 목록 가운데에 맞추고 목록 양 끝에서는 범위를 넘지 않는다. */
export function getSelectedStopScrollOffset(rowY: number, rowHeight: number, viewportHeight: number, contentHeight: number) {
  return Math.max(0, Math.min(contentHeight - viewportHeight, rowY + rowHeight / 2 - viewportHeight / 2));
}

/** 같은 정류소를 왕복으로 경유할 때 현재 보고 있던 순번에 가까운 경유를 선택한다. */
export function getRouteStopOccurrence<T extends { stationId: string; stationSeq: number }>(stops: T[], stationId: string, currentSeq: number): T | undefined {
  return stops.filter((stop) => stop.stationId === stationId)
    .sort((a, b) => Math.abs(a.stationSeq - currentSeq) - Math.abs(b.stationSeq - currentSeq))[0];
}
