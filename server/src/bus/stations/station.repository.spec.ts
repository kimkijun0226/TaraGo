import type { DatabaseService } from '../../database/database.service';
import { StationRepository } from './station.repository';

describe('StationRepository', () => {
  it('경도-위도 순서로 반경 조회하고 거리순 결과와 provider 목록을 반환한다', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'station-1',
          ars_id: '12345',
          name: '역곡역',
          latitude: 37.4883,
          longitude: 126.8169,
          distance_meters: 42,
          providers: ['GYEONGGI', 'TAGO'],
        },
      ],
    });
    const repository = new StationRepository({ query } as unknown as DatabaseService);

    await expect(
      repository.findNearby(37.4883, 126.8169, 250),
    ).resolves.toEqual([
      {
        id: 'station-1',
        arsId: '12345',
        name: '역곡역',
        latitude: 37.4883,
        longitude: 126.8169,
        distanceMeters: 42,
        type: '0',
        providers: ['GYEONGGI', 'TAGO'],
      },
    ]);

    expect(query.mock.calls[0][1]).toEqual([126.8169, 37.4883, 250]);
    expect(query.mock.calls[0][0]).toContain('ORDER BY distance_meters');
    expect(query.mock.calls[0][0]).toContain('ST_DWithin');
    expect(query.mock.calls[0][0]).not.toContain('LIMIT');
  });

  it('provider ID와 20m 이름 중복을 하나의 원자적 upsert로 연결한다', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ station_id: 'shared-station' }],
    });
    const repository = new StationRepository({ query } as unknown as DatabaseService);

    const input = {
      provider: 'TAGO' as const,
      providerStationId: 'node-1',
      providerCityCode: '31050',
      arsId: '12345',
      name: ' 역곡역 ',
      latitude: 37.4883,
      longitude: 126.8169,
    };

    await expect(repository.upsertSource(input)).resolves.toBe('shared-station');
    await expect(repository.upsertSource(input)).resolves.toBe('shared-station');

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain('20');
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (provider, provider_station_id)');
    expect(query.mock.calls[0][1]).toEqual([
      'TAGO',
      'node-1',
      '31050',
      '12345',
      '역곡역',
      '역곡역',
      126.8169,
      37.4883,
      {},
      '',
    ]);
  });

  it('잘린 스냅샷은 삭제 전에 전체 트랜잭션을 롤백한다', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT count(*) FROM imported_stations') ? [{ count: '1' }] : [],
    }));
    const database = {
      withClient: async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }),
    } as unknown as DatabaseService;
    const repository = new StationRepository(database);
    async function* rows() {
      yield { provider: 'TAGO' as const, providerStationId: 'node-1', name: '역곡역', latitude: 37.4883, longitude: 126.8169 };
    }

    await expect(repository.importSnapshot(rows(), 2, 'new-run')).rejects.toThrow('예상보다 적습니다');
    const sql = query.mock.calls.map((call) => call[0]).join('\n');
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('DELETE FROM station_sources');
  });

  it('성공한 스냅샷에서만 기존 전국 CSV 출처를 제거한다', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT count(*)') ? [{ count: '1' }] : [],
    }));
    const database = {
      withClient: async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }),
    } as unknown as DatabaseService;
    const repository = new StationRepository(database);
    async function* rows() {
      yield { provider: 'TAGO' as const, providerStationId: 'node-1', name: '역곡역', latitude: 37.4883, longitude: 126.8169 };
    }

    await expect(repository.importSnapshot(rows(), 1, 'new-run')).resolves.toEqual({ imported: 1, removed: 1 });
    const sql = query.mock.calls.map((call) => call[0]);
    const deleteSql = sql.find((statement) => statement.includes('DELETE FROM station_sources'));
    expect(deleteSql).toContain("provider = 'TAGO'");
    expect(deleteSql).toContain("raw_metadata->>'source' = 'national_csv'");
    expect(sql.at(-1)).toBe('COMMIT');
  });
});
