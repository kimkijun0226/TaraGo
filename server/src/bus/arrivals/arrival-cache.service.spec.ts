import { ArrivalCacheService } from './arrival-cache.service';

describe('ArrivalCacheService', () => {
  it('동일 정류장 동시 요청을 한 번만 실행하고 5초 동안 재사용한다', async () => {
    jest.useFakeTimers();
    const cache = new ArrivalCacheService();
    const loader = jest.fn(async () => [{ routeId: 'route-1' }]);

    await Promise.all([
      cache.getOrLoad('station-1', loader),
      cache.getOrLoad('station-1', loader),
    ]);
    await cache.getOrLoad('station-1', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5_001);
    await cache.getOrLoad('station-1', loader);
    expect(loader).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('새 요청이 실패하면 30초 이내의 stale 값을 반환한다', async () => {
    jest.useFakeTimers();
    const cache = new ArrivalCacheService();
    await cache.getOrLoad('station-1', async () => ['cached']);
    jest.advanceTimersByTime(5_001);

    await expect(
      cache.getOrLoad('station-1', async () => {
        throw new Error('upstream');
      }),
    ).resolves.toEqual(['cached']);
    jest.useRealTimers();
  });
});
