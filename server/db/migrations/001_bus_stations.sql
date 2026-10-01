CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bus_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  ars_id text,
  station_type text,
  location geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bus_stations_location_gist
  ON bus_stations USING gist (location);

CREATE TABLE IF NOT EXISTS station_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES bus_stations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('SEOUL', 'GYEONGGI', 'INCHEON', 'TAGO')),
  provider_station_id text NOT NULL,
  provider_city_code text,
  provider_ars_id text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_station_id)
);

CREATE INDEX IF NOT EXISTS station_sources_station_id_idx
  ON station_sources (station_id);
