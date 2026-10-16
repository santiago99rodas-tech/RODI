import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import provinces from "./provinces.json";

// "Mi cuenta" in the Club profile: what Shopify's own account page used to edit (name, phone, addresses, e-mail marketing).
// The theme cannot write customer data under New Customer Accounts, so the page saves through the app proxy and this module
// calls the Admin API as the signed-in customer (the id comes from the signed proxy request, never from the browser).

export const ADDRESS_LIMIT = 20;
const PROVINCES = provinces as unknown as Record<string, { n: string; p: [string, string][] }>;

export type AccountError = "INVALID" | "LIMIT" | "NOT_FOUND" | "SHOPIFY";
export class AccountFailure extends Error {
  constructor(public code: AccountError, public detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const ADDRESS_ID = /^gid:\/\/shopify\/MailingAddress\/\d+(\?model_name=CustomerAddress)?$/;

export type ProfileInput = { firstName: string; lastName: string; phone: string };
export type AddressInput = {
  firstName: string; lastName: string; address1: string; address2: string; city: string;
  provinceCode: string; zip: string; countryCode: string; phone: string;
};

// phone: nothing, or digits with a leading + and the country code (Shopify wants E.164)
export function sanitizePhone(raw: unknown): string | null {
  const s = clean(raw, 30);
  if (!s) return "";
  const digits = s.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

export function sanitizeProfile(raw: unknown): ProfileInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const firstName = clean(r.firstName, 60);
  const phone = sanitizePhone(r.phone);
  if (!firstName || phone === null) throw new AccountFailure("INVALID");
  return { firstName, lastName: clean(r.lastName, 60), phone };
}

// Province codes come from this app's own list (ISO 3166-2, the same codes Shopify uses), so a country that has provinces
// needs one of them and a country that has none must not send one.
export function sanitizeAddress(raw: unknown): AddressInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const countryCode = clean(r.countryCode, 2).toUpperCase();
  const country = PROVINCES[countryCode];
  if (!country) throw new AccountFailure("INVALID", "country");
  const provinceCode = clean(r.provinceCode, 8).toUpperCase();
  if (country.p.length) {
    if (!country.p.some(([code]) => code === provinceCode)) throw new AccountFailure("INVALID", "province");
  }
  const phone = sanitizePhone(r.phone);
  const firstName = clean(r.firstName, 60), address1 = clean(r.address1, 100), city = clean(r.city, 60);
  if (!firstName || !address1 || !city || phone === null) throw new AccountFailure("INVALID");
  return {
    firstName, lastName: clean(r.lastName, 60), address1, address2: clean(r.address2, 100), city,
    provinceCode: country.p.length ? provinceCode : "", zip: clean(r.zip, 20), countryCode, phone,
  };
}

export function sanitizeAddressId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!ADDRESS_ID.test(id)) throw new AccountFailure("INVALID", "address");
  return id;
}

// What the page needs to offer: every country with its provinces (names in English; the page shows country names in the
// visitor's language with Intl).
export function provinceList() {
  const out: Record<string, [string, string][]> = {};
  for (const [code, c] of Object.entries(PROVINCES)) out[code] = c.p;
  return out;
}

const toMailing = (a: AddressInput) => ({
  firstName: a.firstName, lastName: a.lastName, address1: a.address1, address2: a.address2 || undefined, city: a.city,
  provinceCode: a.provinceCode || undefined, zip: a.zip || undefined, countryCode: a.countryCode, phone: a.phone || undefined,
});

async function run(admin: AdminApiContext, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  const body = (await response.json()) as { data?: any; errors?: unknown[] };
  if (body?.errors?.length) throw new AccountFailure("SHOPIFY", JSON.stringify(body.errors).slice(0, 400));
  return body.data;
}
const userErrors = (payload: { userErrors?: { field?: string[]; message: string }[] } | null | undefined) => {
  const e = payload?.userErrors;
  if (e?.length) throw new AccountFailure("SHOPIFY", e.map((x) => `${(x.field || []).join(".")}: ${x.message}`).join("; ").slice(0, 400));
};

export async function readAccount(admin: AdminApiContext, customerId: string) {
  const data = await run(
    admin,
    `#graphql
      query account($id: ID!) {
        customer(id: $id) {
          firstName lastName
          defaultEmailAddress { emailAddress marketingState }
          defaultPhoneNumber { phoneNumber }
          defaultAddress { id }
          addressesV2(first: ${ADDRESS_LIMIT}) {
            nodes { id firstName lastName address1 address2 city provinceCode zip countryCodeV2 phone }
          }
        }
      }`,
    { id: `gid://shopify/Customer/${customerId}` },
  );
  const c = data?.customer;
  if (!c) throw new AccountFailure("NOT_FOUND");
  const defaultId: string | null = c.defaultAddress?.id ?? null;
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    email: c.defaultEmailAddress?.emailAddress ?? "",
    phone: c.defaultPhoneNumber?.phoneNumber ?? "",
    marketing: c.defaultEmailAddress?.marketingState === "SUBSCRIBED" || c.defaultEmailAddress?.marketingState === "PENDING",
    addresses: (c.addressesV2?.nodes ?? []).map((a: Record<string, string | null>) => ({
      id: a.id, firstName: a.firstName ?? "", lastName: a.lastName ?? "", address1: a.address1 ?? "", address2: a.address2 ?? "",
      city: a.city ?? "", provinceCode: a.provinceCode ?? "", zip: a.zip ?? "", countryCode: a.countryCodeV2 ?? "", phone: a.phone ?? "",
      isDefault: a.id === defaultId,
    })),
  };
}

export async function updateProfile(admin: AdminApiContext, customerId: string, input: ProfileInput) {
  const data = await run(
    admin,
    `#graphql
      mutation updateProfile($input: CustomerInput!) {
        customerUpdate(input: $input) { userErrors { field message } }
      }`,
    { input: { id: `gid://shopify/Customer/${customerId}`, firstName: input.firstName, lastName: input.lastName, phone: input.phone || null } },
  );
  userErrors(data?.customerUpdate);
}

export async function saveAddress(admin: AdminApiContext, customerId: string, input: AddressInput, addressId?: string, makeDefault = false) {
  const owner = `gid://shopify/Customer/${customerId}`;
  if (!addressId) {
    const current = await readAccount(admin, customerId);
    if (current.addresses.length >= ADDRESS_LIMIT) throw new AccountFailure("LIMIT");
    const data = await run(
      admin,
      `#graphql
        mutation addAddress($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
          customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) { userErrors { field message } }
        }`,
      { customerId: owner, address: toMailing(input), setAsDefault: makeDefault || current.addresses.length === 0 },
    );
    userErrors(data?.customerAddressCreate);
    return;
  }
  const data = await run(
    admin,
    `#graphql
      mutation editAddress($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
        customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) { userErrors { field message } }
      }`,
    { customerId: owner, addressId, address: toMailing(input), setAsDefault: makeDefault || undefined },
  );
  userErrors(data?.customerAddressUpdate);
}

export async function deleteAddress(admin: AdminApiContext, customerId: string, addressId: string) {
  const data = await run(
    admin,
    `#graphql
      mutation removeAddress($customerId: ID!, $addressId: ID!) {
        customerAddressDelete(customerId: $customerId, addressId: $addressId) { userErrors { field message } }
      }`,
    { customerId: `gid://shopify/Customer/${customerId}`, addressId },
  );
  userErrors(data?.customerAddressDelete);
}

export async function setDefaultAddress(admin: AdminApiContext, customerId: string, addressId: string) {
  const data = await run(
    admin,
    `#graphql
      mutation defaultAddress($customerId: ID!, $addressId: ID!) {
        customerUpdateDefaultAddress(customerId: $customerId, addressId: $addressId) { userErrors { field message } }
      }`,
    { customerId: `gid://shopify/Customer/${customerId}`, addressId },
  );
  userErrors(data?.customerUpdateDefaultAddress);
}

export async function setEmailMarketing(admin: AdminApiContext, customerId: string, subscribed: boolean) {
  const data = await run(
    admin,
    `#graphql
      mutation marketing($input: CustomerEmailMarketingConsentUpdateInput!) {
        customerEmailMarketingConsentUpdate(input: $input) { userErrors { field message } }
      }`,
    {
      input: {
        customerId: `gid://shopify/Customer/${customerId}`,
        emailMarketingConsent: { marketingState: subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN" },
      },
    },
  );
  userErrors(data?.customerEmailMarketingConsentUpdate);
}
