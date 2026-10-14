import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { backupDir, createBackup, databaseBytes, lastOffsiteStatus, listBackups, offsiteConfig } from "../backup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {
    dir: backupDir(),
    dbBytes: databaseBytes(),
    enabled: process.env.BACKUP_ENABLED !== "false",
    hours: Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS) || 6),
    backups: listBackups(),
    offsite: offsiteConfig() ? { bucket: offsiteConfig()!.bucket, last: lastOffsiteStatus() } : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  try {
    const b = await createBackup();
    return { ok: true as const, name: b.name, offsite: b.offsite ?? null };
  } catch (e) {
    return { ok: false as const, error: String((e as Error).message ?? e) };
  }
};

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Backups() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const running = ["loading", "submitting"].includes(fetcher.state);

  // The download is a plain fetch with the app's session token, saved as a file from the browser.
  const download = async (name: string) => {
    try {
      const token = await shopify.idToken();
      const res = await fetch(`/app/backup-file?name=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      shopify.toast.show(`Falló la descarga: ${(e as Error).message}`, { isError: true });
    }
  };

  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data;
    const off = d.ok && d.offsite ? (d.offsite.ok ? " (también se subió fuera del servidor)" : ` (FALLÓ la subida fuera del servidor: ${d.offsite.error})`) : "";
    shopify.toast.show(d.ok ? `Respaldo creado: ${d.name}${off}` : `Falló el respaldo: ${d.error}`, { isError: !d.ok || (!!d.offsite && !d.offsite.ok) });
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Respaldos de la base de datos">
      <s-button slot="primary-action" onClick={() => fetcher.submit({}, { method: "POST" })} disabled={running}>
        {running ? "Respaldando…" : "Respaldar ahora"}
      </s-button>
      <s-section heading="Estado">
        <s-paragraph>
          Copias automáticas: {data.enabled ? `cada ${data.hours} horas, más una poco después de cada inicio o despliegue` : "DESACTIVADAS (BACKUP_ENABLED=false)"}.
        </s-paragraph>
        <s-paragraph>Tamaño de la base de datos: {data.dbBytes == null ? "desconocido" : kb(data.dbBytes)}. Guardadas en: {data.dir}</s-paragraph>
        <s-paragraph>
          Retención: las 8 copias más recientes más la más reciente de cada uno de los últimos 30 días. Las copias viven en el mismo
          volumen persistente que la base de datos, así que una copia fuera del servidor es lo que te protege si se pierde el servidor o el volumen.
        </s-paragraph>
        <s-paragraph>
          Copia fuera del servidor:{" "}
          {data.offsite
            ? data.offsite.last
              ? data.offsite.last.ok
                ? `ACTIVA (bucket ${data.offsite.bucket}). Última subida ${new Date(data.offsite.last.at).toLocaleString("es-CO")}: ${data.offsite.last.name}`
                : `ACTIVA pero la última subida FALLÓ (${data.offsite.last.error})`
              : `ACTIVA (bucket ${data.offsite.bucket}). No se ha subido nada desde el último inicio; la próxima copia sí se subirá.`
            : "DESACTIVADA. Define las variables BACKUP_S3_* para subir cada copia a un bucket, o descarga las copias a mano abajo."}
        </s-paragraph>
      </s-section>
      <s-section heading={`Copias (${data.backups.length})`}>
        {data.backups.length === 0 ? (
          <s-paragraph>Aún no hay copias. La primera se toma un par de minutos después de que la app inicia.</s-paragraph>
        ) : (
          data.backups.map((b) => (
            <s-paragraph key={b.name}>
              {b.name} — {kb(b.bytes)} — {new Date(b.createdAt).toLocaleString("es-CO")}{" "}
              <s-button variant="tertiary" onClick={() => download(b.name)}>
                Descargar
              </s-button>
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="Cómo restaurar">
        <s-paragraph>
          Detén el servicio, abre una consola en él y ejecuta: node scripts/restore-backup.mjs &lt;nombre del archivo de la copia&gt;. La base
          de datos actual se conserva como dev.sqlite.before-restore-&lt;hora&gt;. Luego vuelve a iniciar el servicio.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
