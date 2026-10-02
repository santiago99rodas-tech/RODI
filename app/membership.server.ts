import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";

// Fase 1 of the RODI entitlement system. Single source of truth for a
// customer's membership state lives in the Membership table (full
// FREE/PROMOTIONAL_ACCESS/ACTIVE/PAST_DUE/CANCELLED/EXPIRED bookkeeping,
// reserved fields for Fase 2 billing). Everything below funnels through
// resolveMembership() — nothing else should read Membership.status directly.
//
// The theme never talks to this app for membership (no new fetch pattern,
// no app-proxy endpoint for this) — it reads one projected customer
// metafield, custom.club_access_until, directly in Liquid, the same way it
// already reads custom.travel_log for the Passport. See
// projectMembershipToMetafield() below for the write side.

export type EffectiveMembership = {
  status: "FREE" | "PROMOTIONAL_ACCESS" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  isClub: boolean;
  accessUntil: Date | null;
};

const PROMO_MONTHS = Number(process.env.PROMO_MONTHS) || 3;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Computes the effective membership state from whatever is on the row right
// now. Paid ACTIVE (Fase 2, not populated yet) wins over a promo; otherwise
// a still-valid promo counts as Club; anything else is FREE (or EXPIRED if
// there's a lapsed access window, for copy purposes only — EXPIRED is not a
// distinct access level, it still resolves to isClub: false).
export async function resolveMembership(shop: string, customerId: string): Promise<EffectiveMembership> {
  const row = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (!row) return { status: "FREE", isClub: false, accessUntil: null };

  const now = new Date();

  if (row.status === "ACTIVE" && row.currentPeriodEnd && row.currentPeriodEnd > now) {
    return { status: "ACTIVE", isClub: true, accessUntil: row.currentPeriodEnd };
  }

  if (row.promoEnd && row.promoEnd > now) {
    return { status: "PROMOTIONAL_ACCESS", isClub: true, accessUntil: row.promoEnd };
  }

  const lapsedUntil = row.currentPeriodEnd ?? row.promoEnd;
  if (lapsedUntil) {
    return { status: "EXPIRED", isClub: false, accessUntil: lapsedUntil };
  }

  return { status: "FREE", isClub: false, accessUntil: null };
}

// Grants (or re-grants) the launch promo. Idempotent: upserts on the
// shop+customerId unique constraint, so it's safe to call from both
// customers/create and the defensive customers/update handler without
// double-granting on duplicate webhook deliveries.
export async function grantPromotionalAccess(shop: string, customerId: string, source = "launch_2026") {
  const existing = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (existing) return existing; // already has a row — never silently re-grant on a later webhook

  const now = new Date();
  return db.membership.create({
    data: {
      shop,
      customerId,
      status: "PROMOTIONAL_ACCESS",
      promoStart: now,
      promoEnd: addMonths(now, PROMO_MONTHS),
      promoSource: source,
    },
  });
}

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "club_access_until";

// Projects the single derived date onto the customer so Liquid can gate on
// it with no app round-trip: `{% if customer.metafields.custom.club_access_until.value > 'now' %}`.
// Requires the write_customers scope and the custom.club_access_until
// (date_time) metafield definition to already exist (created manually in
// Admin, same pattern as the existing Passport fields).
export async function projectMembershipToMetafield(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
) {
  const membership = await resolveMembership(shop, customerId);
  if (!membership.accessUntil) return; // nothing to project yet — Liquid treats a missing metafield as Free

  const response = await admin.graphql(
    `#graphql
      mutation setClubAccessUntil($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: `gid://shopify/Customer/${customerId}`,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "date_time",
            value: membership.accessUntil.toISOString(),
          },
        ],
      },
    },
  );

  const body = await response.json();
  const userErrors = body?.data?.metafieldsSet?.userErrors;
  if (userErrors?.length) {
    throw new Error(`metafieldsSet failed for customer ${customerId}: ${JSON.stringify(userErrors)}`);
  }
}

// ---------------------------------------------------------------------------
// Manual membership management (admin screen: app/routes/app.memberships.tsx).
// Support/ops tooling — gift or revoke Club for one customer without waiting
// on billing (Fase 2). All of these write the Membership row first (the
// source of truth every server-side limit reads) and then re-project the
// metafield so the theme agrees with the server.
//
// "Set to Free" deliberately KEEPS the row (status FREE, no dates) instead of
// deleting it: grantPromotionalAccess() never re-grants over an existing row,
// so a kept row can't be silently handed a fresh promo by a later webhook.

export type ManualMembershipAction =
  | { kind: "grant"; months: number }
  | { kind: "expire" }
  | { kind: "free" };

export async function applyManualMembership(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
  action: ManualMembershipAction,
) {
  const key = { shop_customerId: { shop, customerId } };
  const now = new Date();

  if (action.kind === "grant") {
    const data = {
      status: "PROMOTIONAL_ACCESS",
      promoStart: now,
      promoEnd: addMonths(now, action.months),
      promoSource: "manual_grant",
      cancelledAt: null,
    };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  } else if (action.kind === "expire") {
    const past = new Date(now.getTime() - 60 * 1000);
    const existing = await db.membership.findUnique({ where: key });
    const data = {
      status: "EXPIRED",
      promoEnd: past,
      // A lapsed paid period must lapse too, or ACTIVE would keep winning in resolveMembership().
      currentPeriodEnd: existing?.currentPeriodEnd ? past : null,
      cancelledAt: now,
      promoSource: existing?.promoSource ?? "manual_expire",
    };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  } else {
    const data = {
      status: "FREE",
      promoStart: null,
      promoEnd: null,
      currentPeriodEnd: null,
      cancelledAt: null,
      promoSource: "manual_reset",
    };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  }

  if (action.kind === "free") {
    await clearMembershipMetafield(admin, customerId);
  } else {
    await projectMembershipToMetafield(admin, shop, customerId);
  }
}

// Removes the projected date so Liquid reads the customer as never-a-member
// (Free), as opposed to an expired date which reads as "Expired".
export async function clearMembershipMetafield(admin: AdminApiContext, customerId: string) {
  const response = await admin.graphql(
    `#graphql
      mutation clearClubAccessUntil($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          { ownerId: `gid://shopify/Customer/${customerId}`, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY },
        ],
      },
    },
  );

  const body = await response.json();
  const userErrors = body?.data?.metafieldsDelete?.userErrors;
  if (userErrors?.length) {
    throw new Error(`metafieldsDelete failed for customer ${customerId}: ${JSON.stringify(userErrors)}`);
  }
}
