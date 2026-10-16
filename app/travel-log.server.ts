import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// "Mark a country" in the member's passport. The theme can't write customer data under New Customer Accounts, so the
// Passport page saves through the app proxy and this writes the customer's custom.travel_log metafield (JSON list of
// { country, status, date_visited?, note? }). Liquid keeps reading it directly: the Passport, the world map, the profile stamps.
const NAMESPACE = "custom";
const KEY = "travel_log";
export const TRAVEL_STATUSES = ["visited", "want_to_go", "planned"] as const;
export const TRAVEL_MAX_ENTRIES = 250;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type TravelEntry = { country: string; status: (typeof TRAVEL_STATUSES)[number]; date_visited?: string; note?: string };
export type TravelLogError = "INVALID_COUNTRY" | "INVALID_STATUS" | "LIMIT" | "SHOPIFY";

export class TravelLogFailure extends Error {
  constructor(public code: TravelLogError, message?: string) {
    super(message ?? code);
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Whatever is stored, keep only entries the page can use (the list may have been typed by hand in the admin).
export function sanitizeLog(value: unknown): TravelEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: TravelEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const country = typeof r.country === "string" ? r.country.trim() : "";
    const status = TRAVEL_STATUSES.find((s) => s === r.status);
    if (!HANDLE_RE.test(country) || !status || seen.has(country)) continue;
    seen.add(country);
    const entry: TravelEntry = { country, status };
    const date = clean(r.date_visited, 40), note = clean(r.note, 200);
    if (date && status === "visited") entry.date_visited = date;
    if (note) entry.note = note;
    out.push(entry);
  }
  return out;
}

// Pure: the list after setting (or, with status null, removing) one country. Throws TravelLogFailure on bad input.
export function applyTravelEntry(
  list: TravelEntry[],
  input: { country: unknown; status: unknown; date_visited?: unknown; note?: unknown },
): TravelEntry[] {
  const country = typeof input.country === "string" ? input.country.trim() : "";
  if (!HANDLE_RE.test(country)) throw new TravelLogFailure("INVALID_COUNTRY");
  const rest = list.filter((e) => e.country !== country);
  if (input.status === null) return rest;
  const status = TRAVEL_STATUSES.find((s) => s === input.status);
  if (!status) throw new TravelLogFailure("INVALID_STATUS");
  if (rest.length >= TRAVEL_MAX_ENTRIES) throw new TravelLogFailure("LIMIT");
  const entry: TravelEntry = { country, status };
  const date = clean(input.date_visited, 40), note = clean(input.note, 200);
  if (date && status === "visited") entry.date_visited = date;
  if (note) entry.note = note;
  // an edit keeps its place in the list; a new country goes last
  const at = list.findIndex((e) => e.country === country);
  if (at < 0) return [...rest, entry];
  const next = list.slice();
  next[at] = entry;
  return next;
}

async function readLog(admin: AdminApiContext, ownerId: string): Promise<TravelEntry[]> {
  const response = await admin.graphql(
    `#graphql
      query travelLog($id: ID!) {
        customer(id: $id) { metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } }
      }`,
    { variables: { id: ownerId } },
  );
  const body = await response.json();
  const value = body?.data?.customer?.metafield?.value;
  if (!value) return [];
  try { return sanitizeLog(JSON.parse(value)); } catch { return []; }
}

async function writeLog(admin: AdminApiContext, ownerId: string, list: TravelEntry[]) {
  // an empty list is "nothing marked", which Liquid reads as a blank metafield: remove it instead of storing "[]"
  if (!list.length) {
    const response = await admin.graphql(
      `#graphql
        mutation clearTravelLog($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) { userErrors { field message } }
        }`,
      { variables: { metafields: [{ ownerId, namespace: NAMESPACE, key: KEY }] } },
    );
    const body = await response.json();
    const errors = body?.data?.metafieldsDelete?.userErrors;
    if (errors?.length) throw new TravelLogFailure("SHOPIFY", JSON.stringify(errors));
    return;
  }
  const response = await admin.graphql(
    `#graphql
      mutation setTravelLog($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
    { variables: { metafields: [{ ownerId, namespace: NAMESPACE, key: KEY, type: "json", value: JSON.stringify(list) }] } },
  );
  const body = await response.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) throw new TravelLogFailure("SHOPIFY", JSON.stringify(errors));
}

// The handle is checked for shape only (the app has no scope to read country metaobjects); the page only offers real countries,
// and Liquid skips an entry whose country does not exist.
// Idempotent: asking for the state the member already has rewrites nothing.
export async function setTravelEntry(
  admin: AdminApiContext,
  customerId: string,
  input: { country: unknown; status: unknown; date_visited?: unknown; note?: unknown },
): Promise<TravelEntry[]> {
  const ownerId = `gid://shopify/Customer/${customerId}`;
  const current = await readLog(admin, ownerId);
  const next = applyTravelEntry(current, input);
  if (JSON.stringify(next) !== JSON.stringify(current)) await writeLog(admin, ownerId, next);
  return next;
}
