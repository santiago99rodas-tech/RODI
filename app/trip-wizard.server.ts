// What the "Plan a trip" assistant asks besides destination and dates: who is travelling, what they like to do, which countries
// (a trip can have several) and whether they already have an itinerary or chose one of the suggested routes.
// Stored as one JSON string on Trip.wizard. The packing page reads it as the starting point of the smart list, and the itinerary
// page shows the chosen route when the trip has no days yet.

export const WIZARD_WHO = ["solo", "couple", "family", "friends"] as const;
export const WIZARD_LIKES = ["food", "culture", "beach", "nature", "adventure", "shop", "rest", "night"] as const;
export const WIZARD_ROUTES = ["ess", "likes", "slow", "off"] as const;

export type WizardLeg = { c: string; h: string; n: string; d: number };
export type WizardPlan = { mode: "have" | "suggest"; route?: string; legs?: WizardLeg[] };
// origin: the city the trip starts from; ret: where it ends when that is not the same city (empty = back to the origin); trav: the itinerary has a travel day going and another coming back.
export type TripWizard = { who: (typeof WIZARD_WHO)[number] | null; people: number; likes: string[]; countries: string[]; plan: WizardPlan | null; origin: string; ret: string; trav: boolean };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function sanitizePlan(raw: unknown): WizardPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === "have") return { mode: "have" };
  if (r.mode !== "suggest") return null;
  const route = (WIZARD_ROUTES as readonly string[]).includes(r.route as string) ? (r.route as string) : undefined;
  const legs: WizardLeg[] = Array.isArray(r.legs)
    ? r.legs
        .slice(0, 40)
        .map((l) => {
          const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
          return { c: clean(o.c, 60), h: clean(o.h, 80), n: clean(o.n, 80), d: Math.min(60, Math.max(1, Math.round(Number(o.d)) || 1)) };
        })
        .filter((l) => l.n)
    : [];
  return legs.length ? { mode: "suggest", route, legs } : { mode: "suggest" };
}

export function sanitizeWizard(raw: unknown): TripWizard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const who = (WIZARD_WHO as readonly string[]).includes(r.who as string) ? (r.who as TripWizard["who"]) : null;
  const likes = Array.isArray(r.likes)
    ? [...new Set(r.likes.filter((l): l is string => typeof l === "string"))].filter((l) => (WIZARD_LIKES as readonly string[]).includes(l))
    : [];
  const countries = Array.isArray(r.countries) ? [...new Set(r.countries.map((c) => clean(c, 80)).filter(Boolean))].slice(0, 30) : [];
  const plan = sanitizePlan(r.plan);
  const n = Math.round(Number(r.people));
  const people = who === "solo" ? 1 : Number.isFinite(n) ? Math.min(20, Math.max(who ? 2 : 1, n)) : who ? 2 : 1;
  const origin = clean(r.origin, 80), ret = clean(r.ret, 80), trav = r.trav === true;
  if (!who && !likes.length && !countries.length && !plan && !origin) return null;
  return { who, people, likes, countries, plan, origin, ret, trav };
}
