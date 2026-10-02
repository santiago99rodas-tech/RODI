import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { applyManualMembership, resolveMembership } from "../membership.server";
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
  accessUntil: string | null;
  source: string | null;
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
      accessUntil: membership.accessUntil ? membership.accessUntil.toISOString() : null,
      source: row?.promoSource ?? null,
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

  return { q, found, recentRows };
};

const GRANT_MONTHS = [1, 3, 12];

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const customerId = String(form.get("customerId") ?? "");
  const intent = String(form.get("intent") ?? "");

  if (!/^\d+$/.test(customerId)) return { error: "Invalid customer id" };

  try {
    if (intent === "grant") {
      const months = Number(form.get("months"));
      if (!GRANT_MONTHS.includes(months)) return { error: "Invalid duration" };
      await applyManualMembership(admin, shop, customerId, { kind: "grant", months });
      return { ok: `Granted ${months} month${months === 1 ? "" : "s"} of Club access` };
    }
    if (intent === "expire") {
      await applyManualMembership(admin, shop, customerId, { kind: "expire" });
      return { ok: "Club access expired" };
    }
    if (intent === "free") {
      await applyManualMembership(admin, shop, customerId, { kind: "free" });
      return { ok: "Customer set to Free" };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update membership" };
  }

  return { error: "Unknown action" };
};

function CustomerRow({ customer, fetcher }: { customer: CustomerRowData; fetcher: ReturnType<typeof useFetcher> }) {
  const busy = fetcher.state !== "idle";
  const submit = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ customerId: customer.id, intent, ...extra }, { method: "POST" });

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="base">
        <s-text fontWeight="bold">{customer.email ?? customer.name ?? `Customer ${customer.id}`}</s-text>
        <s-text tone="neutral">
          {customer.name ? `${customer.name} · ` : ""}ID {customer.id}
        </s-text>
        <s-text>
          {customer.isClub ? "Club" : "Free"} — {customer.status}
          {customer.accessUntil ? ` · until ${new Date(customer.accessUntil).toLocaleString()}` : ""}
          {customer.source ? ` · source: ${customer.source}` : ""}
        </s-text>

        <s-stack direction="inline" gap="base">
          {GRANT_MONTHS.map((m) => (
            <s-button key={m} disabled={busy} onClick={() => submit("grant", { months: String(m) })}>
              {`Grant ${m} month${m === 1 ? "" : "s"}`}
            </s-button>
          ))}
          <s-button
            tone="critical"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Expire Club access for ${customer.email ?? customer.id} right now?`)) return;
              submit("expire");
            }}
          >
            Expire now
          </s-button>
          <s-button
            tone="critical"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Reset ${customer.email ?? customer.id} to Free (clears dates and the Club metafield)?`)) return;
              submit("free");
            }}
          >
            Set to Free
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function Memberships() {
  const { q, found, recentRows } = useLoaderData<typeof loader>();
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
    <s-page heading="RODI Club — memberships">
      <s-section heading="Find a customer">
        <s-stack gap="base">
          <s-paragraph>
            Search by email or name, then gift, expire or reset Club access. Changes take effect on the server
            immediately and update the customer&rsquo;s club_access_until metafield so the storefront agrees.
          </s-paragraph>
          <s-text-field
            label="Email or name"
            value={query}
            onInput={(e: any) => setQuery(e.target.value)}
          ></s-text-field>
          <s-button onClick={search}>Search</s-button>
        </s-stack>
      </s-section>

      {q && (
        <s-section heading={`Results for “${q}” (${found.length})`}>
          {found.length === 0 ? (
            <s-paragraph>No customers found.</s-paragraph>
          ) : (
            <s-stack gap="base">
              {found.map((c) => (
                <CustomerRow key={c.id} customer={c} fetcher={fetcher} />
              ))}
            </s-stack>
          )}
        </s-section>
      )}

      <s-section heading="Recently changed memberships">
        {recentRows.length === 0 ? (
          <s-paragraph>No memberships yet.</s-paragraph>
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
