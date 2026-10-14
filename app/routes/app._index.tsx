import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const SECTIONS: { href: string; title: string; text: string }[] = [
  { href: "/app/memberships", title: "Membresías Club", text: "Mira quién es Free o Club, da o quita acceso Club y envía el correo de bienvenida." },
  { href: "/app/membership-backfill", title: "Promo de lanzamiento Club", text: "Da el acceso de lanzamiento a quienes se registraron antes de la promo." },
  { href: "/app/community-moderation", title: "Moderación de la comunidad", text: "Revisa preguntas, respuestas y recomendaciones; oculta o restaura publicaciones." },
  { href: "/app/service-inquiries", title: "Consultas de RODI Services", text: "Solicitudes que enviaron los miembros para RODI Services, con estado y notas internas." },
  { href: "/app/email", title: "Correo (Resend)", text: "Estado del envío y una prueba de los correos de la app." },
  { href: "/app/campaigns", title: "Campañas", text: "Previsualiza y envía correos de marketing a una audiencia." },
  { href: "/app/abandoned-carts", title: "Carritos abandonados", text: "Correos recordatorio para compras que no se completaron." },
  { href: "/app/backups", title: "Respaldos de la base de datos", text: "Copias automáticas, copias fuera del servidor y descarga manual." },
  { href: "/app/calculator-usage", title: "Uso de la calculadora", text: "Cómo usan los miembros la calculadora de costos de viaje (solo totales)." },
];

export default function Index() {
  return (
    <s-page heading="RODI Trip Planner">
      <s-section heading="Herramientas de administración">
        <s-paragraph>El planificador funciona en la tienda en /apps/trip-planner. Estas páginas administran lo que hay detrás.</s-paragraph>
        <s-stack direction="block" gap="base">
          {SECTIONS.map((s) => (
            <s-box key={s.href} padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small">
                <s-link href={s.href}>{s.title}</s-link>
                <s-paragraph>{s.text}</s-paragraph>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
