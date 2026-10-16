// What the "Plan a trip" assistant asks besides destination and dates: who is travelling and what they like to do.
// Stored as one JSON string on Trip.wizard. The packing page reads it as the starting point of the smart list.

export const WIZARD_WHO = ["solo", "couple", "family", "friends"] as const;
export const WIZARD_LIKES = ["food", "culture", "beach", "nature", "adventure", "shop", "rest", "night"] as const;

export type TripWizard = { who: (typeof WIZARD_WHO)[number] | null; people: number; likes: string[] };

export function sanitizeWizard(raw: unknown): TripWizard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const who = (WIZARD_WHO as readonly string[]).includes(r.who as string) ? (r.who as TripWizard["who"]) : null;
  const likes = Array.isArray(r.likes)
    ? [...new Set(r.likes.filter((l): l is string => typeof l === "string"))].filter((l) => (WIZARD_LIKES as readonly string[]).includes(l))
    : [];
  const n = Math.round(Number(r.people));
  const people = who === "solo" ? 1 : Number.isFinite(n) ? Math.min(20, Math.max(who ? 2 : 1, n)) : who ? 2 : 1;
  if (!who && !likes.length) return null;
  return { who, people, likes };
}
