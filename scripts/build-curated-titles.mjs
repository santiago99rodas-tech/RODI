// Builds app/curated-titles.generated.json from the theme: the names of the places RODI suggests (assets/rodi-acts-*.js) and the
// generic titles the itinerary writes itself (arrival, transfer, flights, "lunch in X"...: the strings of the plan, itin2 and calc2 locale groups,
// English and Spanish). The planner uses it to tell an activity RODI suggested from text a Free member typed and marked as "suggested".
// Run it again whenever the curated data or those texts change:  node scripts/build-curated-titles.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const theme = path.resolve(here, "..", "..", "shopify-theme");
const out = path.resolve(here, "..", "app", "curated-titles.generated.json");

// same normalization as app/curated-titles.server.ts
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- places
const names = new Set();
const g = { window: {} };
for (let k = 1; k <= 20; k++) {
  const f = path.join(theme, "assets", `rodi-acts-${k}.js`);
  if (!fs.existsSync(f)) continue;
  delete g.window.RODI_ACTS;
  new Function("window", fs.readFileSync(f, "utf8"))(g.window);
  for (const country of Object.values(g.window.RODI_ACTS || {})) for (const city of Object.values(country)) for (const it of city) if (it && it[0]) names.add(norm(it[0]));
}

// ---- generic titles
const patterns = new Set();
const walk = (o) => { if (typeof o === "string") { add(o); } else if (o && typeof o === "object") Object.values(o).forEach(walk); };
function add(s) {
  const lit = norm(s).replace(/\{\w+\}/g, "");
  if (!/[a-z]{3,}/.test(lit) || lit.replace(/\s/g, "").length < 4 || s.length > 160) return; // a generic title needs a literal word of its own
  const parts = norm(s).split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? ".{1,80}?" : escapeRe(p)));
  patterns.add(parts.join(""));
}
for (const f of ["en.default.json", "es.json"]) {
  const d = JSON.parse(fs.readFileSync(path.join(theme, "locales", f), "utf8"));
  for (const group of ["plan", "itin2", "calc2"]) walk(d.rodi[group]);
}

const data = { names: [...names].sort(), patterns: [...patterns].sort() };
fs.writeFileSync(out, JSON.stringify(data) + "\n");
console.log("places:", data.names.length, "generic patterns:", data.patterns.length, "bytes:", fs.statSync(out).size);
