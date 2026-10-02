// Thin Resend client (plain fetch, no SDK). Configuration comes only from environment variables set in EasyPanel:
//   RESEND_API_KEY   API key from resend.com (never committed, never logged)
//   EMAIL_FROM       e.g. "RODI Club <club@rodiclub.com>"; the domain must be verified in Resend
//   EMAIL_REPLY_TO   optional, defaults to contact@rodiclub.com
// Until both RESEND_API_KEY and EMAIL_FROM are set, sending is skipped (and logged) instead of failing.

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export function resendConfig() {
  return {
    hasKey: Boolean(process.env.RESEND_API_KEY),
    from: process.env.EMAIL_FROM || "",
    replyTo: process.env.EMAIL_REPLY_TO || "contact@rodiclub.com",
  };
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const { from, replyTo } = resendConfig();
  if (!key) return { ok: false, skipped: true, reason: "RESEND_API_KEY is not set" };
  if (!from) return { ok: false, skipped: true, reason: "EMAIL_FROM is not set" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [input.to], reply_to: replyTo, subject: input.subject, html: input.html }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) {
      return { ok: false, skipped: false, error: `${response.status} ${body.name ?? ""} ${body.message ?? ""}`.trim() };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }
}
