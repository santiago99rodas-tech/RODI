import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { formatEmailDate, normalizeLocale, renderEmail, type AppEmailTemplate } from "../email-render.server";
import { resendConfig, sendEmail } from "../resend.server";
import db from "../db.server";

// Email setup check + test sender. The app's own emails go out through Resend (see app/emails.server.ts); this page
// shows whether it is configured (never the key itself) and lets staff send a test of each template to any address.

// Plain constant on purpose: the page component cannot import values from a .server module.
const LOCALES = ["es", "en", "fr", "it"];

const TEMPLATES: { id: AppEmailTemplate; label: string }[] = [
  { id: "account-ready", label: "Your account is ready (sent on signup)" },
  { id: "welcome-club", label: "Welcome to RODI Club (sent from the memberships screen)" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = resendConfig();
  const recent = await db.emailLog.findMany({ where: { shop: session.shop }, orderBy: { updatedAt: "desc" }, take: 15 });
  return {
    configured: config.hasKey && Boolean(config.from),
    hasKey: config.hasKey,
    from: config.from,
    replyTo: config.replyTo,
    defaultLocale: normalizeLocale(null),
    recent: recent.map((r) => ({
      id: r.id,
      template: r.template,
      status: r.status,
      locale: r.locale,
      recipient: r.recipient,
      error: r.error,
      at: r.updatedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const to = String(form.get("to") ?? "").trim();
  const template = String(form.get("template") ?? "") as AppEmailTemplate;
  const locale = normalizeLocale(String(form.get("locale") ?? ""));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "Enter a valid email address" };
  if (!TEMPLATES.some((t) => t.id === template)) return { error: "Unknown template" };

  try {
    const rendered = await renderEmail(template, locale, {
      promo_months: 3,
      access_until: formatEmailDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), locale),
    });
    const result = await sendEmail({ to, subject: `[TEST] ${rendered.subject}`, html: rendered.html });
    if (result.ok) return { ok: `Test sent to ${to}` };
    return { error: result.skipped ? `Not sent: ${result.reason}` : `Resend rejected it: ${result.error}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the test" };
  }
};

export default function EmailSettings() {
  const { configured, hasKey, from, replyTo, defaultLocale, recent } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<AppEmailTemplate>("account-ready");
  const [locale, setLocale] = useState<string>(defaultLocale);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (!fetcher.data) return;
    if ("error" in fetcher.data && fetcher.data.error) shopify.toast.show(fetcher.data.error, { isError: true });
    else if ("ok" in fetcher.data && fetcher.data.ok) shopify.toast.show(fetcher.data.ok);
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Email (Resend)">
      <s-section heading="Status">
        <s-stack gap="base">
          <s-text fontWeight="bold">{configured ? "Ready to send" : "Not configured — emails are skipped"}</s-text>
          <s-text>API key: {hasKey ? "set" : "missing (RESEND_API_KEY)"}</s-text>
          <s-text>From: {from || "missing (EMAIL_FROM)"}</s-text>
          <s-text>Reply-to: {replyTo}</s-text>
          <s-text>Fallback language: {defaultLocale}</s-text>
          <s-paragraph>
            Set RESEND_API_KEY and EMAIL_FROM (for example &ldquo;RODI Club &lt;club@rodiclub.com&gt;&rdquo;) as
            environment variables in EasyPanel and redeploy. The domain must be verified in Resend first.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Send a test">
        <s-stack gap="base">
          <s-text-field label="Send to" value={to} onInput={(e: any) => setTo(e.target.value)}></s-text-field>
          <s-select label="Template" value={template} onChange={(e: any) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <s-option key={t.id} value={t.id}>
                {t.label}
              </s-option>
            ))}
          </s-select>
          <s-select label="Language" value={locale} onChange={(e: any) => setLocale(e.target.value)}>
            {LOCALES.map((l) => (
              <s-option key={l} value={l}>
                {l}
              </s-option>
            ))}
          </s-select>
          <s-button disabled={busy || !to} onClick={() => fetcher.submit({ to, template, locale }, { method: "POST" })}>
            Send test
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Recent sends">
        {recent.length === 0 ? (
          <s-paragraph>Nothing sent yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recent.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-text>
                  {r.template} · {r.locale} · {r.status} · {r.recipient} · {new Date(r.at).toLocaleString()}
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
