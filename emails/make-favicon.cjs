// Builds the favicons from the vector "R" isotype (../../rodi2-negro.svg):
//   rodi-favicon.svg           transparent background, white R in dark mode / dark R in light mode (Chrome, Edge, Firefox)
//   rodi-favicon.png           512x512 fallback for browsers without SVG favicons: dark R on ivory (readable on any tab)
//   rodi-apple-touch-icon.png  180x180, same as the fallback (iOS fills transparency with black, so it cannot be transparent)
//   rodi-favicon-preview.png   side-by-side preview at 16/32/64 px on light and dark tab colours (not published)
//   node make-favicon.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "..", "rodi2-negro.svg");
const OUT = path.join(__dirname, "..", "..", "shopify-theme", "assets");
const IVORY = "#F5F1EA";
const INK = "#1C1B1A";

const svg = fs.readFileSync(SRC, "utf8");
const dAttrs = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
if (!dAttrs.length) throw new Error("no path found in the isotype");
const paths = (fill) => dAttrs.map((d) => `<path fill="${fill}" d="${d}"/>`).join("");

// The R is 815 x 1051 (portrait). A square canvas that fits it with ~4% margin so it reads at 16 px.
const W = 815.69;
const H = 1051.36;
const S = Math.round(H * 1.08);
const VIEWBOX = `${((W - S) / 2).toFixed(1)} ${((H - S) / 2).toFixed(1)} ${S} ${S}`;

const flat = (fill, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}">${bg ? `<rect x="${((W - S) / 2).toFixed(1)}" y="${((H - S) / 2).toFixed(1)}" width="${S}" height="${S}" fill="${bg}"/>` : ""}${paths(fill)}</svg>`;

const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}"><style>path{fill:${INK}}@media (prefers-color-scheme:dark){path{fill:#fff}}</style>${dAttrs.map((d) => `<path d="${d}"/>`).join("")}</svg>`;

(async () => {
  fs.writeFileSync(path.join(OUT, "rodi-favicon.svg"), adaptive);
  // Fallback PNGs: the R a bit larger than before (about 74% of the square)
  const tile = (size) => {
    const inner = Math.round(size * 0.74);
    return sharp(Buffer.from(flat(INK, null)), { density: 300 })
      .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
      .then((letter) =>
        sharp({ create: { width: size, height: size, channels: 4, background: IVORY } }).composite([{ input: letter, gravity: "center" }]).png({ compressionLevel: 9 }),
      );
  };
  await (await tile(512)).toFile(path.join(OUT, "rodi-favicon.png"));
  await (await tile(180)).toFile(path.join(OUT, "rodi-apple-touch-icon.png"));

  // Preview: the adaptive icon in a light tab (dark R) and a dark tab (white R), at real favicon sizes
  const cell = async (fill, bg, px) =>
    sharp(Buffer.from(flat(fill, null)), { density: 300 }).resize({ width: px, height: px }).png().toBuffer().then((b) => ({ b, px, bg }));
  const sizes = [16, 32, 64];
  const tiles = [];
  for (const [fill, bg] of [[INK, "#F1F3F4"], ["#ffffff", "#202124"]]) for (const px of sizes) tiles.push(await cell(fill, bg, px));
  const pad = 24;
  const rowW = sizes.reduce((a, s) => a + s + pad, pad) + 40;
  const canvas = sharp({ create: { width: rowW * 2, height: 64 + pad * 2, channels: 4, background: "#ffffff" } });
  const parts = [];
  let x = 0;
  for (let k = 0; k < 2; k++) {
    parts.push({ input: await sharp({ create: { width: rowW, height: 64 + pad * 2, channels: 4, background: tiles[k * 3].bg } }).png().toBuffer(), left: x, top: 0 });
    let cx = x + pad;
    for (let i = 0; i < 3; i++) {
      const t = tiles[k * 3 + i];
      parts.push({ input: t.b, left: cx, top: pad + Math.round((64 - t.px) / 2) });
      cx += t.px + pad;
    }
    x += rowW;
  }
  await canvas.composite(parts).png().toFile(path.join(__dirname, "favicon-preview.png"));
  console.log("viewBox", VIEWBOX, "| files: rodi-favicon.svg, rodi-favicon.png, rodi-apple-touch-icon.png | preview: emails/favicon-preview.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
