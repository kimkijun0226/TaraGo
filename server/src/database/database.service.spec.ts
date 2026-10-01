import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';

import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  it('하나의 pool로 쿼리하고 종료 시 연결을 닫는다', async () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('postgres://tarago:test@db/tarago'),
    } as unknown as ConfigService;
    const query = jest.fn().mockResolvedValue({ rows: [{ value: 1 }] });
    const end = jest.fn().mockResolvedValue(undefined);
    const pool = { query, end } as unknown as Pool;
    const service = new DatabaseService(configService, pool);

    await expect(
      service.query<{ value: number }>('SELECT 1'),
    ).resolves.toMatchObject({ rows: [{ value: 1 }] });
    await service.onApplicationShutdown();

    expect(query).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
