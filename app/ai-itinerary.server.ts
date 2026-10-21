// AI step of the "Plan a trip" assistant (Club only).
//
// The page builds the route and the day structure with its own data. When the member asks for it, the page sends the numbered list of
// verified places of every city of the route plus the member's answers, and the model decides WHICH of those places goes in each moment
// of each day (morning, lunch, afternoon, sunset, dinner) and adds a short reason. It can only answer with numbers from the list, so it
// can not invent a place; the server checks every number and the page checks them again against its own data before using them.
//
// Off by default: it runs only with AI_ITINERARY_ENABLED=true and OPENAI_API_KEY. AI_ITINERARY_MODEL picks the model.

export const AI_SLOTS = ["m", "lunch", "a", "sun", "din"] as const;
export type AiSlot = (typeof AI_SLOTS)[number];
export type AiPick = { i: number; tip: string } | null;
export type AiDay = Record<AiSlot, AiPick>;
export type AiPlanResult = { legs: Array<{ days: AiDay[] }> };

type PoolItem = { i: number; name: string; cat: string; tier: number; slot: string; hours: number };
export type AiRequest = {
  ctx: { who: string; people: number; likes: string[]; pace: string; pets: string; month: number; lang: string };
  legs: Array<{ city: string; country: string; days: number; mode: string; first: boolean; pool: PoolItem[] }>;
};

const CATS = ["museum", "monument", "view", "walk", "nature", "beach", "adventure", "food", "shop", "night", "rest"];
const MODES = ["classic", "tailored", "discover", "secret"];
const LANGS: Record<string, string> = { es: "Spanish", en: "English", fr: "French", it: "Italian" };
const MAX_LEGS = 12, MAX_DAYS_TOTAL = 45, MAX_POOL = 48, MAX_TIP = 100;

export function aiItineraryEnabled(): boolean {
  return process.env.AI_ITINERARY_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}

// ---- limits: a few per member per day, and a ceiling for the whole shop per day (in memory; a restart resets them)
const perMember = new Map<string, number[]>();
let shopDay = { key: "", n: 0 };
const PER_MINUTE = 2;
function perDay() { return Math.max(1, Number(process.env.AI_ITINERARY_PER_DAY) || 6); }
function shopCap() { return Math.max(1, Number(process.env.AI_ITINERARY_SHOP_PER_DAY) || 400); }
export function aiAllowance(customerId: string, now = Date.now()): { ok: boolean; reason?: "RATE_LIMIT" | "AI_DAILY_LIMIT" | "AI_BUSY"; left: number } {
  const list = (perMember.get(customerId) || []).filter((t) => now - t < 86400000);
  const today = new Date(now).toISOString().slice(0, 10);
  if (shopDay.key !== today) shopDay = { key: today, n: 0 };
  if (list.length >= perDay()) { perMember.set(customerId, list); return { ok: false, reason: "AI_DAILY_LIMIT", left: 0 }; }
  if (list.filter((t) => now - t < 60000).length >= PER_MINUTE) { perMember.set(customerId, list); return { ok: false, reason: "RATE_LIMIT", left: perDay() - list.length }; }
  if (shopDay.n >= shopCap()) return { ok: false, reason: "AI_BUSY", left: perDay() - list.length };
  return { ok: true, left: perDay() - list.length };
}
export function aiRegister(customerId: string, now = Date.now()) {
  const list = (perMember.get(customerId) || []).filter((t) => now - t < 86400000);
  list.push(now); perMember.set(customerId, list); shopDay.n++;
  if (perMember.size > 3000) for (const [k, v] of perMember) if (!v.some((t) => now - t < 86400000)) perMember.delete(k);
}
export function aiRefund(customerId: string) {
  const list = perMember.get(customerId); if (list && list.length) list.pop();
  if (shopDay.n > 0) shopDay.n--;
}
export function aiLeft(customerId: string, now = Date.now()): number {
  return Math.max(0, perDay() - (perMember.get(customerId) || []).filter((t) => now - t < 86400000).length);
}

// ---- the request, cleaned
function str(v: unknown, max: number): string { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }

export function sanitizeAiRequest(raw: any): AiRequest | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.legs) || !raw.legs.length || raw.legs.length > MAX_LEGS) return null;
  const c = raw.ctx && typeof raw.ctx === "object" ? raw.ctx : {};
  const lang = LANGS[c.lang] ? c.lang : "en";
  const ctx = {
    who: ["solo", "couple", "family", "friends", "group"].includes(c.who) ? c.who : "solo",
    people: Math.max(1, Math.min(20, Math.round(Number(c.people)) || 1)),
    likes: (Array.isArray(c.likes) ? c.likes : []).map((x: unknown) => str(x, 24)).filter(Boolean).slice(0, 12),
    pace: ["relaxed", "balanced", "busy"].includes(c.pace) ? c.pace : "balanced",
    pets: ["dog", "cat", "other", ""].includes(c.pets) ? c.pets : "",
    month: Math.max(0, Math.min(12, Math.round(Number(c.month)) || 0)),
    lang,
  };
  let total = 0;
  const legs: AiRequest["legs"] = [];
  for (const l of raw.legs) {
    const days = Math.round(Number(l?.days));
    if (!l || !(days >= 1 && days <= MAX_DAYS_TOTAL) || !Array.isArray(l.pool)) return null;
    total += days;
    const seen = new Set<number>(), pool: PoolItem[] = [];
    for (const p of l.pool.slice(0, MAX_POOL)) {
      if (!Array.isArray(p)) continue;
      const i = Math.round(Number(p[0]));
      if (!(i >= 0 && i < 5000) || seen.has(i)) continue;
      const cat = String(p[2]), slot = String(p[4]);
      if (!CATS.includes(cat) || !["m", "a", "e"].includes(slot)) continue;
      const name = str(p[1], 90); if (!name) continue;
      seen.add(i);
      pool.push({ i, name, cat, tier: Math.max(1, Math.min(3, Math.round(Number(p[3])) || 1)), slot, hours: Math.max(0.25, Math.min(12, Number(p[5]) || 1)) });
    }
    if (pool.length < 3) return null;
    legs.push({ city: str(l.city, 60), country: str(l.country, 60), days, mode: MODES.includes(l.mode) ? l.mode : "classic", first: !!l.first, pool });
  }
  if (total > MAX_DAYS_TOTAL) return null;
  return { ctx, legs };
}

// ---- what each moment of the day accepts (same rules as the page)
const NONFOOD = (cat: string) => cat !== "food" && cat !== "night";
const SLOT_OK: Record<AiSlot, (p: PoolItem) => boolean> = {
  m: (p) => NONFOOD(p.cat),
  lunch: (p) => p.cat === "food",
  a: (p) => NONFOOD(p.cat),
  sun: (p) => NONFOOD(p.cat) && p.slot !== "m",
  din: (p) => p.cat === "food" || p.cat === "night",
};

function cleanTip(v: unknown): string {
  const t = str(v, 400).replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\s+/g, " ").trim();
  if (t.length > MAX_TIP) return t.slice(0, MAX_TIP - 1).replace(/\s+\S*$/, "") + "…";
  return t;
}

/** Keeps only the picks that are valid: a number of that city's list, right kind of place for the moment, never twice in a city. */
export function validateAiPlan(req: AiRequest, out: any): AiPlanResult {
  const legsOut: AiPlanResult["legs"] = [];
  req.legs.forEach((leg, li) => {
    const byIdx = new Map(leg.pool.map((p) => [p.i, p]));
    const used = new Set<number>();
    const rawDays: any[] = Array.isArray(out?.legs?.[li]?.days) ? out.legs[li].days : [];
    const days: AiDay[] = [];
    for (let di = 0; di < leg.days; di++) {
      const rd = rawDays[di] || {};
      const day = { m: null, lunch: null, a: null, sun: null, din: null } as AiDay;
      for (const slot of AI_SLOTS) {
        if (slot === "m" && di === 0) continue; // the first day of a city starts with the arrival or the transfer
        const pick = rd[slot];
        if (!pick || typeof pick !== "object") continue;
        const i = Math.round(Number(pick.i));
        const p = byIdx.get(i);
        if (!p || used.has(i) || !SLOT_OK[slot](p)) continue;
        used.add(i);
        day[slot] = { i, tip: cleanTip(pick.tip) };
      }
      days.push(day);
    }
    legsOut.push({ days });
  });
  return { legs: legsOut };
}

// ---- the model
const PICK = { anyOf: [{ type: "null" }, { type: "object", properties: { i: { type: "integer" }, tip: { type: "string" } }, required: ["i", "tip"], additionalProperties: false }] };
const SCHEMA = {
  type: "object",
  properties: {
    legs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: { m: PICK, lunch: PICK, a: PICK, sun: PICK, din: PICK },
              required: ["m", "lunch", "a", "sun", "din"],
              additionalProperties: false,
            },
          },
        },
        required: ["days"],
        additionalProperties: false,
      },
    },
  },
  required: ["legs"],
  additionalProperties: false,
};

const MODE_TEXT: Record<string, string> = {
  classic: "the classics everyone does first (tier 1), a few lesser-known ones",
  tailored: "mostly what matches the traveller's interests, whatever the tier",
  discover: "a mix of classics and lesser-known places (tier 2), some hidden gems (tier 3)",
  secret: "mostly lesser-known places and hidden gems (tier 3), very few classics",
};
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function buildMessages(req: AiRequest) {
  const c = req.ctx;
  const system = [
    "You plan the days of a trip for RODI Club, a premium travel membership. For every city you receive a numbered list of verified places.",
    "Choose, for every day of every city, which place goes in each moment: m = morning, lunch, a = afternoon, sun = sunset, din = dinner.",
    "Rules: use ONLY the numbers (field i) of the list of that city. Never use a number twice in the same city. Lunch must be a place with category food. Dinner must be food or night.",
    "Morning, afternoon and sunset must NOT be food or night places; sunset prefers view, walk, nature or beach and never a place whose best time is m (morning).",
    "Morning is null on the first day of a city (the traveller arrives). Use null for a moment when nothing fits; a day can have no sunset.",
    "Think like a local guide: keep a day geographically and thematically coherent, put the demanding places in the morning, leave the evening for relaxed places, vary the categories, and respect the pace (relaxed = fewer and slower, busy = full days). Visits last the number of hours given (hours); do not overload a day.",
    "Tailor to the interests and to who travels (family = easy, short walks; couple = romantic spots; friends/group = lively). If a pet travels, prefer outdoor places and avoid long closed-door visits.",
    `For each pick write tip: one short sentence (max ${MAX_TIP} characters, in ${LANGS[c.lang]}) saying why it fits THIS traveller on THIS day. No prices, no opening hours, no links, no claims you can not know from the list.`,
  ].join("\n");
  const user = JSON.stringify({
    traveller: { group: c.who, people: c.people, interests: c.likes, pace: c.pace, pet: c.pets || "none", month: MONTHS[c.month] || "unknown" },
    cities: req.legs.map((l) => ({
      city: l.city, country: l.country, days: l.days, firstDayOfTheTripOrCityHasArrival: true, style: MODE_TEXT[l.mode],
      places: l.pool.map((p) => ({ i: p.i, name: p.name, category: p.cat, tier: p.tier, bestTime: p.slot === "m" ? "morning" : p.slot === "a" ? "afternoon" : "evening", hours: p.hours })),
    })),
  });
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export class AiFailure extends Error {
  code: "AI_OFF" | "AI_UNAVAILABLE" | "AI_BAD_REQUEST";
  constructor(code: "AI_OFF" | "AI_UNAVAILABLE" | "AI_BAD_REQUEST") { super(code); this.code = code; }
}

export async function planWithAi(req: AiRequest, timeoutMs = 30000): Promise<AiPlanResult> {
  if (!aiItineraryEnabled()) throw new AiFailure("AI_OFF");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const days = req.legs.reduce((a, l) => a + l.days, 0);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_ITINERARY_MODEL || "gpt-4.1-mini",
        messages: buildMessages(req),
        response_format: { type: "json_schema", json_schema: { name: "itinerary", strict: true, schema: SCHEMA } },
        max_completion_tokens: Math.min(12000, 600 + days * 330),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AiFailure("AI_UNAVAILABLE");
  }
  if (!res.ok) throw new AiFailure("AI_UNAVAILABLE");
  let content = "";
  try { content = ((await res.json()) as any)?.choices?.[0]?.message?.content || ""; } catch { throw new AiFailure("AI_UNAVAILABLE"); }
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new AiFailure("AI_UNAVAILABLE"); }
  return validateAiPlan(req, parsed);
}
