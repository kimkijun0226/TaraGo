import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type {
  BusStop,
  StationSource,
  StationSourceInput,
  TransitProvider,
} from '../domain/bus-stop';

type NearbyStationRow = {
  id: string;
  ars_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  station_type: string | null;
  providers: TransitProvider[];
};

@Injectable()
/** 지도 조회와 전국 CSV 스냅샷 적재에 사용하는 정류장 저장소. */
export class StationRepository {
  constructor(private readonly database: DatabaseService) {}

  async findNearby(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<BusStop[]> {
    const result = await this.database.query<NearbyStationRow>(
      `SELECT
         station.id,
         station.ars_id,
         station.name,
         ST_Y(station.location::geometry) AS latitude,
         ST_X(station.location::geometry) AS longitude,
         ST_Distance(
           station.location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         ) AS distance_meters,
         station.station_type,
         array_agg(DISTINCT source.provider ORDER BY source.provider) AS providers
       FROM bus_stations station
       JOIN station_sources source ON source.station_id = station.id
       WHERE ST_DWithin(
         station.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       GROUP BY station.id
       ORDER BY distance_meters`,
      [longitude, latitude, radius],
    );

    const stations = result.rows.map((row) => ({
      id: row.id,
      arsId: row.ars_id,
      name: row.name,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: Number(row.distance_meters),
      type: row.station_type ?? '0',
      providers: row.providers,
    }));

    /** 전국 CSV에는 같은 정류장이 '0' 번호와 실제 번호로 2m가량 떨어져 중복될 수 있다. */
    return stations.filter((station) => {
      if (station.arsId && station.arsId !== '0') return true;
      return !stations.some((other) => {
        if (!other.arsId || other.arsId === '0' || other.name !== station.name) return false;
        const northMeters = (other.latitude - station.latitude) * 111_320;
        const eastMeters =
          (other.longitude - station.longitude) *
          111_320 *
          Math.cos((station.latitude * Math.PI) / 180);
        return northMeters * northMeters + eastMeters * eastMeters < 25;
      });
    });
  }

  async findSources(stationId: string): Promise<StationSource[]> {
    const result = await this.database.query<{
      provider: TransitProvider;
      provider_station_id: string;
      provider_city_code: string | null;
    }>(
      `SELECT provider, provider_station_id, provider_city_code
       FROM station_sources
       WHERE station_id = $1
       ORDER BY provider`,
      [stationId],
    );

    return result.rows.map((row) => ({
      provider: row.provider,
      providerStationId: row.provider_station_id,
      providerCityCode: row.provider_city_code,
    }));
  }

  /** 전체 CSV 검증이 끝난 뒤에만 이전 CSV 출처를 제거하도록 트랜잭션으로 교체한다. */
  async importSnapshot(
    stations: AsyncIterable<StationSourceInput>,
    minimumRows: number,
    snapshotId: string,
  ): Promise<{ imported: number; removed: number }> {
    return this.database.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`CREATE TEMP TABLE imported_stations (
          provider_station_id text PRIMARY KEY,
          name text NOT NULL,
          normalized_name text NOT NULL,
          ars_id text,
          city_code text,
          latitude double precision NOT NULL,
          longitude double precision NOT NULL,
          station_id uuid
        ) ON COMMIT DROP`);

        let batch: Record<string, unknown>[] = [];
        for await (const station of stations) {
          const name = station.name.trim().replace(/\s+/g, ' ');
          batch.push({
            provider_station_id: station.providerStationId,
            name,
            normalized_name: name.toLocaleLowerCase('ko-KR'),
            ars_id: station.arsId ?? null,
            city_code: station.providerCityCode ?? null,
            latitude: station.latitude,
            longitude: station.longitude,
          });
          if (batch.length === 1000) {
            await this.insertSnapshotBatch(client, batch);
            batch = [];
          }
        }
        if (batch.length) await this.insertSnapshotBatch(client, batch);

        const countResult = await client.query<{ count: string }>(
          'SELECT count(*) FROM imported_stations',
        );
        const imported = Number(countResult.rows[0].count);
        if (imported < minimumRows) {
          throw new Error(`정류장 CSV가 예상보다 적습니다: ${imported}개 (최소 ${minimumRows}개). 이전 데이터는 삭제하지 않았습니다.`);
        }

        await client.query(`UPDATE imported_stations imported
          SET station_id = source.station_id
          FROM station_sources source
          WHERE source.provider = 'TAGO'
            AND source.provider_station_id = imported.provider_station_id`);
        await client.query(`CREATE INDEX imported_stations_name_idx
          ON imported_stations (normalized_name)`);
        await client.query(`UPDATE imported_stations imported
          SET station_id = station.id
          FROM bus_stations station
          JOIN station_sources source ON source.station_id = station.id
          WHERE imported.station_id IS NULL
            AND source.provider <> 'TAGO'
            AND station.normalized_name = imported.normalized_name
            AND ST_DWithin(
              station.location,
              ST_SetSRID(ST_MakePoint(imported.longitude, imported.latitude), 4326)::geography,
              20
            )`);
        await client.query(`UPDATE imported_stations
          SET station_id = gen_random_uuid()
          WHERE station_id IS NULL`);

        await client.query(`INSERT INTO bus_stations (
          id, name, normalized_name, ars_id, location
        )
        SELECT imported.station_id, imported.name, imported.normalized_name,
          NULLIF(imported.ars_id, ''),
          ST_SetSRID(ST_MakePoint(imported.longitude, imported.latitude), 4326)::geography
        FROM imported_stations imported
        LEFT JOIN bus_stations station ON station.id = imported.station_id
        WHERE station.id IS NULL`);
        await client.query(`UPDATE bus_stations station
          SET name = imported.name,
              normalized_name = imported.normalized_name,
              ars_id = COALESCE(NULLIF(imported.ars_id, ''), station.ars_id),
              location = ST_SetSRID(ST_MakePoint(imported.longitude, imported.latitude), 4326)::geography,
              updated_at = now()
          FROM imported_stations imported
          WHERE station.id = imported.station_id`);
        await client.query(`INSERT INTO station_sources (
          station_id, provider, provider_station_id, provider_city_code,
          provider_ars_id, raw_metadata, updated_at
        )
        SELECT imported.station_id, 'TAGO', imported.provider_station_id,
          NULLIF(imported.city_code, ''), NULLIF(imported.ars_id, ''),
          jsonb_build_object('source', 'national_csv', 'snapshotId', $1::text), now()
        FROM imported_stations imported
        ON CONFLICT (provider, provider_station_id)
        DO UPDATE SET
          station_id = EXCLUDED.station_id,
          provider_city_code = EXCLUDED.provider_city_code,
          provider_ars_id = EXCLUDED.provider_ars_id,
          raw_metadata = EXCLUDED.raw_metadata,
          updated_at = now()`, [snapshotId]);

        await client.query(`CREATE TEMP TABLE removed_station_ids (
          station_id uuid
        ) ON COMMIT DROP`);
        await client.query(`WITH removed AS (
          DELETE FROM station_sources
          WHERE provider = 'TAGO'
            AND raw_metadata->>'source' = 'national_csv'
            AND raw_metadata->>'snapshotId' IS DISTINCT FROM $1
          RETURNING station_id
        )
        INSERT INTO removed_station_ids SELECT station_id FROM removed`, [snapshotId]);
        const removedResult = await client.query<{ count: string }>(
          'SELECT count(*) FROM removed_station_ids',
        );
        const removed = Number(removedResult.rows[0].count);
        await client.query(`DELETE FROM bus_stations station
          WHERE station.id IN (SELECT station_id FROM removed_station_ids)
            AND NOT EXISTS (
              SELECT 1 FROM station_sources source
              WHERE source.station_id = station.id
            )`);
        await client.query('COMMIT');
        return { imported, removed };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async insertSnapshotBatch(
    client: import('pg').PoolClient,
    batch: Record<string, unknown>[],
  ) {
    await client.query(`INSERT INTO imported_stations (
      provider_station_id, name, normalized_name, ars_id, city_code,
      latitude, longitude
    )
    SELECT provider_station_id, name, normalized_name, ars_id, city_code,
      latitude, longitude
    FROM jsonb_to_recordset($1::jsonb) AS row(
      provider_station_id text, name text, normalized_name text,
      ars_id text, city_code text, latitude double precision,
      longitude double precision
    )
    ON CONFLICT (provider_station_id) DO UPDATE SET
      name = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      ars_id = EXCLUDED.ars_id,
      city_code = EXCLUDED.city_code,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude`, [JSON.stringify(batch)]);
  }

}
