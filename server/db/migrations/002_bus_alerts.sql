BEGIN;
CREATE TABLE IF NOT EXISTS alert_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_hash text NOT NULL UNIQUE,
  push_token text,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bus_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES alert_devices(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES bus_stations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bus_alerts_device_idx ON bus_alerts(device_id);
CREATE TABLE IF NOT EXISTS alert_deliveries (
  alert_id uuid NOT NULL REFERENCES bus_alerts(id) ON DELETE CASCADE,
  delivery_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  ticket_id text,
  push_token text,
  attempts integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, delivery_key)
);
ALTER TABLE alert_devices ADD COLUMN IF NOT EXISTS push_error text;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS push_token text;
COMMIT;
