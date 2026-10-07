import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import db from "./db.server";

// Snapshots of the SQLite database, taken while the app is running (VACUUM INTO gives a consistent
// copy without stopping anything), gzipped and kept next to the database in the persistent volume.
//   BACKUP_ENABLED=false        turn the schedule off
//   BACKUP_INTERVAL_HOURS=6     how often (default 6)
//   BACKUP_DIR=/app/data/backups  where (default: "backups" next to the database file)

const KEEP_RECENT = 8; // newest snapshots are always kept
const KEEP_DAYS = 30; // plus the newest snapshot of each of the last 30 days

function databaseFile(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  return path.resolve(url.slice("file:".length).split("?")[0]);
}

export function backupDir(): string {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  const dbFile = databaseFile();
  return path.join(dbFile ? path.dirname(dbFile) : process.cwd(), "backups");
}

export type BackupInfo = { name: string; bytes: number; createdAt: string };

export function listBackups(): BackupInfo[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => /\.sqlite(\.gz)?$/.test(n))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, bytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function databaseBytes(): number | null {
  const file = databaseFile();
  return file && fs.existsSync(file) ? fs.statSync(file).size : null;
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-"); // 20261007-153000
}

export async function createBackup(): Promise<BackupInfo> {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `rodi-${stamp()}.sqlite`);
  const sqlPath = base.replace(/\\/g, "/").replace(/'/g, "''");
  await db.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);
  if (!fs.existsSync(base) || fs.statSync(base).size === 0) throw new Error("Backup file was not created");
  const gz = `${base}.gz`;
  await pipeline(fs.createReadStream(base), zlib.createGzip({ level: 9 }), fs.createWriteStream(gz));
  fs.unlinkSync(base);
  pruneBackups();
  const stat = fs.statSync(gz);
  return { name: path.basename(gz), bytes: stat.size, createdAt: stat.mtime.toISOString() };
}

export function pruneBackups() {
  const dir = backupDir();
  // pre-migration copies ("pre-migrate-*") are managed by scripts/pre-migrate-backup.mjs
  const all = listBackups().filter((b) => b.name.startsWith("rodi-"));
  const keep = new Set(all.slice(0, KEEP_RECENT).map((b) => b.name));
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const seenDays = new Set<string>();
  for (const b of all) {
    const day = b.createdAt.slice(0, 10);
    if (new Date(b.createdAt).getTime() >= cutoff && !seenDays.has(day)) {
      seenDays.add(day);
      keep.add(b.name);
    }
  }
  for (const b of all) if (!keep.has(b.name)) fs.rmSync(path.join(dir, b.name), { force: true });
}

async function tick() {
  try {
    const b = await createBackup();
    console.log(`[backup] ${b.name} (${b.bytes} bytes)`);
  } catch (e) {
    console.error("[backup] failed:", e);
  }
}

let started = false;
export function startBackupScheduler() {
  if (started || process.env.BACKUP_ENABLED === "false" || !databaseFile()) return;
  started = true;
  const hours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS) || 6);
  setTimeout(tick, 2 * 60 * 1000).unref(); // first snapshot shortly after every start/deploy
  setInterval(tick, hours * 3600 * 1000).unref();
}
