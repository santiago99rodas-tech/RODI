import crypto from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { extendClubAccess } from "./membership.server";

// "Refiere a un amigo". Every member has one invitation code and a share link (STOREFRONT_URL/?ref=CODE). The theme keeps
// the code of whoever arrives through that link and claims it once the friend is signed in (op claimReferral). The
// reward is paid when the friend creates their first trip (qualifyReferral, called from createTrip):
//   - the friend gets +REFERRAL_FRIEND_MONTHS month(s) of Club,
//   - the member who invited gets +REFERRAL_REFERRER_MONTHS month(s) of Club, up to REFERRAL_REFERRER_MAX_MONTHS in total.
// The rule is deliberately simple and has no money in it: it only moves the Club access date, like the launch promo.
export const REFERRAL_FRIEND_MONTHS = 1;
export const REFERRAL_REFERRER_MONTHS = 1;
export const REFERRAL_REFERRER_MAX_MONTHS = 6;
export const REFERRAL_MAX_PENDING = 50; // invitations accepted but not yet rewarded, per member
export const REFERRAL_CLAIM_WINDOW_DAYS = 30; // the friend's account must be this new

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CODE_RE = /^RODI[A-Z2-9]{5}$/;

export const storefrontUrl = () => (process.env.STOREFRONT_URL || "https://rodiclub.com").replace(/\/$/, "");
export const shareUrlFor = (code: string) => `${storefrontUrl()}/?ref=${code}`;

function makeCode(): string {
  const bytes = crypto.randomBytes(5);
  let out = "RODI";
  for (let i = 0; i < 5; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Pure: what a code may look like once a person has typed or pasted it (or "" when it cannot be one). */
export function normalizeCode(raw: unknown): string {
  const code = typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  return CODE_RE.test(code) ? code : "";
}

export async function codeFor(shop: string, customerId: string): Promise<string> {
  const existing = await db.referralCode.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return (await db.referralCode.create({ data: { shop, customerId, code: makeCode() } })).code;
    } catch {
      // a collision on the unique code, or a parallel request created this member's code first
      const again = await db.referralCode.findUnique({ where: { shop_customerId: { shop, customerId } } });
      if (again) return again.code;
    }
  }
  throw new Error("Could not create a referral code");
}

export async function referralSummary(shop: string, customerId: string) {
  const code = await codeFor(shop, customerId);
  const [asReferrer, asFriend] = await Promise.all([
    db.referral.findMany({ where: { shop, referrerId: customerId } }),
    db.referral.findUnique({ where: { shop_referredId: { shop, referredId: customerId } } }),
  ]);
  const rewarded = asReferrer.filter((r) => r.status === "rewarded");
  return {
    code,
    shareUrl: shareUrlFor(code),
    invited: asReferrer.length,
    rewarded: rewarded.length,
    monthsEarned: rewarded.reduce((sum, r) => sum + r.referrerMonths, 0),
    maxMonths: REFERRAL_REFERRER_MAX_MONTHS,
    friendMonths: REFERRAL_FRIEND_MONTHS,
    referrerMonths: REFERRAL_REFERRER_MONTHS,
    // Set when this member arrived through someone's invitation: "pending" until their first trip, then "rewarded".
    invitedBy: asFriend ? { status: asFriend.status, months: asFriend.friendMonths } : null,
  };
}

export type ClaimResult = { ok: true; already?: boolean } | { error: "INVALID_CODE" | "OWN_CODE" | "NOT_NEW" | "REFERRER_FULL" };

export async function claimReferral(shop: string, referredId: string, rawCode: unknown): Promise<ClaimResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "INVALID_CODE" };
  const owner = await db.referralCode.findUnique({ where: { code } });
  if (!owner || owner.shop !== shop) return { error: "INVALID_CODE" };
  if (owner.customerId === referredId) return { error: "OWN_CODE" };

  const already = await db.referral.findUnique({ where: { shop_referredId: { shop, referredId } } });
  if (already) return { ok: true, already: true };

  // Only people who have just joined can be invited: an account older than the window, or one that already has a trip, cannot.
  const row = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId: referredId } } });
  const limit = Date.now() - REFERRAL_CLAIM_WINDOW_DAYS * 24 * 3600 * 1000;
  if (row && row.createdAt.getTime() < limit) return { error: "NOT_NEW" };
  if ((await db.trip.count({ where: { shop, customerId: referredId } })) > 0) return { error: "NOT_NEW" };

  const pending = await db.referral.count({ where: { shop, referrerId: owner.customerId, status: "pending" } });
  if (pending >= REFERRAL_MAX_PENDING) return { error: "REFERRER_FULL" };

  try {
    await db.referral.create({ data: { shop, referrerId: owner.customerId, referredId, code } });
  } catch {
    return { ok: true, already: true }; // a parallel claim for the same friend won the unique key
  }
  return { ok: true };
}

/**
 * Called after a member creates a trip. If they were invited and the invitation is still pending, pays the reward.
 * Never throws: a reward problem must not fail the trip. Returns the months the friend just received (or 0).
 */
export async function qualifyReferral(admin: AdminApiContext | null, shop: string, customerId: string): Promise<number> {
  try {
    if (!admin) return 0; // the Club date cannot be projected without the Admin API: stay pending until the next trip
    const pending = await db.referral.findUnique({ where: { shop_referredId: { shop, referredId: customerId } } });
    if (!pending || pending.status !== "pending") return 0;

    const earned = await db.referral.aggregate({
      where: { shop, referrerId: pending.referrerId, status: "rewarded" },
      _sum: { referrerMonths: true },
    });
    const room = REFERRAL_REFERRER_MAX_MONTHS - (earned._sum.referrerMonths ?? 0);
    const referrerMonths = Math.max(0, Math.min(REFERRAL_REFERRER_MONTHS, room));

    // Claim the reward exactly once even if two trips are created at the same time.
    const won = await db.referral.updateMany({
      where: { id: pending.id, status: "pending" },
      data: { status: "rewarded", rewardedAt: new Date(), friendMonths: REFERRAL_FRIEND_MONTHS, referrerMonths },
    });
    if (won.count !== 1) return 0;

    try {
      await extendClubAccess(admin, shop, customerId, REFERRAL_FRIEND_MONTHS, "referral_friend");
      if (referrerMonths > 0) await extendClubAccess(admin, shop, pending.referrerId, referrerMonths, "referral_referrer");
    } catch (err) {
      await db.referral.updateMany({ where: { id: pending.id }, data: { status: "pending", rewardedAt: null, friendMonths: 0, referrerMonths: 0 } });
      throw err;
    }
    return REFERRAL_FRIEND_MONTHS;
  } catch (err) {
    console.error("qualifyReferral failed", err);
    return 0;
  }
}
