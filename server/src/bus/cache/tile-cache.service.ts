import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class TileCacheService {
  private readonly entries = new Map<string, Promise<unknown>>();

  constructor(@Optional() private readonly maxEntries = 500) {}

  getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key) as Promise<T> | undefined;
    if (cached) return cached;

    const pending = loader().catch((error: unknown) => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, pending);

    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey && oldestKey !== key) this.entries.delete(oldestKey);
    }

    return pending;
  }
}
