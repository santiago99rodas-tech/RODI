import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redactShop } from "../privacy.server";

// Mandatory compliance webhook, sent 48 hours after the store uninstalls the app: every row of that shop is deleted.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  void redactShop(shop).catch((err) => console.error(`[privacy] shop/redact for ${shop} failed`, err));
  return new Response();
};
