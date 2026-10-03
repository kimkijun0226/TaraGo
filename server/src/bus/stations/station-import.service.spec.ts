import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';

import { StationImportService } from './station-import.service';
import type { StationRepository } from './station.repository';

describe('StationImportService', () => {
  it('CSV를 읽어 하나의 스냅샷 적재 작업으로 전달한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tarago-import-'));
    try {
      const path = join(directory, 'stations.csv');
      await writeFile(path, 'NODE_ID,NODE_NM,GPS_LATI,GPS_LONG\nnode-1,역곡역,37.4883,126.8169\n');
      const config = {
        get: (key: string) => ({
          BUS_STATIONS_CSV_PATH: path,
          BUS_STATIONS_CSV_ENCODING: 'utf-8',
          BUS_STATIONS_MIN_ROWS: '1',
        })[key],
      } as ConfigService;
      const repository = {
        importSnapshot: jest.fn().mockImplementation(async (rows: AsyncIterable<unknown>) => {
          const imported = [];
          for await (const row of rows) imported.push(row);
          expect(imported).toEqual([{
            provider: 'TAGO', providerStationId: 'node-1',
            providerCityCode: undefined, arsId: undefined,
            name: '역곡역', latitude: 37.4883, longitude: 126.8169,
          }]);
          return { imported: 1, removed: 0 };
        }),
      } as unknown as StationRepository;

      await expect(new StationImportService(config, repository).importConfiguredSnapshot()).resolves.toBe(1);
      expect(repository.importSnapshot).toHaveBeenCalledWith(expect.anything(), 1, expect.any(String));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
