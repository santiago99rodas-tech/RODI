// Builds every email in es + en:
//   dist/<lang>/<id>.html     Liquid kept as-is: paste into Shopify notifications, or render in the app's sender
//   preview/<lang>/<id>.html  same email rendered with sample data (open in a browser)
//   manifest.json             id -> channel, subject, variables (what each email needs from its sender)
//   node build.js
const fs = require("fs");
const path = require("path");
const { Liquid } = require("liquidjs");
const K = require("./lib/components");

const { LANGS } = require("./src/copy");
const EMAILS = [...require("./src/engagement"), ...require("./src/promotions"), ...require("./src/transactional"), ...require("./src/account")];

const engine = new Liquid({ strictVariables: false, strictFilters: false });
// Shopify-only filters, approximated for previews.
engine.registerFilter("img_url", (v) => (v && v.image) || "");
engine.registerFilter("money_with_currency", (v) => `US$ ${(Number(v || 0) / 100).toFixed(2)} USD`);
engine.registerFilter("money", (v) => `US$ ${(Number(v || 0) / 100).toFixed(2)}`);

const A = (n) => K.img(n);
const COMMON = {
  shop: { url: "https://rodiclub.com", name: "RODI Club" },
  unsubscribe_url: "https://rodiclub.com/unsubscribe",
  customer: { first_name: "Santiago" },
  order_name: "#ROD123456",
  created_at: "2026-10-02T12:00:00Z",
  order_status_url: "https://rodiclub.com/orders/status",
  url: "https://rodiclub.com/checkouts/recover",
  line_items: [
    { title: "Maleta RODI Classic", variant: { title: "Carry On · Arena" }, quantity: 1, image: A("rodi-email-thumb-grecia.jpg"), final_line_price: 29500 },
    { title: "Tag de equipaje", variant: { title: "Cuero · Arena" }, quantity: 1, image: A("rodi-email-thumb-turquia.jpg"), final_line_price: 4500 },
  ],
  subtotal_price: 34000,
  shipping_price: 0,
  total_discounts: 0,
  tax_price: 0,
  total_price: 34000,
  shipping_address: { name: "Santiago Rodas", address1: "Calle 10 # 5-20", address2: "", city: "Medellín", province: "Antioquia", zip: "050001", country: "Colombia" },
};

const out = (...p) => path.join(__dirname, ...p);
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

(async () => {
  const manifest = [];
  for (const e of EMAILS) {
    for (const lang of LANGS) {
      const html = K.shell({ lang, title: e.subject[lang], preheader: e.preheader[lang], body: e.build(lang) });
      write(out("dist", lang, `${e.id}.html`), html);
      const data = { ...COMMON, ...e.sample };
      write(out("preview", lang, `${e.id}.html`), await engine.parseAndRender(html, data));
    }
    manifest.push({
      id: e.id,
      title: e.title,
      channel: e.channel,
      marketing: e.marketing,
      subject: e.subject,
      variables: e.variables,
    });
  }
  write(out("manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const rows = manifest
    .map(
      (m) =>
        `<tr><td>${m.title.es}</td><td>${m.channel.type}</td><td><a href="es/${m.id}.html">ES</a> · <a href="en/${m.id}.html">EN</a></td></tr>`
    )
    .join("");
  write(out("preview", "index.html"), `<!doctype html><meta charset="utf-8"><title>RODI emails</title><style>body{font:15px Georgia;margin:40px}td{padding:6px 18px 6px 0}</style><h1>RODI emails</h1><table>${rows}</table>`);
  console.log(`built ${EMAILS.length} emails x ${LANGS.length} languages`);
  for (const m of manifest) console.log(" ", m.id.padEnd(20), m.channel.type);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
