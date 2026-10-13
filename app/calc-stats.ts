// Aggregate usage numbers for the trip cost calculator, computed from the plans members saved to their
// account. Pure on purpose (no database import) so it can be tested; the admin page feeds it rows.
// Nothing personal leaves this module: only counts, averages and city names.

export type PlanRow = { customerId: string; currency: string; total: number; tripId: string | null; data: string; createdAt: Date };

export type CalcStats = {
  plans: number;
  plansLast7d: number;
  plansLast30d: number;
  customers: number;
  appliedToBudget: number;
  avgTravelers: number;
  withChildren: number;
  byCurrency: { currency: string; plans: number; avgTotal: number }[];
  topDestinations: { city: string; plans: number }[];
  panelUse: { panel: string; plans: number }[];
  unreadable: number;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function summarizePlans(rows: PlanRow[], now = new Date()): CalcStats {
  const day = 86_400_000;
  const customers = new Set<string>();
  const cur: Record<string, { n: number; sum: number }> = {};
  const cities = new Map<string, { label: string; n: number }>();
  const panels: Record<string, number> = {};
  let travelers = 0, withChildren = 0, applied = 0, l7 = 0, l30 = 0, unreadable = 0, readable = 0;

  for (const r of rows) {
    customers.add(r.customerId);
    if (r.tripId) applied++;
    const age = now.getTime() - r.createdAt.getTime();
    if (age <= 7 * day) l7++;
    if (age <= 30 * day) l30++;
    (cur[r.currency] ??= { n: 0, sum: 0 });
    cur[r.currency].n++;
    cur[r.currency].sum += r.total;

    let plan: any;
    try { plan = JSON.parse(r.data); } catch { unreadable++; continue; }
    readable++;
    const trav: any[] = Array.isArray(plan.trav) ? plan.trav : [];
    travelers += trav.length;
    if (trav.some((t) => t && t.k === "c")) withChildren++;

    const seen = new Set<string>();
    for (const s of Array.isArray(plan.stops) ? plan.stops : []) {
      const label = typeof s?.c === "string" ? s.c.trim() : "";
      const key = norm(label);
      if (!key || seen.has(key)) continue; // a city counts once per plan
      seen.add(key);
      const e = cities.get(key) ?? { label, n: 0 };
      e.n++;
      cities.set(key, e);
    }
    // a panel counts as "used" when it is on and holds at least one amount
    const withAmount = new Set<string>();
    for (const x of Array.isArray(plan.items) ? plan.items : []) if (x && Number(x.v) > 0) withAmount.add(x.p);
    if ((plan.stops ?? []).some((s: any) => Number(s?.leg?.v) > 0)) withAmount.add("vuelos");
    for (const p of Array.isArray(plan.panels) ? plan.panels : []) {
      if (p && p.on && withAmount.has(p.id)) panels[p.id] = (panels[p.id] ?? 0) + 1;
    }
  }

  return {
    plans: rows.length,
    plansLast7d: l7,
    plansLast30d: l30,
    customers: customers.size,
    appliedToBudget: applied,
    avgTravelers: readable ? Math.round((travelers / readable) * 10) / 10 : 0,
    withChildren,
    byCurrency: Object.entries(cur).map(([currency, v]) => ({ currency, plans: v.n, avgTotal: Math.round(v.sum / v.n) })).sort((a, b) => b.plans - a.plans),
    topDestinations: [...cities.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 10).map((c) => ({ city: c.label, plans: c.n })),
    panelUse: Object.entries(panels).map(([panel, n]) => ({ panel, plans: n })).sort((a, b) => b.plans - a.plans),
    unreadable,
  };
}
