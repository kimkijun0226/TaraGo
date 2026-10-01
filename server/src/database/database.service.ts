import { Injectable, OnApplicationShutdown, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(configService: ConfigService, @Optional() pool?: Pool) {
    this.pool =
      pool ??
      new Pool({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      });
  }

  query<T extends QueryResultRow>(text: string, values?: readonly unknown[]) {
    return this.pool.query<T>(text, values as unknown[] | undefined);
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
