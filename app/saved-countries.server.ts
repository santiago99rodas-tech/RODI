import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";

// "Save destination" for members. The theme can't write customer data under New Customer Accounts, so the
// save button goes through the app proxy and this writes the customer's custom.saved_countries metafield
// (list of Country metaobject references — Liquid keeps reading it for "Saved" state and the Saved page),
// and mirrors the save into CountrySave so favorites can be ranked across all members.
const NAMESPACE = "custom";
const KEY = "saved_countries";
const MAX_SAVED = 250;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type SavedCountriesError = "INVALID_COUNTRY" | "LIMIT" | "SHOPIFY";

export class SavedCountriesFailure extends Error {
  constructor(public code: SavedCountriesError, message?: string) {
    super(message ?? code);
  }
}

// Liquid's metaobject id may print as a bare number or a full gid depending on the surface; accept both.
export function metaobjectGid(raw: unknown): string | null {
  const m = String(raw ?? "").match(/(\d{5,20})$/);
  return m ? `gid://shopify/Metaobject/${m[1]}` : null;
}

async function readSaved(admin: AdminApiContext, ownerId: string): Promise<string[]> {
  const response = await admin.graphql(
    `#graphql
      query savedCountries($id: ID!) {
        customer(id: $id) { metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } }
      }`,
    { variables: { id: ownerId } },
  );
  const body = await response.json();
  const value = body?.data?.customer?.metafield?.value;
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function writeSaved(admin: AdminApiContext, ownerId: string, gids: string[]) {
  if (!gids.length) {
    const response = await admin.graphql(
      `#graphql
        mutation clearSaved($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) { userErrors { field message } }
        }`,
      { variables: { metafields: [{ ownerId, namespace: NAMESPACE, key: KEY }] } },
    );
    const body = await response.json();
    const errors = body?.data?.metafieldsDelete?.userErrors;
    if (errors?.length) throw new SavedCountriesFailure("SHOPIFY", JSON.stringify(errors));
    return;
  }
  const response = await admin.graphql(
    `#graphql
      mutation setSaved($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
    {
      variables: {
        metafields: [{ ownerId, namespace: NAMESPACE, key: KEY, type: "list.metaobject_reference", value: JSON.stringify(gids) }],
      },
    },
  );
  const body = await response.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) throw new SavedCountriesFailure("SHOPIFY", JSON.stringify(errors));
}

// Idempotent: asking for the state the member already has changes nothing.
export async function setCountrySaved(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
  handle: unknown,
  id: unknown,
  saved: boolean,
) {
  const gid = metaobjectGid(id);
  if (typeof handle !== "string" || !HANDLE_RE.test(handle) || !gid) throw new SavedCountriesFailure("INVALID_COUNTRY");

  const ownerId = `gid://shopify/Customer/${customerId}`;
  const current = await readSaved(admin, ownerId);
  const has = current.includes(gid);
  let next = current;
  if (saved && !has) {
    if (current.length >= MAX_SAVED) throw new SavedCountriesFailure("LIMIT");
    next = [...current, gid];
  } else if (!saved && has) {
    next = current.filter((g) => g !== gid);
  }
  if (next !== current) await writeSaved(admin, ownerId, next);

  if (saved) {
    await db.countrySave.upsert({
      where: { shop_customerId_countryHandle: { shop, customerId, countryHandle: handle } },
      create: { shop, customerId, countryHandle: handle },
      update: {},
    });
  } else {
    await db.countrySave.deleteMany({ where: { shop, customerId, countryHandle: handle } });
  }
  const count = await db.countrySave.count({ where: { shop, countryHandle: handle } });
  return { saved, count };
}

// Public ranking for the Destinations "Member favorites" filter: handle + how many members saved it. No member
// data leaves here, only counts.
export async function topFavorites(shop: string, take = 24) {
  const rows = await db.countrySave.groupBy({
    by: ["countryHandle"],
    where: { shop },
    _count: { countryHandle: true },
    orderBy: [{ _count: { countryHandle: "desc" } }, { countryHandle: "asc" }],
    take,
  });
  return rows.map((r) => ({ handle: r.countryHandle, count: r._count.countryHandle }));
}
