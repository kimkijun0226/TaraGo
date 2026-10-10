import type { BusStop } from '../api/get-nearby-bus-stops';

/** 고정된 combine 함수로 타일 중복을 제거하고 Query가 합친 결과의 참조를 재사용하게 한다. */
export function combineBusStops(results: { data?: BusStop[] }[]) {
  const stops = new Map(results.flatMap(({ data = [] }) => data).map((stop) => [stop.id, stop]));
  return [...stops.values()];
}
