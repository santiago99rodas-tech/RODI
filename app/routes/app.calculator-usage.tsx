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
  vuelos: "Flights and transfers", aloj: "Lodging", comida: "Food", trans: "Local transport", entr: "Tickets and attractions",
  guias: "Tours and guides", comun: "Common expenses", compras: "Shopping and souvenirs", salud: "Health and emergencies",
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
    <s-page heading="Calculator usage">
      <s-section heading="Overview">
        <s-paragraph>Plans saved to accounts: {s.plans} ({s.plansLast7d} in the last 7 days, {s.plansLast30d} in the last 30).</s-paragraph>
        <s-paragraph>Members who saved at least one plan: {s.customers} ({d.club} Club, {d.free} Free).</s-paragraph>
        <s-paragraph>Plans taken into Budget: {s.appliedToBudget} ({d.budgetRows} budget lines created from plans).</s-paragraph>
        <s-paragraph>Plans with a child traveling: {s.withChildren}. Average travelers per plan: {s.avgTravelers}.</s-paragraph>
        <s-paragraph>Split participants that carry a reduced share (set from a plan): {d.splitParticipants}.</s-paragraph>
        <s-paragraph>
          Only plans saved to an account count. Plans that stay in a visitor&apos;s browser are not visible here.
          {d.capped ? ` Showing the newest ${s.plans}.` : ""} {s.unreadable ? `${s.unreadable} plans could not be read.` : ""}
        </s-paragraph>
      </s-section>
      <s-section heading="Most planned destinations">
        {s.topDestinations.length === 0 ? (
          <s-paragraph>No plans yet.</s-paragraph>
        ) : (
          s.topDestinations.map((c) => (
            <s-paragraph key={c.city}>
              {c.city} — {c.plans} plan{c.plans === 1 ? "" : "s"}
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="Panels with amounts">
        {s.panelUse.length === 0 ? (
          <s-paragraph>No data yet.</s-paragraph>
        ) : (
          s.panelUse.map((p) => (
            <s-paragraph key={p.panel}>
              {PANEL_NAMES[p.panel] ?? "Custom panel"} — {p.plans} plan{p.plans === 1 ? "" : "s"}
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="Average plan total">
        {s.byCurrency.length === 0 ? (
          <s-paragraph>No data yet.</s-paragraph>
        ) : (
          s.byCurrency.map((c) => (
            <s-paragraph key={c.currency}>
              {c.currency}: {money(c.avgTotal)} on average across {c.plans} plan{c.plans === 1 ? "" : "s"}
            </s-paragraph>
          ))
        )}
      </s-section>
    </s-page>
  );
}
