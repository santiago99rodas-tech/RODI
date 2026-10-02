import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { formatEmailDate, normalizeLocale, renderEmail, type AppEmailTemplate, type EmailLocale } from "./email-render.server";
import { resendConfig, sendEmail } from "./resend.server";
import { resolveMembership } from "./membership.server";

// Sends the app's own emails (the ones Shopify does not send). Every send goes through sendTemplateEmail(), which uses
// the EmailLog table as a guard so a webhook retry (Shopify delivers at least once) never emails someone twice.

type SendInput = {
  shop: string;
  customerId: string;
  template: AppEmailTemplate;
  to: string;
  locale: EmailLocale;
  data?: Record<string, unknown>;
  // An admin explicitly asking to send again. Automatic triggers never set this.
  force?: boolean;
};

export type TemplateSendOutcome = "sent" | "skipped" | "duplicate" | "failed";

export async function sendTemplateEmail(input: SendInput): Promise<{ outcome: TemplateSendOutcome; detail?: string }> {
  const { shop, customerId, template, to, locale } = input;
  const key = { shop_customerId_template: { shop, customerId, template } };

  const config = resendConfig();
  if (!config.hasKey || !config.from) {
    return { outcome: "skipped", detail: "Resend is not configured (RESEND_API_KEY / EMAIL_FROM)" };
  }

  // Claim the row first: the unique constraint makes concurrent deliveries (customers/create + customers/update) race
  // safely, and only the winner sends.
  const existing = await db.emailLog.findUnique({ where: key });
  if (existing) {
    const retryable = existing.status === "failed" || input.force;
    if (!retryable) return { outcome: "duplicate" };
    await db.emailLog.update({ where: key, data: { status: "sending", error: null, recipient: to, locale } });
  } else {
    try {
      await db.emailLog.create({ data: { shop, customerId, template, locale, recipient: to } });
    } catch {
      return { outcome: "duplicate" }; // lost the race to a concurrent delivery
    }
  }

  try {
    const { subject, html } = await renderEmail(template, locale, input.data);
    const result = await sendEmail({
      to,
      subject,
      html,
      idempotencyKey: input.force ? undefined : `${template}/${shop}/${customerId}`,
    });
    if (result.ok) {
      await db.emailLog.update({ where: key, data: { status: "sent", providerId: result.id, error: null } });
      return { outcome: "sent" };
    }
    const error = result.skipped ? result.reason : result.error;
    await db.emailLog.update({ where: key, data: { status: "failed", error } });
    return { outcome: "failed", detail: error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.emailLog.update({ where: key, data: { status: "failed", error } });
    return { outcome: "failed", detail: error };
  }
}

// The webhook payload can omit email/locale (Shopify hides protected customer fields unless the app has access to
// them), so read what is missing straight from the Admin API.
async function customerInfo(admin: AdminApiContext, customerId: string): Promise<{ email: string | null; locale: string | null }> {
  try {
    const response = await admin.graphql(
      `#graphql
        query customerInfo($id: ID!) { customer(id: $id) { email locale } }`,
      { variables: { id: `gid://shopify/Customer/${customerId}` } },
    );
    const body = await response.json();
    return { email: body?.data?.customer?.email ?? null, locale: body?.data?.customer?.locale ?? null };
  } catch {
    return { email: null, locale: null };
  }
}

function monthsBetween(start: Date, end: Date): number {
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
}

// "Tu cuenta ya está lista": sent right after a signup receives the complimentary Club access. Never throws: a failed
// email must not make the webhook fail (Shopify would retry the whole delivery).
export async function sendAccountReadyEmail(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
  payload: { email?: string | null },
) {
  try {
    const info = await customerInfo(admin, customerId);
    const to = payload.email || info.email;
    if (!to) return;
    const membership = await resolveMembership(shop, customerId);
    if (!membership.isClub || !membership.accessUntil) return;
    const row = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId } } });
    const locale = normalizeLocale(info.locale);
    const result = await sendTemplateEmail({
      shop,
      customerId,
      template: "account-ready",
      to,
      locale,
      data: {
        promo_months: row?.promoStart && row.promoEnd ? monthsBetween(row.promoStart, row.promoEnd) : 3,
        access_until: formatEmailDate(membership.accessUntil, locale),
      },
    });
    if (result.outcome === "failed" || result.outcome === "skipped") {
      console.warn(`[email] account-ready for customer ${customerId}: ${result.outcome} (${result.detail})`);
    }
  } catch (err) {
    console.error(`[email] account-ready for customer ${customerId} threw`, err);
  }
}

// "Bienvenido a RODI Club": sent only when an admin presses the button on the memberships screen.
export async function sendWelcomeClubEmail(admin: AdminApiContext, shop: string, customerId: string, to: string) {
  const locale = normalizeLocale((await customerInfo(admin, customerId)).locale);
  return sendTemplateEmail({ shop, customerId, template: "welcome-club", to, locale, force: true });
}
