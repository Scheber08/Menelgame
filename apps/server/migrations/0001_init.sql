-- Profile ohne Account: Die ID ist öffentlich, das Geheimnis liegt nur gehasht hier.
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Eigene Board Packs. Privat: gelesen wird nur vom Besitzer oder mit dem Teilen-Schlüssel.
CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  json TEXT NOT NULL,
  share_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX packs_owner ON packs(owner_id);

-- Regelsets, getrennt vom Brett und mit jedem Pack kombinierbar.
CREATE TABLE rulesets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX rulesets_owner ON rulesets(owner_id);
