// Converts the finished artwork in ../../New Assets into optimized WebP files in ../../shopify-theme/assets.
//   node process-new-assets.cjs
// Banners are cropped to exactly 3:1 around the centre (the page hero band is 3:1); nothing is upscaled.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "..", "New Assets");
const OUT = path.join(__dirname, "..", "..", "shopify-theme", "assets");

// Banner file -> asset name suffix
const BANNERS = {
  Alertas: "alertas", Beneficios: "beneficios", Calculadoradeviaje: "calculadora", Destinos: "destinos", Exportarviaje: "exportar",
  Guardados: "guardados", Itinerario: "itinerario", Midiario: "mi-diario", Misservicios: "mis-servicios", Misviajes: "mis-viajes",
  Modoemergencia: "emergencia", Packing: "packing", Pasaporte: "pasaporte", Perfil: "perfil", PreguntaalClub: "ask", Presupuesto: "presupuesto",
  Recomendaciones: "recomendaciones", Servicios: "servicios", Splitdegastos: "split",
};

const jobs = [];
for (const [name, slug] of Object.entries(BANNERS)) jobs.push({ src: `Banner_${name}_rodi.png`, out: `rodi-banner-${slug}.webp`, ratio: 3, q: 80 });
for (let i = 1; i <= 9; i++) jobs.push({ src: `Chapter_${i}-9_rodi.png`, out: `rodi-chapter-${i}.webp`, q: 82 });
for (let i = 1; i <= 3; i++) jobs.push({ src: `Inicio_Journal (tarjeta ${i})_rodi.png`, out: `rodi-journal-${i}.webp`, q: 82 });
jobs.push({ src: "inicio_hero-rodi.png", out: "rodi-home-hero.webp", q: 80 });
jobs.push({ src: "inicio_manifiesto_rodi.png", out: "rodi-manifesto.webp", q: 82 });
jobs.push({ src: "banner_delcarrito_rodi.png", out: "rodi-cart-banner.webp", q: 80 });

(async () => {
  let before = 0;
  let after = 0;
  for (const j of jobs) {
    const input = path.join(SRC, j.src);
    if (!fs.existsSync(input)) { console.log("MISSING", j.src); continue; }
    const meta = await sharp(input).metadata();
    let img = sharp(input);
    if (j.ratio) {
      const h = Math.round(meta.width / j.ratio);
      if (h < meta.height) img = img.extract({ left: 0, top: Math.round((meta.height - h) / 2), width: meta.width, height: h });
    }
    const dest = path.join(OUT, j.out);
    await img.webp({ quality: j.q, effort: 5 }).toFile(dest);
    before += fs.statSync(input).size;
    after += fs.statSync(dest).size;
    const m = await sharp(dest).metadata();
    console.log(j.out.padEnd(34), `${m.width}x${m.height}`.padEnd(10), Math.round(fs.statSync(dest).size / 1024) + " KB");
  }
  console.log(`\n${jobs.length} files: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
})().catch((e) => { console.error(e); process.exit(1); });
