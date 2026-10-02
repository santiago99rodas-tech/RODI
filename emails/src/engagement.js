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
      K.hero({ src: "rodi-email-hero-lisboa.jpg", alt: "" }),
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
  channel: { type: "app", trigger: "Campaign or automation. Needs a referral feature that does not exist yet (a code per customer). No reward is promised in the copy until one is defined" },
  marketing: true,
  subject: all("referral", "subject"),
  preheader: all("referral", "preheader"),
  variables: ["referral_code", "share_url", "shop.url", "unsubscribe_url"],
  sample: { referral_code: "RODI237", share_url: "https://rodiclub.com/pages/club" },
  build(lang) {
    const S = copy("referral", lang);
    return [
      K.header({ tagline: tagline(lang) }),
      K.hero({ src: "rodi-email-hero-barcelona.jpg", alt: "" }),
      K.headline(S.h1),
      K.para(S.p, { max: 440 }),
      K.codeBox({ label: S.label, code: "{{ referral_code }}", icon: "lock", spacing: 10, size: 42 }),
      K.button({ label: S.cta, url: "{{ share_url }}" }),
      K.columns({
        items: [
          { icon: "gift", title: S.cols[0][0], text: S.cols[0][1] },
          { icon: "users", title: S.cols[1][0], text: S.cols[1][1] },
          { icon: "compass", title: S.cols[2][0], text: S.cols[2][1] },
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
      K.hero({ src: "rodi-email-hero-roma.jpg", alt: "" }),
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

module.exports = [communityShare, referral, winback];
