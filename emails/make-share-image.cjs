// Builds the default social-sharing image (1200 x 630): the RODI "R" and the tagline on ivory.
//   node make-share-image.cjs  ->  ../../shopify-theme/assets/rodi-share.jpg
// Rendered with headless Edge so the heading font (Cormorant Garamond) is the real one, then cropped and encoded by sharp.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SRC = path.join(__dirname, "..", "..", "rodi2-negro.svg");
const OUT = path.join(__dirname, "..", "..", "shopify-theme", "assets", "rodi-share.jpg");
const TAGLINE = process.argv[2] || "Tu vida viajera, en un solo lugar";

const svg = fs.readFileSync(SRC, "utf8");
const letter = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => `<path d="${m[1]}"/>`).join("");

const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;background:#F5F1EA;overflow:hidden}
  .wrap{width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center}
  svg{height:290px;width:auto;fill:#1C1B1A;display:block}
  .rule{width:72px;height:2px;background:#A88543;margin:44px 0 34px}
  .tag{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:50px;letter-spacing:.5px;color:#1C1B1A}
</style>
<div class="wrap"><svg viewBox="0 0 815.69 1051.36">${letter}</svg><div class="rule"></div><div class="tag">${TAGLINE}</div></div>`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "share-"));
  const page = path.join(tmp, "share.html");
  const shot = path.join(tmp, "share.png");
  fs.writeFileSync(page, html);
  spawnSync(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(tmp, "profile")}`, "--hide-scrollbars", "--window-size=1200,700", "--virtual-time-budget=8000", `--screenshot=${shot}`, "file:///" + page.replace(/\\/g, "/")], { timeout: 90000 });
  for (let i = 0; i < 40 && !fs.existsSync(shot); i++) await new Promise((r) => setTimeout(r, 500)); // Edge writes the file after its launcher exits
  await new Promise((r) => setTimeout(r, 500));
  if (!fs.existsSync(shot)) throw new Error("Edge did not produce the screenshot");
  await sharp(shot).extract({ left: 0, top: 0, width: 1200, height: 630 }).jpeg({ quality: 88, mozjpeg: true }).toFile(OUT);
  const meta = await sharp(OUT).metadata();
  console.log("rodi-share.jpg", meta.width + "x" + meta.height, Math.round(fs.statSync(OUT).size / 1024) + " KB");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
