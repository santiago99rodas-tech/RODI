// Store transactional emails. These are Shopify notification templates: paste the built HTML into
// Admin > Settings > Notifications > Customer notifications. Variables are Shopify's own.
const K = require("../lib/components");
const { copy, all, tagline } = require("./copy");
const { T, c, f } = K;

// One cart/order line: product image straight from the catalog (`line | img_url`), title, variant, price.
function lineItems({ showQty }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:22px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
{% for line in line_items %}<tr>
<td width="84" valign="middle" style="width:84px;padding:14px 0;border-top:1px solid ${c.line};">{% if line.image %}<img src="{{ line | img_url: '160x160' }}" width="72" alt="{{ line.title | escape }}" style="width:72px;height:auto;border-radius:4px;background:${c.soft};">{% endif %}</td>
<td valign="middle" style="padding:14px 12px;border-top:1px solid ${c.line};"><div style="font-family:${f.heading};font-size:21px;line-height:1.2;color:${c.ink};">{{ line.title | escape }}</div>
{% assign vt = line.variant.title %}{% if vt != blank and vt != 'Default Title' %}<div style="padding-top:4px;font-family:${f.body};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${c.muted};">{{ vt | escape }}</div>{% endif %}</td>
${showQty ? `<td width="44" align="center" valign="middle" style="width:44px;padding:14px 0;border-top:1px solid ${c.line};font-family:${f.body};font-size:13px;color:${c.muted};">x {{ line.quantity }}</td>` : ""}
<td align="right" valign="middle" style="padding:14px 0;border-top:1px solid ${c.line};font-family:${f.body};font-size:15px;color:${c.ink};white-space:nowrap;">{{ line.final_line_price | money_with_currency }}</td>
</tr>{% endfor %}
<tr><td colspan="4" style="border-top:1px solid ${c.line};font-size:0;line-height:0;">&nbsp;</td></tr>
</table></td></tr></table>`;
}

function totalsRow(label, value, { bold = false } = {}) {
  return `<tr><td style="padding:5px 0;font-family:${f.body};font-size:${bold ? 13 : 11.5}px;letter-spacing:2.4px;text-transform:uppercase;${bold ? `font-weight:600;color:${c.ink};` : `color:${c.muted};`}">${label}</td><td align="right" style="padding:5px 0;font-family:${f.body};font-size:${bold ? 18 : 14}px;${bold ? `font-weight:600;color:${c.ink};` : `color:${c.muted};`}">${value}</td></tr>`;
}

const abandonedCheckout = {
  id: "abandoned-checkout",
  title: { es: "Tu carrito sigue esperándote", en: "Your cart is still waiting" },
  channel: { type: "shopify", template: "Abandoned checkout (Settings > Notifications > Customer notifications > Abandoned checkout)" },
  marketing: false,
  subject: all("abandoned-checkout", "subject"),
  preheader: all("abandoned-checkout", "preheader"),
  variables: ["line_items", "url (checkout recovery link)", "shop.url"],
  sample: {},
  build(lang) {
    const S = copy("abandoned-checkout", lang);
    const trust = K.columns({
      padTop: 26,
      items: S.trust.map(([icon, title]) => ({ icon, title: `<span style="font-size:10.5px;letter-spacing:2.2px;">${title}</span>` })),
    });
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-brujas.jpg", inset: 24 }),
      K.headline(S.h1, { rule: false, size: 40, padTop: 30 }),
      K.para(S.p, { padTop: 14, max: 440 }),
      lineItems({ showQty: false }),
      K.button({ label: S.cta, url: "{{ url }}", radius: 8, wide: false, padTop: 28 }),
      trust,
      K.footer({ lang, quote: "", nav: false, marketing: false }),
    ].join("\n");
  },
};

const orderConfirmation = {
  id: "order-confirmation",
  title: { es: "Tu compra fue exitosa", en: "Your purchase was successful" },
  channel: { type: "shopify", template: "Order confirmation (Settings > Notifications > Customer notifications > Order confirmation)" },
  marketing: false,
  subject: all("order-confirmation", "subject"),
  preheader: all("order-confirmation", "preheader"),
  variables: ["order_name", "created_at", "line_items", "subtotal_price", "shipping_price", "total_discounts", "tax_price", "total_price", "shipping_address", "order_status_url", "shop.url"],
  sample: {},
  build(lang) {
    const S = copy("order-confirmation", lang);
    const head = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:34px 40px 0;"><div style="height:1px;background:${c.line};font-size:0;line-height:0;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="bottom" style="padding-top:18px;font-family:${f.heading};font-size:26px;color:${c.ink};">${S.summary}</td>
<td align="right" valign="bottom" style="padding-top:18px;font-family:${f.body};font-size:10.5px;letter-spacing:2.2px;text-transform:uppercase;line-height:1.8;color:${c.muted};">${S.order} {{ order_name }}<br>{{ created_at | date: '%d/%m/%Y' }}</td></tr></table></td></tr></table>`;
    const totals = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:6px 40px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${totalsRow(S.subtotal, "{{ subtotal_price | money_with_currency }}")}
{% if total_discounts > 0 %}${totalsRow(S.discount, "&minus;{{ total_discounts | money_with_currency }}")}{% endif %}
{% if shipping_price != blank %}${totalsRow(S.shipping, `{% if shipping_price == 0 %}${S.free}{% else %}{{ shipping_price | money_with_currency }}{% endif %}`)}{% endif %}
{% if tax_price > 0 %}${totalsRow(S.taxes, "{{ tax_price | money_with_currency }}")}{% endif %}
<tr><td colspan="2" style="padding:6px 0 0;"><div style="height:1px;background:${c.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>
${totalsRow(S.total, "{{ total_price | money_with_currency }}", { bold: true })}
</table></td></tr></table>`;
    const address = `{% if shipping_address %}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:22px 40px 0;font-family:${f.body};font-size:13px;line-height:1.7;color:${c.body};"><div style="font-size:10.5px;letter-spacing:2.4px;text-transform:uppercase;color:${c.muted};padding-bottom:4px;">${S.shipTo}</div>{{ shipping_address.name }}<br>{{ shipping_address.address1 }}{% if shipping_address.address2 != blank %}, {{ shipping_address.address2 }}{% endif %}<br>{{ shipping_address.city }}{% if shipping_address.province != blank %}, {{ shipping_address.province }}{% endif %} {{ shipping_address.zip }}<br>{{ shipping_address.country }}</td></tr></table>{% endif %}`;
    return [
      K.header({ tagline: "", rule: true }).replace(/<div style="font-family:[^>]*>\s*<\/div>/, ""),
      K.hero({ src: "rodi-email-hero-brujas.jpg", inset: 24 }),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:34px 56px 0;"><h1 class="h1" style="margin:0;font-family:${f.heading};font-weight:400;font-size:42px;line-height:1.06;letter-spacing:-0.5px;color:${c.ink};">${S.h1}</h1>
<div style="padding-top:14px;font-family:${f.body};font-size:11px;letter-spacing:3.4px;text-transform:uppercase;font-weight:500;color:${c.gold};">${S.eyebrow}</div></td></tr></table>`,
      K.para(S.p, { padTop: 18, max: 440, size: 15 }),
      head,
      lineItems({ showQty: true }),
      totals,
      address,
      K.button({ label: S.cta, url: "{{ order_status_url }}", dark: true, padTop: 30 }),
      K.footer({ lang, quote: "", nav: false, marketing: false, wordmark: true }),
    ].join("\n");
  },
};

module.exports = [abandonedCheckout, orderConfirmation];
