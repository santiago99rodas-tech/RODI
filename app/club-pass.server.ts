import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { extendClubAccess, resolveMembership } from "./membership.server";
import { sendWelcomeClubEmailAuto } from "./emails.server";

// Prepaid Club passes: shop products whose variant SKU is CLUB-PASS-<months>M (CLUB-PASS-12M, CLUB-PASS-3M). When an order that contains one is
// paid (orders/paid webhook), the months are added to the buyer's Club access, exactly like the referral reward does. Nothing is revoked
// automatically on a refund or cancellation: use "Vencer ahora" in the admin Memberships screen.
//
// Each order line is one ClubPassGrant row (unique per shop+order+line), so a webhook delivered twice, or a retry after a failure,
// can never grant the months twice. A buyer without an account (guest checkout) stays PENDING and is granted as soon as an account
// with the same email is created (see redeemPendingPasses, called from customers/create).

const SKU_RE = /^CLUB-PASS-(\d{1,2})M$/i;
const PASS_SOURCE = "pass_purchase";

export function passMonths(sku: unknown): number | null {
  const m = SKU_RE.exec(String(sku ?? "").trim());
  if (!m) return null;
  const months = Number(m[1]);
  return months > 0 && months <= 36 ? months : null;
}

type OrderLine = { id?: number | string; sku?: string | null; quantity?: number | null };
export type PaidOrder = {
  id?: number | string;
  email?: string | null;
  contact_email?: string | null;
  customer?: { id?: number | string | null; email?: string | null } | null;
  line_items?: OrderLine[];
};

async function customerIdFromOrder(admin: AdminApiContext, order: PaidOrder, orderId: string): Promise<string | null> {
  if (order.customer?.id) return String(order.customer.id);
  try {
    const response = await admin.graphql(
      `#graphql
        query orderCustomer($id: ID!) { order(id: $id) { customer { id } } }`,
      { variables: { id: `gid://shopify/Order/${orderId}` } },
    );
    const body = await response.json();
    const gid: string | undefined = body?.data?.order?.customer?.id;
    if (gid) return gid.replace("gid://shopify/Customer/", "");
  } catch {
    /* fall through to the email lookup */
  }
  return null;
}

async function customerIdByEmail(admin: AdminApiContext, email: string): Promise<string | null> {
  try {
    const response = await admin.graphql(
      `#graphql
        query customerByEmail($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`,
      { variables: { q: `email:${email}` } },
    );
    const body = await response.json();
    const gid: string | undefined = body?.data?.customers?.nodes?.[0]?.id;
    return gid ? gid.replace("gid://shopify/Customer/", "") : null;
  } catch {
    return null;
  }
}

// Applies one claimed row. The claim (PENDING -> GRANTING) is atomic, so two deliveries can never apply the same row.
async function applyRow(admin: AdminApiContext, shop: string, row: { id: string; months: number }, customerId: string) {
  const claim = await db.clubPassGrant.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "GRANTING", customerId } });
  if (claim.count !== 1) return false;
  try {
    const before = await resolveMembership(shop, customerId);
    await extendClubAccess(admin, shop, customerId, row.months, PASS_SOURCE);
    await db.clubPassGrant.update({ where: { id: row.id }, data: { status: "GRANTED", grantedAt: new Date() } });
    if (!before.isClub) await sendWelcomeClubEmailAuto(admin, shop, customerId); // never throws; deduplicated per customer
    return true;
  } catch (err) {
    await db.clubPassGrant.update({ where: { id: row.id }, data: { status: "PENDING" } }); // let the retry try again
    throw err;
  }
}

export async function redeemPassOrder(admin: AdminApiContext, shop: string, order: PaidOrder): Promise<{ lines: number; granted: number; pending: number }> {
  const orderId = String(order.id ?? "");
  const passes = (order.line_items ?? [])
    .map((li) => ({ lineId: String(li.id ?? ""), months: passMonths(li.sku), quantity: Math.max(1, Math.min(12, Number(li.quantity ?? 1) || 1)), sku: String(li.sku ?? "") }))
    .filter((p) => p.lineId && p.months);
  if (!orderId || !passes.length) return { lines: 0, granted: 0, pending: 0 };

  const email = String(order.email ?? order.contact_email ?? order.customer?.email ?? "").trim().toLowerCase() || null;
  let customerId = await customerIdFromOrder(admin, order, orderId);
  if (!customerId && email) customerId = await customerIdByEmail(admin, email);

  let granted = 0;
  let pending = 0;
  for (const p of passes) {
    const months = (p.months as number) * p.quantity;
    const key = { shop_orderId_lineItemId: { shop, orderId, lineItemId: p.lineId } };
    let row = await db.clubPassGrant.findUnique({ where: key });
    if (!row) {
      try {
        row = await db.clubPassGrant.create({ data: { shop, orderId, lineItemId: p.lineId, sku: p.sku, months, email, customerId } });
      } catch {
        row = await db.clubPassGrant.findUnique({ where: key }); // a parallel delivery created it first
      }
    }
    if (!row || row.status === "GRANTED" || row.status === "GRANTING") continue;
    if (!customerId) {
      pending += 1;
      console.warn(`[club-pass] order ${orderId} line ${p.lineId}: no account for ${email ?? "(no email)"} yet, left PENDING`);
      continue;
    }
    if (await applyRow(admin, shop, row, customerId)) granted += 1;
  }
  return { lines: passes.length, granted, pending };
}

// A new account was created: grant the passes that were bought before it existed (guest checkout with the same email).
export async function redeemPendingPasses(admin: AdminApiContext, shop: string, customerId: string, email: unknown): Promise<number> {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean) return 0;
  const rows = await db.clubPassGrant.findMany({ where: { shop, status: "PENDING", email: clean } });
  let granted = 0;
  for (const row of rows) {
    if (await applyRow(admin, shop, row, customerId)) granted += 1;
  }
  return granted;
}
