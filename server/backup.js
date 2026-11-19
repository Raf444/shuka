// Daily backup with VACUUM INTO: a consistent copy even while the app is running.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, BACKUPS_DIR } from './db.js';

export function backupNow() {
  const file = path.join(BACKUPS_DIR, `shuka-${new Date().toISOString().slice(0, 10)}.db`);
  fs.rmSync(file, { force: true }); // VACUUM INTO refuses to overwrite
  db.prepare('VACUUM INTO ?').run(file);
  // keep the last 7 backups
  const all = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.db')).sort();
  for (const old of all.slice(0, -7)) fs.rmSync(path.join(BACKUPS_DIR, old), { force: true });
  console.log(`backup written: ${file}`);
  return file;
}

export function scheduleDailyBackup() {
  const run = () => { try { backupNow(); } catch (e) { console.error('backup failed', e); } };
  setTimeout(run, 60_000);               // one shortly after start
  setInterval(run, 24 * 3600 * 1000).unref?.(); // then every 24 h
}

// `npm run backup`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) backupNow();
