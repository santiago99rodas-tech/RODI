import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Inicio</s-link>
        <s-link href="/app/memberships">Membresías Club</s-link>
        <s-link href="/app/membership-backfill">Promo de lanzamiento Club</s-link>
        <s-link href="/app/community-moderation">Moderación de la comunidad</s-link>
        <s-link href="/app/service-inquiries">Consultas de RODI Services</s-link>
        <s-link href="/app/email">Correo (Resend)</s-link>
        <s-link href="/app/campaigns">Campañas</s-link>
        <s-link href="/app/abandoned-carts">Carritos abandonados</s-link>
        <s-link href="/app/backups">Respaldos de la base de datos</s-link>
        <s-link href="/app/calculator-usage">Uso de la calculadora</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
