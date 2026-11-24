-- Run once in Neon SQL Editor. Dashboard-only projection, no sensitive device IPs or photos.
CREATE TABLE IF NOT EXISTS dashboard_visits (
 visit_id text PRIMARY KEY, store_code text NOT NULL, zone text NOT NULL,
 engineer_email text NOT NULL, engineer_name text NOT NULL DEFAULT '',
 visit_type text NOT NULL DEFAULT '', status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 rating integer, damaged boolean NOT NULL DEFAULT false, device_count integer NOT NULL DEFAULT 0,
 spare_count integer NOT NULL DEFAULT 0, sheets_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dv_zone_date ON dashboard_visits(zone,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dv_engineer ON dashboard_visits(engineer_email,created_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_devices (
 visit_id text NOT NULL REFERENCES dashboard_visits(visit_id) ON DELETE CASCADE,
 device_index integer NOT NULL, device_type text NOT NULL, subtype text NOT NULL DEFAULT '',
 amc_status text NOT NULL DEFAULT 'Unknown', PRIMARY KEY(visit_id,device_index)
);
CREATE TABLE IF NOT EXISTS dashboard_spares (
 visit_id text NOT NULL REFERENCES dashboard_visits(visit_id) ON DELETE CASCADE,
 device_index integer NOT NULL, spare_name text NOT NULL,
 PRIMARY KEY(visit_id,device_index,spare_name)
);
CREATE INDEX IF NOT EXISTS idx_spare_name ON dashboard_spares(spare_name);
CREATE TABLE IF NOT EXISTS dashboard_sync_events (
 event_id text PRIMARY KEY, visit_id text NOT NULL, event_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
