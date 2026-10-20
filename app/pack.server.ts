// Smart packing (Club). The list itself is derived in the theme (assets/rodi-packing-core.js) from the trip and these
// preferences; the server only keeps what the member decided and what they ticked, and enforces that it is Club-only.
// Smart items are stored by `key` (language-neutral), never by label, so one member can read the same list in another
// language or regional vocabulary.

export const PACK_LUGGAGE = ["bag", "cabin", "checked"] as const;
export const PACK_ACTIVITIES = [
  "city", "museums", "food", "shop", "photo", "hike", "trek", "camp", "safari", "bike", "beach", "snorkel", "surf",
  "snow", "gym", "yoga", "spa", "night", "event", "formal", "work", "biz",
] as const;

// the bags the member brings: a personal item (0/1), cabin bags, 23 kg and 32 kg checked bags, and up to four of any other weight (kg)
export type PackBags = { pers: number; cab: number; c23: number; c32: number; cx: number[] };

export type PackPrefs = {
  lug: (typeof PACK_LUGGAGE)[number];
  bl?: PackBags; // the bags above (lug and bags stay as the simple summary older pages read)
  bags: number; // checked bags, 1 to 3 (only meaningful when lug === "checked")
  laun: boolean; // can wash clothes mid-trip
  trav: number; // travelers
  acts: string[];
  place: string; // city or country handle the climate and plugs are read from ("" = guess from the destination text)
  total: number; // how many items the list had when it was last saved (readiness needs the size of the whole list)
};

const HANDLE = /^[a-z0-9-]{0,80}$/;

export function sanitizePackPrefs(raw: unknown): PackPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!PACK_LUGGAGE.includes(r.lug as never)) return null;
  const bags = Math.round(Number(r.bags));
  const trav = Math.round(Number(r.trav));
  const total = Math.round(Number(r.total));
  if (!Number.isFinite(bags) || !Number.isFinite(trav) || !Number.isFinite(total)) return null;
  if (!Array.isArray(r.acts) || r.acts.length > PACK_ACTIVITIES.length) return null;
  const acts = [...new Set(r.acts.filter((a): a is string => typeof a === "string"))].filter((a) => (PACK_ACTIVITIES as readonly string[]).includes(a));
  const place = typeof r.place === "string" ? r.place : "";
  if (!HANDLE.test(place)) return null;
  let bl: PackBags | undefined;
  if (r.bl && typeof r.bl === "object") {
    const b = r.bl as Record<string, unknown>, n = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v)) || 0));
    const cx = Array.isArray(b.cx) ? b.cx.map((v) => Math.round(Number(v))).filter((v) => Number.isFinite(v) && v >= 5 && v <= 50).slice(0, 4) : [];
    bl = { pers: n(b.pers, 1), cab: n(b.cab, 3), c23: n(b.c23, 6), c32: n(b.c32, 6), cx };
  }
  return {
    lug: r.lug as PackPrefs["lug"],
    ...(bl ? { bl } : {}),
    bags: Math.min(3, Math.max(1, bags)),
    laun: r.laun === true,
    trav: Math.min(12, Math.max(1, trav)),
    acts,
    place,
    total: Math.min(250, Math.max(0, total)),
  };
}

export function parsePackPrefs(stored: string | null | undefined): PackPrefs | null {
  if (!stored) return null;
  try { return sanitizePackPrefs(JSON.parse(stored)); } catch { return null; }
}

// Categories the Club list uses for items a member types in by hand. Rows in any other category are the old starter checklist
// (documents, clothing...) from before the member was Club: they stay visible but do not count toward the list.
export const PACK_CATEGORIES = ["docs", "prep", "clothes", "shoes", "care", "tech", "health", "pet", "act", "carry"] as const;

// A smart item key looks like "tee", "act:beach:0" or "f:documents:2" (Free template); keep it tame.
export const PACK_KEY = /^[a-z0-9][a-z0-9:._-]{0,59}$/;

// Share of the packing list that is ticked, for Travel Readiness. With smart prefs the denominator is the size of the
// whole list (rows only exist for items that were ticked or edited), plus anything the member typed in by hand.
export function packingRatio(
  prefs: PackPrefs | null,
  checklist: { done: boolean; key?: string | null; source?: string | null; category?: string | null }[],
): number {
  if (!prefs) {
    return checklist.length ? checklist.filter((c) => c.done).length / checklist.length : 0;
  }
  const smartDone = checklist.filter((c) => c.key && c.done).length;
  const manual = checklist.filter((c) => !c.key && c.source !== "smart" && (PACK_CATEGORIES as readonly string[]).includes(c.category ?? ""));
  const total = prefs.total + manual.length;
  if (!total) return 0;
  return Math.min(1, (smartDone + manual.filter((c) => c.done).length) / total);
}
