// Campaign emails (offers, benefits, discounts, product and Chapter launches), sent by the app. Wording lives in copy.js.
const K = require("../lib/components");
const { copy, all, tagline } = require("./copy");
const { T, c, f } = K;

// Sample catalog entries for previews; the real sender fills `products` from the shop's catalog.
const SAMPLE_PRODUCTS = [
  { title: "Pouch", url: "https://rodiclub.com/pages/objects", image: K.img("rodi-email-thumb-grecia.jpg"), description: "" },
  { title: "Wallet", url: "https://rodiclub.com/pages/objects", image: K.img("rodi-email-thumb-turquia.jpg"), description: "" },
  { title: "Luggage tag", url: "https://rodiclub.com/pages/objects", image: K.img("rodi-email-thumb-marruecos.jpg"), description: "" },
];

const limitedOffer = {
  id: "limited-offer",
  title: { es: "Aprovecha esta oportunidad", en: "Take this opportunity" },
  channel: { type: "app", trigger: "Campaign (manual); audience: Club members. The offer itself is whatever the sender passes as offer_text" },
  marketing: true,
  subject: all("limited-offer", "subject"),
  preheader: all("limited-offer", "preheader"),
  variables: ["offer_text (optional)", "cta_url", "shop.url", "unsubscribe_url"],
  sample: { cta_url: "https://rodiclub.com/pages/beneficios" },
  build(lang) {
    const S = copy("limited-offer", lang);
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-barcelona.jpg", alt: "" }),
      K.headline(S.h1),
      K.para(`{{ offer_text | default: "${S.pDefault}" }}`, { max: 460 }),
      K.button({ label: S.cta, url: "{{ cta_url | default: '" + T.link.benefits + "' }}" }),
      K.columns({
        items: [
          { icon: "globe", title: S.cols[0][0], text: S.cols[0][1] },
          { icon: "tag", title: S.cols[1][0], text: S.cols[1][1] },
          { icon: "compass", title: S.cols[2][0], text: S.cols[2][1] },
        ],
      }),
      K.footer({ lang, quote: S.quote, marketing: true }),
    ].join("\n");
  },
};

const newBenefits = {
  id: "new-benefits",
  title: { es: "Conoce los nuevos beneficios", en: "Meet the new benefits" },
  channel: { type: "app", trigger: "Campaign (manual) when Benefits change; audience: Club members" },
  marketing: true,
  subject: all("new-benefits", "subject"),
  preheader: all("new-benefits", "preheader"),
  variables: ["shop.url", "unsubscribe_url"],
  sample: {},
  build(lang) {
    const S = copy("new-benefits", lang);
    const side = `<div style="text-align:right;font-family:${f.body};font-size:10.5px;letter-spacing:3.4px;text-transform:uppercase;line-height:2.3;color:${c.ink};">${S.side}</div><div style="width:34px;height:1px;background:${c.gold};margin:14px 0 0 auto;font-size:0;line-height:0;">&nbsp;</div>`;
    const icons = ["pin", "globe", "briefcase", "compass"];
    return [
      K.header({ tagline: tagline(lang), rule: true }),
      K.heroOverlay({ src: "rodi-email-hero-brujas.jpg", height: 230, align: "right", panelWidth: 270, html: side }),
      K.headline(S.h1, { size: 46, rule: false, padTop: 34 }),
      K.para(S.p, { padTop: 14, color: "#6B6862", max: 460 }),
      K.rows({ items: S.rows.map(([title, text], i) => ({ icon: icons[i], title, text, url: T.link.benefits })) }),
      K.button({ label: S.cta, url: T.link.benefits, dark: true, padTop: 22 }),
      K.footer({ lang, quote: "", nav: false, marketing: true }),
    ].join("\n");
  },
};

const discountCode = {
  id: "discount-code",
  title: { es: "Tenemos un descuento para ti", en: "We have a discount for you" },
  channel: { type: "app", trigger: "Campaign (manual). Needs a real discount code created in Shopify Admin" },
  marketing: true,
  subject: all("discount-code", "subject"),
  preheader: all("discount-code", "preheader"),
  variables: ["discount_code", "discount_label", "products[]", "cta_url", "shop.url", "unsubscribe_url"],
  sample: { discount_code: "VIAJA20", discount_label: "20%", cta_url: "https://rodiclub.com/pages/objects", products: SAMPLE_PRODUCTS },
  build(lang) {
    const S = copy("discount-code", lang);
    const overlay = `<h1 class="h1" style="margin:0;font-family:${f.heading};font-weight:400;font-size:40px;line-height:1.05;letter-spacing:-0.5px;color:${c.ink};">${S.h1}</h1>
<div style="padding-top:16px;font-family:${f.body};font-size:11px;letter-spacing:3.4px;text-transform:uppercase;line-height:2;color:${c.body};">${S.sub}</div>
<div style="width:34px;height:1px;background:${c.gold};margin-top:16px;font-size:0;line-height:0;">&nbsp;</div>`;
    return [
      K.header({ tagline: tagline(lang), rule: true }),
      K.heroOverlay({ src: "rodi-email-hero-grecia.jpg", height: 330, html: overlay }),
      K.para(S.p, { padTop: 28, size: 15, max: 460 }),
      K.codeBox({ label: S.label, code: "{{ discount_code }}", spacing: 9, size: 34 }),
      K.note(S.note),
      K.productTiles({ limit: 3, padTop: 30 }),
      K.button({ label: S.cta, url: "{{ cta_url | default: '" + T.link.shop + "' }}", padTop: 28, radius: 6 }),
      K.footer({ lang, quote: tagline(lang), nav: false, wordmark: false, marketing: true }),
    ].join("\n");
  },
};

const newProducts = {
  id: "new-products",
  title: { es: "Descubre los nuevos productos", en: "Discover the new products" },
  channel: { type: "app", trigger: "Campaign (manual) when new products launch; products pulled from the catalog" },
  marketing: true,
  subject: all("new-products", "subject"),
  preheader: all("new-products", "preheader"),
  variables: ["products[]", "cta_url", "shop.url", "unsubscribe_url"],
  sample: { cta_url: "https://rodiclub.com/pages/objects", products: SAMPLE_PRODUCTS },
  build(lang) {
    const S = copy("new-products", lang);
    const overlay = `<div style="max-width:300px;">${K.eyebrow(S.eyebrow, { color: c.gold })}<h1 class="h1" style="margin:0;font-family:${f.heading};font-weight:400;font-size:38px;line-height:1.08;letter-spacing:-0.4px;color:${c.ink};">${S.h1}</h1>
<p style="margin:16px 0 0;font-family:${f.body};font-size:14.5px;line-height:1.65;color:${c.body};">${S.p}</p></div>`;
    return [
      K.header({ tagline: tagline(lang), rule: true }),
      K.heroOverlay({ src: "rodi-email-hero-roma.jpg", height: 340, html: overlay }),
      K.productCards({ limit: 3, badge: S.badge, padTop: 30 }),
      K.button({ label: S.cta, url: "{{ cta_url | default: '" + T.link.shop + "' }}", padTop: 32, radius: 2 }),
      K.footer({ lang, quote: tagline(lang), nav: false, marketing: true }),
    ].join("\n");
  },
};

const chapterLaunch = {
  id: "chapter-launch",
  title: { es: "Descubre el nuevo Chapter", en: "Discover the new Chapter" },
  channel: { type: "app", trigger: "Campaign (manual) when a new Chapter is published; data from the Chapter" },
  marketing: true,
  subject: all("chapter-launch", "subject"),
  preheader: all("chapter-launch", "preheader"),
  variables: ["chapter.name", "chapter.tagline (optional)", "chapter.image (optional)", "chapter.url", "shop.url", "unsubscribe_url"],
  sample: { chapter: { name: "Lisboa", tagline: "", image: "", url: "https://rodiclub.com/pages/chapters-guide" } },
  build(lang) {
    const S = copy("chapter-launch", lang);
    const heroImg = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 24px;"><img src="{% if chapter.image != blank %}{{ chapter.image }}{% else %}${K.img("rodi-email-hero-roma.jpg")}{% endif %}" width="552" alt="{{ chapter.name | escape }}" style="width:100%;max-width:552px;height:auto;"></td></tr></table>`;
    const kicker = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:20px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="70" style="width:70px;"><div style="height:1px;background:${c.gold};font-size:0;line-height:0;">&nbsp;</div></td>
<td align="center" style="padding:0 16px;font-family:${f.body};font-size:12px;letter-spacing:5px;text-transform:uppercase;color:${c.goldInk};">{{ chapter.name }}</td>
<td width="70" style="width:70px;"><div style="height:1px;background:${c.gold};font-size:0;line-height:0;">&nbsp;</div></td></tr></table></td></tr></table>`;
    return [
      K.header({ tagline: tagline(lang) }),
      heroImg,
      K.headline(S.h1, { rule: false, padTop: 34, size: 44 }),
      kicker,
      K.para(`{% if chapter.tagline != blank %}{{ chapter.tagline }}{% else %}${S.tagline}{% endif %}`, { padTop: 22, max: 440 }),
      K.para(S.p2, { padTop: 12, max: 440 }),
      K.button({ label: S.cta, url: "{{ chapter.url }}", padTop: 30 }),
      K.footer({ lang, quote: "", nav: true, marketing: true }),
    ].join("\n");
  },
};

module.exports = [limitedOffer, newBenefits, discountCode, newProducts, chapterLaunch];
