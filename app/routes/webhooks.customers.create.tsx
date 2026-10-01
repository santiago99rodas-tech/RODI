import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { grantPromotionalAccess, projectMembershipToMetafield } from "../membership.server";

// Grants the launch promo (RODI Club Fase 1) to every new signup and
// projects it to the customer metafield the theme reads. Not run for
// customers that existed before this webhook was registered — that backfill
// is a separate, manually-triggered action (see app.membership-backfill.tsx),
// never automatic.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, admin, payload } = await authenticate.webhook(request);

  if (!session || !admin) {
    // App reinstalled/uninstalled race, or no offline session yet — nothing
    // to do; the customer gets treated as Free until a later event (e.g. a
    // customers/update delivery) lands with a session available.
    return new Response();
  }

  const customerId = String(payload.id ?? "");
  if (!customerId) return new Response();

  await grantPromotionalAccess(shop, customerId);
  await projectMembershipToMetafield(admin, shop, customerId);

  return new Response();
};
