// One SQLite connection for the whole process (better-sqlite3 is synchronous,
// so one connection + short transactions is the right model).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// DATA_DIR holds shuka.db, uploads/ and backups/. On Render point it at the persistent disk.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(here, '..', 'data'));
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'shuka.db'));
db.pragma('journal_mode = WAL');   // readers don't block the writer
db.pragma('busy_timeout = 5000');  // wait up to 5 s instead of SQLITE_BUSY
db.pragma('foreign_keys = ON');    // off by default in SQLite!
db.pragma('synchronous = NORMAL');

// Apply numbered .sql migrations that have not run yet.
export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const dir = path.join(here, 'migrations');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, now());
    })();
    console.log(`migrated: ${file}`);
  }
}

export const now = () => new Date().toISOString();

// BEGIN IMMEDIATE: take the write lock at the start, so two checkouts can't both read "1 left".
export function immediate(fn) {
  return db.transaction(fn).immediate();
}

// Run migrations as soon as the DB module loads, so other modules can prepare statements at import time.
migrate();
