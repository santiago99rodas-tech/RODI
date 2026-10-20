// Community / retention emails, sent by the app. Wording lives in copy.js.
const K = require("../lib/components");
const { copy, all, tagline } = require("./copy");
const { T } = K;

const communityShare = {
  id: "community-share",
  title: { es: "Comparte tus experiencias", en: "Share your experiences" },
  channel: { type: "app", trigger: "Campaign or automation (e.g. a few days after a trip ends); audience: Club members, since only Club can post" },
  marketing: true,
  subject: all("community-share", "subject"),
  preheader: all("community-share", "preheader"),
  variables: ["shop.url", "unsubscribe_url"],
  sample: {},
  build(lang) {
    const S = copy("community-share", lang);
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-cena.jpg", alt: "" }),
      K.headline(S.h1),
      K.para(S.p, { max: 460 }),
      K.button({ label: S.cta, url: T.link.community }),
      K.columns({
        iconStyle: "ring",
        items: [
          { thumb: "rodi-email-thumb-grecia.jpg", icon: "compass", title: S.cols[0][0], text: S.cols[0][1] },
          { thumb: "rodi-email-thumb-turquia.jpg", icon: "pin", title: S.cols[1][0], text: S.cols[1][1] },
          { thumb: "rodi-email-thumb-marruecos.jpg", icon: "book", title: S.cols[2][0], text: S.cols[2][1] },
        ],
      }),
      K.footer({ lang, quote: S.quote, marketing: true }),
    ].join("\n");
  },
};

const referral = {
  id: "referral",
  title: { es: "Refiere a un amigo", en: "Refer a friend" },
  channel: { type: "app", trigger: "Campaign (Admin > Campaigns, personal: each recipient gets their own code and link). Reward is real: when the friend creates a first trip, both get 1 month of Club (the member up to 6 months in total) - see app/referral.server.ts" },
  marketing: true,
  subject: all("referral", "subject"),
  preheader: all("referral", "preheader"),
  variables: ["referral_code", "share_url", "shop.url", "unsubscribe_url"],
  sample: { referral_code: "RODIK7M2Q", share_url: "https://rodiclub.com/?ref=RODIK7M2Q" },
  build(lang) {
    const S = copy("referral", lang);
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-cena.jpg", alt: "" }),
      K.headline(S.h1),
      K.para(S.p, { max: 440 }),
      K.codeBox({ label: S.label, code: "{{ referral_code }}", icon: "lock", spacing: 10, size: 42 }),
      K.button({ label: S.cta, url: "{{ share_url }}" }),
      K.columns({
        items: [
          { icon: "users", title: S.cols[0][0], text: S.cols[0][1] },
          { icon: "plane", title: S.cols[1][0], text: S.cols[1][1] },
          { icon: "gift", title: S.cols[2][0], text: S.cols[2][1] },
        ],
      }),
      K.footer({ lang, quote: S.quote, marketing: true }),
    ].join("\n");
  },
};

const winback = {
  id: "winback",
  title: { es: "Te extrañamos", en: "We miss you" },
  channel: { type: "app", trigger: "Automation: no storefront/app activity for N days (N to be decided)" },
  marketing: true,
  subject: all("winback", "subject"),
  preheader: all("winback", "preheader"),
  variables: ["shop.url", "unsubscribe_url"],
  sample: {},
  build(lang) {
    const S = copy("winback", lang);
    return [
      K.header({ tagline: tagline(lang), rule: true }),
      K.hero({ src: "rodi-email-hero-globos.jpg", alt: "" }),
      K.headline(S.h1, { rule: false, padTop: 34 }),
      K.para(S.p, { padTop: 14, max: 460 }),
      K.columns({
        iconStyle: "soft",
        padTop: 30,
        items: [
          { icon: "book", title: S.cols[0][0], text: S.cols[0][1] },
          { icon: "gem", title: S.cols[1][0], text: S.cols[1][1] },
          { icon: "pin", title: S.cols[2][0], text: S.cols[2][1] },
        ],
      }),
      K.button({ label: S.cta, url: T.link.home, dark: true, padTop: 34 }),
      K.footer({ lang, quote: S.quote, nav: false, marketing: true }),
    ].join("\n");
  },
};

// C8 (DEC-050) — RODI Dispatch: the periodic newsletter. Everything editorial comes from the campaign fields.
const dispatch = {
  id: "dispatch",
  title: { es: "RODI Dispatch (newsletter)", en: "RODI Dispatch (newsletter)" },
  channel: { type: "app", trigger: "Campaign (manual), e.g. every two weeks; title, intro and up to three stories written per issue" },
  marketing: true,
  subject: all("dispatch", "subject"),
  preheader: all("dispatch", "preheader"),
  variables: ["dispatch.title", "dispatch.intro", "dispatch.items[] (title, text, url)", "cta_url (optional)", "shop.url", "unsubscribe_url"],
  sample: {
    dispatch: {
      title: "Lisboa, before the light",
      intro: "A first look at Chapter Portugal: the places behind each piece and what to pack for an Atlantic week.",
      items: [
        { title: "The Chapter handbook", text: "Lisboa, Porto, Sintra and the Atlantic, piece by piece.", url: "https://rodiclub.com/pages/chapters?chapter=portugal" },
        { title: "What to pack", text: "A linen set for the evenings, a cap for the miradouros.", url: "https://rodiclub.com/pages/packing" },
      ],
    },
  },
  build(lang) {
    const S = copy("dispatch", lang);
    const item = `{% for item in dispatch.items %}${K.para("<strong>{{ item.title }}</strong><br>{{ item.text }}{% if item.url != blank %}<br><a href=\"{{ item.url }}\">" + S.read + " →</a>{% endif %}", { padTop: 18, max: 460 })}{% endfor %}`;
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-manifiesto.jpg", alt: "" }),
      K.para(S.eyebrow.toUpperCase(), { padTop: 26, max: 460 }),
      K.headline("{{ dispatch.title }}", { rule: false, padTop: 8 }),
      K.para("{{ dispatch.intro }}", { padTop: 14, max: 460 }),
      item,
      K.button({ label: S.cta, url: "{% if cta_url != blank %}{{ cta_url }}{% else %}{{ shop.url }}{% endif %}", padTop: 30 }),
      K.footer({ lang, quote: S.quote, marketing: true }),
    ].join("\n");
  },
};

module.exports = [communityShare, referral, winback, dispatch];
