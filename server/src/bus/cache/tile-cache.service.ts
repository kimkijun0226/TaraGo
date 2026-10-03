import { Injectable, Optional } from '@nestjs/common';

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
