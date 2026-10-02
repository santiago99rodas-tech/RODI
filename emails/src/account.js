// Account and membership emails. Wording lives in copy.js.
const K = require("../lib/components");
const { copy, all, tagline } = require("./copy");
const { T, c, f } = K;

const welcomeClub = {
  id: "welcome-club",
  title: { es: "Bienvenido a RODI Club", en: "Welcome to RODI Club" },
  channel: { type: "app", trigger: "When a customer becomes a Club member (promotional access granted, or paid membership starts)" },
  marketing: false,
  subject: all("welcome-club", "subject"),
  preheader: all("welcome-club", "preheader"),
  variables: ["shop.url"],
  sample: {},
  build(lang) {
    const S = copy("welcome-club", lang);
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-barcelona.jpg", inset: 0 }),
      K.headline(S.h1, { size: 46 }),
      K.para(S.p, { max: 460 }),
      K.columns({
        padTop: 30,
        items: [
          { icon: "compass", title: S.cols[0][0], text: S.cols[0][1] },
          { icon: "briefcase", title: S.cols[1][0], text: S.cols[1][1] },
          { icon: "gem", title: S.cols[2][0], text: S.cols[2][1] },
        ],
      }),
      K.button({ label: S.cta, url: T.link.home, radius: 8, padTop: 32 }),
      K.footer({ lang, quote: tagline(lang), marketing: false }),
    ].join("\n");
  },
};

const accountReady = {
  id: "account-ready",
  title: { es: "Tu cuenta ya está lista", en: "Your account is ready" },
  channel: { type: "app", trigger: "customers/create webhook, right after the complimentary Club access is granted" },
  marketing: false,
  subject: all("account-ready", "subject"),
  preheader: all("account-ready", "preheader"),
  variables: ["promo_months", "access_until", "shop.url"],
  sample: { promo_months: 3, access_until: "01/01/2027" },
  build(lang) {
    const S = copy("account-ready", lang);
    const lead = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="left" style="padding:32px 56px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:${f.body};font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${c.goldInk};font-weight:500;padding-right:14px;">${S.eyebrow}</td><td width="60" style="width:60px;"><div style="height:1px;background:${c.gold};font-size:0;line-height:0;">&nbsp;</div></td></tr></table>
<h1 class="h1" style="margin:14px 0 0;font-family:${f.heading};font-weight:400;font-size:46px;line-height:1.04;letter-spacing:-0.8px;color:${c.ink};">${S.h1}</h1>
<p style="margin:16px 0 0;font-family:${f.body};font-size:16px;line-height:1.6;color:${c.body};">${S.p}<br><span style="color:${c.muted};font-size:13px;">${S.until}</span></p></td></tr></table>`;
    return [
      K.header({ tagline: "" }).replace(/<div style="font-family:[^>]*>\s*<\/div>/, ""),
      K.hero({ src: "rodi-email-hero-lisboa.jpg", inset: 24 }),
      lead,
      K.list({ padTop: 30, items: S.items.map(([icon, title, text]) => ({ icon, title, text })) }),
      K.button({ label: S.cta, url: T.link.home, dark: true, padTop: 14 }),
      K.footer({ lang, quote: tagline(lang), nav: false, marketing: false }),
    ].join("\n");
  },
};

const verificationCode = {
  id: "verification-code",
  title: { es: "Tu código de verificación", en: "Your verification code" },
  channel: { type: "not-deliverable", trigger: "Shopify sends the sign-in code for new customer accounts itself and does not let the store change its design. Built here for the day RODI sends its own codes." },
  marketing: false,
  subject: all("verification-code", "subject"),
  preheader: all("verification-code", "preheader"),
  variables: ["code", "expires_in_minutes", "shop.url"],
  sample: { code: "237 678", expires_in_minutes: 15 },
  build(lang) {
    const S = copy("verification-code", lang);
    const once = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:24px 56px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="48" align="center" valign="middle">${K.icon("lock", { size: 24 })}</td><td width="1" style="width:1px;"><div style="width:1px;height:38px;background:${c.line};font-size:0;line-height:0;">&nbsp;</div></td>
<td valign="middle" style="padding-left:16px;font-family:${f.body};font-size:14px;line-height:1.55;color:${c.body};">${S.once}</td></tr></table></td></tr></table>`;
    return [
      K.header({ tagline: tagline(lang), rule: true }),
      K.headline(S.h1, { rule: false, padTop: 22, size: 46 }),
      K.para(S.p, { padTop: 22, max: 400 }),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:30px 56px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${c.gold};border-radius:10px;background:${c.soft};"><tr><td align="center" style="padding:22px 12px;font-family:${f.heading};font-size:50px;line-height:1;letter-spacing:12px;color:${c.ink};font-weight:500;padding-left:24px;font-feature-settings:'lnum' 1;font-variant-numeric:lining-nums;">{{ code }}</td></tr></table></td></tr></table>`,
      once,
      K.button({ label: S.cta, url: "{{ shop.url }}", padTop: 28 }),
      K.para(`${S.didnt} <a href="${T.link.contact}" style="color:${c.goldInk};">${S.support}</a>`, { padTop: 26, size: 13 }),
      K.spacer(26),
      K.hero({ src: "rodi-email-hero-brujas.jpg" }),
      K.footer({ lang, quote: "", nav: false, wordmark: false, marketing: false }),
    ].join("\n");
  },
};

module.exports = [welcomeClub, accountReady, verificationCode];
