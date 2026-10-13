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
      shopify.toast.show(`Download failed: ${(e as Error).message}`, { isError: true });
    }
  };

  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data;
    const off = d.ok && d.offsite ? (d.offsite.ok ? " (also uploaded off-server)" : ` (off-server upload FAILED: ${d.offsite.error})`) : "";
    shopify.toast.show(d.ok ? `Backup created: ${d.name}${off}` : `Backup failed: ${d.error}`, { isError: !d.ok || (!!d.offsite && !d.offsite.ok) });
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Database backups">
      <s-button slot="primary-action" onClick={() => fetcher.submit({}, { method: "POST" })} disabled={running}>
        {running ? "Backing up…" : "Back up now"}
      </s-button>
      <s-section heading="Status">
        <s-paragraph>
          Automatic snapshots: {data.enabled ? `every ${data.hours} hours, plus one shortly after every start or deploy` : "OFF (BACKUP_ENABLED=false)"}.
        </s-paragraph>
        <s-paragraph>Database size: {data.dbBytes == null ? "unknown" : kb(data.dbBytes)}. Stored in: {data.dir}</s-paragraph>
        <s-paragraph>
          Retention: the 8 newest snapshots plus the newest one of each of the last 30 days. Snapshots live in the same
          persistent volume as the database, so a copy off the server is what protects you if the server or the volume is lost.
        </s-paragraph>
        <s-paragraph>
          Off-server copy:{" "}
          {data.offsite
            ? data.offsite.last
              ? data.offsite.last.ok
                ? `ON (bucket ${data.offsite.bucket}). Last upload ${new Date(data.offsite.last.at).toLocaleString()}: ${data.offsite.last.name}`
                : `ON but the last upload FAILED (${data.offsite.last.error})`
              : `ON (bucket ${data.offsite.bucket}). Nothing uploaded since the last start; the next snapshot will be.`
            : "OFF. Set the BACKUP_S3_* variables to upload every snapshot to a bucket, or download snapshots below by hand."}
        </s-paragraph>
      </s-section>
      <s-section heading={`Snapshots (${data.backups.length})`}>
        {data.backups.length === 0 ? (
          <s-paragraph>No snapshots yet. The first one is taken a couple of minutes after the app starts.</s-paragraph>
        ) : (
          data.backups.map((b) => (
            <s-paragraph key={b.name}>
              {b.name} — {kb(b.bytes)} — {new Date(b.createdAt).toLocaleString()}{" "}
              <s-button variant="tertiary" onClick={() => download(b.name)}>
                Download
              </s-button>
            </s-paragraph>
          ))
        )}
      </s-section>
      <s-section heading="How to restore">
        <s-paragraph>
          Stop the service, open a console on it and run: node scripts/restore-backup.mjs &lt;snapshot file name&gt;. The current
          database is kept as dev.sqlite.before-restore-&lt;time&gt;. Then start the service again.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
