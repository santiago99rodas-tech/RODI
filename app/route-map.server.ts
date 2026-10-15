// Route map (Club). Pure rules plus the place search, kept out of apps.proxy.tsx so they can be tested on their own.
// Two free geocoders over OpenStreetMap data, both reached only through this server (results are cached and each member
// has a per-minute limit):
// - suggestPlaces: Photon, for the dropdown while typing. Its public instance is built for search-as-you-type but can be slow.
// - searchPlaces: Nominatim, when the member presses Enter. Fast, but its public instance forbids search-as-you-type and
//   allows one request per second, so every call here waits its turn.

export const MAP_PLACE_LIMIT = 300; // places per trip, those in a day plus those still unassigned
export const MAP_IMPORT_BATCH = 300;
export const MAP_CATEGORIES = ["comida", "tienda", "must", "mirador", "cultura", "bar"] as const;
export const MAP_STATUSES = ["want", "review"] as const;

export type CleanPlace = { name: string; category: string; lat: number; lng: number; note: string | null; status: string | null };

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Returns the place ready to store, or null when it is not usable (no name, or no real coordinates).
export function cleanPlace(raw: unknown): CleanPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 160);
  const lat = Number(r.lat);
  const lng = Number(r.lng ?? r.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const category = (MAP_CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as string) : "must";
  const status = (MAP_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as string) : null;
  return { name, category, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, note: text(r.note, 300) || null, status };
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Metres between two points (haversine).
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The same name within 150 m of a place already on the trip counts as a duplicate (re-importing a list must not double it).
export function isDuplicate(p: { name: string; lat: number; lng: number }, existing: { name: string; lat: number; lng: number }[]): boolean {
  const n = norm(p.name);
  return existing.some((e) => norm(e.name) === n && metres(p, e) < 150);
}

// How many of `incoming` fit under the cap, given what the trip already has.
export function roomLeft(existingCount: number, incomingCount: number): { fit: number; over: number } {
  const room = Math.max(0, MAP_PLACE_LIMIT - existingCount);
  const fit = Math.min(room, incomingCount);
  return { fit, over: incomingCount - fit };
}

// ---- search (Photon)

type Hit = { name: string; sub: string; hood: string; category: string; lat: number; lng: number; osmId: string };

const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_LANGS = ["en", "fr", "it", "de"];
const UA = "RODI-Club-RouteMap/1.0 (+https://rodiclub.com)";
const cache = new Map<string, { t: number; hits: Hit[] }>();
const CACHE_TTL = 15 * 60 * 1000, CACHE_MAX = 800;
const recent = new Map<string, number[]>();
const PER_MINUTE = 40;

export function allowSearch(customerId: string, now = Date.now()): boolean {
  const list = (recent.get(customerId) || []).filter((t) => now - t < 60000);
  if (list.length >= PER_MINUTE) { recent.set(customerId, list); return false; }
  list.push(now); recent.set(customerId, list);
  if (recent.size > 2000) for (const k of recent.keys()) { if (!(recent.get(k) || []).some((t) => now - t < 60000)) recent.delete(k); }
  return true;
}

// OSM tags -> the six categories the map uses.
export function categoryFor(key: string | undefined, value: string | undefined): string {
  const k = key || "", v = value || "";
  if (k === "amenity") {
    if (["restaurant", "cafe", "fast_food", "food_court", "ice_cream", "biergarten", "bakery"].includes(v)) return "comida";
    if (["bar", "pub", "nightclub"].includes(v)) return "bar";
    if (["marketplace"].includes(v)) return "tienda";
    if (["theatre", "cinema", "arts_centre", "place_of_worship", "library", "townhall"].includes(v)) return "cultura";
  }
  if (k === "shop") return "tienda";
  if (k === "tourism") {
    if (v === "viewpoint") return "mirador";
    if (["museum", "gallery", "artwork"].includes(v)) return "cultura";
    return "must";
  }
  if (k === "historic" || (k === "building" && ["cathedral", "church", "chapel", "castle", "stadium"].includes(v))) return "cultura";
  if (k === "leisure" && ["stadium", "sports_centre", "arena"].includes(v)) return "cultura";
  return "must";
}

function toHit(f: any): Hit | null {
  const p = f?.properties || {}, c = f?.geometry?.coordinates;
  if (!p.name || !Array.isArray(c) || c.length < 2) return null;
  const hood = [p.district || p.locality || p.suburb, p.city || p.county || p.state].filter(Boolean).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(", ");
  const kind = [p.osm_value && String(p.osm_value).replace(/_/g, " "), p.country].filter(Boolean).join(" · ");
  return { name: String(p.name), sub: kind, hood, category: categoryFor(p.osm_key, p.osm_value), lat: Number(c[1]), lng: Number(c[0]), osmId: `${p.osm_type || ""}${p.osm_id || ""}` };
}

export async function suggestPlaces(query: string, opts: { lat?: number; lon?: number; lang?: string; limit?: number } = {}): Promise<Hit[]> {
  const q = text(query, 120);
  if (q.length < 3) return [];
  const lang = PHOTON_LANGS.includes(opts.lang || "") ? opts.lang! : "";
  const near = Number.isFinite(opts.lat) && Number.isFinite(opts.lon);
  // snap the bias point so nearby map positions share a cache entry
  const key = ["s", norm(q), lang, near ? `${Math.round(opts.lat! * 10) / 10},${Math.round(opts.lon! * 10) / 10}` : "", opts.limit || 6].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.hits;
  const url = new URL(PHOTON);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(opts.limit || 6));
  if (lang) url.searchParams.set("lang", lang);
  if (near) { url.searchParams.set("lat", String(opts.lat)); url.searchParams.set("lon", String(opts.lon)); }
  const json: any = await getJson(url, 12000);
  const hits = (json.features || []).map(toHit).filter(Boolean) as Hit[];
  remember(key, hits);
  return hits;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
let nominatimNext = 0;

function toHitN(r: any): Hit | null {
  const lat = Number(r?.lat), lon = Number(r?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = r.address || {};
  const name = String(r.name || String(r.display_name || "").split(",")[0] || "").trim();
  if (!name) return null;
  const hood = [a.suburb || a.city_district || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.municipality].filter(Boolean).filter((x: string, i: number, arr: string[]) => arr.indexOf(x) === i).join(", ");
  const kind = [r.type && String(r.type).replace(/_/g, " "), a.country].filter(Boolean).join(" · ");
  return { name, sub: kind, hood, category: categoryFor(r.category || r.class, r.type), lat, lng: lon, osmId: `${r.osm_type || ""}${r.osm_id || ""}` };
}

export async function searchPlaces(query: string, opts: { lat?: number; lon?: number; lang?: string; limit?: number } = {}): Promise<Hit[]> {
  const q = text(query, 120);
  if (q.length < 2) return [];
  const near = Number.isFinite(opts.lat) && Number.isFinite(opts.lon);
  const key = ["n", norm(q), opts.lang || "", near ? `${Math.round(opts.lat! * 10) / 10},${Math.round(opts.lon! * 10) / 10}` : "", opts.limit || 6].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.hits;
  // one request per second to the public instance, however many members are searching
  const wait = nominatimNext - Date.now();
  nominatimNext = Math.max(Date.now(), nominatimNext) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(opts.limit || 6));
  if (opts.lang) url.searchParams.set("accept-language", opts.lang);
  if (near) { const d = 1.5; url.searchParams.set("viewbox", `${opts.lon! - d},${opts.lat! + d},${opts.lon! + d},${opts.lat! - d}`); }
  const json: any = await getJson(url, 8000);
  const hits = (Array.isArray(json) ? json : []).map(toHitN).filter(Boolean) as Hit[];
  remember(key, hits);
  return hits;
}

async function getJson(url: URL, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function remember(key: string, hits: Hit[]) {
  cache.set(key, { t: Date.now(), hits });
  if (cache.size > CACHE_MAX) { const first = cache.keys().next().value; if (first) cache.delete(first); }
}

// Looks up a few names one after another (searchPlaces already spaces its requests) to import a Takeout CSV, which has no coordinates.
export async function geocodeNames(names: string[], near: { lat?: number; lon?: number; lang?: string }): Promise<{ name: string; hit: Hit | null }[]> {
  const out: { name: string; hit: Hit | null }[] = [];
  for (const raw of names.slice(0, 6)) {
    const name = text(raw, 160);
    let hit: Hit | null = null;
    try { hit = (await searchPlaces(name, { ...near, limit: 1 }))[0] || null; } catch { hit = null; }
    out.push({ name, hit });
  }
  return out;
}

// ---- moving things between days and the "por asignar" tray

import type { PrismaClient } from "@prisma/client";
export type MapTx = Pick<PrismaClient, "activity" | "tripPlace" | "day">;

export async function reindexDay(tx: MapTx, dayId: string, ids?: string[]) {
  const order = ids ?? (await tx.activity.findMany({ where: { dayId }, orderBy: { sortOrder: "asc" }, select: { id: true } })).map((r) => r.id);
  for (let i = 0; i < order.length; i++) await tx.activity.update({ where: { id: order[i] }, data: { sortOrder: i } });
}

// Moves a stop or a saved place to a day (at `index`, default the end) or back to the tray (toDayId null).
// A place that enters a day becomes an Activity and an Activity that goes back to the tray becomes a place, so the id can change.
export async function moveMapPlace(
  tx: MapTx,
  a: { kind: "activity" | "place"; id: string; tripId: string; toDayId: string | null; index: number | null },
): Promise<{ kind: "activity" | "place"; id: string } | { error: "NO_COORDS" }> {
  const insertAt = (ids: string[], newId: string) => {
    const at = a.index === null ? ids.length : Math.min(Math.max(a.index, 0), ids.length);
    const next = ids.slice(); next.splice(at, 0, newId); return next;
  };
  if (a.kind === "activity") {
    const act = (await tx.activity.findUnique({ where: { id: a.id } }))!;
    if (!a.toDayId) {
      if (act.lat === null || act.lng === null) return { error: "NO_COORDS" };
      const created = await tx.tripPlace.create({ data: { tripId: a.tripId, name: act.title, category: act.category, lat: act.lat, lng: act.lng, note: act.note } });
      await tx.activity.delete({ where: { id: a.id } });
      await reindexDay(tx, act.dayId);
      return { kind: "place", id: created.id };
    }
    const others = (await tx.activity.findMany({ where: { dayId: a.toDayId, NOT: { id: a.id } }, orderBy: { sortOrder: "asc" }, select: { id: true } })).map((r) => r.id);
    await tx.activity.update({ where: { id: a.id }, data: { dayId: a.toDayId } });
    await reindexDay(tx, a.toDayId, insertAt(others, a.id));
    if (act.dayId !== a.toDayId) await reindexDay(tx, act.dayId);
    return { kind: "activity", id: a.id };
  }
  const pl = (await tx.tripPlace.findUnique({ where: { id: a.id } }))!;
  if (!a.toDayId) return { kind: "place", id: a.id };
  const others = (await tx.activity.findMany({ where: { dayId: a.toDayId }, orderBy: { sortOrder: "asc" }, select: { id: true } })).map((r) => r.id);
  const created = await tx.activity.create({
    data: { dayId: a.toDayId, title: pl.name, category: pl.category, note: pl.note, lat: pl.lat, lng: pl.lng, sortOrder: others.length },
  });
  await tx.tripPlace.delete({ where: { id: a.id } });
  await reindexDay(tx, a.toDayId, insertAt(others, created.id));
  return { kind: "activity", id: created.id };
}
