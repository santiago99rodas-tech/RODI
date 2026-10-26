import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redeemPassOrder } from "../club-pass.server";

// A paid order: if it contains a prepaid Club pass (SKU CLUB-PASS-<n>M), add the months to the buyer's Club access.
// Idempotent per order line (see club-pass.server.ts). A real failure answers 500 so Shopify retries the delivery.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, admin, payload } = await authenticate.webhook(request);

  if (!session || !admin) return new Response(); // app reinstalled/uninstalled race: nothing to do

  try {
    const result = await redeemPassOrder(admin, shop, payload as any);
    if (result.lines) console.log(`[club-pass] order ${String((payload as any)?.id ?? "")}: ${result.granted} granted, ${result.pending} pending`);
  } catch (err) {
    console.error("[club-pass] failed to apply the order", err);
    return new Response("club pass failed", { status: 500 });
  }
  return new Response();
};
