import db from "./db.server";

// The Journal (Club): one free-form page per country, stored as a small JSON of items positioned in percent of the page.
// Photos are kept in the database already shrunk by the browser (no object storage in this app) and are served back
// through the app proxy, only to their owner.
export const JOURNAL_MAX_ITEMS = 40;
export const JOURNAL_MAX_PHOTOS = 150;
export const JOURNAL_MAX_PHOTO_BYTES = 700 * 1024;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
const PHOTO_MIMES = ["image/jpeg", "image/webp", "image/png"];
const NOTE_STYLES = ["yellow", "paper", "kraft", "hand"];
const NOTE_FONTS = ["hand", "type", "serif"];
const STICKERS = ["plane", "heart", "star", "compass", "camera", "sun", "wave", "mountain", "coffee", "luggage", "flag", "palm"];
const ITEM_TYPES = ["photo", "note", "place", "tape", "stamp", "ticket", "sticker"];

export type JournalItem = {
  id: string;
  type: "photo" | "note" | "place" | "tape" | "stamp" | "ticket" | "sticker";
  x: number; y: number; w: number; rot: number; z: number;
  photoId?: string; caption?: string;
  text?: string; style?: string; font?: string;
  sub?: string; h?: string; icon?: string;
};
export type JournalPageData = { quote: string; items: JournalItem[] };

// Album covers: the six continents of the Journal and the ink colours a member can pick (the hex values live in the theme)
export const COVER_CONTINENTS = ["europe", "africa", "south_america", "north_america", "asia", "oceania"] as const;
export const COVER_COLORS = ["blue", "wine", "forest", "gold", "plum", "graphite", "clay", "teal"] as const;
export const COVER_TITLE_MAX = 22;
export type JournalCoverData = { title: string; color: string };

export class JournalFailure extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

export function isValidCountryHandle(h: unknown): h is string {
  return typeof h === "string" && HANDLE_RE.test(h);
}

// Pure: keep only well-formed items. photoIds the member does not own are dropped by the caller (ownedPhotos).
export function sanitizePage(input: unknown, ownedPhotos: Set<string>): JournalPageData {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const list = Array.isArray(raw.items) ? raw.items : [];
  const items: JournalItem[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    if (!r || typeof r !== "object" || items.length >= JOURNAL_MAX_ITEMS) continue;
    const it = r as Record<string, unknown>;
    const type = ITEM_TYPES.find((t) => t === it.type) as JournalItem["type"] | undefined;
    if (!type) continue;
    const id = str(it.id, 40).replace(/[^A-Za-z0-9_-]/g, "") || `i${items.length}${Math.random().toString(36).slice(2, 8)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const item: JournalItem = {
      id, type,
      x: num(it.x, -10, 100, 10), y: num(it.y, -10, 100, 10),
      w: num(it.w, 6, 95, type === "tape" ? 28 : type === "stamp" ? 26 : type === "sticker" ? 14 : type === "ticket" ? 46 : 40),
      rot: num(it.rot, -45, 45, 0),
      z: Math.round(num(it.z, 0, 999, items.length + 1)),
    };
    if (type === "photo") {
      const photoId = str(it.photoId, 40);
      if (!ownedPhotos.has(photoId)) continue;
      item.photoId = photoId;
      item.caption = str(it.caption, 60);
    } else if (type === "note") {
      item.text = str(it.text, 400);
      item.style = NOTE_STYLES.find((s) => s === it.style) ?? "yellow";
      item.font = NOTE_FONTS.find((s) => s === it.font) ?? "hand";
    } else if (type === "place") {
      item.text = str(it.text, 80);
      if (!item.text) continue;
    } else if (type === "stamp") {
      // a copy of the stamp of a country (the image is the country's own, read from the theme)
      if (!isValidCountryHandle(it.h)) continue;
      item.h = it.h;
    } else if (type === "ticket") {
      item.text = str(it.text, 60);
      item.sub = str(it.sub, 60);
    } else if (type === "sticker") {
      const icon = STICKERS.find((s) => s === it.icon);
      if (!icon) continue;
      item.icon = icon;
    }
    items.push(item);
  }
  return { quote: str(raw.quote, 140), items };
}

export function parseStored(data: string): JournalPageData {
  try {
    const j = JSON.parse(data);
    return { quote: typeof j.quote === "string" ? j.quote : "", items: Array.isArray(j.items) ? j.items : [] };
  } catch {
    return { quote: "", items: [] };
  }
}

export async function readBook(shop: string, customerId: string) {
  const [pages, photoCount, visited, covers] = await Promise.all([
    db.journalPage.findMany({ where: { shop, customerId } }),
    db.journalPhoto.count({ where: { shop, customerId } }),
    db.countryTravel.findMany({ where: { shop, customerId, status: "visited" }, select: { countryHandle: true } }),
    db.journalCover.findMany({ where: { shop, customerId } }),
  ]);
  return {
    covers: Object.fromEntries(covers.map((c) => [c.continent, { title: c.title, color: c.color }])),
    pages: pages.map((p) => ({ country: p.countryHandle, updatedAt: p.updatedAt, ...parseStored(p.data) })),
    visited: visited.map((v) => v.countryHandle),
    photos: { count: photoCount, max: JOURNAL_MAX_PHOTOS },
  };
}

export async function savePage(shop: string, customerId: string, country: unknown, input: unknown) {
  if (!isValidCountryHandle(country)) throw new JournalFailure("INVALID_COUNTRY");
  const visited = await db.countryTravel.findFirst({ where: { shop, customerId, countryHandle: country, status: "visited" } });
  if (!visited) throw new JournalFailure("COUNTRY_LOCKED", 403);
  const mine = await db.journalPhoto.findMany({ where: { shop, customerId }, select: { id: true } });
  const page = sanitizePage(input, new Set(mine.map((p) => p.id)));
  const data = JSON.stringify(page);
  await db.journalPage.upsert({
    where: { shop_customerId_countryHandle: { shop, customerId, countryHandle: country } },
    create: { shop, customerId, countryHandle: country, data },
    update: { data },
  });
  return page;
}

// Pure: a cover is a known continent plus a short title and one of the ink colours (both may be empty = the default look).
export function sanitizeCover(continent: unknown, input: unknown): { continent: (typeof COVER_CONTINENTS)[number]; title: string; color: string } {
  const c = COVER_CONTINENTS.find((x) => x === continent);
  if (!c) throw new JournalFailure("INVALID_CONTINENT");
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const color = COVER_COLORS.find((x) => x === raw.color) ?? "";
  return { continent: c, title: str(raw.title, COVER_TITLE_MAX), color };
}

export async function saveCover(shop: string, customerId: string, continent: unknown, input: unknown) {
  const cv = sanitizeCover(continent, input);
  const where = { shop_customerId_continent: { shop, customerId, continent: cv.continent } };
  if (!cv.title && !cv.color) {
    // back to the default look: nothing to keep
    await db.journalCover.deleteMany({ where: { shop, customerId, continent: cv.continent } });
  } else {
    await db.journalCover.upsert({ where, create: { shop, customerId, continent: cv.continent, title: cv.title, color: cv.color }, update: { title: cv.title, color: cv.color } });
  }
  return { continent: cv.continent, title: cv.title, color: cv.color };
}

export function decodeDataUrl(v: unknown): { mime: string; bytes: Buffer } {
  if (typeof v !== "string") throw new JournalFailure("INVALID_PHOTO");
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m || !PHOTO_MIMES.includes(m[1])) throw new JournalFailure("INVALID_PHOTO");
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length) throw new JournalFailure("INVALID_PHOTO");
  if (bytes.length > JOURNAL_MAX_PHOTO_BYTES) throw new JournalFailure("PHOTO_TOO_LARGE");
  return { mime: m[1], bytes };
}

export async function addPhoto(shop: string, customerId: string, dataUrl: unknown) {
  const { mime, bytes } = decodeDataUrl(dataUrl);
  const count = await db.journalPhoto.count({ where: { shop, customerId } });
  if (count >= JOURNAL_MAX_PHOTOS) throw new JournalFailure("JOURNAL_PHOTO_LIMIT");
  const photo = await db.journalPhoto.create({ data: { shop, customerId, mime, size: bytes.length, bytes: new Uint8Array(bytes) } });
  return { id: photo.id, count: count + 1 };
}

export async function getPhoto(shop: string, customerId: string, id: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  return db.journalPhoto.findFirst({ where: { id, shop, customerId } });
}

// Drops photos no page of the member uses any more.
export async function pruneUnusedPhotos(shop: string, customerId: string) {
  const [pages, photos] = await Promise.all([
    db.journalPage.findMany({ where: { shop, customerId }, select: { data: true } }),
    db.journalPhoto.findMany({ where: { shop, customerId }, select: { id: true, createdAt: true } }),
  ]);
  const used = new Set<string>();
  for (const p of pages) for (const it of parseStored(p.data).items) if (it.photoId) used.add(it.photoId);
  const cutoff = Date.now() - 60 * 60 * 1000; // a photo uploaded in the last hour may not be saved on a page yet
  const stale = photos.filter((p) => !used.has(p.id) && p.createdAt.getTime() < cutoff).map((p) => p.id);
  if (stale.length) await db.journalPhoto.deleteMany({ where: { id: { in: stale }, shop, customerId } });
  return stale.length;
}
