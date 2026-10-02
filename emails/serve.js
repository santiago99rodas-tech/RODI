// Tiny static server for ./preview and ./dist (local use only). CORS is open so the Shopify admin page can fetch dist/ when
// installing templates from the in-app browser.
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOTS = { preview: path.join(__dirname, "preview"), dist: path.join(__dirname, "dist") };
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json" };
http
  .createServer((req, res) => {
    const p = path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[\/])+/, "");
    const isDist = /^[\/]dist[\/]/.test(p);
    const root = isDist ? ROOTS.dist : ROOTS.preview;
    let file = path.join(root, isDist ? p.replace(/^[\/]dist/, "") : p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Private-Network": "true" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(4281, () => console.log("preview on http://localhost:4281"));
