import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
};

/** TAGO 요청량을 줄이기 위해 정류장별 진행 중인 요청과 최근 응답을 공유한다. */
@Injectable()
export class ArrivalCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * 같은 정류장의 동시 요청을 한 번만 실행하고 성공 응답을 5초간 재사용한다.
   *
   * 갱신 중 외부 API가 실패하더라도 마지막 성공 응답이 30초 이내면
   * 일시적 오류 대신 그 값을 제공한다. 사용 가능한 값이 없으면 오류를 유지한다.
   * 완료·실패 뒤에는 진행 중인 요청을 해제해 다음 갱신이 가능하게 한다.
   * @param key 서버 정류장 UUID를 사용하는 캐시 키.
   * @param loader 캐시가 없거나 만료됐을 때 실행할 외부 API 조회.
   * @returns 새 응답 또는 30초 이내의 마지막 성공 응답.
   * @throws 새 요청이 실패했고 재사용할 최근 응답도 없으면 원래 오류.
   */
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) return cached.value;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const request = loader()
      .then((value) => {
        this.entries.set(key, {
          value,
          expiresAt: Date.now() + 5_000,
          staleUntil: Date.now() + 30_000,
        });
        return value;
      })
      .catch((error: unknown) => {
        if (cached && cached.staleUntil > Date.now()) return cached.value;
        throw error;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);
    return request;
  }
}
