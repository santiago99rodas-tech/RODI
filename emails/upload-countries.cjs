// Uploads the country WebP files (from process-countries.cjs) to Shopify Files and sets each country's "hero_image".
//   node upload-countries.cjs <webpDir> <countries.json>
// countries.json = output of a `metaobjects(type:"country")` query (fields incl. iso_code). Resumable: progress is kept in <webpDir>/state.json.
// Needs the CLI store auth to include read_files, write_files, read/write_metaobjects.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = path.resolve(process.argv[2]);
const COUNTRIES = path.resolve(process.argv[3]);
const STORE = "fjhcns-wy.myshopify.com";
const STATE = path.join(DIR, "state.json");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "up-"));

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const raw = JSON.parse(fs.readFileSync(COUNTRIES, "utf8"));
const nodes = (raw.metaobjects || raw.data.metaobjects).nodes;
const byIso = new Map(nodes.map((n) => [Object.fromEntries(n.fields.map((f) => [f.key, f.value])).iso_code.toUpperCase(), n]));
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

function gql(query, variables, mutate) {
  const q = path.join(tmp, "q.graphql");
  const out = path.join(tmp, "out.json");
  fs.writeFileSync(q, query);
  const args = ["store", "execute", "-s", STORE, "--query-file", q, "--output-file", out];
  if (variables) { const v = path.join(tmp, "v.json"); fs.writeFileSync(v, JSON.stringify(variables)); args.push("--variable-file", v); }
  if (mutate) args.push("--allow-mutations");
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const r = spawnSync("shopify", args, { shell: true, encoding: "utf8", maxBuffer: 1 << 26 });
  if (!fs.existsSync(out)) throw new Error("CLI failed: " + (r.stdout || "").slice(-1500) + (r.stderr || "").slice(-500));
  const j = JSON.parse(fs.readFileSync(out, "utf8"));
  return j.data || j;
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const items = manifest.filter((m) => byIso.has(m.code)).map((m) => ({ ...m, mo: byIso.get(m.code).id }));
  console.log(`${items.length} countries to process (${manifest.length - items.length} without a store country)`);
  for (const it of items) state[it.code] = state[it.code] || {};

  // 1) staged upload targets + the file bytes
  for (const batch of chunk(items.filter((i) => !state[i.code].uploaded), 40)) {
    const d = gql(
      `mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`,
      { input: batch.map((i) => ({ filename: `rodi-country-${i.code.toLowerCase()}.webp`, mimeType: "image/webp", httpMethod: "POST", resource: "FILE", fileSize: String(fs.statSync(path.join(DIR, i.file)).size) })) },
      true,
    ).stagedUploadsCreate;
    if (d.userErrors.length) throw new Error(JSON.stringify(d.userErrors));
    for (let k = 0; k < batch.length; k++) {
      const t = d.stagedTargets[k];
      const form = new FormData();
      for (const p of t.parameters) form.append(p.name, p.value);
      form.append("file", new Blob([fs.readFileSync(path.join(DIR, batch[k].file))], { type: "image/webp" }), `rodi-country-${batch[k].code.toLowerCase()}.webp`);
      const res = await fetch(t.url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`upload ${batch[k].code} failed: ${res.status} ${await res.text()}`);
      state[batch[k].code].resourceUrl = t.resourceUrl;
      state[batch[k].code].uploaded = true;
    }
    save();
    console.log("uploaded bytes:", Object.values(state).filter((s) => s.uploaded).length);
  }

  // 2) create the File records
  for (const batch of chunk(items.filter((i) => !state[i.code].fileId), 40)) {
    const d = gql(
      `mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id } userErrors{ field message code } } }`,
      { files: batch.map((i) => ({ originalSource: state[i.code].resourceUrl, contentType: "IMAGE", alt: `${i.name} — RODI Club` })) },
      true,
    ).fileCreate;
    if (d.userErrors.length) throw new Error(JSON.stringify(d.userErrors));
    batch.forEach((i, k) => (state[i.code].fileId = d.files[k].id));
    save();
    console.log("files created:", Object.values(state).filter((s) => s.fileId).length);
  }

  // 3) wait until Shopify finished processing every image
  for (let round = 0; round < 40; round++) {
    const pending = items.filter((i) => !state[i.code].ready);
    if (!pending.length) break;
    let failed = [];
    for (const batch of chunk(pending, 100)) {
      const d = gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage { id fileStatus fileErrors{ message } } } }`, { ids: batch.map((i) => state[i.code].fileId) });
      for (const n of d.nodes) {
        const it = batch.find((i) => state[i.code].fileId === n.id);
        if (n.fileStatus === "READY") state[it.code].ready = true;
        else if (n.fileStatus === "FAILED") failed.push(`${it.code}: ${JSON.stringify(n.fileErrors)}`);
      }
    }
    save();
    if (failed.length) throw new Error("file processing failed: " + failed.join("; "));
    const left = items.filter((i) => !state[i.code].ready).length;
    console.log("processing, pending:", left);
    if (left) await sleep(8000);
  }

  // 4) point each country at its image
  for (const batch of chunk(items.filter((i) => state[i.code].ready && !state[i.code].linked), 25)) {
    const body = batch.map((i, k) => `m${k}: metaobjectUpdate(id:${JSON.stringify(i.mo)}, metaobject:{fields:[{key:"hero_image", value:${JSON.stringify(state[i.code].fileId)}}]}){ userErrors{ field message } }`).join("\n");
    const d = gql(`mutation{ ${body} }`, null, true);
    batch.forEach((i, k) => {
      const e = d[`m${k}`].userErrors;
      if (e.length) console.log("ERROR", i.code, JSON.stringify(e)); else state[i.code].linked = true;
    });
    save();
    console.log("linked:", Object.values(state).filter((s) => s.linked).length);
  }
  const done = items.filter((i) => state[i.code].linked).length;
  console.log(`DONE ${done}/${items.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
