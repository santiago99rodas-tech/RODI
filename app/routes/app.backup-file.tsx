import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { backupDir, listBackups } from "../backup.server";

// Resource route (no UI): streams one snapshot to the signed-in admin so it can be kept off the server.
// Only names that exist in the backups folder are served, so ?name= can't reach any other file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!listBackups().some((b) => b.name === name)) return new Response("Not found", { status: 404 });
  const file = path.join(backupDir(), name);
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": name.endsWith(".gz") ? "application/gzip" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(fs.statSync(file).size),
    },
  });
};
