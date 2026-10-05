// Matches the country image files in ../../New Assets (Spanish names, e.g. "Albania_rodi.png") to the 199 country codes.
//   node match-countries.cjs        prints the match table, duplicates and missing countries
// Also exported as load() for process-countries.cjs.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const DIR = path.join(__dirname, "..", "..", "New Assets");
const ts = fs.readFileSync(path.join(__dirname, "..", "app", "nationalities.ts"), "utf8");
const countries = [...ts.matchAll(/"code": "([A-Z]{2})",\s*"name": "([^"]+)"/g)].map((m) => ({ code: m[1], en: m[2] }));
countries.push({ code: "EH", en: "Western Sahara" }); // created after the 199-nationality list (a territory, not a passport)
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const es = new Intl.DisplayNames(["es"], { type: "region" });
// Spanish name (normalized) -> country. Include common short forms and the CLDR names.
const index = new Map();
const put = (name, c) => { const k = norm(name); if (k && !index.has(k)) index.set(k, c); };
for (const c of countries) { put(es.of(c.code), c); put(c.en, c); }
const ALIAS = { "bosnia": "BA", "brasil": "BR", "republica checa": "CZ", "chequia": "CZ", "estados unidos": "US", "eeuu": "US", "reino unido": "GB", "corea del sur": "KR", "corea del norte": "KP", "emiratos arabes": "AE", "costa de marfil": "CI", "rd congo": "CD", "republica democratica del congo": "CD", "congo": "CG", "birmania": "MM", "myanmar": "MM", "timor oriental": "TL", "palestina": "PS", "vaticano": "VA", "turquia": "TR", "turkiye": "TR", "eswatini": "SZ", "suazilandia": "SZ", "cabo verde": "CV", "nueva zelanda": "NZ", "sudafrica": "ZA", "arabia saudita": "SA", "arabia saudi": "SA", "paises bajos": "NL", "holanda": "NL", "macedonia del norte": "MK", "macedonia": "MK", "rusia": "RU", "siria": "SY", "laos": "LA", "vietnam": "VN", "taiwan": "TW", "bielorrusia": "BY", "congo rd": "CD", "eau": "AE" };
for (const [k, code] of Object.entries(ALIAS)) { const c = countries.find((x) => x.code === code); if (c) index.set(k, c); }

async function load() {
  const files = fs.readdirSync(DIR).filter((f) => !/^(Banner_|Chapter_|Inicio_|banner_|inicio_)/.test(f) && /\.(png|jpe?g|webp)$/i.test(f));
  const rows = [], bad = [], seen = new Map();
  for (const f of files.sort()) {
    const base = f.replace(/\.[a-z]+$/i, "").replace(/_?rodi$/i, "").replace(/_/g, " ");
    const c = index.get(norm(base));
    const m = await sharp(path.join(DIR, f)).metadata();
    if (!c) { bad.push({ file: f, why: `SIN PAÍS (nombre leído: "${base}")` }); continue; }
    if (seen.has(c.code)) bad.push({ file: f, why: `DUPLICADO de ${seen.get(c.code)} (${c.en})` });
    seen.set(c.code, f);
    rows.push({ file: f, code: c.code, en: c.en, width: m.width, height: m.height, kb: Math.round(fs.statSync(path.join(DIR, f)).size / 1024) });
  }
  const missing = countries.filter((c) => !seen.has(c.code));
  return { DIR, files, rows, bad, missing, total: countries.length };
}

module.exports = { load };

if (require.main === module) {
  load().then(({ files, rows, bad, missing, total }) => {
    console.log(`archivos de país: ${files.length} | emparejados: ${rows.length} | problemas: ${bad.length}`);
    rows.forEach((r) => console.log(`  ${r.file.padEnd(34)} -> ${r.code} ${r.en.padEnd(24)} ${r.width}x${r.height} (${(r.width / r.height).toFixed(2)}) ${r.kb}KB`));
    bad.forEach((r) => console.log(`  ⚠ ${r.file} -> ${r.why}`));
    missing.forEach((c) => console.log(`  falta: ${c.code} ${c.en}`));
    console.log(`\nfaltan ${missing.length} de ${total} países`);
  });
}
