// Converts the country photos in ../../New Assets to optimized WebP (3:2, never upscaled), one per country.
//   node process-countries.cjs <outDir>      writes <outDir>/<iso>.webp and <outDir>/manifest.json
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { load } = require("./match-countries.cjs");

const OUT = path.resolve(process.argv[2] || path.join(__dirname, "country-webp"));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { DIR, rows, bad } = await load();
  const manifest = [];
  let before = 0, after = 0, over = [];
  for (const r of rows) {
    const input = path.join(DIR, r.file);
    let img = sharp(input);
    // 16:9 sources are cropped around the centre to 3:2; 3:2 sources are untouched.
    const w = r.width, h = r.height;
    if (Math.abs(w / h - 1.5) > 0.01) {
      const nw = w / h > 1.5 ? Math.round(h * 1.5) : w;
      const nh = w / h > 1.5 ? h : Math.round(w / 1.5);
      img = img.extract({ left: Math.round((w - nw) / 2), top: Math.round((h - nh) / 2), width: nw, height: nh });
    }
    const dest = path.join(OUT, `${r.code.toLowerCase()}.webp`);
    let q = 80;
    let info;
    for (; q >= 62; q -= 6) {
      info = await img.clone().webp({ quality: q, effort: 5 }).toFile(dest);
      if (info.size <= 350 * 1024) break;
    }
    before += r.kb * 1024; after += info.size;
    if (info.size > 350 * 1024) over.push(`${r.code} ${Math.round(info.size / 1024)}KB`);
    manifest.push({ code: r.code, name: r.en, source: r.file, file: path.basename(dest), width: info.width, height: info.height, kb: Math.round(info.size / 1024), quality: q });
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`${manifest.length} files | ${(before / 1048576).toFixed(0)} MB -> ${(after / 1048576).toFixed(1)} MB | max ${Math.max(...manifest.map((m) => m.kb))} KB | avg ${Math.round(manifest.reduce((a, m) => a + m.kb, 0) / manifest.length)} KB`);
  if (over.length) console.log("over 350KB:", over.join(", "));
  if (bad.length) console.log("not processed:", bad.map((b) => b.file).join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
