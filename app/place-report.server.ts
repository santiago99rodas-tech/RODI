import db from "./db.server";

// "Is it closed?" notices (Itinerary): a member tells RODI that a place it suggested has closed. The staff reviews them in
// the app (app.place-reports.tsx) and removes the place from the data once confirmed.
export const REPORTS_PER_DAY = 20;
export const REPORT_STATUSES = ["new", "removed", "dismissed"] as const;

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export function normName(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// Pure: what a notice may carry. A place needs a name; city and country are optional context.
export function sanitizeReport(input: unknown): { name: string; city: string; country: string; norm: string } | null {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = clean(r.name, 120);
  if (name.length < 2) return null;
  return { name, city: clean(r.city, 80).toLowerCase(), country: clean(r.country, 60).toLowerCase(), norm: normName(name).slice(0, 120) };
}

export async function saveReport(shop: string, customerId: string, input: unknown) {
  const rep = sanitizeReport(input);
  if (!rep) return { error: "INVALID" as const };
  const exists = await db.placeReport.findFirst({ where: { shop, customerId, city: rep.city, norm: rep.norm } });
  if (exists) return { ok: true as const, duplicate: true };
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  if ((await db.placeReport.count({ where: { shop, customerId, createdAt: { gte: since } } })) >= REPORTS_PER_DAY) return { error: "RATE_LIMIT" as const };
  await db.placeReport.create({ data: { shop, customerId, country: rep.country, city: rep.city, name: rep.name, norm: rep.norm } });
  return { ok: true as const, duplicate: false };
}
