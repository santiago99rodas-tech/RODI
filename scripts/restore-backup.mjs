// Restores the database from a snapshot. STOP THE APP FIRST (EasyPanel: stop the service, open a console
// on it or run this with the volume mounted), then:
//   node scripts/restore-backup.mjs rodi-20261007-153000.sqlite.gz
// The current database is kept next to it as dev.sqlite.before-restore-<time> in case you need to undo.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) { console.error("DATABASE_URL must be a file: URL"); process.exit(1); }
const dbFile = path.resolve(url.slice("file:".length).split("?")[0]);
const dir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(dbFile), "backups");
const arg = process.argv[2];
if (!arg) { console.error("Usage: node scripts/restore-backup.mjs <backup file name or path>"); process.exit(1); }
const src = fs.existsSync(arg) ? path.resolve(arg) : path.join(dir, arg);
if (!fs.existsSync(src)) { console.error("Backup not found:", src); process.exit(1); }

if (fs.existsSync(dbFile)) {
  const keep = `${dbFile}.before-restore-${Date.now()}`;
  fs.copyFileSync(dbFile, keep);
  console.log("Current database saved as", keep);
}
for (const ext of ["-wal", "-shm", "-journal"]) fs.rmSync(dbFile + ext, { force: true });
if (src.endsWith(".gz")) await pipeline(fs.createReadStream(src), zlib.createGunzip(), fs.createWriteStream(dbFile));
else fs.copyFileSync(src, dbFile);
console.log("Restored", src, "->", dbFile, `(${fs.statSync(dbFile).size} bytes). Start the app again.`);
