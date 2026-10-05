import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { normalizeLocale, renderEmail } from "./email-render.server";
import { resendConfig, sendEmail } from "./resend.server";
import { unsubscribeUrl } from "./unsubscribe.server";

// Abandoned-cart reminders, sent from the app with the RODI design (the store's own Shopify automation cannot take
// custom HTML; turn it off in Marketing > Automations so nobody gets two emails).
//
// How it works: a scheduled job (every 10 minutes while ABANDONED_CART_ENABLED=true) asks Shopify for recently
// abandoned checkouts and emails the ones that qualify. A cart qualifies when:
//   - it was left at least ABANDONED_CART_DELAY_MINUTES ago (default 60) and no more than ABANDONED_CART_MAX_AGE_HOURS (default 48)
//   - it is not completed, has products, and belongs to a customer with an email
//   - the customer accepted marketing emails (ABANDONED_CART_AUDIENCE=all relaxes this to every customer)
//   - the customer has not ordered since, and was not sent a cart reminder in the last 7 days
// Each cart is emailed at most once (AbandonedCartLog), and every email carries a working unsubscribe link.

const delayMinutes = () => Number(process.env.ABANDONED_CART_DELAY_MINUTES) || 60;
const maxAgeHours = () => Number(process.env.ABANDONED_CART_MAX_AGE_HOURS) || 48;
const audience = () => (process.env.ABANDONED_CART_AUDIENCE === "all" ? "all" : "subscribed");
export const abandonedCartsEnabled = () => process.env.ABANDONED_CART_ENABLED === "true";
export const abandonedCartSettings = () => ({ enabled: abandonedCartsEnabled(), delayMinutes: delayMinutes(), maxAgeHours: maxAgeHours(), audience: audience() });

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 25;

export type CartDecision = {
  checkoutId: string;
  email: string;
  items: number;
  total: string;
  action: "send" | "skip";
  reason?: string;
  result?: "sent" | "failed" | "not-sent";
};

type Money = { amount: string; currencyCode: string };
type CheckoutNode = {
  id: string;
  abandonedCheckoutUrl: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  customer: { id: string; email: string | null; locale: string | null; emailMarketingConsent: { marketingState: string } | null } | null;
  totalPriceSet: { shopMoney: Money } | null;
  lineItems: { nodes: { title: string; variantTitle: string | null; quantity: number; image: { url: string } | null; discountedTotalPriceSet: { shopMoney: Money } }[] };
};

const CHECKOUT_FIELDS = `
  id abandonedCheckoutUrl createdAt updatedAt completedAt
  customer { id email locale emailMarketingConsent { marketingState } }
  totalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first: 10) { nodes { title variantTitle quantity image { url } discountedTotalPriceSet { shopMoney { amount currencyCode } } } }`;

async function fetchCheckouts(admin: AdminApiContext, since: Date): Promise<CheckoutNode[]> {
  const run = async (query: string) => {
    const response = await admin.graphql(
      `#graphql
        query abandoned($query: String) {
          abandonedCheckouts(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) { nodes { ${CHECKOUT_FIELDS} } }
        }`,
      { variables: { query } },
    );
    return (await response.json()) as any;
  };
  let body = await run(`updated_at:>=${since.toISOString()}`);
  if (body?.errors?.length) body = await run(""); // some API versions reject the date filter: filter in code instead
  if (body?.errors?.length) {
    const message = body.errors.map((e: { message?: string }) => e.message).join("; ");
    throw new Error(/access denied/i.test(message) ? `${message} The app needs the read_orders permission (see README).` : message);
  }
  return body?.data?.abandonedCheckouts?.nodes ?? [];
}

async function hasOrderedSince(admin: AdminApiContext, customerId: string, since: Date): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
      query orderedSince($query: String!) { orders(first: 1, query: $query) { nodes { id } } }`,
    { variables: { query: `customer_id:${customerId} created_at:>=${since.toISOString()}` } },
  );
  const body: any = await response.json();
  return (body?.data?.orders?.nodes?.length ?? 0) > 0;
}

const cents = (money: Money | undefined | null) => Math.round(parseFloat(money?.amount ?? "0") * 100);

export async function runAbandonedCarts(
  admin: AdminApiContext,
  shop: string,
  options: { dryRun: boolean },
): Promise<CartDecision[]> {
  const now = Date.now();
  const checkouts = await fetchCheckouts(admin, new Date(now - maxAgeHours() * 60 * 60 * 1000));
  const decisions: CartDecision[] = [];
  let sends = 0;

  for (const cart of checkouts) {
    const customer = cart.customer;
    const email = customer?.email?.trim().toLowerCase() ?? "";
    const base = { checkoutId: cart.id, email: email || "(no email)", items: cart.lineItems.nodes.length, total: cart.totalPriceSet ? `${cart.totalPriceSet.shopMoney.amount} ${cart.totalPriceSet.shopMoney.currencyCode}` : "" };
    const skip = (reason: string) => decisions.push({ ...base, action: "skip", reason });

    const idle = now - new Date(cart.updatedAt).getTime();
    if (cart.completedAt) { skip("completed"); continue; }
    if (idle < delayMinutes() * 60 * 1000) { skip("left less than the waiting time ago"); continue; }
    if (idle > maxAgeHours() * 60 * 60 * 1000) { skip("too old"); continue; }
    if (!customer || !email) { skip("no customer email"); continue; }
    if (cart.lineItems.nodes.length === 0) { skip("empty cart"); continue; }
    if (audience() === "subscribed" && customer.emailMarketingConsent?.marketingState !== "SUBSCRIBED") { skip("not subscribed to marketing emails"); continue; }

    const customerId = customer.id.replace("gid://shopify/Customer/", "");
    const logged = await db.abandonedCartLog.findUnique({ where: { shop_checkoutId: { shop, checkoutId: cart.id } } });
    if (logged && logged.status !== "failed") { skip("already emailed"); continue; }
    const recent = await db.abandonedCartLog.findFirst({ where: { shop, email, status: "sent", createdAt: { gte: new Date(now - COOLDOWN_MS) } } });
    if (recent) { skip("emailed about another cart in the last 7 days"); continue; }
    if (await hasOrderedSince(admin, customerId, new Date(cart.createdAt))) { skip("ordered since"); continue; }

    if (sends >= MAX_PER_RUN) { skip("limit per run reached (will be picked up next run)"); continue; }

    if (options.dryRun) { decisions.push({ ...base, action: "send" }); sends++; continue; }

    sends++;
    const outcome = await sendReminder(shop, cart, customerId, email);
    decisions.push({ ...base, action: "send", result: outcome });
  }
  return decisions;
}

async function sendReminder(shop: string, cart: CheckoutNode, customerId: string, email: string): Promise<"sent" | "failed" | "not-sent"> {
  const config = resendConfig();
  if (!config.hasKey || !config.from) return "not-sent";

  const key = { shop_checkoutId: { shop, checkoutId: cart.id } };
  const existing = await db.abandonedCartLog.findUnique({ where: key });
  if (existing) {
    await db.abandonedCartLog.update({ where: key, data: { status: "sending", error: null } });
  } else {
    try {
      await db.abandonedCartLog.create({ data: { shop, checkoutId: cart.id, customerId, email } });
    } catch {
      return "not-sent"; // another run claimed it first
    }
  }

  try {
    const locale = normalizeLocale(cart.customer?.locale);
    const link = unsubscribeUrl(shop, customerId, locale);
    const currency = cart.totalPriceSet?.shopMoney.currencyCode ?? cart.lineItems.nodes[0]?.discountedTotalPriceSet.shopMoney.currencyCode ?? "USD";
    const { subject, html } = await renderEmail("abandoned-checkout", locale, {
      url: cart.abandonedCheckoutUrl,
      unsubscribe_url: link,
      currency,
      line_items: cart.lineItems.nodes.map((item) => ({
        title: item.title,
        variant: { title: item.variantTitle ?? "" },
        quantity: item.quantity,
        image: item.image?.url ?? "",
        final_line_price: cents(item.discountedTotalPriceSet.shopMoney),
      })),
    });
    const result = await sendEmail({
      to: email,
      subject,
      html,
      idempotencyKey: `abandoned/${shop}/${cart.id}`,
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (result.ok) {
      await db.abandonedCartLog.update({ where: key, data: { status: "sent", providerId: result.id, error: null } });
      return "sent";
    }
    await db.abandonedCartLog.update({ where: key, data: { status: "failed", error: result.skipped ? result.reason : result.error } });
    return "failed";
  } catch (err) {
    await db.abandonedCartLog.update({ where: key, data: { status: "failed", error: err instanceof Error ? err.message : String(err) } });
    return "failed";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Scheduler: started once when the server boots; does nothing unless ABANDONED_CART_ENABLED=true.

let started = false;
let running = false;

async function tick() {
  if (!abandonedCartsEnabled() || running) return;
  running = true;
  try {
    const sessions = await db.session.findMany({ where: { isOnline: false }, distinct: ["shop"] });
    for (const { shop } of sessions) {
      try {
        const { admin } = await unauthenticated.admin(shop);
        const decisions = await runAbandonedCarts(admin, shop, { dryRun: false });
        const sent = decisions.filter((d) => d.result === "sent").length;
        if (sent || decisions.some((d) => d.result === "failed")) console.log(`[abandoned-carts] ${shop}: ${sent} sent, ${decisions.filter((d) => d.result === "failed").length} failed`);
      } catch (err) {
        console.error(`[abandoned-carts] ${shop} failed`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startAbandonedCartScheduler() {
  if (started) return;
  started = true;
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 10 * 60 * 1000).unref();
}
