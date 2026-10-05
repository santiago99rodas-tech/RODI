import crypto from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { specFor, type CampaignAudience, type CampaignTemplateId } from "./campaign-spec";
import { normalizeLocale, renderEmail, type EmailLocale } from "./email-render.server";
import { resendConfig, sendBatch, sendEmail } from "./resend.server";
import { resolveMembership } from "./membership.server";
import { unsubscribeUrl } from "./unsubscribe.server";

// Marketing campaigns (Admin > Campaigns). The flow is: validate the fields -> snapshot the audience (customers who
// accepted marketing emails in Shopify) and the products -> send in batches of 50 from the admin screen, which keeps
// the work resumable and visible. Nothing is sent until a person presses "Send".

export type ProductSnapshot = { title: string; url: string; image: string; description: string };
export type CampaignParams = { fields: Record<string, string>; products: ProductSnapshot[] };
export type Counts = { total: number; pending: number; sent: number; failed: number; skipped: number };

const BATCH_SIZE = 50;
const AUDIENCE_CAP = 5000;
const storefront = () => (process.env.STOREFRONT_URL || "https://rodiclub.com").replace(/\/$/, "");

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------------------------------------------
// Fields

export function validateFields(template: CampaignTemplateId, raw: Record<string, string>): { fields: Record<string, string> } | { error: string } {
  const spec = specFor(template);
  if (!spec) return { error: "Unknown email" };
  const fields: Record<string, string> = {};
  for (const field of spec.fields) {
    const value = (raw[field.key] ?? "").trim();
    if (!value) {
      if (field.required) return { error: `${field.label} is required` };
      continue;
    }
    if (value.length > 500) return { error: `${field.label} is too long` };
    if (field.key === "discount_code" && !/^[A-Za-z0-9_-]{3,30}$/.test(value)) return { error: "The discount code can only have letters, numbers, - and _ (3 to 30 characters)" };
    if (field.key === "collection" && !/^[a-z0-9-]{1,80}$/.test(value)) return { error: "The collection handle looks wrong (lowercase letters, numbers and -)" };
    if (["cta_url", "chapter_url", "chapter_image"].includes(field.key)) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        return { error: `${field.label} must be a full https:// link` };
      }
    }
    fields[field.key] = value;
  }
  return { fields };
}

// ---------------------------------------------------------------------------------------------------------------
// Catalog and audience

export async function fetchProducts(admin: AdminApiContext, collection?: string): Promise<ProductSnapshot[]> {
  const fields = `title handle onlineStoreUrl description status featuredImage { url }`;
  const response = collection
    ? await admin.graphql(`#graphql\n query p($handle: String!) { collectionByHandle(handle: $handle) { products(first: 6) { nodes { ${fields} } } } }`, { variables: { handle: collection } })
    : await admin.graphql(`#graphql\n query p { products(first: 6, sortKey: CREATED_AT, reverse: true, query: "status:active") { nodes { ${fields} } } }`);
  const body: any = await response.json();
  if (body?.errors?.length) {
    const message = body.errors.map((e: { message?: string }) => e.message).join("; ");
    throw new Error(/access denied/i.test(message) ? `${message} The app needs the read_products permission: add it to SCOPES in EasyPanel, run shopify app deploy and approve it in Shopify.` : message);
  }
  const nodes: any[] = collection ? body?.data?.collectionByHandle?.products?.nodes ?? [] : body?.data?.products?.nodes ?? [];
  return nodes
    .filter((p) => p.status === "ACTIVE" && p.featuredImage?.url)
    .slice(0, 3)
    .map((p) => ({
      title: p.title,
      url: p.onlineStoreUrl || `${storefront()}/products/${p.handle}`,
      image: `${p.featuredImage.url}${p.featuredImage.url.includes("?") ? "&" : "?"}width=600`,
      description: p.description ?? "",
    }));
}

export type AudienceMember = { customerId: string; email: string; locale: EmailLocale };

// Only customers whose marketing consent in Shopify is SUBSCRIBED. Shopify is the source of truth for consent, so a
// person who unsubscribed anywhere (including through our own link) is never included.
export async function fetchAudience(admin: AdminApiContext, shop: string, audience: CampaignAudience): Promise<AudienceMember[]> {
  const members: AudienceMember[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 40 && members.length < AUDIENCE_CAP; page++) {
    const response: Response = await admin.graphql(
      `#graphql
        query audience($cursor: String) {
          customers(first: 250, after: $cursor, query: "email_marketing_state:subscribed") {
            pageInfo { hasNextPage endCursor }
            nodes { id email locale emailMarketingConsent { marketingState } }
          }
        }`,
      { variables: { cursor } },
    );
    const body = await response.json();
    const connection = body?.data?.customers;
    for (const node of connection?.nodes ?? []) {
      const email = String(node.email ?? "").trim().toLowerCase();
      if (!email || node.emailMarketingConsent?.marketingState !== "SUBSCRIBED" || seen.has(email)) continue;
      const customerId = String(node.id).replace("gid://shopify/Customer/", "");
      if (audience === "club" && !(await resolveMembership(shop, customerId)).isClub) continue;
      seen.add(email);
      members.push({ customerId, email, locale: normalizeLocale(node.locale) });
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }
  return members;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering

function templateData(params: CampaignParams, unsubscribe: string, escape = true): Record<string, unknown> {
  const f = params.fields;
  const safe = (key: string) => (f[key] ? (escape ? escapeHtml(f[key]) : f[key]) : undefined);
  return {
    offer_text: safe("offer_text"),
    cta_url: safe("cta_url"),
    discount_code: safe("discount_code"),
    discount_label: safe("discount_label"),
    products: params.products,
    chapter: f.chapter_name
      ? { name: safe("chapter_name"), url: safe("chapter_url"), tagline: safe("chapter_tagline") ?? "", image: safe("chapter_image") ?? "" }
      : undefined,
    unsubscribe_url: unsubscribe,
  };
}

export const previewCampaign = (template: CampaignTemplateId, params: CampaignParams, locale: EmailLocale) =>
  {
  const link = `${storefront()}/#unsubscribe-preview`;
  return renderEmail(template, locale, templateData(params, link), templateData(params, link, false));
};

// ---------------------------------------------------------------------------------------------------------------
// Create, send, track

export async function createCampaign(
  admin: AdminApiContext,
  shop: string,
  input: { template: CampaignTemplateId; audience: CampaignAudience; fields: Record<string, string> },
): Promise<{ id: string } | { error: string }> {
  const spec = specFor(input.template);
  if (!spec) return { error: "Unknown email" };
  const products = spec.usesProducts ? await fetchProducts(admin, input.fields.collection) : [];
  if (spec.usesProducts && products.length < 3) {
    return { error: input.fields.collection ? "That collection has fewer than 3 active products with images" : "The shop needs at least 3 active products with images" };
  }
  const audience = await fetchAudience(admin, shop, input.audience);
  if (audience.length === 0) return { error: "Nobody in that audience has accepted marketing emails" };

  const campaign = await db.campaign.create({
    data: { shop, template: input.template, audience: input.audience, params: JSON.stringify({ fields: input.fields, products } satisfies CampaignParams), total: audience.length },
  });
  for (let i = 0; i < audience.length; i += 400) {
    await db.campaignRecipient.createMany({
      data: audience.slice(i, i + 400).map((m) => ({ campaignId: campaign.id, customerId: m.customerId, email: m.email, locale: m.locale })),
    });
  }
  return { id: campaign.id };
}

export async function campaignCounts(campaignId: string): Promise<Counts> {
  const groups = await db.campaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  const counts: Counts = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const g of groups) {
    const n = g._count._all;
    counts.total += n;
    if (g.status in counts) (counts as any)[g.status] += n;
  }
  return counts;
}

export async function sendNextBatch(shop: string, campaignId: string): Promise<{ counts: Counts; status: string; error?: string }> {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, shop } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "cancelled" || campaign.status === "sent") return { counts: await campaignCounts(campaignId), status: campaign.status };

  const config = resendConfig();
  if (!config.hasKey || !config.from) return { counts: await campaignCounts(campaignId), status: campaign.status, error: "Resend is not configured (RESEND_API_KEY / EMAIL_FROM)" };

  if (campaign.status === "draft") await db.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });
  const params = JSON.parse(campaign.params) as CampaignParams;
  const batch = await db.campaignRecipient.findMany({ where: { campaignId, status: "pending" }, orderBy: { id: "asc" }, take: BATCH_SIZE });

  if (batch.length === 0) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: "sent" } });
    return { counts: await campaignCounts(campaignId), status: "sent" };
  }

  const items: { recipient: (typeof batch)[number]; message: { to: string; subject: string; html: string; headers: Record<string, string> } }[] = [];
  for (const recipient of batch) {
    try {
      const link = unsubscribeUrl(shop, recipient.customerId, recipient.locale);
      const { subject, html } = await renderEmail(campaign.template as CampaignTemplateId, normalizeLocale(recipient.locale), templateData(params, link), templateData(params, link, false));
      items.push({
        recipient,
        message: { to: recipient.email, subject, html, headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } },
      });
    } catch (err) {
      await db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "failed", error: err instanceof Error ? err.message : String(err) } });
    }
  }

  let error: string | undefined;
  if (items.length) {
    // Same recipients in the same batch always produce the same key, so a retry after a timeout cannot double-send.
    const key = `campaign-${campaignId}-${crypto.createHash("sha1").update(items.map((i) => i.recipient.id).join(",")).digest("hex")}`;
    const result = await sendBatch(items.map((i) => i.message), key);
    if (result.ok) {
      for (let i = 0; i < items.length; i++) {
        await db.campaignRecipient.update({ where: { id: items[i].recipient.id }, data: { status: "sent", providerId: result.ids[i], error: null } });
      }
    } else if (result.skipped) {
      error = result.error; // nothing was attempted: leave them pending
    } else {
      error = result.error;
      await db.campaignRecipient.updateMany({ where: { id: { in: items.map((i) => i.recipient.id) } }, data: { status: "failed", error: result.error } });
    }
  }

  const counts = await campaignCounts(campaignId);
  const status = counts.pending === 0 ? "sent" : "sending";
  if (status === "sent") await db.campaign.update({ where: { id: campaignId }, data: { status } });
  return { counts, status, error };
}

export async function retryFailed(shop: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, shop } });
  if (!campaign || campaign.status === "cancelled") return;
  await db.campaignRecipient.updateMany({ where: { campaignId, status: "failed" }, data: { status: "pending", error: null } });
  await db.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });
}

export async function cancelCampaign(shop: string, campaignId: string) {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, shop } });
  if (!campaign || campaign.status === "sent") return;
  await db.campaignRecipient.updateMany({ where: { campaignId, status: "pending" }, data: { status: "skipped", error: "cancelled" } });
  await db.campaign.update({ where: { id: campaignId }, data: { status: "cancelled" } });
}

export async function sendCampaignTest(template: CampaignTemplateId, params: CampaignParams, locale: EmailLocale, to: string) {
  const rendered = await previewCampaign(template, params, locale);
  return sendEmail({ to, subject: `[TEST] ${rendered.subject}`, html: rendered.html });
}
