import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { abandonedCartSettings, runAbandonedCarts, type CartDecision } from "../abandoned-carts.server";
import { resendConfig } from "../resend.server";

// Abandoned-cart reminders. The automatic job is configured with environment variables (see the explanations below);
// this page shows its state, lets staff check which carts would get an email right now WITHOUT sending anything, and
// lists what was sent.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = resendConfig();
  const recent = await db.abandonedCartLog.findMany({ where: { shop: session.shop }, orderBy: { updatedAt: "desc" }, take: 20 });
  return {
    settings: abandonedCartSettings(),
    resendReady: config.hasKey && Boolean(config.from),
    recent: recent.map((r) => ({ id: r.id, email: r.email, status: r.status, error: r.error, at: r.updatedAt.toISOString() })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const intent = String((await request.formData()).get("intent") ?? "");
  if (intent !== "check" && intent !== "send") return { error: "Acción desconocida" };
  try {
    const decisions = await runAbandonedCarts(admin, session.shop, { dryRun: intent === "check" });
    return { decisions, mode: intent };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron leer los carritos abandonados" };
  }
};

const RESULT_LABEL: Record<string, string> = { sent: "enviado", failed: "fallido", "not-sent": "no enviado" };

export default function AbandonedCarts() {
  const { settings, resendReady, recent } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data as { decisions?: CartDecision[]; mode?: string; error?: string } | undefined;

  useEffect(() => {
    if (data?.error) shopify.toast.show(data.error, { isError: true });
  }, [data, shopify]);

  return (
    <s-page heading="Carritos abandonados">
      <s-section heading="Estado">
        <s-stack gap="base">
          <s-text fontWeight="bold">{settings.enabled ? "Los recordatorios automáticos están ACTIVADOS" : "Los recordatorios automáticos están DESACTIVADOS"}</s-text>
          <s-text>Tiempo de espera: {settings.delayMinutes} minutos después de dejar el carrito (hasta {settings.maxAgeHours} horas)</s-text>
          <s-text>A quién: {settings.audience === "all" ? "todo cliente con correo" : "clientes suscritos a correos de marketing"}</s-text>
          <s-text tone="neutral">
            Lo que recibió la app: ABANDONED_CART_ENABLED = {settings.received.enabled}
            {settings.received.enabled === '"true"' ? " (correcto)" : " (debe ser exactamente true, en minúsculas, sin comillas ni espacios)"}; ABANDONED_CART_AUDIENCE ={" "}
            {settings.received.audience} (solo el valor all cambia algo; cualquier otro significa solo clientes suscritos).
          </s-text>
          <s-text>Resend: {resendReady ? "listo" : "sin configurar"}</s-text>
          <s-paragraph>
            Para activarlo, define ABANDONED_CART_ENABLED=true en EasyPanel y vuelve a desplegar. Opcionales: ABANDONED_CART_DELAY_MINUTES (por defecto 60),
            ABANDONED_CART_MAX_AGE_HOURS (por defecto 48) y ABANDONED_CART_AUDIENCE=all (por defecto: solo clientes suscritos).
            Apaga antes la automatización de checkout abandonado de Shopify (Marketing &gt; Automatizaciones) para que nadie reciba dos correos.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Revisar ahora">
        <s-stack gap="base">
          <s-paragraph>
            &ldquo;Revisar&rdquo; lista los carritos que recibirían un correo ahora mismo y por qué los demás no. No envía nada.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" disabled={busy} onClick={() => fetcher.submit({ intent: "check" }, { method: "POST" })}>Revisar (no envía nada)</s-button>
            <s-button
              tone="critical"
              disabled={busy || !resendReady}
              onClick={() => {
                if (!window.confirm("¿Enviar ahora los recordatorios a los carritos que califican? No se puede deshacer.")) return;
                fetcher.submit({ intent: "send" }, { method: "POST" });
              }}
            >
              Enviar ahora
            </s-button>
          </s-stack>

          {data?.decisions && (
            <s-stack gap="base">
              <s-text fontWeight="bold">
                {data.mode === "send" ? "Resultado" : "Vista previa"}: {data.decisions.filter((d) => d.action === "send").length} por escribir, {data.decisions.filter((d) => d.action === "skip").length} omitidos
              </s-text>
              {data.decisions.length === 0 && <s-paragraph>No hay carritos abandonados en las últimas {settings.maxAgeHours} horas.</s-paragraph>}
              {data.decisions.map((d) => (
                <s-box key={d.checkoutId} padding="base" borderWidth="base" borderRadius="base">
                  <s-text>
                    {d.email} · {d.items} {d.items === 1 ? "producto" : "productos"} · {d.total} ·{" "}
                    {d.action === "send" ? (d.result ? `correo ${RESULT_LABEL[d.result] ?? d.result}` : "se le escribiría") : `omitido: ${d.reason}`}
                  </s-text>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Recordatorios recientes">
        {recent.length === 0 ? (
          <s-paragraph>Aún no se ha enviado nada.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recent.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-text>
                  {r.email} · {RESULT_LABEL[r.status] ?? r.status} · {new Date(r.at).toLocaleString("es-CO")}
                  {r.error ? ` · ${r.error}` : ""}
                </s-text>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
