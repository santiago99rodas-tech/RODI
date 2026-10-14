import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_TEMPLATES, type CampaignTemplateId } from "../campaign-spec";
import { cancelCampaign, campaignCounts, previewCampaign, retryFailed, sendNextBatch, type CampaignParams } from "../campaigns.server";
import { normalizeLocale } from "../email-render.server";
import { resendConfig } from "../resend.server";

// One prepared campaign: who will get it, a preview, and the Send button. Sending runs in batches of 50 driven by this
// page (each batch is one request), so progress is visible and a closed tab simply pauses it; "Send" resumes.

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const campaign = await db.campaign.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!campaign) throw redirect("/app/campaigns");

  const counts = await campaignCounts(campaign.id);
  const failed = await db.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "failed" }, take: 10 });
  const sample = await db.campaignRecipient.findFirst({ where: { campaignId: campaign.id }, orderBy: { id: "asc" } });
  const parsed = JSON.parse(campaign.params) as CampaignParams;
  const rendered = await previewCampaign(campaign.template as CampaignTemplateId, parsed, normalizeLocale(sample?.locale));
  const config = resendConfig();

  return {
    id: campaign.id,
    label: CAMPAIGN_TEMPLATES.find((t) => t.id === campaign.template)?.label ?? campaign.template,
    status: campaign.status,
    audience: CAMPAIGN_AUDIENCES.find((a) => a.id === campaign.audience)?.label ?? campaign.audience,
    counts,
    failed: failed.map((r) => ({ email: r.email, error: r.error })),
    subject: rendered.subject,
    html: rendered.html,
    configured: config.hasKey && Boolean(config.from),
    sampleEmail: sample?.email ?? "",
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id!;
  const intent = String((await request.formData()).get("intent") ?? "");
  try {
    if (intent === "next") return await sendNextBatch(session.shop, id);
    if (intent === "retry") {
      await retryFailed(session.shop, id);
      return { counts: await campaignCounts(id), status: "sending" };
    }
    if (intent === "cancel") {
      await cancelCampaign(session.shop, id);
      return { counts: await campaignCounts(id), status: "cancelled" };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Algo salió mal" };
  }
  return { error: "Acción desconocida" };
};

const STATUS_LABEL: Record<string, string> = { draft: "Preparada", sending: "Enviando", sent: "Enviada", cancelled: "Cancelada" };

export default function CampaignDetail() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [running, setRunning] = useState(false);
  const live = (fetcher.data as any) ?? null;
  const counts = live?.counts ?? data.counts;
  const status: string = live?.status ?? data.status;
  const lastHandled = useRef<unknown>(null);

  // Drives the batches: after each answer, ask for the next one until nothing is pending (or something goes wrong).
  useEffect(() => {
    if (!running || fetcher.state !== "idle") return;
    const result = fetcher.data as any;
    if (result === lastHandled.current) return;
    lastHandled.current = result;
    if (result?.error) {
      setRunning(false);
      shopify.toast.show(result.error, { isError: true });
    } else if (result && (result.status === "sent" || result.status === "cancelled" || result.counts?.pending === 0)) {
      setRunning(false);
      shopify.toast.show(result.counts?.failed ? `Terminó con ${result.counts.failed} fallidos` : "Campaña enviada");
    } else {
      fetcher.submit({ intent: "next" }, { method: "POST" });
    }
  }, [running, fetcher, fetcher.state, fetcher.data, shopify]);

  const start = () => {
    if (!window.confirm(`¿Enviar "${data.label}" a ${counts.pending} personas ahora? No se puede deshacer.`)) return;
    lastHandled.current = null;
    setRunning(true);
    fetcher.submit({ intent: "next" }, { method: "POST" });
  };

  const done = counts.sent + counts.failed + counts.skipped;
  const canSend = data.configured && status !== "sent" && status !== "cancelled" && counts.pending > 0;

  return (
    <s-page heading={`Campaña: ${data.label}`}>
      <s-section heading="Estado">
        <s-stack gap="base">
          <s-text fontWeight="bold">{STATUS_LABEL[status] ?? status}{running ? " (enviando…)" : ""}</s-text>
          <s-text>Audiencia: {data.audience}</s-text>
          <s-text>Asunto: {data.subject}</s-text>
          <s-text>
            {counts.total} destinatarios · {counts.sent} enviados · {counts.pending} en espera · {counts.failed} fallidos · {counts.skipped} omitidos
          </s-text>
          <s-text>Avance: {counts.total ? Math.round((done / counts.total) * 100) : 0}%</s-text>
          {!data.configured && <s-text tone="critical">Resend no está configurado, así que no se puede enviar nada.</s-text>}

          <s-stack direction="inline" gap="base">
            <s-button variant="primary" disabled={!canSend || running} onClick={start}>
              {counts.sent > 0 ? "Reanudar el envío" : "Enviar"}
            </s-button>
            {counts.failed > 0 && (
              <s-button disabled={running} onClick={() => fetcher.submit({ intent: "retry" }, { method: "POST" })}>
                Reintentar los fallidos
              </s-button>
            )}
            {status !== "sent" && status !== "cancelled" && (
              <s-button
                tone="critical"
                disabled={running}
                onClick={() => {
                  if (window.confirm("¿Cancelar esta campaña? A quienes aún no se les haya enviado se les omitirá.")) fetcher.submit({ intent: "cancel" }, { method: "POST" });
                }}
              >
                Cancelar campaña
              </s-button>
            )}
          </s-stack>
          <s-paragraph>
            Deja esta página abierta mientras se envía. Si la cierras, el envío se pausa y "Reanudar el envío" continúa donde se quedó; a nadie se le escribe dos veces.
          </s-paragraph>
        </s-stack>
      </s-section>

      {data.failed.length > 0 && (
        <s-section heading="Fallidos (los primeros 10)">
          <s-stack gap="base">
            {data.failed.map((f) => (
              <s-text key={f.email}>{f.email}: {f.error}</s-text>
            ))}
          </s-stack>
        </s-section>
      )}

      <s-section heading="Vista previa (idioma del primer destinatario)">
        <iframe title="Vista previa del correo" srcDoc={data.html} style={{ width: "100%", height: 720, border: "1px solid #ddd", borderRadius: 8 }} />
      </s-section>
    </s-page>
  );
}
