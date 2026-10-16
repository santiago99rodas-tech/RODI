import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { NATIONALITIES } from "./nationalities";
import { readAccount } from "./account.server";

// Second step of the Club gate ("complete your profile"). Sign-in is Shopify's hosted email code, which cannot ask for anything,
// so right after the member accepts the Terms the gate asks for what a sign-up form normally collects: first and last name,
// mobile, nationality and where they live. Name and phone are Shopify's own customer fields (updateAccount), the nationality
// has its own op (setNationalities); only "where I live" is new and is kept in two customer metafields.

export const RESIDENCE_NAMESPACE = "custom";
export const RESIDENCE_COUNTRY_KEY = "residence_country";
export const RESIDENCE_CITY_KEY = "residence_city";
const COUNTRY_CODES = new Set(NATIONALITIES.map((n) => n.code));

export type ProfileMissing = "name" | "phone" | "nationality" | "residence";

export async function readProfileGate(admin: AdminApiContext, customerId: string) {
  const account = await readAccount(admin, customerId);
  const response = await admin.graphql(
    `#graphql
      query profileGate($id: ID!) {
        customer(id: $id) {
          metafields(first: 20, namespace: "${RESIDENCE_NAMESPACE}") { nodes { key value } }
        }
      }`,
    { variables: { id: `gid://shopify/Customer/${customerId}` } },
  );
  const body = await response.json();
  const nodes: { key: string; value: string }[] = body?.data?.customer?.metafields?.nodes ?? [];
  const get = (key: string) => nodes.find((n) => n.key === key)?.value ?? "";
  let nationalities: string[] = [];
  try {
    const parsed = JSON.parse(get("nationalities") || "[]");
    if (Array.isArray(parsed)) nationalities = parsed.filter((v) => typeof v === "string");
  } catch {
    nationalities = [];
  }
  const residence = { country: get(RESIDENCE_COUNTRY_KEY), city: get(RESIDENCE_CITY_KEY) };
  const missing: ProfileMissing[] = [];
  if (!account.firstName.trim() || !account.lastName.trim()) missing.push("name");
  if (!account.phone.trim()) missing.push("phone");
  if (!nationalities.length) missing.push("nationality");
  if (!residence.country || !residence.city.trim()) missing.push("residence");
  return {
    profile: { firstName: account.firstName, lastName: account.lastName, email: account.email, phone: account.phone, nationalities, residence },
    missing,
  };
}

export type ResidenceInput = { country: string; city: string };

export function sanitizeResidence(raw: unknown): ResidenceInput | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const country = typeof r.country === "string" ? r.country.trim().toUpperCase() : "";
  const city = typeof r.city === "string" ? r.city.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!COUNTRY_CODES.has(country) || city.length < 2) return null;
  return { country, city };
}

export async function saveResidence(admin: AdminApiContext, customerId: string, input: ResidenceInput) {
  const ownerId = `gid://shopify/Customer/${customerId}`;
  const response = await admin.graphql(
    `#graphql
      mutation setResidence($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
    {
      variables: {
        metafields: [
          { ownerId, namespace: RESIDENCE_NAMESPACE, key: RESIDENCE_COUNTRY_KEY, type: "single_line_text_field", value: input.country },
          { ownerId, namespace: RESIDENCE_NAMESPACE, key: RESIDENCE_CITY_KEY, type: "single_line_text_field", value: input.city },
        ],
      },
    },
  );
  const body = await response.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
}
