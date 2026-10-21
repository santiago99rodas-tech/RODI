// Tells an activity RODI suggested from text a member typed and marked as "suggested".
//
// The Free plan limits what the member adds (not what RODI suggests), but the "suggested" mark comes from the page, so a Free member who calls
// the API by hand could mark their own entries as suggested and skip the limit. For Free members the planner therefore accepts the mark only
// when the title is one RODI could have written: a curated place (assets/rodi-acts-*.js), a generic title of the itinerary ("arrival in X",
// "flight A -> B", "lunch in X"...) or the hotel of a night (the one entry the member types: category alojamiento at the stay time).
// The data is generated from the theme by scripts/build-curated-titles.mjs; run it again whenever those change.
import data from "./curated-titles.generated.json";

export const STAY_TIME = "23:59";

export function normTitle(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const NAMES = new Set<string>(data.names as string[]);
const GENERIC = new RegExp("^(?:" + (data.patterns as string[]).join("|") + ")$");

export function isCuratedTitle(title: unknown): boolean {
  const n = normTitle(title).slice(0, 160);
  return !!n && (NAMES.has(n) || GENERIC.test(n));
}

export function isStayEntry(a: { category?: unknown; time?: unknown }): boolean {
  return a.category === "alojamiento" && a.time === STAY_TIME;
}

/** Can this entry carry the "suggested" mark for a Free member? */
export function suggestedMarkOk(a: { title?: unknown; category?: unknown; time?: unknown }): boolean {
  return isStayEntry(a) || isCuratedTitle(a.title);
}
