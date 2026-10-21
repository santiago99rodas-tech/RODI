import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { TEST_ACCOUNTS, listTestAccounts, resetTestAccount } from "../test-accounts.server";

// Owner-only tool: wipes the Club data of the three test accounts so the Club can be tried again from zero.
// The accounts are fixed in test-accounts.server.ts; nothing here can reach a real member.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return { accounts: await listTestAccounts(admin, session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  if (String(form.get("confirm") || "").trim().toUpperCase() !== "BORRAR") return { error: "Escribe BORRAR para confirmar." } as const;
  const keep = form.get("keep") === "on";
  const picked = (TEST_ACCOUNTS as readonly string[]).filter((e) => form.get(`acct:${e}`) === "on");
  if (!picked.length) return { error: "Marca al menos una cuenta." } as const;
  const results = [];
  for (const email of picked) results.push(await resetTestAccount(admin, session.shop, email, keep));
  return { results } as const;
};

const LABELS: Record<string, string> = { trips: "viajes", documents: "documentos", contacts: "contactos de emergencia", journal: "páginas del diario", calc: "cálculos", community: "publicaciones", travel: "países marcados", saves: "países guardados", reports: "avisos de lugares" };

export default function ResetTestAccounts() {
  const { accounts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const results = data && "results" in data ? data.results : null;
  return (
    <s-page heading="Reiniciar cuentas de prueba">
      <s-section heading="Dejar las cuentas de prueba en blanco">
        <s-paragraph>
          Borra todo lo del Club de estas tres cuentas (viajes, documentos, contactos, diario, cálculos, publicaciones, sellos y países guardados,
          invitaciones, aceptación de los términos y datos del perfil) para volver a probar desde cero. La cuenta de Shopify (correo, nombre) se queda.
          <strong> No se puede deshacer.</strong> Solo funciona con estas cuentas; ninguna otra se puede tocar desde aquí.
        </s-paragraph>
        <fetcher.Form method="post">
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0" }}>
            <thead><tr><th align="left"></th><th align="left">Cuenta</th><th align="left">Plan ahora</th><th align="left">Lo que se borraría</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.email} style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: "8px 8px 8px 0" }}>{a.customerId ? <input type="checkbox" name={`acct:${a.email}`} defaultChecked aria-label={a.email} /> : null}</td>
                  <td style={{ padding: 8 }}><b>{a.email}</b><br />{a.customerId ? a.name || "" : "No existe en Shopify"}</td>
                  <td style={{ padding: 8 }}>{a.membership}</td>
                  <td style={{ padding: 8 }}>{a.customerId ? (Object.entries(a.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LABELS[k] || k}`).join(" · ") || "Nada: ya está en blanco") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><label><input type="checkbox" name="keep" defaultChecked /> Conservar el plan de cada cuenta (Free o Club y su fecha) después de borrar</label></p>
          <p><label>Para confirmar, escribe <b>BORRAR</b>: <input type="text" name="confirm" autoComplete="off" style={{ marginLeft: 8, padding: 6 }} /></label></p>
          <button type="submit" disabled={busy} style={{ padding: "10px 18px", background: "#8a1c1c", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" }}>{busy ? "Borrando…" : "Borrar los datos de las cuentas marcadas"}</button>
        </fetcher.Form>
        {data && "error" in data ? <p role="alert" style={{ color: "#8a1c1c" }}>{data.error}</p> : null}
        {results ? (
          <div role="status" style={{ marginTop: 16 }}>
            <b>Listo.</b>
            <ul>{results.map((r) => <li key={r.email}>{r.email}: {r.ok ? "en blanco" : "no se pudo"}{r.problems.length ? ` (avisos: ${r.problems.join("; ")})` : ""}</li>)}</ul>
          </div>
        ) : null}
      </s-section>
    </s-page>
  );
}
