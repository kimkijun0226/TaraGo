import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueriesObserver } from '@tanstack/query-core';
import { combineBusStops } from './combine-bus-stops.ts';
import type { BusStop } from '../api/get-nearby-bus-stops';

const stop: BusStop = { id: 'a', name: '역곡역', arsId: '11400', latitude: 37.5, longitude: 126.8, distanceMeters: 0, type: '0', providers: ['TAGO'] };

test('겹친 타일은 한 정류소로 합치고 데이터가 빠진 타일은 이전 정류소를 남기지 않는다', () => {
  assert.deepEqual(combineBusStops([{ data: [stop] }, {}, { data: [stop] }]), [stop]);
  assert.deepEqual(combineBusStops([{}, { data: [] }]), []);
});
test('반복 렌더에서는 합친 참조를 재사용하고 Query 데이터가 바뀌면 최신 목록을 반영한다', () => {
  const client = new QueryClient();
  const queries = [{ queryKey: ['tile', 1], enabled: false, gcTime: Infinity }];
  client.setQueryData(queries[0].queryKey, [stop]);
  let calls = 0;
  const combine = (results: { data?: unknown }[]) => {
    calls++;
    return combineBusStops(results as { data?: BusStop[] }[]);
  };
  const observer = new QueriesObserver<BusStop[]>(client, queries, { combine });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const first = observer.getOptimisticResult(queries, combine)[1]();
    for (let i = 0; i < 100; i++) assert.equal(observer.getOptimisticResult(queries, combine)[1](), first);
    assert.equal(calls, 1);
    client.setQueryData(queries[0].queryKey, [{ ...stop, name: '변경된 정류소' }]);
    const updated = observer.getOptimisticResult(queries, combine)[1]();
    assert.notEqual(updated, first);
    assert.equal(updated[0].name, '변경된 정류소');
    client.setQueryData(queries[0].queryKey, []);
    assert.deepEqual(observer.getOptimisticResult(queries, combine)[1](), []);
  } finally { unsubscribe(); observer.destroy(); client.clear(); }
});
