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
  if (intent !== "check" && intent !== "send") return { error: "Unknown action" };
  try {
    const decisions = await runAbandonedCarts(admin, session.shop, { dryRun: intent === "check" });
    return { decisions, mode: intent };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read abandoned carts" };
  }
};

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
    <s-page heading="Abandoned carts">
      <s-section heading="Status">
        <s-stack gap="base">
          <s-text fontWeight="bold">{settings.enabled ? "Automatic reminders are ON" : "Automatic reminders are OFF"}</s-text>
          <s-text>Waiting time: {settings.delayMinutes} minutes after the cart was left (up to {settings.maxAgeHours} hours)</s-text>
          <s-text>Who: {settings.audience === "all" ? "every customer with an email" : "customers subscribed to marketing emails"}</s-text>
          <s-text>Resend: {resendReady ? "ready" : "not configured"}</s-text>
          <s-paragraph>
            To turn it on, set ABANDONED_CART_ENABLED=true in EasyPanel and redeploy. Optional: ABANDONED_CART_DELAY_MINUTES (default 60),
            ABANDONED_CART_MAX_AGE_HOURS (default 48) and ABANDONED_CART_AUDIENCE=all (default: only subscribed customers).
            Turn off Shopify&rsquo;s own abandoned-checkout automation (Marketing &gt; Automations) first, so nobody gets two emails.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Check now">
        <s-stack gap="base">
          <s-paragraph>
            &ldquo;Check&rdquo; lists the carts that would get an email right now and why the others do not. It sends nothing.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" disabled={busy} onClick={() => fetcher.submit({ intent: "check" }, { method: "POST" })}>Check (sends nothing)</s-button>
            <s-button
              tone="critical"
              disabled={busy || !resendReady}
              onClick={() => {
                if (!window.confirm("Send the reminder emails to the carts that qualify right now? This cannot be undone.")) return;
                fetcher.submit({ intent: "send" }, { method: "POST" });
              }}
            >
              Send now
            </s-button>
          </s-stack>

          {data?.decisions && (
            <s-stack gap="base">
              <s-text fontWeight="bold">
                {data.mode === "send" ? "Result" : "Preview"}: {data.decisions.filter((d) => d.action === "send").length} to email, {data.decisions.filter((d) => d.action === "skip").length} skipped
              </s-text>
              {data.decisions.length === 0 && <s-paragraph>No abandoned carts in the last {settings.maxAgeHours} hours.</s-paragraph>}
              {data.decisions.map((d) => (
                <s-box key={d.checkoutId} padding="base" borderWidth="base" borderRadius="base">
                  <s-text>
                    {d.email} · {d.items} item{d.items === 1 ? "" : "s"} · {d.total} ·{" "}
                    {d.action === "send" ? (d.result ? `email ${d.result}` : "would be emailed") : `skipped: ${d.reason}`}
                  </s-text>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Recent reminders">
        {recent.length === 0 ? (
          <s-paragraph>Nothing sent yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recent.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-text>
                  {r.email} · {r.status} · {new Date(r.at).toLocaleString()}
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
