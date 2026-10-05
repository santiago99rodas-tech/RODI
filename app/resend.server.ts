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
  headers?: Record<string, string>;
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
      body: JSON.stringify({ from, to: [input.to], reply_to: replyTo, subject: input.subject, html: input.html, headers: input.headers }),
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

export type BatchItem = { to: string; subject: string; html: string; headers?: Record<string, string> };

// Resend's batch endpoint takes up to 100 messages per request and answers with one id per message, in order. A batch
// is all-or-nothing on validation, so a rejected batch reports the same error for every message in it.
export async function sendBatch(
  items: BatchItem[],
  idempotencyKey?: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; skipped: boolean; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const { from, replyTo } = resendConfig();
  if (!key) return { ok: false, skipped: true, error: "RESEND_API_KEY is not set" };
  if (!from) return { ok: false, skipped: true, error: "EMAIL_FROM is not set" };
  if (items.length === 0 || items.length > 100) return { ok: false, skipped: false, error: "A batch needs 1 to 100 messages" };

  try {
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(items.map((item) => ({ from, to: [item.to], reply_to: replyTo, subject: item.subject, html: item.html, headers: item.headers }))),
    });
    const body = (await response.json().catch(() => ({}))) as { data?: { id: string }[]; message?: string; name?: string };
    if (!response.ok || !Array.isArray(body.data) || body.data.length !== items.length) {
      return { ok: false, skipped: false, error: `${response.status} ${body.name ?? ""} ${body.message ?? ""}`.trim() };
    }
    return { ok: true, ids: body.data.map((entry) => entry.id) };
  } catch (err) {
    return { ok: false, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }
}
