import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { resolveMembership } from "../membership.server";
import { summarizePlans } from "../calc-stats";

// How the trip cost calculator is being used. Built from the plans members saved to their account (plus the
// budget rows and Split participants those plans produced), so it needs no tracking of its own.
// Only aggregates are shown: no names, emails or individual plans.
const MAX_PLANS = 5000;

const PANEL_NAMES: Record<string, string> = {
  vuelos: "Vuelos y trayectos", aloj: "Alojamiento", comida: "Alimentación", trans: "Transporte interno", entr: "Entradas y atracciones",
  guias: "Tours y guías", comun: "Gastos comunes", compras: "Compras y recuerdos", salud: "Salud y emergencias",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rows = await db.calculatorPlan.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: MAX_PLANS,
    select: { customerId: true, currency: true, total: true, tripId: true, data: true, createdAt: true },
  });
  const stats = summarizePlans(rows);

  // Who saves plans: Club or Free, counted per customer (the same rule every limit in the app uses).
  const ids = [...new Set(rows.map((r) => r.customerId))].slice(0, 500);
  let club = 0;
  for (const id of ids) if ((await resolveMembership(session.shop, id)).isClub) club++;

  const [budgetRows, splitParticipants] = await Promise.all([
    db.expense.count({ where: { planId: { not: null }, trip: { shop: session.shop } } }),
    db.participant.count({ where: { weight: { not: 1 }, trip: { shop: session.shop } } }),
  ]);

  return { stats, club, free: ids.length - club, budgetRows, splitParticipants, capped: rows.length >= MAX_PLANS };
};

const money = (n: number) => Math.round(n).toLocaleString();

export default function CalculatorUsage() {
  const d = useLoaderData<typeof loader>();
  const s = d.stats;
  return (
    <s-page heading="Uso de la calculadora">
      <s-section heading="Resumen">
        <s-paragraph>Planes guardados en cuentas: {s.plans} ({s.plansLast7d} en los últimos 7 días, {s.plansLast30d} en los últimos 30).</s-paragraph>
        <s-paragraph>Miembros que guardaron al menos un plan: {s.customers} ({d.club} Club, {d.free} Free).</s-paragraph>
        <s-paragraph>Planes llevados a Presupuesto: {s.appliedToBudget} ({d.budgetRows} líneas de presupuesto creadas desde planes).</s-paragraph>
        <s-paragraph>Planes con un niño viajando: {s.withChildren}. Promedio de viajeros por plan: {s.avgTravelers}.</s-paragraph>
        <s-paragraph>Participantes de Split con una parte reducida (definida desde un plan): {d.splitParticipants}.</s-paragraph>
        <s-paragraph>
          Solo cuentan los planes guardados en una cuenta. Los que se quedan en el navegador de un visitante no se ven aquí.
          {d.capped ? ` Mostrando los ${s.plans} más recientes.` : ""} {s.unreadable ? `${s.unreadable} planes no se pudieron leer.` : ""}
        </s-paragraph>
      </s-section>
      <s-section heading="Destinos más planificados">
        {s.topDestinations.length === 0 ? (
          <s-paragraph>Aún no hay planes.</s-paragraph>
        ) : (
          s.topDestinations.map((c) => (
            <s-paragraph key={c.city}>
              {c.city} — {c.plans} {c.plans === 1 ? "plan" : "planes"}
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="Paneles con montos">
        {s.panelUse.length === 0 ? (
          <s-paragraph>Aún no hay datos.</s-paragraph>
        ) : (
          s.panelUse.map((p) => (
            <s-paragraph key={p.panel}>
              {PANEL_NAMES[p.panel] ?? "Panel personalizado"} — {p.plans} {p.plans === 1 ? "plan" : "planes"}
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="Total promedio por plan">
        {s.byCurrency.length === 0 ? (
          <s-paragraph>Aún no hay datos.</s-paragraph>
        ) : (
          s.byCurrency.map((c) => (
            <s-paragraph key={c.currency}>
              {c.currency}: {money(c.avgTotal)} en promedio en {c.plans} {c.plans === 1 ? "plan" : "planes"}
            </s-paragraph>
          ))
        )}
      </s-section>
    </s-page>
  );
}
