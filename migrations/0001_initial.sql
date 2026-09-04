PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_token_hash TEXT NOT NULL,
  a_token_hash TEXT NOT NULL,
  b_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
  session_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  browser_json TEXT,
  browser_captured_at TEXT,
  peet_json TEXT,
  peet_captured_at TEXT,
  PRIMARY KEY (session_id, side),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
