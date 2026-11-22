-- Puddleton D1 schema: guests, friends, blocks, stats, reports, match logs, sanctions, audit.
-- Few indexes on purpose: every index adds a row write on insert (free plan: 100,000 rows written per day).

-- A guest identity. The secret is stored only as a SHA-256 hash. band is set once and never changes.
-- stats is flat JSON: {"games":n,"wins":n,"<role>_p":played,"<role>_w":won}.
-- account_id is reserved for linking this guest to a future account on the owner's domain.
CREATE TABLE guests (
  gid TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('child', 'teen', 'adult')),
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  look TEXT NOT NULL DEFAULT '',
  stats TEXT NOT NULL DEFAULT '{}',
  offences INTEGER NOT NULL DEFAULT 0,
  offence_at INTEGER NOT NULL DEFAULT 0,
  device_hash TEXT NOT NULL DEFAULT '',
  account_id TEXT
) WITHOUT ROWID;

-- One rotating, single use friend link per guest.
CREATE TABLE friend_links (
  gid TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  expires INTEGER NOT NULL
) WITHOUT ROWID;

-- Friend requests: opening someone's friend link asks them; they accept or decline. A decline is silent (the
-- row stays 'declined' and the requester keeps seeing it as pending until it expires). Requests expire after 7 days.
CREATE TABLE friend_requests (
  from_gid TEXT NOT NULL,
  to_gid TEXT NOT NULL,
  created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'declined')),
  PRIMARY KEY (from_gid, to_gid)
) WITHOUT ROWID;
CREATE INDEX friend_requests_to ON friend_requests (to_gid, created);

-- Friendships are stored in both directions, so each side reads its list by primary key.
CREATE TABLE friends (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (a, b)
) WITHOUT ROWID;

-- Server side blocks: gid blocked target.
CREATE TABLE blocks (
  gid TEXT NOT NULL,
  target TEXT NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (gid, target)
) WITHOUT ROWID;

-- Snapshots of a match (chat, whispers, votes, night actions, system events, players and bands). Kept 30 days.
CREATE TABLE match_logs (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  created INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX match_logs_created ON match_logs (created);

-- Player reports and automatic reports (auto = 1). Kept 1 year.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  reporter TEXT NOT NULL,
  target TEXT NOT NULL,
  target_name TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  auto INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  log_id TEXT,
  resolved_at INTEGER,
  resolution TEXT
);
CREATE INDEX reports_status ON reports (status, created);

-- Mutes and bans. A ban matches the guest id or the device hash (the device token hashed with a server secret).
-- No IP address is ever stored.
CREATE TABLE sanctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mute', 'ban')),
  gid TEXT,
  device_hash TEXT,
  reason TEXT NOT NULL,
  until INTEGER NOT NULL,
  by TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX sanctions_gid ON sanctions (gid);
CREATE INDEX sanctions_device ON sanctions (device_hash);

-- Append only audit log of moderator actions.
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append only'); END;
