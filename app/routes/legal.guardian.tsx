import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { clientIp, clientUserAgent, decideGuardian, findGuardianConsent } from "../legal.server";

// Public page behind the link emailed to the parent/guardian of a member aged 15-17 (no login: the random token in the
// link is the credential, and only its HMAC is stored). Opening the page changes nothing; the decision needs a click
// (POST), so mail scanners that open links cannot approve on anyone's behalf. Language = the one the member used.

const TEXT = {
  es: {
    title: "Autorización de madre, padre o tutor",
    intro: "Una persona de entre 15 y 17 años creó una cuenta en RODI Club e indicó este correo como el de su madre, padre o tutor legal. Su cuenta está en pausa hasta que respondas.",
    whatTitle: "Qué es la cuenta",
    what: "RODI Club es el espacio de miembros de RODI. Permite planificar viajes (itinerario, presupuesto, equipaje y documentos), guardar destinos, llevar un pasaporte de países visitados y leer la comunidad del Club.",
    dataTitle: "Qué datos tratamos",
    data: [
      "Nombre y correo electrónico de la cuenta.",
      "Año de nacimiento y franja de edad (nunca la fecha completa).",
      "Lo que el menor guarde en sus viajes: itinerarios, listas, gastos, enlaces a documentos, contactos de emergencia y diario.",
      "La constancia de aceptación de los términos y de esta autorización: fecha, dirección IP y navegador.",
    ],
    rulesTitle: "Restricciones para menores",
    rules: [
      "Puede leer la comunidad, pero no publicar ni responder.",
      "No recibe correos de marketing, aunque lo pida.",
      "Puede descargar o eliminar todos sus datos en cualquier momento desde su cuenta; tú también puedes pedirlo escribiendo a contact@rodiclub.com.",
    ],
    minors: "Política de menores",
    privacy: "Política de privacidad",
    approve: "Autorizo",
    decline: "No autorizo",
    record: "Tu respuesta queda registrada con la fecha, la dirección IP y el navegador como constancia.",
    approved: "Gracias. La cuenta quedó autorizada y ya puede usar RODI Club con las restricciones para menores.",
    declined: "Registramos que no autorizas la cuenta. Seguirá en pausa, sin acceso a las funciones del Club.",
    expired: "Este enlace venció. Pide al menor que envíe una nueva solicitud desde su cuenta.",
    invalid: "Este enlace no es válido o ya fue reemplazado por uno más reciente.",
  },
  en: {
    title: "Parent or guardian authorization",
    intro: "Someone between 15 and 17 created a RODI Club account and gave this email address as their parent or legal guardian's. Their account is paused until you respond.",
    whatTitle: "What the account is",
    what: "RODI Club is RODI's members' space. It is used to plan trips (itinerary, budget, packing and documents), save destinations, keep a passport of countries visited and read the Club community.",
    dataTitle: "What data we process",
    data: [
      "The account's name and email address.",
      "Birth year and age band (never the full date of birth).",
      "What the minor saves in their trips: itineraries, lists, expenses, links to documents, emergency contacts and journal.",
      "The record of their acceptance of the terms and of this authorization: date, IP address and browser.",
    ],
    rulesTitle: "Restrictions for minors",
    rules: [
      "They can read the community but cannot post or reply.",
      "They never receive marketing emails, even if they ask to.",
      "They can download or delete all their data at any time from their account; you can also ask by writing to contact@rodiclub.com.",
    ],
    minors: "Minors policy",
    privacy: "Privacy policy",
    approve: "I authorize",
    decline: "I do not authorize",
    record: "Your answer is recorded with the date, IP address and browser as evidence.",
    approved: "Thank you. The account is authorized and can now use RODI Club with the restrictions for minors.",
    declined: "We have recorded that you do not authorize the account. It stays paused, with no access to Club features.",
    expired: "This link has expired. Ask the minor to send a new request from their account.",
    invalid: "This link is not valid or has been replaced by a newer one.",
  },
  fr: {
    title: "Autorisation parentale",
    intro: "Une personne âgée de 15 à 17 ans a créé un compte RODI Club et a indiqué cette adresse comme celle de son parent ou tuteur légal. Son compte est en pause jusqu'à votre réponse.",
    whatTitle: "Ce qu'est le compte",
    what: "RODI Club est l'espace membres de RODI. Il permet de planifier des voyages (itinéraire, budget, bagages et documents), d'enregistrer des destinations, de tenir un passeport des pays visités et de lire la communauté du Club.",
    dataTitle: "Les données que nous traitons",
    data: [
      "Le nom et l'adresse e-mail du compte.",
      "L'année de naissance et la tranche d'âge (jamais la date complète).",
      "Ce que le mineur enregistre dans ses voyages : itinéraires, listes, dépenses, liens vers des documents, contacts d'urgence et journal.",
      "La preuve de son acceptation des conditions et de cette autorisation : date, adresse IP et navigateur.",
    ],
    rulesTitle: "Restrictions pour les mineurs",
    rules: [
      "Il peut lire la communauté, mais ni publier ni répondre.",
      "Il ne reçoit jamais d'e-mails marketing, même s'il le demande.",
      "Il peut télécharger ou supprimer toutes ses données à tout moment depuis son compte ; vous pouvez aussi le demander à contact@rodiclub.com.",
    ],
    minors: "Politique relative aux mineurs",
    privacy: "Politique de confidentialité",
    approve: "J'autorise",
    decline: "Je n'autorise pas",
    record: "Votre réponse est enregistrée avec la date, l'adresse IP et le navigateur comme preuve.",
    approved: "Merci. Le compte est autorisé et peut désormais utiliser RODI Club avec les restrictions pour les mineurs.",
    declined: "Nous avons enregistré votre refus. Le compte reste en pause, sans accès aux fonctions du Club.",
    expired: "Ce lien a expiré. Demandez au mineur d'envoyer une nouvelle demande depuis son compte.",
    invalid: "Ce lien n'est pas valide ou a été remplacé par un plus récent.",
  },
  it: {
    title: "Autorizzazione del genitore o tutore",
    intro: "Una persona tra i 15 e i 17 anni ha creato un account RODI Club e ha indicato questo indirizzo come quello del genitore o tutore legale. Il suo account resta in pausa finché non rispondi.",
    whatTitle: "Che cos'è l'account",
    what: "RODI Club è lo spazio dei membri di RODI. Serve a pianificare viaggi (itinerario, budget, bagagli e documenti), salvare destinazioni, tenere un passaporto dei paesi visitati e leggere la community del Club.",
    dataTitle: "Quali dati trattiamo",
    data: [
      "Nome e indirizzo email dell'account.",
      "Anno di nascita e fascia d'età (mai la data completa).",
      "Ciò che il minore salva nei suoi viaggi: itinerari, liste, spese, link a documenti, contatti di emergenza e diario.",
      "La prova dell'accettazione dei termini e di questa autorizzazione: data, indirizzo IP e browser.",
    ],
    rulesTitle: "Restrizioni per i minori",
    rules: [
      "Può leggere la community, ma non pubblicare né rispondere.",
      "Non riceve mai email di marketing, anche se lo chiede.",
      "Può scaricare o eliminare tutti i suoi dati in qualsiasi momento dal suo account; puoi chiederlo anche tu scrivendo a contact@rodiclub.com.",
    ],
    minors: "Politica sui minori",
    privacy: "Informativa sulla privacy",
    approve: "Autorizzo",
    decline: "Non autorizzo",
    record: "La tua risposta viene registrata con data, indirizzo IP e browser come prova.",
    approved: "Grazie. L'account è autorizzato e può usare RODI Club con le restrizioni per i minori.",
    declined: "Abbiamo registrato che non autorizzi l'account. Resterà in pausa, senza accesso alle funzioni del Club.",
    expired: "Questo link è scaduto. Chiedi al minore di inviare una nuova richiesta dal suo account.",
    invalid: "Questo link non è valido o è stato sostituito da uno più recente.",
  },
} as const;
type Lang = keyof typeof TEXT;
type Status = "pending" | "approved" | "declined" | "expired" | "invalid";

const langOf = (v: string | null | undefined): Lang => (v && v in TEXT ? (v as Lang) : "es");
const storefront = () => (process.env.STOREFRONT_URL || "https://rodiclub.com").replace(/\/$/, "");

export const meta: MetaFunction = () => [{ title: "RODI Club" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const consent = await findGuardianConsent(token);
  let status: Status = "invalid";
  if (consent) status = consent.status === "pending" && consent.expiresAt < new Date() ? "expired" : (consent.status as Status);
  return { status, lang: langOf(consent?.locale), store: storefront() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const intent = String((await request.formData()).get("intent") ?? "");
  if (intent !== "approve" && intent !== "decline") return { status: "invalid" as Status, lang: "es" as Lang };
  const { result, locale } = await decideGuardian(token, intent, { ip: clientIp(request), userAgent: clientUserAgent(request) });
  return { status: result as Status, lang: langOf(locale) };
};

export default function GuardianConsentPage() {
  const loaded = useLoaderData<typeof loader>();
  const acted = useActionData<typeof action>();
  const { search } = useLocation();
  const busy = useNavigation().state !== "idle";
  const status = acted?.status ?? loaded.status;
  const t = TEXT[acted?.lang ?? loaded.lang];

  const ink = "#1C1B1A";
  const page: React.CSSProperties = { minHeight: "100vh", margin: 0, background: "#F6F2EA", color: ink, padding: "8vh 20px 10vh", boxSizing: "border-box" };
  const card: React.CSSProperties = { maxWidth: 560, margin: "0 auto", fontFamily: "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 15, lineHeight: 1.65 };
  const h1: React.CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 38, lineHeight: 1.1, margin: "0 0 18px" };
  const h2: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase", color: "#7A6038", margin: "28px 0 8px" };
  const btn = (dark: boolean): React.CSSProperties => ({
    background: dark ? ink : "transparent", color: dark ? "#F5F1EA" : ink, border: `1px solid ${ink}`, borderRadius: 999,
    padding: "14px 30px", fontSize: 13, letterSpacing: 1.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit",
  });
  const muted = { color: "#6B6A66" };
  const link = { color: ink };

  return (
    <div style={page}>
      <style>{"body{margin:0;background:#F6F2EA}"}</style>
      <div style={card}>
        <p style={{ ...muted, fontSize: 12, letterSpacing: 1.5, margin: "0 0 10px" }}>RODI Club</p>
        <h1 style={h1}>{t.title}</h1>
        {status === "pending" ? (
          <>
            <p>{t.intro}</p>
            <h2 style={h2}>{t.whatTitle}</h2>
            <p style={{ margin: 0 }}>{t.what}</p>
            <h2 style={h2}>{t.dataTitle}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{t.data.map((d) => <li key={d}>{d}</li>)}</ul>
            <h2 style={h2}>{t.rulesTitle}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{t.rules.map((d) => <li key={d}>{d}</li>)}</ul>
            <p style={{ marginTop: 22 }}>
              <a href={`${loaded.store}/pages/minors-policy`} style={link} target="_blank" rel="noreferrer">{t.minors}</a>
              {" · "}
              <a href={`${loaded.store}/pages/privacy`} style={link} target="_blank" rel="noreferrer">{t.privacy}</a>
            </p>
            <Form method="post" action={`/legal/guardian${search}`} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
              <button type="submit" name="intent" value="approve" disabled={busy} style={btn(true)}>{t.approve}</button>
              <button type="submit" name="intent" value="decline" disabled={busy} style={btn(false)}>{t.decline}</button>
            </Form>
            <p style={{ ...muted, fontSize: 12, marginTop: 18 }}>{t.record}</p>
          </>
        ) : (
          <>
            <p>{t[status]}</p>
            {status !== "invalid" && (
              <p style={{ marginTop: 22 }}>
                <a href={`${loaded.store}/pages/minors-policy`} style={link}>{t.minors}</a>
                {" · "}
                <a href={`${loaded.store}/pages/privacy`} style={link}>{t.privacy}</a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
