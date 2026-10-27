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

// The three plan profiles. What each one includes is decided separately; today "club" and "founder" unlock the same things
// (every limit reads isClub), and "founder" only adds the badge and the locked price.
export type PlanProfile = "free" | "club" | "founder";

export type EffectiveMembership = {
  status: "FREE" | "PROMOTIONAL_ACCESS" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  isClub: boolean;
  plan: PlanProfile;
  accessUntil: Date | null;
  founderNumber: number | null; // only while the member is a Fundador with Club active
  lifetime: boolean; // Club with no end date (the Fundador pass)
};

// Fundador: limited launch tier. Club for life (a date far in the future, so every existing "date in the future = Club" check
// keeps working untouched), a member number 1..FOUNDER_CAP in order of arrival, and a badge in the theme.
export const FOUNDER_CAP = Number(process.env.FOUNDER_CAP) || 20;
const LIFETIME_END = new Date("2099-12-31T23:59:59Z");
const isLifetimeDate = (date: Date | null | undefined) => Boolean(date && date.getUTCFullYear() >= 2090);

const PROMO_MONTHS = Number(process.env.PROMO_MONTHS) || 3;

// The launch plan (PROMO_MONTHS of Club) is only for people who register while the public launch window is open: February
// 2027 by default (Colombia time). Before that, every new account starts on Free and the owner decides, one by one, who gets
// Club (Admin > Membresías Club). Override with PROMO_WINDOW_START / PROMO_WINDOW_END (ISO dates, end exclusive).
const parseDate = (value: string | undefined, fallback: string) => {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
};
export function launchPromoOpen(now: Date = new Date()): boolean {
  const start = parseDate(process.env.PROMO_WINDOW_START, "2027-02-01T00:00:00-05:00");
  const end = parseDate(process.env.PROMO_WINDOW_END, "2027-03-01T00:00:00-05:00");
  return now >= start && now < end;
}

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
  if (!row) return { status: "FREE", isClub: false, plan: "free", accessUntil: null, founderNumber: null, lifetime: false };

  const now = new Date();

  const clubPlan: PlanProfile = row.founder ? "founder" : "club";

  if (row.status === "ACTIVE" && row.currentPeriodEnd && row.currentPeriodEnd > now) {
    return { status: "ACTIVE", isClub: true, plan: clubPlan, accessUntil: row.currentPeriodEnd, founderNumber: row.founder ? row.founderNumber : null, lifetime: isLifetimeDate(row.currentPeriodEnd) };
  }

  if (row.promoEnd && row.promoEnd > now) {
    return { status: "PROMOTIONAL_ACCESS", isClub: true, plan: clubPlan, accessUntil: row.promoEnd, founderNumber: row.founder ? row.founderNumber : null, lifetime: isLifetimeDate(row.promoEnd) };
  }

  const lapsedUntil = row.currentPeriodEnd ?? row.promoEnd;
  if (lapsedUntil) {
    return { status: "EXPIRED", isClub: false, plan: "free", accessUntil: lapsedUntil, founderNumber: null, lifetime: false };
  }

  return { status: "FREE", isClub: false, plan: "free", accessUntil: null, founderNumber: null, lifetime: false };
}

// Grants (or re-grants) the launch promo. Idempotent: upserts on the
// shop+customerId unique constraint, so it's safe to call from both
// customers/create and the defensive customers/update handler without
// double-granting on duplicate webhook deliveries.
export async function grantPromotionalAccess(shop: string, customerId: string, source = "launch_2026") {
  const existing = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (existing) return existing; // already has a row — never silently re-grant on a later webhook

  const now = new Date();
  // Outside the launch window the account starts on Free. The row is kept (like "Set to Free") so a later webhook can
  // never hand it a promo; the owner grants Club by hand when they want to. Manual backfills are explicit, so they still grant.
  if (source !== "manual_backfill" && !launchPromoOpen(now)) {
    return db.membership.create({ data: { shop, customerId, status: "FREE", promoSource: "prelaunch_free" } });
  }
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

// Adds whole months of Club on top of whatever the member has left (or from today when it already lapsed or never existed),
// then projects the new date. Used by the referral reward. A paid ACTIVE period (Fase 2, not in use yet) is extended in place.
export async function extendClubAccess(admin: AdminApiContext, shop: string, customerId: string, months: number, source: string) {
  const key = { shop_customerId: { shop, customerId } };
  const row = await db.membership.findUnique({ where: key });
  const now = new Date();
  if (isLifetimeDate(row?.promoEnd) || isLifetimeDate(row?.currentPeriodEnd)) return; // Fundador: Club for life, nothing to extend
  if (row?.status === "ACTIVE" && row.currentPeriodEnd && row.currentPeriodEnd > now) {
    await db.membership.update({ where: key, data: { currentPeriodEnd: addMonths(row.currentPeriodEnd, months) } });
  } else {
    const current = row?.promoEnd && row.promoEnd > now ? row.promoEnd : now;
    const data = {
      status: "PROMOTIONAL_ACCESS",
      promoStart: row?.promoEnd && row.promoEnd > now && row.promoStart ? row.promoStart : now,
      promoEnd: addMonths(current, months),
      promoSource: row?.promoSource && row.promoEnd && row.promoEnd > now ? row.promoSource : source,
      cancelledAt: null,
    };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  }
  await projectMembershipToMetafield(admin, shop, customerId);
}

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "club_access_until";
const FOUNDER_METAFIELD_KEY = "founder_number";

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

  const metafields: { ownerId: string; namespace: string; key: string; type: string; value: string }[] = [
    {
      ownerId: `gid://shopify/Customer/${customerId}`,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: "date_time",
      value: membership.accessUntil.toISOString(),
    },
  ];
  // The Fundador badge in the theme reads this one; it is only sent while the member really is a Fundador with Club active.
  if (membership.founderNumber) {
    metafields.push({
      ownerId: `gid://shopify/Customer/${customerId}`,
      namespace: METAFIELD_NAMESPACE,
      key: FOUNDER_METAFIELD_KEY,
      type: "number_integer",
      value: String(membership.founderNumber),
    });
  }

  const response = await admin.graphql(
    `#graphql
      mutation setClubAccessUntil($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: { metafields },
    },
  );

  const body = await response.json();
  const userErrors = body?.data?.metafieldsSet?.userErrors;
  if (userErrors?.length) {
    throw new Error(`metafieldsSet failed for customer ${customerId}: ${JSON.stringify(userErrors)}`);
  }
}

// Gives the next free Fundador number (the lowest unused one, so a number freed by removing the flag is reused). Returns null when
// all FOUNDER_CAP numbers are taken. Concurrency-safe: the unique (shop, founderNumber) index rejects a duplicate and we retry.
async function assignFounderNumber(shop: string, customerId: string): Promise<number | null> {
  const key = { shop_customerId: { shop, customerId } };
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await db.membership.findUnique({ where: key });
    if (row?.founderNumber) return row.founderNumber;
    const taken = await db.membership.findMany({ where: { shop, founderNumber: { not: null } }, select: { founderNumber: true } });
    const used = new Set(taken.map((t) => t.founderNumber as number));
    let next = 1;
    while (used.has(next)) next += 1;
    if (next > FOUNDER_CAP) return null;
    try {
      await db.membership.update({ where: key, data: { founderNumber: next } });
      return next;
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") continue; // another request took that number first
      throw err;
    }
  }
  return null;
}

// The Fundador pass was bought: Club for life + the next member number + the badge. Idempotent for a member who already is one.
export async function grantFounderAccess(admin: AdminApiContext, shop: string, customerId: string, source = "founder_pass"): Promise<{ number: number | null }> {
  const key = { shop_customerId: { shop, customerId } };
  const now = new Date();
  const existing = await db.membership.findUnique({ where: key });
  const data = {
    status: "PROMOTIONAL_ACCESS",
    promoStart: existing?.promoStart ?? now,
    promoEnd: LIFETIME_END,
    promoSource: source,
    cancelledAt: null,
    founder: true,
    founderSince: existing?.founderSince ?? now,
  };
  await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  const number = await assignFounderNumber(shop, customerId);
  if (number === null) console.warn(`[founder] all ${FOUNDER_CAP} numbers are taken; customer ${customerId} got Club for life without a number`);
  await projectMembershipToMetafield(admin, shop, customerId);
  return { number };
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
  | { kind: "founder"; value: boolean }
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
  } else if (action.kind === "founder") {
    // The profile flag changes; turning it on also takes the next Fundador number, turning it off frees it.
    const existing = await db.membership.findUnique({ where: key });
    // Club for life only exists as part of Fundador: taking the profile away from a lifetime member also ends that access.
    const endsLifetime = !action.value && (isLifetimeDate(existing?.promoEnd) || isLifetimeDate(existing?.currentPeriodEnd));
    const past = new Date(now.getTime() - 60 * 1000);
    const data = action.value
      ? { founder: true, founderSince: now }
      : {
          founder: false,
          founderSince: null,
          founderNumber: null,
          ...(endsLifetime ? { status: "EXPIRED", promoEnd: past, currentPeriodEnd: existing?.currentPeriodEnd ? past : null, cancelledAt: now } : {}),
        };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
    if (action.value) await assignFounderNumber(shop, customerId);
    else await clearFounderMetafield(admin, customerId);
    await projectMembershipToMetafield(admin, shop, customerId);
    return;
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
      founder: false,
      founderSince: null,
      founderNumber: null,
    };
    await db.membership.upsert({ where: key, create: { shop, customerId, ...data }, update: data });
  }

  if (action.kind === "free") {
    await clearMembershipMetafield(admin, customerId);
    await clearFounderMetafield(admin, customerId);
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

// Removes the projected Fundador number so the badge disappears from the theme.
export async function clearFounderMetafield(admin: AdminApiContext, customerId: string) {
  const response = await admin.graphql(
    `#graphql
      mutation clearFounderNumber($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          { ownerId: `gid://shopify/Customer/${customerId}`, namespace: METAFIELD_NAMESPACE, key: FOUNDER_METAFIELD_KEY },
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
