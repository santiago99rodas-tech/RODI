// Runs before `prisma migrate deploy` on every container start: keeps a raw copy of the database as it was
// before any migration touches it, so a bad migration can be rolled back.
// The app is not running yet at this point, so a plain file copy is consistent.
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) process.exit(0);
const dbFile = path.resolve(url.slice("file:".length).split("?")[0]);
if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) process.exit(0);

const dir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(dbFile), "backups");
try {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const out = path.join(dir, `pre-migrate-${stamp}.sqlite`);
  fs.copyFileSync(dbFile, out);
  console.log(`[backup] pre-migrate copy: ${out}`);
  const old = fs.readdirSync(dir).filter((n) => n.startsWith("pre-migrate-")).sort().reverse().slice(5);
  for (const n of old) fs.rmSync(path.join(dir, n), { force: true });
} catch (e) {
  console.error("[backup] pre-migrate copy failed (continuing):", e);
}
