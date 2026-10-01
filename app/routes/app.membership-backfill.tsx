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
        `Backfill complete — granted ${fetcher.data.grantedCount}, already had access ${fetcher.data.skippedCount}`,
      );
    }
  }, [fetcher.data, shopify]);

  const runBackfill = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="RODI Club — launch promo backfill">
      <s-section heading="Grant Complimentary Club Access to existing customers">
        <s-paragraph>
          By default, only customers who sign up from now on receive the 3-month
          Complimentary Club Access promo (granted automatically via the
          customers/create webhook). Customers who already had an account before
          this launched do NOT get it automatically.
        </s-paragraph>
        <s-paragraph>
          Clicking the button below runs a one-time pass over every existing
          customer and grants the same promo to anyone who doesn&rsquo;t already
          have a membership record. This is irreversible to re-run selectively
          — it either runs for everyone who&rsquo;s missing it, or not at all.
          Only do this once the business has decided existing customers should
          get the launch promo too.
        </s-paragraph>
        <s-button slot="primary-action" onClick={runBackfill} disabled={isRunning}>
          {isRunning ? "Running…" : "Grant Club access to all existing customers"}
        </s-button>
      </s-section>
    </s-page>
  );
}
