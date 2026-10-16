import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleShopifyRedact } from "../privacy.server";

// Mandatory compliance webhook: Shopify is erasing a customer. Everything the app stores about them is deleted (same
// as a member deleting their account, without asking Shopify to erase, since Shopify started it). Runs in the
// background so the 200 goes back immediately.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = String(payload?.customer?.id ?? "");
  if (customerId) {
    void handleShopifyRedact(shop, customerId).catch((err) => console.error(`[privacy] customers/redact for ${customerId} failed`, err));
  }
  return new Response();
};
