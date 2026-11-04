/* Created automatically on the first request (CREATE IF NOT EXISTS). Same statements live in ../schema.sql. */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS docs(
    coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER,
    rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(coll,id))`,
  `CREATE INDEX IF NOT EXISTS docs_coll_ts ON docs(coll,ts)`,
  `CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated)`,
  `CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1, perms TEXT NOT NULL DEFAULT '{}', salt TEXT NOT NULL, hash TEXT NOT NULL,
    must_change INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions(
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY, fails INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)`,
];
