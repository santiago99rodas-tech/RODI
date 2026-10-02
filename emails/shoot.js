// Screenshots the built previews with headless Edge (dev only). Needs `node serve.js` running.
//   node shoot.js [lang] [width] [id...]      e.g. node shoot.js es 680 order-confirmation
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const [lang = "es", width = "680", ...only] = process.argv.slice(2);
const ids = (only.length ? only : require("./manifest.json").map((m) => m.id));
fs.mkdirSync(path.join(__dirname, "shots"), { recursive: true });

(async () => {
  for (const id of ids) {
    const out = path.join(__dirname, "shots", `${id}-${lang}-${width}.png`);
    fs.rmSync(out, { force: true });
    // Edge headless will not lay out narrower than ~500px, so phone widths are tested inside an iframe of that width.
    const phone = Number(width) < 500;
    let url = `http://localhost:4281/${lang}/${id}.html`;
    if (phone) {
      const wrap = path.join(__dirname, "preview", `_frame-${id}-${lang}.html`);
      fs.writeFileSync(wrap, `<!doctype html><body style="margin:0;background:#F6F2EA"><iframe src="${lang}/${id}.html" width="${width}" height="3200" style="border:0;display:block;margin:0 auto"></iframe>`);
      url = `http://localhost:4281/_frame-${id}-${lang}.html`;
    }
    const r = spawnSync(EDGE, [
      "--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(os.tmpdir(), "edge-shot-profile")}`,
      "--hide-scrollbars", `--window-size=${phone ? 600 : width},3400`, "--virtual-time-budget=8000", `--screenshot=${out}`,
      url,
    ], { encoding: "utf8", timeout: 90000 });
    for (let i = 0; i < 40 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 500)); // headless Edge writes the file after its launcher exits
    await new Promise((r) => setTimeout(r, 400));
    if (!fs.existsSync(out)) { console.log(id, "FAILED", (r.stderr || "").slice(0, 200)); continue; }
    const buf = await sharp(out).trim({ background: "#F6F2EA", threshold: 6 }).toBuffer();
    // trim also removes the side margins; re-extend a little so the card keeps its context
    const meta = await sharp(buf).metadata();
    await sharp(buf).extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#F6F2EA" }).toFile(out);
    console.log(id, `${meta.width}x${meta.height}`);
  }
})();
