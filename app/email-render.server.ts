import fs from "node:fs";
import path from "node:path";
import { Liquid } from "liquidjs";

// Renders the built email templates from ./emails (see emails/README.md): the same Liquid files that are installed in
// Shopify notifications, filled with the data the app has. Kept free of database imports so it can be exercised alone.

export const EMAIL_LOCALES = ["es", "en", "fr", "it"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];
export type AppEmailTemplate = "account-ready" | "welcome-club";

const engine = new Liquid({ strictVariables: false });
const templateCache = new Map<string, string>();
let manifestCache: { id: string; subject: Record<string, string> }[] | null = null;

const emailsRoot = () => process.env.EMAILS_DIR || path.join(process.cwd(), "emails");
const storefrontUrl = () => (process.env.STOREFRONT_URL || "https://rodiclub.com").replace(/\/$/, "");
const useCache = () => process.env.NODE_ENV === "production";

const isLocale = (value: string): value is EmailLocale => (EMAIL_LOCALES as readonly string[]).includes(value);

// Shopify gives locales like "es", "es-CO", "pt-BR". Anything we have no templates for falls back to the default.
export function normalizeLocale(raw: string | null | undefined): EmailLocale {
  const short = (raw || "").toLowerCase().slice(0, 2);
  if (isLocale(short)) return short;
  const fallback = (process.env.EMAIL_DEFAULT_LOCALE || "en").toLowerCase().slice(0, 2);
  return isLocale(fallback) ? fallback : "en";
}

export function formatEmailDate(date: Date, locale: EmailLocale): string {
  const text = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  return locale === "fr" ? text.replace(/^1 /, "1er ") : text; // French writes the first of the month as "1er"
}

function readTemplate(locale: EmailLocale, template: AppEmailTemplate): string {
  const key = `${locale}/${template}`;
  const cached = useCache() ? templateCache.get(key) : undefined;
  if (cached) return cached;
  const html = fs.readFileSync(path.join(emailsRoot(), "dist", locale, `${template}.html`), "utf8");
  templateCache.set(key, html);
  return html;
}

function readSubject(locale: EmailLocale, template: AppEmailTemplate): string {
  if (!manifestCache || !useCache()) {
    manifestCache = JSON.parse(fs.readFileSync(path.join(emailsRoot(), "manifest.json"), "utf8"));
  }
  const entry = manifestCache!.find((item) => item.id === template);
  if (!entry) throw new Error(`Unknown email template: ${template}`);
  return entry.subject[locale];
}

export async function renderEmail(
  template: AppEmailTemplate,
  locale: EmailLocale,
  data: Record<string, unknown> = {},
): Promise<{ subject: string; html: string }> {
  const context = { shop: { url: storefrontUrl(), name: "RODI Club" }, ...data };
  const [subject, html] = await Promise.all([
    engine.parseAndRender(readSubject(locale, template), context),
    engine.parseAndRender(readTemplate(locale, template), context),
  ]);
  return { subject: subject.trim(), html };
}
