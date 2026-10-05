import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { unsubscribeCustomer, verifyUnsubscribe } from "../unsubscribe.server";

// Public page behind the "Unsubscribe" link of marketing emails (no login; the link itself is signed). The page asks
// for one click to confirm so link scanners cannot unsubscribe people by merely opening it; mail clients that support
// one-click unsubscribe POST straight to this URL.

const TEXT = {
  es: { title: "Darte de baja", ask: "¿Quieres dejar de recibir correos de marketing de RODI Club?", button: "Sí, darme de baja", done: "Listo. Ya no recibirás correos de marketing de RODI Club.", note: "Seguirás recibiendo los correos de tus pedidos y de tu cuenta.", bad: "Este enlace no es válido.", retry: "No pudimos completarlo. Inténtalo de nuevo." },
  en: { title: "Unsubscribe", ask: "Do you want to stop receiving marketing emails from RODI Club?", button: "Yes, unsubscribe me", done: "Done. You will no longer receive marketing emails from RODI Club.", note: "You will still get emails about your orders and your account.", bad: "This link is not valid.", retry: "We could not complete that. Please try again." },
  fr: { title: "Se désabonner", ask: "Voulez-vous ne plus recevoir les e-mails marketing de RODI Club ?", button: "Oui, me désabonner", done: "C'est fait. Vous ne recevrez plus d'e-mails marketing de RODI Club.", note: "Vous continuerez à recevoir les e-mails concernant vos commandes et votre compte.", bad: "Ce lien n'est pas valide.", retry: "Nous n'avons pas pu terminer. Veuillez réessayer." },
  it: { title: "Annulla l'iscrizione", ask: "Vuoi smettere di ricevere le email di marketing di RODI Club?", button: "Sì, annulla l'iscrizione", done: "Fatto. Non riceverai più email di marketing da RODI Club.", note: "Continuerai a ricevere le email sui tuoi ordini e sul tuo account.", bad: "Questo link non è valido.", retry: "Non siamo riusciti a completare. Riprova." },
} as const;
type Lang = keyof typeof TEXT;

const readParams = (url: URL) => ({
  shop: url.searchParams.get("shop") ?? "",
  customerId: url.searchParams.get("c") ?? "",
  signature: url.searchParams.get("s") ?? "",
  lang: ((url.searchParams.get("l") ?? "") in TEXT ? url.searchParams.get("l") : "en") as Lang,
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, customerId, signature, lang } = readParams(new URL(request.url));
  return { valid: /^\d+$/.test(customerId) && verifyUnsubscribe(shop, customerId, signature), lang };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, customerId, signature, lang } = readParams(new URL(request.url));
  if (!/^\d+$/.test(customerId) || !verifyUnsubscribe(shop, customerId, signature)) return { ok: false, lang };
  try {
    await unsubscribeCustomer(shop, customerId);
    return { ok: true, lang };
  } catch (err) {
    console.error("[unsubscribe] failed", err);
    return { ok: false, lang, failed: true };
  }
};

export default function Unsubscribe() {
  const { valid, lang } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { search } = useLocation();
  const t = TEXT[(result?.lang ?? lang) as Lang];
  const shell: React.CSSProperties = { fontFamily: "Georgia, serif", maxWidth: 480, margin: "12vh auto", padding: "0 24px", textAlign: "center", color: "#1C1B1A" };

  return (
    <div style={shell}>
      <h1 style={{ fontWeight: 400, fontSize: 32 }}>{t.title}</h1>
      {result?.ok ? (
        <>
          <p>{t.done}</p>
          <p style={{ color: "#6B6862" }}>{t.note}</p>
        </>
      ) : !valid ? (
        <p>{t.bad}</p>
      ) : (
        <>
          <p>{result && "failed" in result && result.failed ? t.retry : t.ask}</p>
          <Form method="post" action={`/unsubscribe${search}`}>
            <button type="submit" style={{ background: "#1C1B1A", color: "#F5F1EA", border: 0, borderRadius: 999, padding: "14px 32px", fontSize: 14, letterSpacing: 1.5, cursor: "pointer" }}>
              {t.button}
            </button>
          </Form>
        </>
      )}
    </div>
  );
}
