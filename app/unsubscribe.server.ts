import crypto from "node:crypto";
import db from "./db.server";
import { unauthenticated } from "./shopify.server";

// Unsubscribe links in marketing emails. The link carries an HMAC of shop + customer, so it cannot be forged or
// guessed, and works without a login. Unsubscribing also updates the customer's marketing consent in Shopify, so
// Shopify Email and every other tool see the same state.

const secret = () => process.env.SHOPIFY_API_SECRET || "";
const appUrl = () => (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");

export function unsubscribeSignature(shop: string, customerId: string): string {
  return crypto.createHmac("sha256", secret()).update(`unsubscribe:${shop}:${customerId}`).digest("base64url");
}

export function verifyUnsubscribe(shop: string, customerId: string, signature: string): boolean {
  if (!secret() || !signature) return false;
  const expected = Buffer.from(unsubscribeSignature(shop, customerId));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function unsubscribeUrl(shop: string, customerId: string, locale: string): string {
  const params = new URLSearchParams({ shop, c: customerId, s: unsubscribeSignature(shop, customerId), l: locale });
  return `${appUrl()}/unsubscribe?${params.toString()}`;
}

export async function unsubscribeCustomer(shop: string, customerId: string): Promise<void> {
  // Anything still queued for this person must not go out.
  await db.campaignRecipient.updateMany({
    where: { customerId, status: "pending", campaign: { shop } },
    data: { status: "skipped", error: "unsubscribed" },
  });

  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
      mutation unsubscribeEmail($input: CustomerEmailMarketingConsentUpdateInput!) {
        customerEmailMarketingConsentUpdate(input: $input) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          customerId: `gid://shopify/Customer/${customerId}`,
          emailMarketingConsent: { marketingState: "UNSUBSCRIBED", consentUpdatedAt: new Date().toISOString() },
        },
      },
    },
  );
  const body = await response.json();
  const errors = body?.data?.customerEmailMarketingConsentUpdate?.userErrors;
  if (errors?.length) throw new Error(`Could not unsubscribe customer ${customerId}: ${JSON.stringify(errors)}`);
}
