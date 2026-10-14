import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { grantPromotionalAccess, projectMembershipToMetafield } from "../membership.server";
import db from "../db.server";

// Manual-only action — intentionally NOT wired to any webhook or cron.
// customers/create and customers/update only grant the launch promo to
// customers created at or after this app started receiving webhooks.
// Running this page is the one deliberate way to extend that promo to
// customers who signed up before launch, and it's not run as part of
// shipping Fase 1 — the user decides separately if/when to click it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  let grantedCount = 0;
  let skippedCount = 0;
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
      `#graphql
        query backfillCustomers($cursor: String) {
          customers(first: 250, after: $cursor) {
            edges { cursor node { id } }
            pageInfo { hasNextPage }
          }
        }`,
      { variables: { cursor } },
    );
    const body = await response.json();
    const edges = body?.data?.customers?.edges ?? [];

    for (const edge of edges) {
      const customerId = String(edge.node.id).replace("gid://shopify/Customer/", "");
      const existing = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });
      if (existing) {
        skippedCount += 1;
        continue;
      }
      await grantPromotionalAccess(shop, customerId, "manual_backfill");
      await projectMembershipToMetafield(admin, shop, customerId);
      grantedCount += 1;
    }

    hasNextPage = body?.data?.customers?.pageInfo?.hasNextPage ?? false;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }

  return { grantedCount, skippedCount };
};

export default function MembershipBackfill() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isRunning = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data) {
      shopify.toast.show(
        `Proceso terminado — se otorgó acceso a ${fetcher.data.grantedCount}; ${fetcher.data.skippedCount} ya lo tenían`,
      );
    }
  }, [fetcher.data, shopify]);

  const runBackfill = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="RODI Club — promo de lanzamiento para clientes existentes">
      <s-section heading="Dar acceso Club de cortesía a los clientes existentes">
        <s-paragraph>
          Por defecto, solo los clientes que se registran desde ahora reciben la promo de 3 meses de
          acceso Club de cortesía (se otorga automáticamente con el webhook customers/create). Los
          clientes que ya tenían cuenta antes del lanzamiento NO la reciben automáticamente.
        </s-paragraph>
        <s-paragraph>
          El botón de abajo recorre una sola vez a todos los clientes existentes y da la misma promo a
          quien aún no tenga un registro de membresía. No se puede repetir de forma selectiva: se aplica
          a todos los que les falte, o a ninguno. Hazlo solo cuando el negocio haya decidido que los
          clientes existentes también reciban la promo de lanzamiento.
        </s-paragraph>
        <s-button slot="primary-action" onClick={runBackfill} disabled={isRunning}>
          {isRunning ? "Procesando…" : "Dar acceso Club a todos los clientes existentes"}
        </s-button>
      </s-section>
    </s-page>
  );
}
