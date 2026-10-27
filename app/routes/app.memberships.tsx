import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { applyManualMembership, FOUNDER_CAP, grantFounderAccess, resolveMembership } from "../membership.server";
import { sendWelcomeClubEmail, sendWelcomeClubEmailAuto } from "../emails.server";
import db from "../db.server";

// Manual membership management for support/ops. Fase 2 (billing) is paused,
// so this is the only way to gift, revoke or reset Club for a single
// customer. The Membership table stays the source of truth (every limit in
// apps.proxy.tsx reads it); each action here also re-projects the
// club_access_until metafield so the theme agrees with the server.

type CustomerRowData = {
  id: string; // numeric Shopify customer id
  email: string | null;
  name: string | null;
  status: string;
  isClub: boolean;
  plan: string;
  accessUntil: string | null;
  source: string | null;
  founderNumber: number | null;
  lifetime: boolean;
};

async function describeCustomers(admin: any, shop: string, nodes: { id: string; email: string | null; displayName: string | null }[]) {
  const rows: CustomerRowData[] = [];
  for (const node of nodes) {
    const id = String(node.id).replace("gid://shopify/Customer/", "");
    const membership = await resolveMembership(shop, id);
    const row = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId: id } } });
    rows.push({
      id,
      email: node.email,
      name: node.displayName,
      status: membership.status,
      isClub: membership.isClub,
      plan: membership.plan,
      accessUntil: membership.accessUntil ? membership.accessUntil.toISOString() : null,
      source: row?.promoSource ?? null,
      founderNumber: membership.founderNumber,
      lifetime: membership.lifetime,
    });
  }
  return rows;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

  let found: CustomerRowData[] = [];
  if (q) {
    const response = await admin.graphql(
      `#graphql
        query findCustomers($query: String!) {
          customers(first: 10, query: $query) {
            nodes { id email displayName }
          }
        }`,
      { variables: { query: q } },
    );
    const body = await response.json();
    found = await describeCustomers(admin, shop, body?.data?.customers?.nodes ?? []);
  }

  // Most recently touched memberships, so a customer just granted/reset is
  // visible without searching again.
  const recent = await db.membership.findMany({ where: { shop }, orderBy: { updatedAt: "desc" }, take: 15 });
  let recentRows: CustomerRowData[] = [];
  if (recent.length) {
    const response = await admin.graphql(
      `#graphql
        query recentCustomers($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Customer { id email displayName } }
        }`,
      { variables: { ids: recent.map((m) => `gid://shopify/Customer/${m.customerId}`) } },
    );
    const body = await response.json();
    recentRows = await describeCustomers(admin, shop, (body?.data?.nodes ?? []).filter(Boolean));
  }

  const founderTaken = await db.membership.count({ where: { shop, founderNumber: { not: null } } });
  return { q, found, recentRows, founderTaken, founderCap: FOUNDER_CAP };
};

const GRANT_MONTHS = [1, 3, 12];
const PLAN_LABEL: Record<string, string> = { free: "Free", club: "Club", founder: "Fundador" };
const STATUS_LABEL: Record<string, string> = {
  FREE: "Free", PROMOTIONAL_ACCESS: "Acceso de cortesía", ACTIVE: "Activa", PAST_DUE: "Pago vencido", CANCELLED: "Cancelada", EXPIRED: "Vencida",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const customerId = String(form.get("customerId") ?? "");
  const intent = String(form.get("intent") ?? "");

  if (!/^\d+$/.test(customerId)) return { error: "ID de cliente no válido" };

  try {
    if (intent === "grant") {
      const months = Number(form.get("months"));
      if (!GRANT_MONTHS.includes(months)) return { error: "Duración no válida" };
      const wasClub = (await resolveMembership(shop, customerId)).isClub;
      await applyManualMembership(admin, shop, customerId, { kind: "grant", months });
      const granted = `${months === 1 ? "Se otorgó 1 mes" : `Se otorgaron ${months} meses`} de acceso Club`;
      if (wasClub) return { ok: granted };
      // Someone who was not Club has just become Club: welcome them automatically (once per customer).
      const welcome = await sendWelcomeClubEmailAuto(admin, shop, customerId);
      if (welcome.outcome === "sent") return { ok: `${granted} y se envió el correo de bienvenida` };
      if (welcome.outcome === "duplicate") return { ok: `${granted} (ya había recibido el correo de bienvenida)` };
      return { ok: `${granted}. No se envió el correo de bienvenida (${welcome.detail ?? welcome.outcome})` };
    }
    if (intent === "welcome") {
      // Explicit admin action: emails the customer the Club welcome. Needs an email and an active Club membership.
      const membership = await resolveMembership(shop, customerId);
      if (!membership.isClub) return { error: "Solo los miembros Club reciben el correo de bienvenida" };
      const email = String(form.get("email") ?? "");
      if (!email) return { error: "Este cliente no tiene correo electrónico" };
      const result = await sendWelcomeClubEmail(admin, shop, customerId, email);
      if (result.outcome === "sent") return { ok: `Correo de bienvenida enviado a ${email}` };
      return { error: `No se envió el correo de bienvenida: ${result.detail ?? result.outcome}` };
    }
    if (intent === "founder") {
      // Fundador = Club for life + the next member number + the badge (the same thing the Fundador pass gives).
      const wasClub = (await resolveMembership(shop, customerId)).isClub;
      const { number } = await grantFounderAccess(admin, shop, customerId, "manual_founder");
      const granted = number ? `Fundador n.º ${String(number).padStart(3, "0")}: Club de por vida` : `Club de por vida (los ${FOUNDER_CAP} números ya están ocupados, sin número)`;
      if (wasClub) return { ok: granted };
      const welcome = await sendWelcomeClubEmailAuto(admin, shop, customerId);
      return { ok: welcome.outcome === "sent" ? `${granted} y se envió el correo de bienvenida` : granted };
    }
    if (intent === "unfounder") {
      await applyManualMembership(admin, shop, customerId, { kind: "founder", value: false });
      return { ok: "Ya no es Fundador (el número queda libre)" };
    }
    if (intent === "expire") {
      await applyManualMembership(admin, shop, customerId, { kind: "expire" });
      return { ok: "El acceso Club venció" };
    }
    if (intent === "free") {
      await applyManualMembership(admin, shop, customerId, { kind: "free" });
      return { ok: "El cliente pasó a Free" };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo actualizar la membresía" };
  }

  return { error: "Acción desconocida" };
};

function CustomerRow({ customer, fetcher }: { customer: CustomerRowData; fetcher: ReturnType<typeof useFetcher> }) {
  const busy = fetcher.state !== "idle";
  const submit = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ customerId: customer.id, intent, ...extra }, { method: "POST" });

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="base">
        <s-text fontWeight="bold">{customer.email ?? customer.name ?? `Cliente ${customer.id}`}</s-text>
        <s-text tone="neutral">
          {customer.name ? `${customer.name} · ` : ""}ID {customer.id}
        </s-text>
        <s-text>
          {PLAN_LABEL[customer.plan] ?? "Free"}
          {customer.founderNumber ? ` n.º ${String(customer.founderNumber).padStart(3, "0")}` : ""} — {STATUS_LABEL[customer.status] ?? customer.status}
          {customer.lifetime ? " · Club de por vida" : customer.accessUntil ? ` · hasta ${new Date(customer.accessUntil).toLocaleString("es-CO")}` : ""}
          {customer.source ? ` · origen: ${customer.source}` : ""}
        </s-text>

        <s-stack direction="inline" gap="base">
          {GRANT_MONTHS.map((m) => (
            <s-button key={m} disabled={busy} onClick={() => submit("grant", { months: String(m) })}>
              {`Dar ${m} ${m === 1 ? "mes" : "meses"}`}
            </s-button>
          ))}
          <s-button
            disabled={busy || !customer.isClub || !customer.email}
            onClick={() => {
              if (!window.confirm(`¿Enviar el correo de bienvenida Club a ${customer.email}?`)) return;
              submit("welcome", { email: customer.email ?? "" });
            }}
          >
            Enviar correo de bienvenida
          </s-button>
          <s-button
            disabled={busy}
            onClick={() => {
              const removing = customer.plan === "founder";
              const text = removing
                ? `¿Quitar Fundador a ${customer.email ?? customer.id}? Pierde el Club de por vida y su número queda libre.`
                : `¿Dar Fundador (Club de por vida y el siguiente número) a ${customer.email ?? customer.id}?`;
              if (!window.confirm(text)) return;
              submit(removing ? "unfounder" : "founder");
            }}
          >
            {customer.plan === "founder" ? "Quitar Fundador" : "Dar Fundador"}
          </s-button>
          <s-button
            tone="critical"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`¿Vencer ahora el acceso Club de ${customer.email ?? customer.id}?`)) return;
              submit("expire");
            }}
          >
            Vencer ahora
          </s-button>
          <s-button
            tone="critical"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`¿Pasar ${customer.email ?? customer.id} a Free? (borra las fechas y el metafield de Club)`)) return;
              submit("free");
            }}
          >
            Pasar a Free
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function Memberships() {
  const { q, found, recentRows, founderTaken, founderCap } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    if (!fetcher.data) return;
    if ("error" in fetcher.data && fetcher.data.error) shopify.toast.show(fetcher.data.error, { isError: true });
    else if ("ok" in fetcher.data && fetcher.data.ok) shopify.toast.show(fetcher.data.ok);
  }, [fetcher.data, shopify]);

  const search = () => navigate(`?q=${encodeURIComponent(query.trim())}`);

  return (
    <s-page heading="RODI Club — membresías">
      <s-section heading="Cupos Fundador">
        <s-paragraph>
          {founderTaken} de {founderCap} números de Fundador ocupados ({Math.max(0, founderCap - founderTaken)} libres). Se asignan en orden al comprar el
          Pase Fundador o al usar «Dar Fundador».
        </s-paragraph>
      </s-section>

      <s-section heading="Buscar un cliente">
        <s-stack gap="base">
          <s-paragraph>
            Busca por correo o nombre y luego regala, vence o reinicia el acceso Club. Los cambios se aplican en el
            servidor de inmediato y actualizan el metafield club_access_until del cliente para que la tienda coincida.
          </s-paragraph>
          <s-text-field
            label="Correo o nombre"
            value={query}
            onInput={(e: any) => setQuery(e.target.value)}
          ></s-text-field>
          <s-button onClick={search}>Buscar</s-button>
        </s-stack>
      </s-section>

      {q && (
        <s-section heading={`Resultados para “${q}” (${found.length})`}>
          {found.length === 0 ? (
            <s-paragraph>No se encontraron clientes.</s-paragraph>
          ) : (
            <s-stack gap="base">
              {found.map((c) => (
                <CustomerRow key={c.id} customer={c} fetcher={fetcher} />
              ))}
            </s-stack>
          )}
        </s-section>
      )}

      <s-section heading="Membresías cambiadas recientemente">
        {recentRows.length === 0 ? (
          <s-paragraph>Aún no hay membresías.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recentRows.map((c) => (
              <CustomerRow key={c.id} customer={c} fetcher={fetcher} />
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
