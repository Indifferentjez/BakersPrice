// Online-safe copy of the SQLite database into server/data/backups/. Uses
// better-sqlite3's own .backup() (correct under WAL mode) rather than a raw
// file copy, which could grab a torn snapshot while the WAL file is active.
//
// NOTE: this is not persistence. On Render's free tier the whole filesystem —
// including any backup file just written — is wiped on sleep/redeploy exactly
// like the live database. Useful on your own machine, or once the service is
// on a paid plan with a mounted disk (copy the result off-box afterwards).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const src = process.env.DB_PATH || path.join(dataDir, 'app.db');

if (!fs.existsSync(src)) {
  console.error(`No database file found at ${src}`);
  process.exit(1);
}

const backupsDir = path.join(dataDir, 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupsDir, `app-${stamp}.db`);

const db = new Database(src, { readonly: true, fileMustExist: true });
try {
  await db.backup(dest);
  console.log(`Backed up ${src} -> ${dest}`);
} finally {
  db.close();
}
