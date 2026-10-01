import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
};

@Injectable()
export class ArrivalCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

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
