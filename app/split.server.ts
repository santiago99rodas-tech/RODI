// Split de gastos: small input cleaners shared by the participant and expense ops.

/** A usable e-mail address, or null. */
export function cleanEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase().slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/** Digits with an optional leading +, 7 to 15 digits (what WhatsApp's wa.me wants), or null. */
export function cleanPhone(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (raw.startsWith("+") ? "+" : "") + digits;
}

/**
 * Who an expense is split between. Accepts an array or its JSON text, keeps only people of this trip, and returns
 * null when the answer is "everyone" (nothing selected, or everybody selected), which is the column's default.
 */
export function cleanSplitWith(v: unknown, valid: string[]): string | null {
  let list: unknown = v;
  if (typeof v === "string") {
    try { list = JSON.parse(v); } catch { list = null; }
  }
  if (!Array.isArray(list)) return null;
  const ok = new Set(valid);
  const ids = Array.from(new Set(list.map(String).filter((id) => ok.has(id))));
  if (!ids.length || ids.length >= valid.length) return null;
  return JSON.stringify(ids);
}
