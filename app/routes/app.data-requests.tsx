import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { maskEmail } from "../legal.server";

// Read-only log of privacy requests (member exports/erasures and Shopify compliance webhooks) and of parent/guardian
// authorizations for members aged 15-17. "shopify_pending" means the app data is gone but the customer must still be
// erased by hand in Shopify (Customers > customer > Erase personal data); an email to contact@rodiclub.com says so too.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [requests, consents] = await Promise.all([
    db.dataRequest.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.guardianConsent.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return {
    requests: requests.map((r) => ({
      id: r.id, customerId: r.customerId, type: r.type, source: r.source, status: r.status, detail: r.detail,
      shopifyRequestId: r.shopifyRequestId, at: r.createdAt.toISOString(),
    })),
    consents: consents.map((c) => ({
      id: c.id, customerId: c.customerId, status: c.status, guardian: maskEmail(c.guardianEmail), locale: c.locale,
      expired: c.status === "pending" && c.expiresAt < new Date(), at: c.createdAt.toISOString(),
      decidedAt: (c.approvedAt ?? c.declinedAt)?.toISOString() ?? null,
    })),
  };
};

const TYPE: Record<string, string> = { export: "Exportación", erase: "Borrado" };
const SOURCE: Record<string, string> = { member: "el miembro", shopify_webhook: "Shopify (webhook)", guardian_timeout: "sin respuesta del tutor en 30 días" };
const STATUS: Record<string, string> = {
  done: "hecho", emailed: "enviado a contact@rodiclub.com", failed: "falló", shopify_pending: "falta borrar en Shopify",
  pending: "pendiente", approved: "autorizado", declined: "rechazado", superseded: "reemplazada",
};
const when = (iso: string) => new Date(iso).toLocaleString("es-CO");

export default function DataRequests() {
  const { requests, consents } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Datos personales">
      <s-section heading="Solicitudes de datos">
        {requests.length === 0 ? (
          <s-paragraph>Aún no hay solicitudes.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {requests.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="small">
                  <s-text fontWeight="bold">
                    {TYPE[r.type] ?? r.type} · {STATUS[r.status] ?? r.status}
                  </s-text>
                  <s-text tone="neutral">
                    Cliente {r.customerId ?? "-"} · pedido por {SOURCE[r.source] ?? r.source} · {when(r.at)}
                    {r.shopifyRequestId ? ` · solicitud Shopify ${r.shopifyRequestId}` : ""}
                  </s-text>
                  {r.detail && <s-text tone="neutral">{r.detail}</s-text>}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Autorizaciones de madre, padre o tutor (15-17 años)">
        {consents.length === 0 ? (
          <s-paragraph>Aún no hay autorizaciones.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {consents.map((c) => (
              <s-box key={c.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="small">
                  <s-text fontWeight="bold">
                    {c.expired ? "vencida" : STATUS[c.status] ?? c.status} · {c.guardian}
                  </s-text>
                  <s-text tone="neutral">
                    Cliente {c.customerId} · idioma {c.locale} · pedida {when(c.at)}
                    {c.decidedAt ? ` · respondida ${when(c.decidedAt)}` : ""}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
