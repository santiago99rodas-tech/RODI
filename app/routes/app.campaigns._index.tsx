import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_TEMPLATES, isCampaignTemplate, specFor, type CampaignAudience } from "../campaign-spec";
import { createCampaign, fetchProducts, previewCampaign, sendCampaignTest, validateFields, type CampaignParams } from "../campaigns.server";
import { normalizeLocale } from "../email-render.server";
import { resendConfig } from "../resend.server";

// Marketing campaigns. Pick an email, fill what it needs, preview it, send yourself a test, then "Prepare campaign"
// (which snapshots who will receive it). Sending itself happens on the next screen and needs one more explicit press.

const LOCALES = ["es", "en", "fr", "it"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = resendConfig();
  const campaigns = await db.campaign.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 20 });
  return {
    configured: config.hasKey && Boolean(config.from),
    campaigns: campaigns.map((c) => ({ id: c.id, template: c.template, status: c.status, total: c.total, createdAt: c.createdAt.toISOString() })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const template = String(form.get("template") ?? "");
  const audience = String(form.get("audience") ?? "subscribed") as CampaignAudience;
  if (!isCampaignTemplate(template)) return { error: "Choose an email" };
  if (!CAMPAIGN_AUDIENCES.some((a) => a.id === audience)) return { error: "Choose an audience" };

  const raw: Record<string, string> = {};
  for (const field of specFor(template)!.fields) raw[field.key] = String(form.get(`f_${field.key}`) ?? "");
  const checked = validateFields(template, raw);
  if ("error" in checked) return { error: checked.error };

  try {
    if (intent === "create") {
      const result = await createCampaign(admin, session.shop, { template, audience, fields: checked.fields });
      if ("error" in result) return { error: result.error };
      return redirect(`/app/campaigns/${result.id}`);
    }

    const products = specFor(template)!.usesProducts ? await fetchProducts(admin, checked.fields.collection) : [];
    if (specFor(template)!.usesProducts && products.length < 3) return { error: "Needs at least 3 active products with images (check the collection handle)" };
    const params: CampaignParams = { fields: checked.fields, products };
    const locale = normalizeLocale(String(form.get("locale") ?? ""));

    if (intent === "preview") {
      const rendered = await previewCampaign(template, params, locale);
      return { preview: rendered.html, subject: rendered.subject };
    }
    if (intent === "test") {
      const to = String(form.get("to") ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "Enter a valid email address for the test" };
      const result = await sendCampaignTest(template, params, locale, to);
      if (result.ok) return { ok: `Test sent to ${to}` };
      return { error: result.skipped ? `Not sent: ${result.reason}` : `Resend rejected it: ${result.error}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
  return { error: "Unknown action" };
};

export default function Campaigns() {
  const { configured, campaigns } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [template, setTemplate] = useState(CAMPAIGN_TEMPLATES[0].id as string);
  const [audience, setAudience] = useState<string>("subscribed");
  const [locale, setLocale] = useState("es");
  const [testTo, setTestTo] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const busy = fetcher.state !== "idle";
  const spec = CAMPAIGN_TEMPLATES.find((t) => t.id === template)!;

  useEffect(() => {
    const data = fetcher.data as any;
    if (!data) return;
    if (data.error) shopify.toast.show(data.error, { isError: true });
    else if (data.ok) shopify.toast.show(data.ok);
    else if (data.preview) setPreview({ html: data.preview, subject: data.subject });
  }, [fetcher.data, shopify]);

  const submit = (intent: string) =>
    fetcher.submit(
      { intent, template, audience, locale, to: testTo, ...Object.fromEntries(spec.fields.map((f) => [`f_${f.key}`, values[`${template}:${f.key}`] ?? ""])) },
      { method: "POST" },
    );

  return (
    <s-page heading="Campaigns">
      {!configured && (
        <s-banner tone="warning" heading="Resend is not configured">
          Set RESEND_API_KEY and EMAIL_FROM first (see Email (Resend)). Previews work, but nothing can be sent.
        </s-banner>
      )}

      <s-section heading="New campaign">
        <s-stack gap="base">
          <s-select label="Email" value={template} onChange={(e: any) => { setTemplate(e.target.value); setPreview(null); }}>
            {CAMPAIGN_TEMPLATES.map((t) => (
              <s-option key={t.id} value={t.id}>{t.label}</s-option>
            ))}
          </s-select>
          <s-paragraph>{spec.description}</s-paragraph>

          {spec.fields.map((f) => (
            <s-text-field
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              details={f.help}
              value={values[`${template}:${f.key}`] ?? ""}
              onInput={(e: any) => setValues((v) => ({ ...v, [`${template}:${f.key}`]: e.target.value }))}
            ></s-text-field>
          ))}

          <s-select label="Who receives it" value={audience} onChange={(e: any) => setAudience(e.target.value)}>
            {CAMPAIGN_AUDIENCES.map((a) => (
              <s-option key={a.id} value={a.id}>{a.label}</s-option>
            ))}
          </s-select>
          <s-paragraph>
            Only customers who accepted marketing emails in Shopify are included. Each person gets the email in their own language.
          </s-paragraph>

          <s-select label="Language for preview and test" value={locale} onChange={(e: any) => setLocale(e.target.value)}>
            {LOCALES.map((l) => (
              <s-option key={l} value={l}>{l}</s-option>
            ))}
          </s-select>
          <s-stack direction="inline" gap="base">
            <s-button disabled={busy} onClick={() => submit("preview")}>Preview</s-button>
          </s-stack>

          <s-text-field label="Send a test to" placeholder="you@example.com" value={testTo} onInput={(e: any) => setTestTo(e.target.value)}></s-text-field>
          <s-button disabled={busy || !testTo || !configured} onClick={() => submit("test")}>Send test</s-button>

          <s-button variant="primary" disabled={busy} onClick={() => submit("create")}>Prepare campaign</s-button>
          <s-paragraph>Preparing only builds the recipient list. Nothing is sent until you press Send on the next screen.</s-paragraph>
        </s-stack>
      </s-section>

      {preview && (
        <s-section heading={`Preview — subject: ${preview.subject}`}>
          <iframe title="Email preview" srcDoc={preview.html} style={{ width: "100%", height: 720, border: "1px solid #ddd", borderRadius: 8 }} />
        </s-section>
      )}

      <s-section heading="Previous campaigns">
        {campaigns.length === 0 ? (
          <s-paragraph>No campaigns yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {campaigns.map((c) => (
              <s-box key={c.id} padding="base" borderWidth="base" borderRadius="base">
                <s-link href={`/app/campaigns/${c.id}`}>
                  {CAMPAIGN_TEMPLATES.find((t) => t.id === c.template)?.label ?? c.template} · {c.status} · {c.total} recipients · {new Date(c.createdAt).toLocaleString()}
                </s-link>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
