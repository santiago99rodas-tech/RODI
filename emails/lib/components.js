// Table-based, inline-styled building blocks (the only layout that survives Gmail, Outlook and Apple Mail).
// Every function returns an HTML string that may contain Liquid ({{ }} / {% %}); build.js leaves it untouched for
// Shopify and renders it with liquidjs for previews and for the app's own sender.
const T = require("./theme");
const { color: c, font: f } = T;

const img = (name) => `${T.ASSET_BASE}${name}?v=${T.ASSET_VERSION}`;
const FOOT = {
  es: { nav: ["Destinos", "Servicios", "Chapters", "RODI Club"], rights: "Todos los derechos reservados.", privacy: "Política de privacidad", terms: "Términos", support: "Soporte", unsub: "Darse de baja", why: "Recibes este correo porque formas parte de RODI Club." },
  en: { nav: ["Destinations", "Services", "Chapters", "RODI Club"], rights: "All rights reserved.", privacy: "Privacy policy", terms: "Terms", support: "Support", unsub: "Unsubscribe", why: "You are receiving this email because you are part of RODI Club." },
  fr: { nav: ["Destinations", "Services", "Chapters", "RODI Club"], rights: "Tous droits réservés.", privacy: "Politique de confidentialité", terms: "Conditions", support: "Assistance", unsub: "Se désabonner", why: "Vous recevez cet e-mail car vous faites partie de RODI Club." },
  it: { nav: ["Destinazioni", "Servizi", "Chapters", "RODI Club"], rights: "Tutti i diritti riservati.", privacy: "Informativa sulla privacy", terms: "Termini", support: "Assistenza", unsub: "Annulla l'iscrizione", why: "Ricevi questa email perché fai parte di RODI Club." },
};

const spacer = (h) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

function shell({ lang, title, preheader, body }) {
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}
  a{color:${c.goldInk}}
  @media only screen and (max-width:620px){
    .container{width:100%!important}
    .px{padding-left:22px!important;padding-right:22px!important}
    .h1{font-size:34px!important;line-height:1.08!important}
    .col{display:block!important;width:100%!important;border-left:0!important;padding:0 0 26px 0!important}
    .col-last{padding-bottom:0!important}
    .hero-pad{padding:30px 22px!important}
    .nav a{display:inline-block;padding:4px 6px!important}
    .stack{display:block!important;width:100%!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${c.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${c.page};">${preheader}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.page}" style="background:${c.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="${T.width}" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.card}" style="width:${T.width}px;max-width:${T.width}px;background:${c.card};">
<tr><td>
${body}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function header({ tagline, rule = false }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:30px 24px ${rule ? "18" : "24"}px;">
<a href="{{ shop.url }}" style="text-decoration:none;"><img src="${img("rodi-email-logo.png")}" width="190" alt="RODI" style="width:190px;max-width:100%;height:auto;margin:0 auto;"></a>
<div style="font-family:${f.body};font-size:10.5px;letter-spacing:4px;text-transform:uppercase;color:${c.body};padding-top:12px;">${tagline}</div>
${rule ? `<div style="width:56px;height:1px;background:${c.gold};margin:16px auto 0;font-size:0;line-height:0;">&nbsp;</div>` : ""}
</td></tr></table>`;
}

function hero({ src, alt = "", radius = 0, inset = 0 }) {
  const w = T.width - inset * 2;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 ${inset}px;"><img src="${img(src)}" width="${w}" alt="${alt}" style="width:100%;max-width:${w}px;height:auto;${radius ? `border-radius:${radius}px;` : ""}"></td></tr></table>`;
}

// Text over a photo. Falls back to a flat ivory block in Outlook desktop (VML) and when images are blocked.
function heroOverlay({ src, height = 360, html, align = "left", panel = true, panelWidth = 340 }) {
  const url = img(src);
  // Translucent ivory panel keeps the copy legible on busy photos; pass panel:false for art with clear space.
  const inner = panel
    ? `<table role="presentation" align="${align}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${panelWidth}px;"><tr><td bgcolor="${c.card}" style="background:rgba(255,253,249,0.9);padding:26px 28px;border-radius:6px;">${html}</td></tr></table>`
    : html;
  return `<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${T.width}px;height:${height}px;"><v:fill type="frame" src="${url}" color="${c.soft}"/><v:textbox inset="0,0,0,0"><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="${url}" bgcolor="${c.soft}" style="background:${c.soft} url('${url}') center center / cover no-repeat;">
<tr><td class="hero-pad" valign="middle" align="${align}" height="${height}" style="height:${height}px;padding:40px 36px;">${inner}</td></tr></table>
<!--[if mso]></v:textbox></v:rect><![endif]-->`;
}

function eyebrow(text, { color = c.goldInk } = {}) {
  return `<div style="font-family:${f.body};font-size:11px;letter-spacing:3.4px;text-transform:uppercase;color:${color};font-weight:500;padding-bottom:12px;">${text}</div>`;
}

// `html` may use <em> for the italic accent word. Centered by default.
function headline(html, { align = "center", size = 44, color = c.ink, rule = true, padTop = 40 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="${align}" style="padding:${padTop}px 56px 0;">
<h1 class="h1" style="margin:0;font-family:${f.heading};font-weight:400;font-size:${size}px;line-height:1.06;letter-spacing:-0.6px;color:${color};">${html}</h1>
${rule ? `<div style="width:56px;height:1px;background:${c.gold};margin:22px ${align === "center" ? "auto" : "0"} 0;font-size:0;line-height:0;">&nbsp;</div>` : ""}
</td></tr></table>`;
}

function para(html, { align = "center", size = 16, color = c.body, padTop = 22, padX = 56, max } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="${align}" style="padding:${padTop}px ${padX}px 0;">
<p style="margin:0;${max ? `max-width:${max}px;` : ""}font-family:${f.body};font-size:${size}px;line-height:1.65;color:${color};">${html}</p>
</td></tr></table>`;
}

function button({ label, url, dark = false, radius = 999, padTop = 30, arrow = true, wide = false }) {
  const bg = dark ? c.ink : c.gold;
  const fg = dark ? c.soft : "#FFFFFF";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:${padTop}px 24px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${wide ? 'width="100%"' : ""}><tr><td align="center" bgcolor="${bg}" style="background:${bg};border-radius:${radius}px;">
<a href="${url}" style="display:block;padding:17px ${wide ? 20 : 40}px;font-family:${f.body};font-size:12px;font-weight:500;letter-spacing:2.8px;text-transform:uppercase;color:${fg};text-decoration:none;border-radius:${radius}px;">${label}${arrow ? `&nbsp;&nbsp;<span style="color:${dark ? c.gold : "#FFFFFF"};">&rarr;</span>` : ""}</a>
</td></tr></table></td></tr></table>`;
}

function icon(name, { style = "plain", size = 28 } = {}) {
  const tag = `<img src="${img(`rodi-email-icon-${name}.png`)}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;margin:0 auto;">`;
  if (style === "plain") return tag;
  const box = size + 26;
  const bg = style === "soft" ? c.soft : c.card;
  const border = style === "ring" ? `border:1px solid ${c.gold};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="${box}" height="${box}" align="center" valign="middle" style="width:${box}px;height:${box}px;background:${bg};${border}border-radius:50%;">${tag}</td></tr></table>`;
}

// items: [{ icon?, thumb?, title, text, url? }]
function columns({ items, iconStyle = "plain", padTop = 34 }) {
  const n = items.length;
  const width = Math.floor(100 / n);
  const cells = items
    .map((it, i) => {
      const last = i === n - 1;
      const border = i > 0 ? `border-left:1px solid ${c.line};` : "";
      const thumb = it.thumb ? `<img src="${img(it.thumb)}" width="170" alt="" style="width:100%;max-width:200px;height:auto;margin:0 auto 14px;">` : "";
      const ic = it.icon ? `<div style="padding-bottom:14px;">${icon(it.icon, { style: iconStyle })}</div>` : "";
      const title = `<div style="font-family:${f.body};font-size:11.5px;font-weight:500;letter-spacing:2.6px;text-transform:uppercase;line-height:1.7;color:${c.ink};padding-bottom:9px;">${it.title}</div>`;
      const text = it.text ? `<div style="font-family:${f.body};font-size:13px;line-height:1.65;color:#6B6862;">${it.text}</div>` : "";
      const inner = `${thumb}${ic}${title}${text}`;
      return `<td class="col${last ? " col-last" : ""}" width="${width}%" valign="top" align="center" style="width:${width}%;padding:0 14px;${border}">${it.url ? `<a href="${it.url}" style="text-decoration:none;color:inherit;">${inner}</a>` : inner}</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${padTop}px 22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
</td></tr></table>`;
}

// A bordered box with a small label and a big code (invitation code, discount code, OTP).
function codeBox({ label, code, icon: ic, spacing = 8, size = 40, dashed = false }) {
  const lock = ic ? `<td width="56" align="center" valign="middle" style="width:56px;">${icon(ic, { style: "plain", size: 26 })}</td>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:30px 56px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.soft}" style="background:${c.soft};border:1px ${dashed ? "dashed" : "solid"} ${c.gold};border-radius:12px;">
<tr><td align="center" style="padding:24px 16px;">
<div style="font-family:${f.body};font-size:10.5px;letter-spacing:3.4px;text-transform:uppercase;color:${c.body};padding-bottom:10px;">${label}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="font-family:${f.heading};font-size:${size}px;line-height:1.1;letter-spacing:${spacing}px;color:${c.ink};font-weight:500;padding-left:${spacing}px;font-feature-settings:'lnum' 1;font-variant-numeric:lining-nums;">${code}</td>${lock}</tr></table>
</td></tr></table></td></tr></table>`;
}

function note(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:18px 56px 0;"><p style="margin:0;font-family:${f.body};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;line-height:1.9;color:${c.body};">${html}</p></td></tr></table>`;
}

// Benefit-style rows: [{ icon, title, text, url }]
function rows({ items, padTop = 28 }) {
  const body = items
    .map(
      (it) => `<tr><td style="padding:0 0 12px;">
<a href="${it.url}" style="text-decoration:none;display:block;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${c.line};border-radius:10px;background:${c.card};"><tr>
<td width="92" align="center" valign="middle" style="width:92px;padding:16px 0 16px 8px;">${icon(it.icon, { style: "soft" })}</td>
<td width="1" style="width:1px;padding:18px 0;"><div style="width:1px;height:46px;background:${c.line};font-size:0;line-height:0;">&nbsp;</div></td>
<td valign="middle" style="padding:16px 14px 16px 18px;"><div style="font-family:${f.heading};font-size:15px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:${c.ink};padding-bottom:5px;">${it.title}</div><div style="font-family:${f.body};font-size:13px;line-height:1.55;color:#6B6862;">${it.text}</div></td>
<td width="44" align="center" valign="middle" style="width:44px;font-family:${f.body};font-size:20px;color:${c.gold};">&rarr;</td>
</tr></table></a></td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${padTop}px 40px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr></table>`;
}

// Product tiles driven by the `products` array the sender supplies ({ title, url, image, description }); images come
// straight from the shop's catalog. `limit` caps how many are shown.
function productTiles({ limit = 3, padTop = 32 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${padTop}px 22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
{% assign pn = products.size %}{% if pn > 3 %}{% assign pn = 3 %}{% endif %}{% assign cw = 100 | divided_by: pn %}{% for p in products limit: ${limit} %}<td class="col{% if forloop.last %} col-last{% endif %}" width="{{ cw }}%" valign="top" align="center" style="width:{{ cw }}%;padding:0 10px;">
<a href="{{ p.url }}" style="text-decoration:none;color:${c.ink};"><img src="{{ p.image }}" width="170" alt="{{ p.title | escape }}" style="width:100%;max-width:{% if pn == 1 %}320{% elsif pn == 2 %}240{% else %}200{% endif %}px;height:auto;margin:0 auto 14px;border-radius:4px;">
<div style="font-family:${f.body};font-size:11.5px;font-weight:500;letter-spacing:2.6px;text-transform:uppercase;line-height:1.7;color:${c.ink};">{{ p.title | escape }}</div>
<div style="padding-top:6px;font-family:${f.body};font-size:20px;color:${c.gold};">&rarr;</div></a></td>{% endfor %}
</tr></table></td></tr></table>`;
}

function productCards({ limit = 3, badge = "", padTop = 28 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${padTop}px 22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
{% assign pn = products.size %}{% if pn > 3 %}{% assign pn = 3 %}{% endif %}{% assign cw = 100 | divided_by: pn %}{% for p in products limit: ${limit} %}<td class="col{% if forloop.last %} col-last{% endif %}" width="{{ cw }}%" valign="top" align="center" style="width:{{ cw }}%;padding:0 8px;">
<a href="{{ p.url }}" style="text-decoration:none;color:${c.ink};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.soft}" style="background:${c.soft};max-width:{% if pn == 1 %}340{% elsif pn == 2 %}270{% else %}230{% endif %}px;margin:0 auto;"><tr><td><img src="{{ p.image }}" width="170" alt="{{ p.title | escape }}" style="width:100%;height:auto;"></td></tr></table>
${badge ? `<div style="padding-top:14px;font-family:${f.body};font-size:10.5px;font-weight:600;letter-spacing:2.6px;text-transform:uppercase;color:${c.gold};">${badge}</div>` : ""}
<div style="padding-top:6px;font-family:${f.heading};font-size:21px;line-height:1.2;color:${c.ink};">{{ p.title | escape }}</div>
<div style="padding-top:6px;font-family:${f.body};font-size:13px;line-height:1.6;color:#6B6862;">{{ p.description | strip_html | truncatewords: 8 }}</div></a></td>{% endfor %}
</tr></table></td></tr></table>`;
}

// Plain feature list: icon on the left, title + text on the right. [{ icon, title, text }]
function list({ items, padTop = 30 }) {
  const body = items
    .map(
      (it) => `<tr><td width="84" align="center" valign="top" style="width:84px;padding:0 0 22px;">${icon(it.icon, { style: "soft" })}</td>
<td valign="middle" style="padding:0 0 22px 14px;"><div style="font-family:${f.body};font-size:12px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:${c.ink};padding-bottom:5px;">${it.title}</div><div style="font-family:${f.body};font-size:13.5px;line-height:1.6;color:#6B6862;">${it.text}</div></td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${padTop}px 56px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr></table>`;
}

function divider(padTop = 40, inset = 40) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${padTop}px ${inset}px 0;"><div style="height:1px;background:${c.gold};opacity:.55;font-size:0;line-height:0;">&nbsp;</div></td></tr></table>`;
}

function footer({ lang, quote, nav = true, marketing = false, wordmark = true, minimal = false }) {
  const t = FOOT[lang];
  const links = [T.link.destinations, T.link.experiences, T.link.inspiration, T.link.club];
  const navHtml = nav
    ? `<div class="nav" style="padding-top:14px;font-family:${f.body};font-size:10.5px;letter-spacing:2.8px;text-transform:uppercase;">${t.nav
        .map((label, i) => `<a href="${links[i]}" style="color:${c.body};text-decoration:none;padding:0 12px;${i ? `border-left:1px solid ${c.line};` : ""}">${label}</a>`)
        .join("")}</div>`
    : "";
  const legal = `<div style="padding-top:16px;font-family:${f.body};font-size:11px;line-height:1.9;color:${c.muted};">
&copy; {{ 'now' | date: '%Y' }} RODI Club. ${t.rights}<br>
<a href="${T.link.privacy}" style="color:${c.muted};">${t.privacy}</a> &nbsp;|&nbsp; <a href="${T.link.terms}" style="color:${c.muted};">${t.terms}</a> &nbsp;|&nbsp; <a href="${T.link.contact}" style="color:${c.muted};">${t.support}</a>${marketing ? ` &nbsp;|&nbsp; <a href="{{ unsubscribe_url }}" style="color:${c.muted};">${t.unsub}</a>` : ""}
${marketing ? `<br><span style="font-size:10.5px;">${t.why}</span>` : ""}
</div>`;
  void minimal;
  return `${divider(44)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:26px 40px 34px;">
${quote ? `<div style="font-family:${f.heading};font-style:italic;font-size:21px;line-height:1.35;color:${c.ink};">${quote}</div>` : ""}
${wordmark ? `<div style="padding-top:${quote ? 12 : 0}px;"><a href="{{ shop.url }}"><img src="${img("rodi-email-logo.png")}" width="84" alt="RODI" style="width:84px;height:auto;margin:0 auto;"></a></div>` : ""}
${navHtml}
${legal}
</td></tr></table>`;
}

module.exports = { shell, header, hero, heroOverlay, eyebrow, headline, para, button, icon, columns, codeBox, note, rows, list, productTiles, productCards, divider, footer, spacer, img, T, c, f };
