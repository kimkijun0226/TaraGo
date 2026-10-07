import { Injectable, Optional } from '@nestjs/common';

/** 반복되는 지도 정류장 DB 조회를 메모리에서 재사용하는 제한된 크기의 캐시. */
@Injectable()
export class TileCacheService {
  private readonly entries = new Map<
    string,
    { value: Promise<unknown>; expiresAt: number }
  >();

  constructor(
    @Optional() private readonly maxEntries = 500,
    @Optional() private readonly ttlMs = 60_000,
  ) {}

  /**
   * 같은 좌표·반경의 요청을 공유하고 성공 응답을 TTL 동안 보관한다.
   *
   * 요청이 실패하면 해당 Promise를 제거해 다음 호출이 재시도할 수 있다.
   * 항목 수가 제한을 넘으면 가장 오래된 키를 제거한다.
   * @param key 정규화한 좌표와 반경으로 만든 조회 키.
   * @param loader 캐시가 없거나 만료됐을 때 실행할 DB 조회.
   * @returns 진행 중인 요청 또는 보관된 조회 결과.
   * @throws DB 조회가 실패하면 원래 오류를 전달한다.
   */
  getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now())
      return cached.value as Promise<T>;

    const pending = loader().catch((error: unknown) => {
      if (this.entries.get(key)?.value === pending) this.entries.delete(key);
      throw error;
    });
    this.entries.delete(key);
    this.entries.set(key, {
      value: pending,
      expiresAt: Date.now() + this.ttlMs,
    });

    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey && oldestKey !== key) this.entries.delete(oldestKey);
    }

    return pending;
  }
}
