import { searchPlaces } from "./route-map.server";

// Getting there and back. A trip has up to two journeys (out and back): how it is travelled, when it leaves and arrives and the stops in between
// (layovers, a change of train...). Stored inside Trip.wizard.jr. Dates are YYYY-MM-DD and times HH:MM, both optional: a member who does not
// know them yet gets an approximate duration from the distance between the two cities (estimateJourney).
export const JOURNEY_MODES = ["flight", "train", "bus", "ship", "car", "other"] as const;
export const JOURNEY_MAX_STOPS = 6;

export type JourneyStop = { p: string; aD: string; aT: string; dD: string; dT: string };
export type Journey = { mode: (typeof JOURNEY_MODES)[number]; dep: string; depT: string; arr: string; arrT: string; stops: JourneyStop[] };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const date = (v: unknown) => { const s = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime()) ? s : ""; };
const time = (v: unknown) => { const s = clean(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ""; };

export function sanitizeJourney(raw: unknown): Journey | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mode = (JOURNEY_MODES as readonly string[]).includes(r.mode as string) ? (r.mode as Journey["mode"]) : "flight";
  const stops: JourneyStop[] = (Array.isArray(r.stops) ? r.stops : [])
    .slice(0, JOURNEY_MAX_STOPS)
    .map((s) => { const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>; return { p: clean(o.p, 80), aD: date(o.aD), aT: time(o.aT), dD: date(o.dD), dT: time(o.dT) }; })
    .filter((s) => s.p);
  const j: Journey = { mode, dep: date(r.dep), depT: time(r.depT), arr: date(r.arr), arrT: time(r.arrT), stops };
  return j.dep || j.depT || j.arr || j.arrT || stops.length || mode !== "flight" ? j : null;
}

// ---- estimate from the distance

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pure: approximate minutes for each way of travelling over a straight-line distance. Flights are direct and include ~1 h on the ground; ground modes add a road/rail detour. */
export function estimateMinutes(km: number): Record<(typeof JOURNEY_MODES)[number], number> {
  const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
  const flight = 55 + (km / (km < 1200 ? 650 : 800)) * 60 + (km > 3500 ? 20 : 0);
  const train = ((km * 1.15) / (km < 900 ? 140 : 100)) * 60;
  const bus = ((km * 1.25) / 65) * 60;
  const car = ((km * 1.25) / 80) * 60;
  const ship = ((km * 1.1) / 32) * 60;
  return { flight: round5(flight), train: round5(train), bus: round5(bus), car: round5(car), ship: round5(ship), other: round5(bus) };
}

const geo = new Map<string, { t: number; hit: { lat: number; lng: number } | null }>();
const GEO_TTL = 30 * 24 * 3600 * 1000, GEO_MAX = 2000;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export async function geocodeCity(name: string): Promise<{ lat: number; lng: number } | null> {
  const q = clean(name, 80);
  if (q.length < 2) return null;
  const key = norm(q), cached = geo.get(key);
  if (cached && Date.now() - cached.t < GEO_TTL) return cached.hit;
  const hits = await searchPlaces(q, { limit: 1 });
  const hit = hits[0] ? { lat: hits[0].lat, lng: hits[0].lng } : null;
  if (geo.size >= GEO_MAX) geo.delete(geo.keys().next().value as string);
  geo.set(key, { t: Date.now(), hit });
  return hit;
}

export async function estimateJourney(from: string, to: string) {
  const [a, b] = [await geocodeCity(from), await geocodeCity(to)];
  if (!a || !b) return { ok: false as const };
  const km = Math.round(haversineKm(a, b));
  return { ok: true as const, km, minutes: estimateMinutes(km) };
}
