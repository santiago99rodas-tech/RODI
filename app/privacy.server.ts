import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { resendConfig, sendEmail } from "./resend.server";
import { unsubscribeCustomer } from "./unsubscribe.server";
import { getLegalState } from "./legal.server";

// Data subject rights for everything this app stores about a customer: export (access/portability) and erasure.
// Used by the member's own buttons (app proxy: GET ?export=all, POST accountDelete) and by Shopify's mandatory compliance
// webhooks (customers/data_request, customers/redact, shop/redact). Each request leaves a DataRequest row (ids and
// outcome only) as the audit trail.

export const OWNER_EMAIL = "contact@rodiclub.com";
// Customer metafields this app writes (and therefore exports and clears).
export const MANAGED_METAFIELDS = ["club_access_until", "nationalities", "saved_countries", "travel_log", "age_band", "legal_version", "residence_country", "residence_city"] as const;
const ERASURE_SCOPE = "write_customer_data_erasure";

/** Admin API client for a shop from its stored offline session, or null (e.g. shop/redact after uninstall). */
export async function adminFor(shop: string): Promise<AdminApiContext | null> {
  try {
    return (await unauthenticated.admin(shop)).admin;
  } catch {
    return null;
  }
}

async function readManagedMetafields(admin: AdminApiContext, customerId: string) {
  const response = await admin.graphql(
    `#graphql
      query exportMetafields($id: ID!) {
        customer(id: $id) { metafields(first: 50, namespace: "custom") { nodes { key type value updatedAt } } }
      }`,
    { variables: { id: `gid://shopify/Customer/${customerId}` } },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin API JSON, read field by field
  const body: any = await response.json();
  const nodes: { key: string; type: string; value: string; updatedAt: string }[] = body?.data?.customer?.metafields?.nodes ?? [];
  return nodes.filter((n) => (MANAGED_METAFIELDS as readonly string[]).includes(n.key)).map((n) => ({ namespace: "custom", ...n }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Export

/**
 * Everything the app stores for one customer. `includeInternal` adds staff-only fields (the service-inquiry internal
 * note); it is used for the Shopify data_request export the owner reviews before forwarding, not for the member download.
 */
export async function buildCustomerExport(shop: string, customerId: string, opts: { admin?: AdminApiContext | null; includeInternal?: boolean } = {}) {
  const who = { shop, customerId };
  const [
    trips, documents, emergencyContacts, journalEntries, communityPosts, communityReplies, communityLikes,
    legacyQuestions, legacyAnswers, legacyRecommendations, calculatorPlans, countrySaves, countryTravel,
    serviceInquiries, memberships, emailLogs, campaignRecipients, abandonedCarts, legalAcceptances, guardianConsents, dataRequests,
  ] = await Promise.all([
    db.trip.findMany({
      where: who,
      orderBy: { createdAt: "asc" },
      include: {
        participants: true,
        days: { orderBy: { sortOrder: "asc" }, include: { activities: { orderBy: { sortOrder: "asc" } } } },
        checklist: true,
        expenses: true,
        places: true,
        documents: true,
      },
    }),
    db.document.findMany({ where: { ...who, tripId: null } }),
    db.emergencyContact.findMany({ where: who }),
    db.journalEntry.findMany({ where: who }),
    db.communityPost.findMany({ where: who }),
    db.communityReply.findMany({ where: who }),
    db.communityLike.findMany({ where: who }),
    db.communityQuestion.findMany({ where: who }),
    db.communityAnswer.findMany({ where: who }),
    db.communityRecommendation.findMany({ where: who }),
    db.calculatorPlan.findMany({ where: who }),
    db.countrySave.findMany({ where: who }),
    db.countryTravel.findMany({ where: who }),
    db.serviceInquiry.findMany({ where: who }),
    db.membership.findMany({ where: who }),
    db.emailLog.findMany({ where: who }),
    db.campaignRecipient.findMany({ where: { customerId, campaign: { shop } }, include: { campaign: { select: { template: true, createdAt: true } } } }),
    db.abandonedCartLog.findMany({ where: who }),
    db.legalAcceptance.findMany({ where: who, orderBy: { createdAt: "asc" } }),
    db.guardianConsent.findMany({ where: who, orderBy: { createdAt: "asc" } }),
    db.dataRequest.findMany({ where: who, orderBy: { createdAt: "asc" } }),
  ]);

  let metafields: unknown = null;
  if (opts.admin) {
    try {
      metafields = await readManagedMetafields(opts.admin, customerId);
    } catch (err) {
      console.error("[privacy] metafield export failed", err);
      metafields = { error: "Could not read Shopify metafields at export time" };
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    shop,
    customerId,
    note: "Data stored by the RODI Club app. Orders, addresses and the account itself are held by Shopify.",
    trips,
    documents,
    emergencyContacts,
    journalEntries,
    community: {
      posts: communityPosts,
      replies: communityReplies,
      likesAndReports: communityLikes,
      legacyQuestions,
      legacyAnswers,
      legacyRecommendations,
    },
    calculatorPlans: calculatorPlans.map((p) => {
      let data: unknown = p.data;
      try { data = JSON.parse(p.data); } catch { /* keep the raw text */ }
      return { ...p, data };
    }),
    countrySaves,
    countryTravel,
    serviceInquiries: opts.includeInternal ? serviceInquiries : serviceInquiries.map((s) => ({ ...s, internalNote: undefined })),
    memberships,
    emailLogs,
    campaignEmails: campaignRecipients,
    abandonedCartEmails: abandonedCarts,
    legalAcceptances,
    // tokenHash is a credential, never exported
    guardianConsents: guardianConsents.map((g) => ({ ...g, tokenHash: undefined })),
    dataRequests,
    shopifyMetafields: metafields,
  };
}

export function exportFilename(date = new Date()): string {
  return `rodi-mis-datos-${date.toISOString().slice(0, 10)}.json`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Erasure

/** Hard-deletes every app row of one customer. Community counters on other members' content are kept consistent. */
export async function deleteCustomerRows(shop: string, customerId: string) {
  const who = { shop, customerId };
  const myPosts = (await db.communityPost.findMany({ where: who, select: { id: true } })).map((p) => p.id);
  const myReplies = await db.communityReply.findMany({ where: who, select: { id: true, postId: true, status: true } });
  const repliesUnderMyPosts = myPosts.length
    ? (await db.communityReply.findMany({ where: { postId: { in: myPosts } }, select: { id: true } })).map((r) => r.id)
    : [];
  const goneReplies = new Set([...myReplies.map((r) => r.id), ...repliesUnderMyPosts]);
  const goneTargets = [...myPosts, ...goneReplies];
  const myLikes = await db.communityLike.findMany({ where: who });

  await db.$transaction(async (tx) => {
    // Likes this member gave to content that stays: take them off the counters.
    for (const like of myLikes) {
      if (like.targetType === "post" && !myPosts.includes(like.targetId)) {
        await tx.communityPost.updateMany({ where: { id: like.targetId, likeCount: { gt: 0 } }, data: { likeCount: { decrement: 1 } } });
      } else if (like.targetType === "reply" && !goneReplies.has(like.targetId)) {
        await tx.communityReply.updateMany({ where: { id: like.targetId, likeCount: { gt: 0 } }, data: { likeCount: { decrement: 1 } } });
      }
    }
    // Their replies on other members' posts: fix the reply count and any "accepted answer" pointing at them.
    const perPost = new Map<string, number>();
    for (const r of myReplies) {
      if (myPosts.includes(r.postId) || r.status === "removed") continue;
      perPost.set(r.postId, (perPost.get(r.postId) ?? 0) + 1);
    }
    for (const [postId, n] of perPost) {
      const post = await tx.communityPost.findUnique({ where: { id: postId }, select: { replyCount: true } });
      if (post) await tx.communityPost.update({ where: { id: postId }, data: { replyCount: Math.max(0, post.replyCount - n) } });
    }
    if (myReplies.length) {
      await tx.communityPost.updateMany({ where: { acceptedReplyId: { in: myReplies.map((r) => r.id) } }, data: { acceptedReplyId: null } });
    }

    await tx.communityLike.deleteMany({ where: who });
    if (goneTargets.length) await tx.communityLike.deleteMany({ where: { targetId: { in: goneTargets } } });
    await tx.communityReply.deleteMany({ where: who });
    await tx.communityPost.deleteMany({ where: who }); // replies by others under these posts go with them (cascade)
    await tx.communityAnswer.deleteMany({ where: who });
    await tx.communityQuestion.deleteMany({ where: who }); // cascade: answers by others under these questions
    await tx.communityRecommendation.deleteMany({ where: who });

    await tx.trip.deleteMany({ where: who }); // cascade: days, activities, checklist, expenses, participants, places, trip documents
    await tx.document.deleteMany({ where: who });
    await tx.emergencyContact.deleteMany({ where: who });
    await tx.journalEntry.deleteMany({ where: who });
    await tx.serviceInquiry.deleteMany({ where: who });
    await tx.calculatorPlan.deleteMany({ where: who });
    await tx.countrySave.deleteMany({ where: who });
    await tx.countryTravel.deleteMany({ where: who });
    await tx.membership.deleteMany({ where: who });
    await tx.emailLog.deleteMany({ where: who });
    await tx.campaignRecipient.deleteMany({ where: { customerId, campaign: { shop } } });
    await tx.abandonedCartLog.deleteMany({ where: who });
    await tx.legalAcceptance.deleteMany({ where: who });
    await tx.guardianConsent.deleteMany({ where: who });
  });
}

async function clearManagedMetafields(admin: AdminApiContext, customerId: string) {
  const ownerId = `gid://shopify/Customer/${customerId}`;
  const response = await admin.graphql(
    `#graphql
      mutation clearAppMetafields($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) { userErrors { field message } }
      }`,
    { variables: { metafields: MANAGED_METAFIELDS.map((key) => ({ ownerId, namespace: "custom", key })) } },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin API JSON, read field by field
  const body: any = await response.json();
  const errors = body?.data?.metafieldsDelete?.userErrors ?? body?.errors;
  if (errors?.length) throw new Error(`metafieldsDelete failed: ${JSON.stringify(errors).slice(0, 300)}`);
}

/**
 * Rows + app metafields + marketing consent. Never throws on the Shopify side: those failures are returned so the
 * caller can record them; the rows are deleted regardless.
 */
export async function eraseCustomerData(shop: string, customerId: string, admin: AdminApiContext | null) {
  const problems: string[] = [];
  await deleteCustomerRows(shop, customerId);
  const client = admin ?? (await adminFor(shop));
  if (client) {
    try {
      await clearManagedMetafields(client, customerId);
    } catch (err) {
      problems.push(`metafields: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    problems.push("metafields: no Admin API session for this shop");
  }
  try {
    await unsubscribeCustomer(shop, customerId);
  } catch (err) {
    problems.push(`marketing: ${err instanceof Error ? err.message : String(err)}`);
  }
  return problems;
}

/**
 * Asks Shopify to erase the customer record itself. Needs the write_customer_data_erasure access scope.
 * TODO(owner): that scope is NOT in shopify.app.toml today (scopes = read_customers,write_customers,read_products,read_orders).
 * Until it is added (and `shopify app deploy` + re-approval in the store), this returns "missing_scope" and the caller
 * records the request as shopify_pending and emails contact@rodiclub.com to erase the customer by hand in Shopify admin
 * (Customers > customer > "Erase personal data"). Once the session carries the scope, this path starts working by itself.
 */
export async function requestShopifyErasure(admin: AdminApiContext | null, grantedScopes: string | null | undefined, customerId: string) {
  const scopes = (grantedScopes ?? "").split(",").map((s) => s.trim());
  if (!scopes.includes(ERASURE_SCOPE)) return { status: "missing_scope" as const };
  if (!admin) return { status: "failed" as const, detail: "no Admin API session" };
  try {
    const response = await admin.graphql(
      `#graphql
        mutation eraseCustomer($customerId: ID!) {
          customerRequestDataErasure(customerId: $customerId) { customerId userErrors { field message } }
        }`,
      { variables: { customerId: `gid://shopify/Customer/${customerId}` } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin API JSON, read field by field
  const body: any = await response.json();
    const errors = body?.data?.customerRequestDataErasure?.userErrors ?? body?.errors;
    if (errors?.length) return { status: "failed" as const, detail: JSON.stringify(errors).slice(0, 300) };
    return { status: "requested" as const };
  } catch (err) {
    return { status: "failed" as const, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Owner notifications (internal, plain HTML)

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function notifyOwner(subject: string, lines: string[], attachment?: { filename: string; json: unknown }) {
  const config = resendConfig();
  if (!config.hasKey || !config.from) {
    console.warn(`[privacy] owner email not sent (Resend not configured): ${subject}`);
    return false;
  }
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1C1B1A">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  const result = await sendEmail({
    to: OWNER_EMAIL,
    subject,
    html,
    attachments: attachment
      ? [{ filename: attachment.filename, content: Buffer.from(JSON.stringify(attachment.json, null, 2), "utf8").toString("base64") }]
      : undefined,
  });
  if (!result.ok) console.warn(`[privacy] owner email failed: ${result.skipped ? result.reason : result.error}`);
  return result.ok;
}

// ---------------------------------------------------------------------------------------------------------------------
// Whole flows

/** Member deletes their account from the Club (POST accountDelete). */
export async function deleteAccountAsMember(shop: string, customerId: string, admin: AdminApiContext | null, grantedScopes: string | null | undefined) {
  const problems = await eraseCustomerData(shop, customerId, admin);
  const erasure = await requestShopifyErasure(admin, grantedScopes, customerId);
  let status = "done";
  if (erasure.status !== "requested") {
    status = "shopify_pending";
    await notifyOwner(`[RODI] Borrar cliente ${customerId} en Shopify`, [
      `El cliente ${customerId} eliminó su cuenta desde RODI Club el ${new Date().toISOString()}.`,
      "La app ya borró todos sus datos propios (viajes, comunidad, registros legales, metacampos) y lo dio de baja de marketing.",
      erasure.status === "missing_scope"
        ? "La app no tiene el permiso write_customer_data_erasure, así que falta borrar el cliente en Shopify: Admin > Clientes > abrir el cliente > Borrar datos personales."
        : `La solicitud de borrado a Shopify falló (${"detail" in erasure ? erasure.detail : ""}). Bórralo a mano: Admin > Clientes > abrir el cliente > Borrar datos personales.`,
      ...(problems.length ? [`Avisos: ${problems.join(" | ")}`] : []),
    ]);
  }
  await db.dataRequest.create({
    data: {
      shop, customerId, type: "erase", source: "member", status,
      detail: [erasure.status === "requested" ? "shopify erasure requested" : `shopify: ${erasure.status}`, ...problems].join(" | ").slice(0, 1000),
    },
  });
}

/** customers/data_request webhook: build the export, keep a record, mail it to the owner (who answers within 30 days). */
export async function handleShopifyDataRequest(shop: string, customerId: string, shopifyRequestId: string | null) {
  const admin = await adminFor(shop);
  const data = await buildCustomerExport(shop, customerId, { admin, includeInternal: true });
  const emailed = await notifyOwner(
    `[RODI] Solicitud de datos del cliente ${customerId} (responder en 30 días)`,
    [
      `Shopify recibió una solicitud de acceso a datos del cliente ${customerId}${shopifyRequestId ? ` (solicitud ${shopifyRequestId})` : ""}.`,
      "Adjunto está todo lo que la app RODI Club guarda de esa persona. Revísalo y envíaselo al cliente dentro de los 30 días.",
      "La nota interna de servicios va incluida: quítala si no corresponde compartirla.",
    ],
    { filename: `rodi-datos-cliente-${customerId}-${new Date().toISOString().slice(0, 10)}.json`, json: data },
  );
  await db.dataRequest.create({
    data: { shop, customerId, type: "export", source: "shopify_webhook", status: emailed ? "emailed" : "failed", shopifyRequestId, detail: emailed ? null : "owner email not sent (Resend not configured or failed)" },
  });
}

/** customers/redact webhook: same erasure as a member deletion, without asking Shopify (Shopify is already erasing). */
export async function handleShopifyRedact(shop: string, customerId: string) {
  const problems = await eraseCustomerData(shop, customerId, null);
  await db.dataRequest.create({
    data: { shop, customerId, type: "erase", source: "shopify_webhook", status: "done", detail: problems.join(" | ").slice(0, 1000) || null },
  });
}

/** shop/redact webhook (48 h after uninstall): every row of the shop goes. */
export async function redactShop(shop: string) {
  const w = { shop };
  await db.$transaction([
    db.communityLike.deleteMany({ where: w }),
    db.communityReply.deleteMany({ where: w }),
    db.communityPost.deleteMany({ where: w }),
    db.communityAnswer.deleteMany({ where: w }),
    db.communityQuestion.deleteMany({ where: w }),
    db.communityRecommendation.deleteMany({ where: w }),
    db.trip.deleteMany({ where: w }),
    db.document.deleteMany({ where: w }),
    db.emergencyContact.deleteMany({ where: w }),
    db.journalEntry.deleteMany({ where: w }),
    db.serviceInquiry.deleteMany({ where: w }),
    db.calculatorPlan.deleteMany({ where: w }),
    db.countrySave.deleteMany({ where: w }),
    db.countryTravel.deleteMany({ where: w }),
    db.membership.deleteMany({ where: w }),
    db.emailLog.deleteMany({ where: w }),
    db.campaign.deleteMany({ where: w }), // cascade: recipients
    db.abandonedCartLog.deleteMany({ where: w }),
    db.legalAcceptance.deleteMany({ where: w }),
    db.guardianConsent.deleteMany({ where: w }),
    db.dataRequest.deleteMany({ where: w }),
    db.session.deleteMany({ where: w }),
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Guardian timeout sweep: a member aged 15-17 whose guardian has not answered 30 days after the request is not kept.
// Their RODI Club data is deleted exactly like accountDelete (without asking Shopify to erase the customer) and a
// DataRequest (erase, guardian_timeout) is left. Runs hourly next to the other schedulers (entry.server.tsx).

const GUARDIAN_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

export async function sweepGuardianTimeouts(now = new Date()) {
  const stale = await db.guardianConsent.findMany({
    where: { status: "pending", createdAt: { lte: new Date(now.getTime() - GUARDIAN_TIMEOUT_MS) } },
    select: { id: true, shop: true, customerId: true },
    take: 200,
  });
  let erased = 0;
  for (const c of stale) {
    try {
      const latest = await db.guardianConsent.findFirst({ where: { shop: c.shop, customerId: c.customerId }, orderBy: { createdAt: "desc" } });
      if (!latest || latest.id !== c.id) {
        // A newer request (another guardian) replaced this one; it has its own 30 days.
        await db.guardianConsent.updateMany({ where: { id: c.id, status: "pending" }, data: { status: "superseded" } });
        continue;
      }
      const state = await getLegalState(c.shop, c.customerId);
      if (state.ageBand !== "minor") {
        // Came of age (or re-declared) in the meantime: the authorization is no longer needed.
        await db.guardianConsent.updateMany({ where: { id: c.id, status: "pending" }, data: { status: "superseded" } });
        continue;
      }
      const problems = await eraseCustomerData(c.shop, c.customerId, null);
      await db.dataRequest.create({
        data: {
          shop: c.shop, customerId: c.customerId, type: "erase", source: "guardian_timeout", status: "done",
          detail: ["no guardian answer within 30 days", ...problems].join(" | ").slice(0, 1000),
        },
      });
      erased++;
    } catch (err) {
      console.error(`[privacy] guardian timeout for ${c.customerId} failed`, err);
    }
  }
  if (erased) console.log(`[privacy] guardian timeout: erased ${erased} member(s)`);
  return erased;
}

let sweepStarted = false;
let sweeping = false;
export function startGuardianSweepScheduler() {
  if (sweepStarted) return;
  sweepStarted = true;
  const tick = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await sweepGuardianTimeouts();
    } catch (err) {
      console.error("[privacy] guardian sweep failed", err);
    } finally {
      sweeping = false;
    }
  };
  setTimeout(tick, 3 * 60 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}
