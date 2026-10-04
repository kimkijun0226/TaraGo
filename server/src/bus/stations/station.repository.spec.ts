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

  it('같은 이름의 5m 이내 중복 정류장은 유효한 정류장 번호를 가진 하나만 반환한다', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 'old-a', ars_id: '0', name: '역곡1동행정복지센터', latitude: 37.4886, longitude: 126.8168771, distance_meters: 33, station_type: '0', providers: ['TAGO'] },
        { id: 'real-a', ars_id: '11400', name: '역곡1동행정복지센터', latitude: 37.4886167, longitude: 126.8168667, distance_meters: 35, station_type: '0', providers: ['TAGO'] },
        { id: 'old-b', ars_id: '0', name: '역곡1동행정복지센터', latitude: 37.4883767, longitude: 126.8162934, distance_meters: 54, station_type: '0', providers: ['TAGO'] },
        { id: 'real-b', ars_id: '11399', name: '역곡1동행정복지센터', latitude: 37.4884, longitude: 126.8162833, distance_meters: 55, station_type: '0', providers: ['TAGO'] },
      ],
    });
    const repository = new StationRepository({ query } as unknown as DatabaseService);

    const result = await repository.findNearby(37.4883, 126.8169, 300);

    expect(result.map((station) => station.id)).toEqual(['real-a', 'real-b']);
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
