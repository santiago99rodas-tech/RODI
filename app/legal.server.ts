import crypto from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { normalizeLocale, type EmailLocale } from "./email-render.server";
import { sendTemplateEmail } from "./emails.server";

// Legal gate of the Club (Terms, Privacy, age, parent/guardian authorization). The theme shows the gate and calls the app
// proxy (GET ?legal=1, POST op legalAccept / guardianResend); everything that decides access is computed here, server side:
//   - current versions come from LEGAL_TERMS_VERSION / LEGAL_PRIVACY_VERSION (default "2.0"); bumping one makes every
//     member accept again before they can write anything.
//   - the member types a full birth date, but only the birth YEAR and MONTH are stored. The age band is recomputed from
//     them on every read, so restrictions lift by themselves at majority. With no day stored, a birthday counts from the
//     first day of the month AFTER the birth month (conservative: never early).
//   - 15-17 need a parent/guardian to approve through an emailed link (/legal/guardian); under 15 cannot use the Club.
// Every acceptance attempt is an append-only LegalAcceptance row (document, version, ip, user agent, source).

export const LEGAL_LOCALES = ["es", "en", "fr", "it"] as const;
export type AgeBand = "adult" | "minor" | "under_15";
export type GuardianState = "none" | "pending" | "approved" | "declined";

export const GUARDIAN_TOKEN_DAYS = 30;
export const GUARDIAN_RESEND_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;

export function currentVersions() {
  return {
    terms: process.env.LEGAL_TERMS_VERSION?.trim() || "2.0",
    privacy: process.env.LEGAL_PRIVACY_VERSION?.trim() || "2.0",
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Request helpers

/** The visitor's address: first X-Forwarded-For entry (Shopify's proxy and EasyPanel append theirs after it). */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || "";
  return ip ? ip.slice(0, 64) : null;
}

export function clientUserAgent(request: Request): string | null {
  const ua = request.headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 400) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pure helpers

/**
 * Age band from birth year + month only: someone born in March 2008 counts as 18 from 1 April 2026 (and as 15 from the
 * first day of the month after their 15th-birthday month). Conservative on purpose, since the day is not stored.
 */
export function bandFromYearMonth(birthYear: number, birthMonth: number, now = new Date()): AgeBand {
  const reached = (years: number) => Date.UTC(birthYear + years, birthMonth, 1) <= now.getTime(); // month index birthMonth = the month after
  return reached(18) ? "adult" : reached(15) ? "minor" : "under_15";
}

/** "YYYY-MM-DD" -> age band, or null when the date is malformed, in the future or more than 120 years ago. */
export function ageBandFor(birthDate: unknown, now = new Date()): { band: AgeBand; birthYear: number; birthMonth: number } | null {
  if (typeof birthDate !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null; // 2026-02-31
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (date.getTime() > today) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  if (age > 120) return null;
  return { band: bandFromYearMonth(y, mo, now), birthYear: y, birthMonth: mo };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function cleanEmailAddress(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

/** "maria.perez@gmail.com" -> "m***@g***.com" */
export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

export function isRestricted(s: { needsAcceptance: boolean; ageBand: AgeBand | null; guardian: GuardianState }): boolean {
  return s.needsAcceptance || s.ageBand === "under_15" || (s.ageBand === "minor" && s.guardian !== "approved");
}

const secret = () => process.env.SHOPIFY_API_SECRET || "";
const appUrl = () => (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");

/** Only this HMAC of the emailed token is stored: a copy of the database alone cannot open the authorization page. */
export function guardianTokenHash(token: string): string {
  return crypto.createHmac("sha256", secret()).update(`guardian:${token}`).digest("hex");
}

function newGuardianToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: guardianTokenHash(token) };
}

export function guardianUrl(token: string): string {
  return `${appUrl()}/legal/guardian?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// State (GET ?legal=1)

export type LegalState = {
  loggedIn: boolean;
  current: { terms: string; privacy: string };
  accepted: { terms: string; privacy: string; at: string } | null;
  needsAcceptance: boolean;
  ageBand: AgeBand | null;
  guardian: GuardianState;
  guardianEmailMasked: string | null;
  restricted: boolean;
};

export async function getLegalState(shop: string, customerId: string | null): Promise<LegalState> {
  const current = currentVersions();
  if (!customerId) {
    return { loggedIn: false, current, accepted: null, needsAcceptance: false, ageBand: null, guardian: "none", guardianEmailMasked: null, restricted: false };
  }
  const base = { shop, customerId, accepted: true };
  const [terms, privacy, termsNow, privacyNow, banded, consent] = await Promise.all([
    db.legalAcceptance.findFirst({ where: { ...base, document: "terms" }, orderBy: { createdAt: "desc" } }),
    db.legalAcceptance.findFirst({ where: { ...base, document: "privacy" }, orderBy: { createdAt: "desc" } }),
    db.legalAcceptance.findFirst({ where: { ...base, document: "terms", version: current.terms }, select: { id: true } }),
    db.legalAcceptance.findFirst({ where: { ...base, document: "privacy", version: current.privacy }, select: { id: true } }),
    db.legalAcceptance.findFirst({ where: { shop, customerId, OR: [{ birthYear: { not: null } }, { ageBand: { not: null } }] }, orderBy: { createdAt: "desc" } }),
    db.guardianConsent.findFirst({ where: { shop, customerId }, orderBy: { createdAt: "desc" } }),
  ]);
  const ageBand: AgeBand | null = banded?.birthYear && banded.birthMonth
    ? bandFromYearMonth(banded.birthYear, banded.birthMonth)
    : ((banded?.ageBand ?? null) as AgeBand | null);
  // Only meaningful for minors. After "declined" the member can name another guardian through legalAccept.
  const guardian: GuardianState =
    ageBand === "minor" && consent && ["approved", "pending", "declined"].includes(consent.status) ? (consent.status as GuardianState) : "none";
  const state = {
    loggedIn: true,
    current,
    accepted: terms && privacy
      ? { terms: terms.version, privacy: privacy.version, at: (terms.createdAt > privacy.createdAt ? terms.createdAt : privacy.createdAt).toISOString() }
      : null,
    needsAcceptance: !termsNow || !privacyNow,
    ageBand,
    guardian,
    guardianEmailMasked: ageBand === "minor" && consent ? maskEmail(consent.guardianEmail) : null,
  };
  // LEGAL_GATE=off lets the app be deployed (community filter, privacy webhooks...) before the v2 legal documents are
  // published: nobody is asked to accept and nothing is restricted. Remove the variable the day the documents go live.
  // tolerant on purpose: a panel may store the value with quotes or spaces ("off", off ), and any casing
  if (/^["']?\s*off\s*["']?$/i.test(process.env.LEGAL_GATE ?? "")) return { ...state, needsAcceptance: false, restricted: false };
  return { ...state, restricted: isRestricted(state) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Shopify writes

async function gql(admin: AdminApiContext, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin API JSON, read field by field below
  const body = (await response.json()) as { data?: any; errors?: unknown[] };
  if (body?.errors?.length) throw new Error(JSON.stringify(body.errors).slice(0, 400));
  return body.data;
}

export async function customerBasics(admin: AdminApiContext, customerId: string): Promise<{ email: string | null; firstName: string | null }> {
  const data = await gql(
    admin,
    `#graphql
      query legalCustomer($id: ID!) { customer(id: $id) { firstName defaultEmailAddress { emailAddress } } }`,
    { id: `gid://shopify/Customer/${customerId}` },
  );
  return { email: data?.customer?.defaultEmailAddress?.emailAddress?.toLowerCase() ?? null, firstName: data?.customer?.firstName ?? null };
}

/** custom.age_band + custom.legal_version ("terms:2.0|privacy:2.0"), written like the other customer metafields of this app. */
export async function writeLegalMetafields(admin: AdminApiContext, customerId: string, ageBand: AgeBand, versions: { terms: string; privacy: string } | null) {
  const ownerId = `gid://shopify/Customer/${customerId}`;
  const metafields: Record<string, string>[] = [{ ownerId, namespace: "custom", key: "age_band", type: "single_line_text_field", value: ageBand }];
  if (versions) {
    metafields.push({ ownerId, namespace: "custom", key: "legal_version", type: "single_line_text_field", value: `terms:${versions.terms}|privacy:${versions.privacy}` });
  }
  const data = await gql(
    admin,
    `#graphql
      mutation legalMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
    { metafields },
  );
  const errors = data?.metafieldsSet?.userErrors;
  if (errors?.length) throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
}

/** Opt-in given in the legal gate (adults only; callers check the age band). */
export async function subscribeEmailMarketing(admin: AdminApiContext, customerId: string) {
  const data = await gql(
    admin,
    `#graphql
      mutation legalMarketing($input: CustomerEmailMarketingConsentUpdateInput!) {
        customerEmailMarketingConsentUpdate(input: $input) { userErrors { field message } }
      }`,
    {
      input: {
        customerId: `gid://shopify/Customer/${customerId}`,
        emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN", consentUpdatedAt: new Date().toISOString() },
      },
    },
  );
  const errors = data?.customerEmailMarketingConsentUpdate?.userErrors;
  if (errors?.length) throw new Error(`customerEmailMarketingConsentUpdate failed: ${JSON.stringify(errors)}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Guardian email

async function sendGuardianEmail(input: { shop: string; customerId: string; to: string; token: string; locale: EmailLocale; memberName: string | null }) {
  const result = await sendTemplateEmail({
    shop: input.shop,
    customerId: input.customerId,
    template: "guardian-consent",
    to: input.to,
    locale: input.locale,
    data: { consent_url: guardianUrl(input.token), member_name: input.memberName ?? "" },
    force: true, // every send carries a new token, so a resend is never a duplicate
  });
  if (result.outcome !== "sent") console.warn(`[legal] guardian email for customer ${input.customerId}: ${result.outcome} (${result.detail ?? ""})`);
  return result.outcome;
}

/** Issues a fresh token (the old link stops working), extends the 30 days and emails the guardian. */
async function issueGuardianLink(consentId: string, ctx: { shop: string; customerId: string; to: string; locale: EmailLocale; memberName: string | null }) {
  const { token, tokenHash } = newGuardianToken();
  const now = new Date();
  await db.guardianConsent.update({
    where: { id: consentId },
    data: { tokenHash, lastSentAt: now, expiresAt: new Date(now.getTime() + GUARDIAN_TOKEN_DAYS * DAY_MS) },
  });
  await sendGuardianEmail({ ...ctx, token });
}

// ---------------------------------------------------------------------------------------------------------------------
// legalAccept

export type LegalAcceptError = "invalid_birthdate" | "version_mismatch" | "guardian_email_required" | "guardian_email_invalid" | "guardian_email_same" | "under_15";

type Ctx = { shop: string; customerId: string; admin: AdminApiContext | null; ip: string | null; userAgent: string | null };

export async function acceptLegal(ctx: Ctx, body: Record<string, unknown>): Promise<{ ok: true } | { error: LegalAcceptError }> {
  const { shop, customerId, admin } = ctx;
  const current = currentVersions();
  if (String(body.termsVersion ?? "") !== current.terms || String(body.privacyVersion ?? "") !== current.privacy) {
    return { error: "version_mismatch" };
  }
  const age = ageBandFor(body.birthDate);
  if (!age) return { error: "invalid_birthdate" };

  const source = (typeof body.source === "string" ? body.source.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "") || "club-gate";
  const locale = normalizeLocale(typeof body.locale === "string" && (LEGAL_LOCALES as readonly string[]).includes(body.locale) ? body.locale : "es");
  const row = { shop, customerId, ageBand: age.band, birthYear: age.birthYear, birthMonth: age.birthMonth, ip: ctx.ip, userAgent: ctx.userAgent, source };
  const marketingAsked = body.marketing === true || body.marketing === false;

  // Under 15: the attempt and the band are kept (so the gate keeps showing the block), nothing is accepted.
  if (age.band === "under_15") {
    await db.legalAcceptance.createMany({
      data: [
        { ...row, document: "terms", version: current.terms, accepted: false },
        { ...row, document: "privacy", version: current.privacy, accepted: false },
      ],
    });
    if (admin) await writeLegalMetafields(admin, customerId, "under_15", null).catch((err) => console.error("[legal] metafields failed", err));
    return { error: "under_15" };
  }

  let guardianEmail: string | null = null;
  let basics: { email: string | null; firstName: string | null } = { email: null, firstName: null };
  if (age.band === "minor") {
    const approved = await db.guardianConsent.findFirst({ where: { shop, customerId, status: "approved" }, orderBy: { createdAt: "desc" } });
    // A minor whose guardian already approved does not need a new approval to accept a new version of the documents.
    if (!approved) {
      if (body.guardianEmail === undefined || body.guardianEmail === null || String(body.guardianEmail).trim() === "") {
        return { error: "guardian_email_required" };
      }
      guardianEmail = cleanEmailAddress(body.guardianEmail);
      if (!guardianEmail) return { error: "guardian_email_invalid" };
      if (admin) {
        try {
          basics = await customerBasics(admin, customerId);
        } catch (err) {
          console.error("[legal] customer lookup failed", err);
        }
      }
      if (basics.email && basics.email === guardianEmail) return { error: "guardian_email_same" };
    }
  }

  // Marketing: adults only. A minor's opt-in is recorded as refused and never reaches Shopify.
  const marketingGranted = body.marketing === true && age.band === "adult";
  await db.legalAcceptance.createMany({
    data: [
      { ...row, document: "terms", version: current.terms, accepted: true },
      { ...row, document: "privacy", version: current.privacy, accepted: true },
      ...(marketingAsked ? [{ ...row, document: "marketing", version: current.privacy, accepted: marketingGranted }] : []),
    ],
  });

  if (guardianEmail) {
    const latest = await db.guardianConsent.findFirst({ where: { shop, customerId }, orderBy: { createdAt: "desc" } });
    const send = { shop, customerId, to: guardianEmail, locale, memberName: basics.firstName };
    if (latest && latest.status === "pending" && latest.guardianEmail === guardianEmail) {
      // Same guardian asked again: keep the request, re-send only outside the 10-minute window.
      if (latest.locale !== locale) await db.guardianConsent.update({ where: { id: latest.id }, data: { locale } });
      if (!latest.lastSentAt || Date.now() - latest.lastSentAt.getTime() >= GUARDIAN_RESEND_MS || latest.expiresAt < new Date()) {
        await issueGuardianLink(latest.id, send);
      }
    } else {
      const { tokenHash } = newGuardianToken(); // placeholder, replaced by issueGuardianLink right away
      const created = await db.guardianConsent.create({
        data: { shop, customerId, tokenHash, guardianEmail, locale, expiresAt: new Date(Date.now() + GUARDIAN_TOKEN_DAYS * DAY_MS) },
      });
      await issueGuardianLink(created.id, send);
    }
  }

  if (admin) {
    if (marketingGranted) await subscribeEmailMarketing(admin, customerId).catch((err) => console.error("[legal] marketing opt-in failed", err));
    await writeLegalMetafields(admin, customerId, age.band, current).catch((err) => console.error("[legal] metafields failed", err));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// guardianResend

export async function resendGuardian(ctx: { shop: string; customerId: string; admin: AdminApiContext | null }): Promise<{ ok: true } | { error: string; status: number; retryAfter?: number }> {
  const { shop, customerId } = ctx;
  const consent = await db.guardianConsent.findFirst({ where: { shop, customerId }, orderBy: { createdAt: "desc" } });
  if (!consent || consent.status !== "pending") return { error: "no_pending_guardian", status: 409 };
  if (consent.lastSentAt && Date.now() - consent.lastSentAt.getTime() < GUARDIAN_RESEND_MS) {
    return { error: "rate_limited", status: 429, retryAfter: Math.ceil((GUARDIAN_RESEND_MS - (Date.now() - consent.lastSentAt.getTime())) / 1000) };
  }
  let memberName: string | null = null;
  if (ctx.admin) {
    try {
      memberName = (await customerBasics(ctx.admin, customerId)).firstName;
    } catch {
      /* the email works without the name */
    }
  }
  await issueGuardianLink(consent.id, { shop, customerId, to: consent.guardianEmail, locale: normalizeLocale(consent.locale), memberName });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// The guardian's page (/legal/guardian)

export async function findGuardianConsent(token: string) {
  if (!token || token.length > 200 || !secret()) return null;
  return db.guardianConsent.findUnique({ where: { tokenHash: guardianTokenHash(token) } });
}

export async function decideGuardian(token: string, decision: "approve" | "decline", meta: { ip: string | null; userAgent: string | null }) {
  const consent = await findGuardianConsent(token);
  if (!consent) return { result: "invalid" as const, locale: null };
  if (consent.status !== "pending") return { result: consent.status as "approved" | "declined", locale: consent.locale };
  if (consent.expiresAt < new Date()) return { result: "expired" as const, locale: consent.locale };
  const now = new Date();
  const changed = await db.guardianConsent.updateMany({
    where: { id: consent.id, status: "pending" },
    data: decision === "approve"
      ? { status: "approved", approvedAt: now, approvedIp: meta.ip, approvedUserAgent: meta.userAgent }
      : { status: "declined", declinedAt: now, approvedIp: meta.ip, approvedUserAgent: meta.userAgent },
  });
  if (!changed.count) {
    const fresh = await db.guardianConsent.findUnique({ where: { id: consent.id } });
    return { result: (fresh?.status ?? "invalid") as "approved" | "declined" | "invalid", locale: consent.locale };
  }
  return { result: decision === "approve" ? ("approved" as const) : ("declined" as const), locale: consent.locale };
}
