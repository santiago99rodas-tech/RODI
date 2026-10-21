import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";
import { eraseCustomerData } from "./privacy.server";
import { projectMembershipToMetafield } from "./membership.server";

// The owner's own test accounts, which can be wiped to try the Club again from zero (Admin > Reiniciar cuentas de prueba).
// The list is fixed on purpose: this tool can never touch a real member.
export const TEST_ACCOUNTS = ["santiago99rodas@gmail.com", "larodajaoficial@gmail.com", "makarena.dalmata@gmail.com"] as const;

export type TestAccount = {
  email: string;
  customerId: string | null;
  name: string;
  counts: Record<string, number>;
  membership: string;
};

async function customerIdByEmail(admin: AdminApiContext, email: string): Promise<{ id: string; name: string } | null> {
  const response = await admin.graphql(
    `#graphql
      query testCustomer($q: String!) { customers(first: 2, query: $q) { nodes { id email firstName lastName } } }`,
    { variables: { q: `email:${email}` } },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Admin API JSON
  const body: any = await response.json();
  const hit = (body?.data?.customers?.nodes ?? []).find((n: { email?: string }) => String(n.email || "").toLowerCase() === email.toLowerCase());
  if (!hit) return null;
  return { id: String(hit.id).replace("gid://shopify/Customer/", ""), name: [hit.firstName, hit.lastName].filter(Boolean).join(" ") };
}

async function counts(shop: string, customerId: string): Promise<Record<string, number>> {
  const who = { shop, customerId };
  const [trips, documents, contacts, journal, calc, posts, replies, travel, saves, reports] = await Promise.all([
    db.trip.count({ where: who }), db.document.count({ where: who }), db.emergencyContact.count({ where: who }),
    db.journalEntry.count({ where: who }).then(async (a) => a + (await db.journalPage.count({ where: who }))),
    db.calculatorPlan.count({ where: who }), db.communityPost.count({ where: who }), db.communityReply.count({ where: who }),
    db.countryTravel.count({ where: who }), db.countrySave.count({ where: who }), db.placeReport.count({ where: who }),
  ]);
  return { trips, documents, contacts, journal, calc, community: posts + replies, travel, saves, reports };
}

export async function listTestAccounts(admin: AdminApiContext, shop: string): Promise<TestAccount[]> {
  const out: TestAccount[] = [];
  for (const email of TEST_ACCOUNTS) {
    const c = await customerIdByEmail(admin, email);
    if (!c) { out.push({ email, customerId: null, name: "", counts: {}, membership: "" }); continue; }
    const m = await db.membership.findUnique({ where: { shop_customerId: { shop, customerId: c.id } } });
    out.push({ email, customerId: c.id, name: c.name, counts: await counts(shop, c.id), membership: m ? `${m.status}${m.promoEnd ? " hasta " + m.promoEnd.toISOString().slice(0, 10) : ""}` : "sin registro (Free)" });
  }
  return out;
}

/**
 * Leaves one test account as if it had just signed up: trips, documents, contacts, journal, calculator, community posts, stamps, saved
 * countries, referrals, legal acceptance and profile data are all erased (same erasure as the member's own "delete my data", but the
 * Shopify customer itself, with its email, stays). With keepMembership the plan (Free / Club and its dates) is put back afterwards.
 */
export async function resetTestAccount(admin: AdminApiContext, shop: string, email: string, keepMembership: boolean): Promise<{ email: string; ok: boolean; problems: string[] }> {
  if (!(TEST_ACCOUNTS as readonly string[]).includes(email)) return { email, ok: false, problems: ["not a test account"] };
  const c = await customerIdByEmail(admin, email);
  if (!c) return { email, ok: false, problems: ["customer not found"] };
  const kept = keepMembership ? await db.membership.findUnique({ where: { shop_customerId: { shop, customerId: c.id } } }) : null;
  const problems = await eraseCustomerData(shop, c.id, admin);
  if (kept) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the key of the old row is not reused
    const { id, ...data } = kept;
    await db.membership.upsert({ where: { shop_customerId: { shop, customerId: c.id } }, update: data, create: data });
    try { await projectMembershipToMetafield(admin, shop, c.id); } catch (err) { problems.push(`membership metafield: ${err instanceof Error ? err.message : String(err)}`); }
  }
  return { email, ok: true, problems };
}
