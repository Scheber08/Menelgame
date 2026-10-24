-- Spielergebnisse je Profil. Ein Platz in einem Raum kann nur einmal beansprucht werden.
CREATE TABLE game_results (
  room_code TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  finished_at INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (room_code, seat_id)
);
CREATE INDEX game_results_profile ON game_results(profile_id, finished_at);

-- Freigeschaltete Erfolge; die Bedingungen stehen in packages/protocol/src/stats.ts.
CREATE TABLE achievements (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, achievement_id)
);
