import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleShopifyDataRequest } from "../privacy.server";

// Mandatory compliance webhook: a customer asked the store for their data. authenticate.webhook verifies the HMAC
// (an invalid one gets 401). The export is built and emailed to the owner in the background so Shopify gets its 200
// right away; the owner must forward it to the customer within 30 days.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = String(payload?.customer?.id ?? "");
  const requestId = payload?.data_request?.id != null ? String(payload.data_request.id) : null;
  if (customerId) {
    void handleShopifyDataRequest(shop, customerId, requestId).catch((err) => console.error(`[privacy] data_request for ${customerId} failed`, err));
  }
  return new Response();
};
