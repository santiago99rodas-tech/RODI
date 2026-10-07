import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { backupDir, createBackup, databaseBytes, listBackups } from "../backup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {
    dir: backupDir(),
    dbBytes: databaseBytes(),
    enabled: process.env.BACKUP_ENABLED !== "false",
    hours: Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS) || 6),
    backups: listBackups(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  try {
    const b = await createBackup();
    return { ok: true as const, name: b.name };
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

  useEffect(() => {
    if (!fetcher.data) return;
    shopify.toast.show(fetcher.data.ok ? `Backup created: ${fetcher.data.name}` : `Backup failed: ${fetcher.data.error}`, { isError: !fetcher.data.ok });
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
          persistent volume as the database, so also copy them (or back up the volume) somewhere off the server.
        </s-paragraph>
      </s-section>
      <s-section heading={`Snapshots (${data.backups.length})`}>
        {data.backups.length === 0 ? (
          <s-paragraph>No snapshots yet. The first one is taken a couple of minutes after the app starts.</s-paragraph>
        ) : (
          data.backups.map((b) => (
            <s-paragraph key={b.name}>
              {b.name} — {kb(b.bytes)} — {new Date(b.createdAt).toLocaleString()}
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
