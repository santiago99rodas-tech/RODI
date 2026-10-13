// Trip cost calculator plans (rodi-calculator.liquid in the theme).
//
// The browser holds the working copy and autosaves it locally; this module
// is what the server trusts when a plan is saved to the account or pushed
// into Budget / Split. It never keeps what the client sent as-is: every
// field is rebuilt from an allow-list (sizes, enums, number ranges, text
// characters), and every total is recomputed here — a client-computed total
// is never written to a Trip. The arithmetic mirrors calc() in
// assets/rodi-calculator.js; change both together.

export const CALC_FREE_PLAN_LIMIT = 1;
export const CALC_CLUB_PLAN_LIMIT = 10;
export const CALC_MAX_JSON_BYTES = 200_000;

const MAX_MONEY = 999_999_999;
const PANEL_IDS = ["vuelos", "aloj", "comida", "trans", "entr", "guias", "comun", "compras", "salud"] as const;
const MODES = ["plane", "train", "bus", "other"] as const;
const KINDS = ["directo", "escalas", "alta", "regional", "noct", ""] as const;
const STATUS = ["est", "res", "pag"] as const;
const BASES = ["total", "pp", "ppd"] as const;
const TYPES = ["rt", "ow", "oj"] as const;
const LODGING_KINDS = ["hotel", "hostal", "apto", ""] as const;

export type CalcStatus = (typeof STATUS)[number];
type Leg = { m: string; k: string; v: number; st: CalcStatus; alt: number };
type Stop = { u: number; c: string; d: number; leg: Leg };
type Item = { id: number; p: string; s: number | "all"; n: string; b: string; v: number; st: CalcStatus; k: string; alt: number };
type Traveler = { n: string; k: "a" | "c"; age: number | null; w: number };
type Panel = { id: string; on: 0 | 1; custom?: true; name?: string };
type Pass = { id: number; n: string; v: number; st: CalcStatus; a: number; b: number };
type Car = {
  pu: number | "x"; pl: string; pc: string; pd: string;
  doo: number | "x"; dl: string; dc: string; dd: string;
  v: number; x: number; st: CalcStatus;
};

export type CalcPlan = {
  v: 2;
  f: { mo: string; mh: string; ms: string; mc: string; pct: number; goal: number; svd: number; vc: string; vr: string };
  type: (typeof TYPES)[number];
  tab: string;
  trav: Traveler[];
  stops: Stop[];
  back: Leg;
  panels: Panel[];
  items: Item[];
  passes: Pass[];
  cars: Car[];
  ref: boolean;
};

const TEXT_STRIP = /[^\p{L}\p{N} .,'()/#&-]/gu;

function text(x: unknown, max = 60): string {
  if (typeof x !== "string") return "";
  return x.replace(TEXT_STRIP, "").replace(/^\s+/, "").slice(0, max);
}
function money(x: unknown): number {
  const n = typeof x === "string" ? Number(x.replace(/[^0-9]/g, "")) : Number(x);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_MONEY, Math.round(n));
}
function int(x: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function pick<T extends readonly string[]>(x: unknown, list: T, fallback: T[number]): T[number] {
  return typeof x === "string" && (list as readonly string[]).includes(x) ? (x as T[number]) : fallback;
}
function dateStr(x: unknown): string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return "";
  const d = new Date(x + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x ? "" : x;
}
function arr(x: unknown, max: number): any[] {
  return Array.isArray(x) ? x.slice(0, max) : [];
}
function leg(x: any): Leg {
  const o = x && typeof x === "object" ? x : {};
  return {
    m: pick(o.m, MODES, "plane"),
    k: pick(o.k, KINDS, ""),
    v: money(o.v),
    st: pick(o.st, STATUS, "est"),
    alt: money(o.alt),
  };
}

export function sanitizePlan(raw: unknown): { ok: true; plan: CalcPlan } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "INVALID_PLAN" };
  const r = raw as any;
  if (JSON.stringify(r).length > CALC_MAX_JSON_BYTES) return { ok: false, error: "PLAN_TOO_LARGE" };

  const stops: Stop[] = [];
  const seenStop = new Set<number>();
  for (const s of arr(r.stops, 30)) {
    if (!s || typeof s !== "object") continue;
    let u = int(s.u, 1, 1_000_000, 0);
    if (!u || seenStop.has(u)) u = Math.max(0, ...seenStop) + 1;
    seenStop.add(u);
    stops.push({ u, c: text(s.c) || "—", d: int(s.d, 1, 90, 1), leg: leg(s.leg) });
  }
  if (!stops.length) return { ok: false, error: "INVALID_PLAN" };

  const panels: Panel[] = [];
  const seenPanel = new Set<string>();
  let customCount = 0;
  for (const p of arr(r.panels, 20)) {
    if (!p || typeof p.id !== "string" || seenPanel.has(p.id)) continue;
    if ((PANEL_IDS as readonly string[]).includes(p.id)) {
      panels.push({ id: p.id, on: p.on ? 1 : 0 });
    } else if (/^c\d{1,3}$/.test(p.id) && customCount < 6) {
      customCount++;
      panels.push({ id: p.id, on: p.on ? 1 : 0, custom: true, name: text(p.name, 30) || "Panel" });
    } else continue;
    seenPanel.add(p.id);
  }
  for (const id of PANEL_IDS) if (!seenPanel.has(id)) panels.push({ id, on: 0 });

  const items: Item[] = [];
  const seenItem = new Set<number>();
  for (const x of arr(r.items, 600)) {
    if (!x || typeof x !== "object" || !seenPanel.has(x.p)) continue;
    let id = int(x.id, 1, 10_000_000, 0);
    if (!id || seenItem.has(id)) id = Math.max(0, ...seenItem) + 1;
    seenItem.add(id);
    const stopRef = x.s === "all" ? "all" : seenStop.has(Number(x.s)) ? Number(x.s) : "all";
    items.push({
      id, p: x.p, s: stopRef, n: text(x.n), b: pick(x.b, BASES, "total"),
      v: money(x.v), st: pick(x.st, STATUS, "est"), k: pick(x.k, LODGING_KINDS, ""), alt: money(x.alt),
    });
  }

  const passes: Pass[] = [];
  for (const p of arr(r.passes, 30)) {
    if (!p || typeof p !== "object") continue;
    passes.push({
      id: int(p.id, 1, 1_000_000, passes.length + 1), n: text(p.n), v: money(p.v), st: pick(p.st, STATUS, "est"),
      a: seenStop.has(Number(p.a)) ? Number(p.a) : stops[0].u,
      b: seenStop.has(Number(p.b)) ? Number(p.b) : stops[stops.length - 1].u,
    });
  }

  const ref = (x: any): number | "x" => (x === "x" ? "x" : seenStop.has(Number(x)) ? Number(x) : "x");
  const cars: Car[] = [];
  for (const c of arr(r.cars, 10)) {
    if (!c || typeof c !== "object") continue;
    cars.push({
      pu: ref(c.pu), pl: text(c.pl), pc: text(c.pc), pd: dateStr(c.pd),
      doo: ref(c.doo), dl: text(c.dl), dc: text(c.dc), dd: dateStr(c.dd),
      v: money(c.v), x: money(c.x), st: pick(c.st, STATUS, "est"),
    });
  }

  const trav: Traveler[] = [];
  for (const t of arr(r.trav, 12)) {
    if (!t || typeof t !== "object") continue;
    const child = t.k === "c";
    const age = child ? int(t.age, 0, 11, 6) : null;
    trav.push({ n: text(t.n, 40), k: child ? "c" : "a", age, w: child ? int(t.w, 0, 100, 60) : 100 });
  }
  if (!trav.length) trav.push({ n: "", k: "a", age: null, w: 100 });

  const f = r.f && typeof r.f === "object" ? r.f : {};
  const cur = (x: unknown, fb: string) => (typeof x === "string" && /^[A-Z]{3}$/.test(x) ? x : fb);

  const plan: CalcPlan = {
    v: 2,
    f: {
      mo: text(f.mo), mh: text(f.mh), ms: dateStr(f.ms), mc: cur(f.mc, "USD"),
      pct: int(f.pct, 0, 50, 10), goal: money(f.goal), svd: money(f.svd), vc: cur(f.vc, "USD"),
      vr: typeof f.vr === "string" ? f.vr.replace(/[^0-9.,]/g, "").slice(0, 12) : "",
    },
    type: pick(r.type, TYPES, "rt"),
    tab: text(r.tab, 12) || "viaje",
    trav, stops, back: leg(r.back), panels, items, passes, cars, ref: r.ref !== false,
  };
  return { ok: true, plan };
}

export type CalcTotals = {
  panelTotals: Record<string, number>;
  subtotal: number;
  contingency: number;
  total: number;
  units: number;
  days: number;
};

export function computeTotals(plan: CalcPlan): CalcTotals {
  const units = plan.trav.reduce((a, t) => a + t.w / 100, 0);
  const days = plan.stops.reduce((a, s) => a + s.d, 0);
  const idx = (u: number) => plan.stops.findIndex((s) => s.u === u);
  const panelTotals: Record<string, number> = {};
  const add = (id: string, a: number) => { panelTotals[id] = (panelTotals[id] ?? 0) + a; };

  const covered = new Set<number>();
  for (const p of plan.passes) {
    add("vuelos", p.v);
    const ia = idx(p.a), ib = idx(p.b);
    if (ia >= 0 && ib > ia) for (let i = ia + 1; i <= ib; i++) covered.add(i);
  }
  plan.stops.forEach((s, i) => { if (i === 0 || !covered.has(i)) add("vuelos", s.leg.v); });
  if (plan.type === "oj") add("vuelos", plan.back.v);
  for (const c of plan.cars) add("trans", c.v + c.x);
  for (const x of plan.items) {
    const d = x.s === "all" ? days : (plan.stops[idx(x.s)]?.d ?? 0);
    add(x.p, x.b === "total" ? x.v : x.b === "pp" ? x.v * units : x.v * units * d);
  }

  let subtotal = 0;
  for (const p of plan.panels) if (p.on) subtotal += panelTotals[p.id] ?? 0;
  const contingency = (subtotal * plan.f.pct) / 100;
  return { panelTotals, subtotal, contingency, total: subtotal + contingency, units, days };
}

// Budget has five fixed categories (see CATS in rodi-budget.liquid).
const BUDGET_CATEGORY: Record<string, string> = {
  vuelos: "transporte", trans: "transporte", aloj: "alojamiento", comida: "comida",
  entr: "actividades", guias: "actividades",
};
export function budgetCategory(panelId: string): string {
  return BUDGET_CATEGORY[panelId] ?? "otros";
}

export const PANEL_LABELS: Record<string, Record<string, string>> = {
  es: { vuelos: "Vuelos y trayectos", aloj: "Alojamiento", comida: "Alimentación", trans: "Transporte interno", entr: "Entradas y atracciones", guias: "Tours y guías", comun: "Gastos comunes", compras: "Compras y souvenirs", salud: "Salud y emergencias", cont: "Imprevistos" },
  en: { vuelos: "Flights and transfers", aloj: "Lodging", comida: "Food", trans: "Local transport", entr: "Tickets and attractions", guias: "Tours and guides", comun: "Common expenses", compras: "Shopping and souvenirs", salud: "Health and emergencies", cont: "Contingency" },
  fr: { vuelos: "Vols et trajets", aloj: "Hébergement", comida: "Repas", trans: "Transports locaux", entr: "Billets et attractions", guias: "Visites et guides", comun: "Frais communs", compras: "Achats et souvenirs", salud: "Santé et urgences", cont: "Imprévus" },
  it: { vuelos: "Voli e tratte", aloj: "Alloggio", comida: "Pasti", trans: "Trasporti locali", entr: "Biglietti e attrazioni", guias: "Tour e guide", comun: "Spese comuni", compras: "Acquisti e souvenir", salud: "Salute ed emergenze", cont: "Imprevisti" },
};
