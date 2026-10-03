import { TileCacheService } from './tile-cache.service';

describe('TileCacheService', () => {
  it('같은 key의 동시 요청은 loader를 한 번만 실행한다', async () => {
    const cache = new TileCacheService(2);
    let resolve!: (value: string[]) => void;
    const loader = jest.fn(
      () => new Promise<string[]>((done) => (resolve = done)),
    );

    const first = cache.getOrLoad('tile-1', loader);
    const second = cache.getOrLoad('tile-1', loader);
    resolve(['station']);

    await expect(Promise.all([first, second])).resolves.toEqual([
      ['station'],
      ['station'],
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('용량을 넘으면 가장 오래된 완료 항목을 제거한다', async () => {
    const cache = new TileCacheService(2);
    const loader = jest.fn(async (value: string) => value);

    await cache.getOrLoad('a', () => loader('a'));
    await cache.getOrLoad('b', () => loader('b'));
    await cache.getOrLoad('c', () => loader('c'));
    await cache.getOrLoad('a', () => loader('a-again'));

    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('빈 목록도 캐시하고 TTL 이후 다시 조회한다', async () => {
    const cache = new TileCacheService(500, 1);
    const loader = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['station']);

    await expect(cache.getOrLoad('tile-1', loader)).resolves.toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(cache.getOrLoad('tile-1', loader)).resolves.toEqual(['station']);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
