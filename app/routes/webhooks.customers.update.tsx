import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { grantPromotionalAccess, projectMembershipToMetafield } from "../membership.server";
import db from "../db.server";

// Defensive upsert for a missed customers/create delivery only (Shopify
// webhooks are at-least-once, not guaranteed) — NOT a general "grant promo
// on any update" handler. A pre-launch customer with no Membership row who
// simply edits their profile must stay Free, per the explicit decision that
// existing customers are never auto-enrolled. The two are told apart by the
// customer's own created_at: only treat this as a likely-missed create if
// the account itself was created recently (a few minutes ago at most) —
// otherwise it's just a routine update on an old account, so we only
// (re-)project whatever membership state already exists, granting nothing.
const RECENT_SIGNUP_WINDOW_MS = 15 * 60 * 1000;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, admin, payload } = await authenticate.webhook(request);

  if (!session || !admin) return new Response();

  const customerId = String(payload.id ?? "");
  if (!customerId) return new Response();

  const existing = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });

  if (!existing) {
    const createdAt = payload.created_at ? new Date(payload.created_at) : null;
    const looksLikeMissedCreate = createdAt && Date.now() - createdAt.getTime() < RECENT_SIGNUP_WINDOW_MS;
    if (looksLikeMissedCreate) {
      await grantPromotionalAccess(shop, customerId);
    } else {
      return new Response(); // old customer, ordinary profile edit — leave at Free, nothing to project
    }
  }

  await projectMembershipToMetafield(admin, shop, customerId);

  return new Response();
};
