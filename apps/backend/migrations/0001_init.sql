-- NTM Sentinel backend — initial schema.
-- No personal data is stored. Reputation results are cached in KV, not D1.
-- scan_history is intentionally not created: history sync is a future, opt-in feature.

CREATE TABLE IF NOT EXISTS technology_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_technology_signatures_version ON technology_signatures (version);

CREATE TABLE IF NOT EXISTS tracker_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracker_signatures_version ON tracker_signatures (version);

CREATE TABLE IF NOT EXISTS application_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO application_config (key, value, updated_at)
VALUES ('schema_version', '1', datetime('now'));
