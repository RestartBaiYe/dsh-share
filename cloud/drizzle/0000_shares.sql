CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  html TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL,
  delete_hash TEXT NOT NULL
);
CREATE INDEX shares_expiry ON shares(expires_at);
CREATE TABLE upload_rates (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
