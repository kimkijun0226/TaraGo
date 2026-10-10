type Coordinate = { latitude: number; longitude: number };
type Region = Coordinate & { latitudeDelta: number; longitudeDelta: number };

/** 화면 간격으로 방향 마커를 배치해 선 두께와 무관하게 삼각형 크기를 유지한다. */
export function getRouteDirectionMarkers(points: Coordinate[], zoom: number, region?: Region) {
  const markers: (Coordinate & { angle: number; id: number })[] = [];
  if (zoom < 16 || !Number.isFinite(zoom)) return markers;
  const latitude = region ? region.latitude + region.latitudeDelta / 2 : points[0]?.latitude ?? 0;
  const eastScale = 111_320 * Math.cos(latitude * Math.PI / 180);
  const spacing = 56 * 156543.03392 * Math.cos(latitude * Math.PI / 180) / 2 ** zoom;
  let distance = 0;
  let next = spacing / 2;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    if (![from.latitude, from.longitude, to.latitude, to.longitude].every(Number.isFinite)) continue;
    const north = (to.latitude - from.latitude) * 111_320;
    const east = (to.longitude - from.longitude) * eastScale;
    const length = Math.hypot(north, east);
    if (length === 0) continue;
    while (next <= distance + length) {
      const fraction = (next - distance) / length;
      const point = {
        latitude: from.latitude + (to.latitude - from.latitude) * fraction,
        longitude: from.longitude + (to.longitude - from.longitude) * fraction,
      };
      if (!region || (
        point.latitude >= region.latitude && point.latitude <= region.latitude + region.latitudeDelta &&
        point.longitude >= region.longitude && point.longitude <= region.longitude + region.longitudeDelta
      )) markers.push({ ...point, angle: (Math.atan2(east, north) * 180 / Math.PI + 360) % 360, id: Math.round(next * 1000) });
      next += spacing;
    }
    distance += length;
  }
  return markers;
}

/** 좌회전은 큰 곡선, 우회전은 작은 곡선으로 공식 노선의 모서리를 잇는다. */
export function roundRouteTurns(points: Coordinate[]) {
  if (points.length < 3) return points;
  const eastScale = 111_320 * Math.cos(points[0].latitude * Math.PI / 180);
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const ax = (corner.longitude - previous.longitude) * eastScale;
    const ay = (corner.latitude - previous.latitude) * 111_320;
    const bx = (next.longitude - corner.longitude) * eastScale;
    const by = (next.latitude - corner.latitude) * 111_320;
    const incoming = Math.hypot(ax, ay), outgoing = Math.hypot(bx, by);
    if (incoming === 0 || outgoing === 0) continue;
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (Math.abs(turn) < Math.PI / 12 || Math.abs(turn) > Math.PI * .9) {
      result.push(corner); continue;
    }
    const cut = Math.min(turn > 0 ? 28 : 20, incoming * .4, outgoing * .4);
    const start = { latitude: corner.latitude - ay / incoming * cut / 111_320,
      longitude: corner.longitude - ax / incoming * cut / eastScale };
    const end = { latitude: corner.latitude + by / outgoing * cut / 111_320,
      longitude: corner.longitude + bx / outgoing * cut / eastScale };
    result.push(start);
    for (let step = 1; step <= 8; step++) {
      const t = step / 8, u = 1 - t;
      result.push({ latitude: u * u * start.latitude + 2 * u * t * corner.latitude + t * t * end.latitude,
        longitude: u * u * start.longitude + 2 * u * t * corner.longitude + t * t * end.longitude });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

/** 도로 진행 방향의 오른쪽으로만 보정하여 왕복 노선이 서로 교차하지 않게 한다. */
export function alignRouteToStops(points: Coordinate[], stops: (Coordinate & { stationSeq: number })[]) {
  const line = points.filter((p, i) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    (i === 0 || p.latitude !== points[i - 1].latitude || p.longitude !== points[i - 1].longitude));
  if (line.length < 2) return line;
  const eastScale = 111_320 * Math.cos(line[0].latitude * Math.PI / 180);
  // 직진 교차로의 짧은 좌표 흔들림만 제거하고 실제 회전은 보존한다.
  for (let i = 1; i < line.length - 1; i++) {
    const a = line[i - 1], b = line[i], c = line[i + 1];
    const ax = (b.longitude - a.longitude) * eastScale, ay = (b.latitude - a.latitude) * 111_320;
    const bx = (c.longitude - b.longitude) * eastScale, by = (c.latitude - b.latitude) * 111_320;
    const chord = Math.hypot(ax + bx, ay + by);
    const angle = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    if (chord > 0 && angle < Math.PI / 9 && Math.abs(ax * by - ay * bx) / chord <= 4) {
      line.splice(i, 1); i = Math.max(0, i - 2);
    }
  }
  const distances = [0];
  for (let i = 1; i < line.length; i++) distances.push(distances[i - 1] + Math.hypot(
    (line[i].latitude - line[i - 1].latitude) * 111_320,
    (line[i].longitude - line[i - 1].longitude) * eastScale,
  ));
  const anchors: { at: number; offset: number; distance: number }[] = [];
  for (const stop of stops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    let best = { at: 0, offset: 0, distance: Infinity };
    for (let i = 0; i < line.length - 1; i++) {
      const north = (line[i + 1].latitude - line[i].latitude) * 111_320;
      const east = (line[i + 1].longitude - line[i].longitude) * eastScale;
      const length = Math.hypot(north, east);
      if (length === 0) continue;
      const sn = (stop.latitude - line[i].latitude) * 111_320;
      const se = (stop.longitude - line[i].longitude) * eastScale;
      const fraction = Math.max(0, Math.min(1, (sn * north + se * east) / length ** 2));
      const offset = (se * north - sn * east) / length;
      const distance = Math.hypot(sn - fraction * north, se - fraction * east);
      // 반대편 정류소나 잘못된 좌표 쪽으로 선을 끌어당기지 않는다.
      if (offset >= 0 && offset <= 30 && distance < best.distance) best = {
        at: distances[i] + fraction * length, offset, distance,
      };
    }
    if (best.distance <= 30) anchors.push(best);
  }
  anchors.sort((a, b) => a.at - b.at || a.distance - b.distance);
  const unique = anchors.filter((a, i) => i === 0 || Math.abs(a.at - anchors[i - 1].at) > .01);
  // 차선 데이터가 없으므로 기본 6m 우측 이동은 지도 표시용 추정이다.
  const offsets = unique.map((a) => a.offset).sort((a, b) => a - b);
  const baseline = offsets.length ? Math.max(3, Math.min(12, offsets[Math.floor(offsets.length / 2)])) : 6;
  const samples = new Set(distances);
  for (const anchor of unique) samples.add(anchor.at);

  let segment = 0, anchorIndex = 0;
  const shifted = [...samples].sort((a, b) => a - b).map((at) => {
    while (segment < line.length - 2 && distances[segment + 1] <= at) segment++;
    const span = distances[segment + 1] - distances[segment];
    const fraction = span === 0 ? 0 : (at - distances[segment]) / span;
    while (anchorIndex < unique.length - 1 && unique[anchorIndex + 1].at < at) anchorIndex++;
    const before = unique[anchorIndex], after = unique[anchorIndex + 1];
    let offset = baseline;
    if (before && after && at >= before.at && at <= after.at) {
      const t = (at - before.at) / (after.at - before.at);
      offset = before.offset * (1 - t) + after.offset * t;
    } else if (before) {
      const nearest = after && Math.abs(after.at - at) < Math.abs(before.at - at) ? after : before;
      offset = nearest.offset;
    }
    const north = (line[segment + 1].latitude - line[segment].latitude) * 111_320;
    const east = (line[segment + 1].longitude - line[segment].longitude) * eastScale;
    const length = Math.hypot(north, east);
    let normalEast = length ? north / length : 0;
    let normalNorth = length ? -east / length : 0;
    if (fraction === 0 && segment > 0) {
      const previousEast = (line[segment].longitude - line[segment - 1].longitude) * eastScale;
      const previousNorth = (line[segment].latitude - line[segment - 1].latitude) * 111_320;
      const previousLength = Math.hypot(previousEast, previousNorth);
      const pe = previousNorth / previousLength, pn = -previousEast / previousLength;
      // 양쪽 평행선의 교점으로 모서리를 연결해 접선 변경 시 선이 튀지 않게 한다.
      const denominator = 1 + pe * normalEast + pn * normalNorth;
      if (denominator > .5) {
        normalEast = (pe + normalEast) / denominator;
        normalNorth = (pn + normalNorth) / denominator;
      }
    }
    return {
      latitude: line[segment].latitude + (line[segment + 1].latitude - line[segment].latitude) * fraction + normalNorth * offset / 111_320,
      longitude: line[segment].longitude + (line[segment + 1].longitude - line[segment].longitude) * fraction + normalEast * offset / eastScale,
    };
  });
  // 안쪽으로 옮기기 전에 곡선을 만들면 우회전 반경이 역전되어 고리가 생긴다.
  return roundRouteTurns(shifted);
}
