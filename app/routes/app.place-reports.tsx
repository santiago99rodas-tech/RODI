import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { REPORT_STATUSES } from "../place-report.server";

// "Is it closed?" notices from members about suggested places, grouped by place. Confirm a closure here, then remove the
// place from the theme data (acts/*.json -> rodi-acts-*.js) and mark the group as removed; or mark it as still open.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rows = await db.placeReport.findMany({ where: { shop: session.shop, status: "new" }, orderBy: { createdAt: "desc" }, take: 1000 });
  const groups = new Map<string, { key: string; name: string; city: string; country: string; count: number; last: Date }>();
  for (const r of rows) {
    const key = `${r.city}|${r.norm}`;
    const g = groups.get(key);
    if (g) { g.count++; if (r.createdAt > g.last) g.last = r.createdAt; } else groups.set(key, { key, name: r.name, city: r.city, country: r.country, count: 1, last: r.createdAt });
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime());
  const [removed, dismissed] = await Promise.all([
    db.placeReport.count({ where: { shop: session.shop, status: "removed" } }),
    db.placeReport.count({ where: { shop: session.shop, status: "dismissed" } }),
  ]);
  return { list, removed, dismissed };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const status = String(form.get("status") ?? "");
  const key = String(form.get("key") ?? "");
  if (!(REPORT_STATUSES as readonly string[]).includes(status) || status === "new") return { error: "Estado no válido" };
  const [city, norm] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
  await db.placeReport.updateMany({ where: { shop: session.shop, status: "new", city, norm }, data: { status } });
  return { ok: true };
};

export default function PlaceReports() {
  const { list, removed, dismissed } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Avisos de lugares cerrados">
      <s-section heading={`Por revisar (${list.length})`}>
        <s-paragraph>
          Avisos de viajeros: «este lugar sugerido está cerrado». Confírmalo (por ejemplo con una búsqueda) y, si es cierto, quita el lugar de los datos del tema y márcalo como quitado. Revisados hasta ahora: {removed} quitados, {dismissed} que siguen abiertos.
        </s-paragraph>
        {list.length === 0 ? (
          <s-paragraph>No hay avisos pendientes.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {list.map((g) => (
              <s-box key={g.key} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-text fontWeight="bold">{g.name}</s-text>
                  <s-text tone="neutral">
                    {g.city || "sin ciudad"}{g.country ? ` · ${g.country}` : ""} · {g.count} {g.count === 1 ? "aviso" : "avisos"} · último {new Date(g.last).toLocaleDateString("es-CO")}
                  </s-text>
                  <s-stack direction="inline" gap="base">
                    <s-button variant="primary" onClick={() => fetcher.submit({ key: g.key, status: "removed" }, { method: "POST" })}>
                      Ya lo quité de los datos
                    </s-button>
                    <s-button onClick={() => fetcher.submit({ key: g.key, status: "dismissed" }, { method: "POST" })}>
                      Sigue abierto
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
