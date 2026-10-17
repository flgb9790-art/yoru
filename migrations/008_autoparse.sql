CREATE TABLE IF NOT EXISTS auto_settings(id INTEGER PRIMARY KEY, config JSONB NOT NULL DEFAULT '{}');
INSERT INTO auto_settings(id,config) VALUES(1,'{}') ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS auto_tasks(name TEXT PRIMARY KEY,cursor JSONB NOT NULL DEFAULT '{}',next_run TIMESTAMPTZ,last_run TIMESTAMPTZ,last_error TEXT NOT NULL DEFAULT '');
INSERT INTO auto_tasks(name) VALUES('archive'),('refresh'),('episodes'),('posters'),('kodik') ON CONFLICT(name) DO NOTHING;
CREATE TABLE IF NOT EXISTS episode_observations(anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,provider TEXT NOT NULL,episode INTEGER NOT NULL,PRIMARY KEY(anime_id,provider));
CREATE TABLE IF NOT EXISTS source_updates(anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,provider TEXT NOT NULL,episode INTEGER NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(anime_id,provider));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'aniliberty';
ALTER TABLE notifications ALTER COLUMN release_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS auto_job_keys(key TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE);
