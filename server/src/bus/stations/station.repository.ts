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
export class StationRepository {
  constructor(private readonly database: DatabaseService) {}

  async findNearby(
    latitude: number,
    longitude: number,
    radius: number,
    limit: number,
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
         array_agg(source.provider ORDER BY source.provider) AS providers
       FROM bus_stations station
       JOIN station_sources source ON source.station_id = station.id
       WHERE ST_DWithin(
         station.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       GROUP BY station.id
       ORDER BY distance_meters
       LIMIT $4`,
      [longitude, latitude, radius, Math.min(limit, 500)],
    );

    return result.rows.map((row) => ({
      id: row.id,
      arsId: row.ars_id,
      name: row.name,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: Number(row.distance_meters),
      type: row.station_type ?? '0',
      providers: row.providers,
    }));
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

  async upsertSource(input: StationSourceInput): Promise<string> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const normalizedName = name.toLocaleLowerCase('ko-KR');
    const result = await this.database.query<{ station_id: string }>(
      `WITH existing_source AS (
         SELECT station_id
         FROM station_sources
         WHERE provider = $1 AND provider_station_id = $2
       ), nearby_station AS (
         SELECT id
         FROM bus_stations
         WHERE normalized_name = $6
           AND ST_DWithin(
             location,
             ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
             20
           )
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography
         )
         LIMIT 1
       ), created_station AS (
         INSERT INTO bus_stations (
           name, normalized_name, ars_id, station_type, location
         )
         SELECT
           $5, $6, NULLIF($4, ''), NULLIF($10, ''),
           ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography
         WHERE NOT EXISTS (SELECT 1 FROM existing_source)
           AND NOT EXISTS (SELECT 1 FROM nearby_station)
         RETURNING id
       ), selected_station AS (
         SELECT station_id AS id FROM existing_source
         UNION ALL
         SELECT id FROM nearby_station
         WHERE NOT EXISTS (SELECT 1 FROM existing_source)
         UNION ALL
         SELECT id FROM created_station
         LIMIT 1
       ), upserted_source AS (
         INSERT INTO station_sources (
           station_id, provider, provider_station_id, provider_city_code,
           provider_ars_id, raw_metadata, updated_at
         )
         SELECT id, $1, $2, NULLIF($3, ''), NULLIF($4, ''), $9::jsonb, now()
         FROM selected_station
         ON CONFLICT (provider, provider_station_id)
         DO UPDATE SET
           station_id = EXCLUDED.station_id,
           provider_city_code = EXCLUDED.provider_city_code,
           provider_ars_id = EXCLUDED.provider_ars_id,
           raw_metadata = EXCLUDED.raw_metadata,
           updated_at = now()
         RETURNING station_id
       )
       SELECT station_id FROM upserted_source`,
      [
        input.provider,
        input.providerStationId,
        input.providerCityCode ?? '',
        input.arsId ?? '',
        name,
        normalizedName,
        input.longitude,
        input.latitude,
        input.rawMetadata ?? {},
        input.type ?? '',
      ],
    );

    const stationId = result.rows[0]?.station_id;
    if (!stationId) throw new Error('정류장 저장 결과가 없습니다.');

    return stationId;
  }
}
