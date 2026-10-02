import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// The theme can't write customer data under New Customer Accounts, so the picker saves through the app
// proxy and this writes the customer's custom.nationalities metafield (list of text). Liquid keeps
// reading it directly — country pages (entry requirements) and Emergency Mode (embassies) match on it.
const NAMESPACE = "custom";
const KEY = "nationalities";

export async function saveNationalities(admin: AdminApiContext, customerId: string, names: string[]) {
  const ownerId = `gid://shopify/Customer/${customerId}`;

  // An empty list is "no nationality saved", which Liquid reads as a blank metafield — so remove it
  // instead of storing "[]".
  if (!names.length) {
    const response = await admin.graphql(
      `#graphql
        mutation clearNationalities($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) { userErrors { field message } }
        }`,
      { variables: { metafields: [{ ownerId, namespace: NAMESPACE, key: KEY }] } },
    );
    const body = await response.json();
    const errors = body?.data?.metafieldsDelete?.userErrors;
    if (errors?.length) throw new Error(`metafieldsDelete failed: ${JSON.stringify(errors)}`);
    return;
  }

  const response = await admin.graphql(
    `#graphql
      mutation setNationalities($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
    {
      variables: {
        metafields: [
          { ownerId, namespace: NAMESPACE, key: KEY, type: "list.single_line_text_field", value: JSON.stringify(names) },
        ],
      },
    },
  );
  const body = await response.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
}
