// Brand tokens shared by every email. Values mirror the storefront (--rodi-* in assets/rodi-member.css).
module.exports = {
  // Where the images from ./assets are hosted. Stand-ins live in the theme's assets; move them to the shop's Files
  // (https://rodiclub.com/cdn/shop/files/) when the final art is uploaded.
  // Bump when an image in ./assets is replaced: the shop CDN caches the old file per URL.
  ASSET_VERSION: 2,
  ASSET_BASE: "https://rodiclub.com/cdn/shop/t/4/assets/",
  color: {
    page: "#F6F2EA",
    card: "#FFFDF9",
    ink: "#1C1B1A",
    body: "#3A3733",
    muted: "#8B8A86",
    gold: "#A88543",
    goldInk: "#7A6038",
    line: "#E3D9C6",
    soft: "#F5F1EA",
  },
  font: {
    heading: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
    body: "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  width: 600,
  // Storefront destinations used by footer links and CTAs. {{ shop.url }} is supplied by Shopify and by the app sender.
  link: {
    destinations: "{{ shop.url }}/pages/destinations",
    experiences: "{{ shop.url }}/pages/services",
    inspiration: "{{ shop.url }}/pages/chapters-guide",
    club: "{{ shop.url }}/pages/club",
    benefits: "{{ shop.url }}/pages/beneficios",
    shop: "{{ shop.url }}/pages/objects",
    community: "{{ shop.url }}/pages/recomendaciones",
    home: "{{ shop.url }}/pages/dashboard",
    privacy: "{{ shop.url }}/pages/privacy",
    terms: "{{ shop.url }}/pages/terms",
    contact: "{{ shop.url }}/pages/contact",
  },
};
