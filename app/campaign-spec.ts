// What each marketing email needs from whoever sends it. Shared by the admin screens (client) and the sender (server),
// so it must stay free of server-only imports.

export type CampaignTemplateId =
  | "community-share"
  | "winback"
  | "limited-offer"
  | "new-benefits"
  | "discount-code"
  | "new-products"
  | "chapter-launch";

export type CampaignField = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
};

export type CampaignTemplateSpec = {
  id: CampaignTemplateId;
  label: string;
  description: string;
  fields: CampaignField[];
  // Pulls up to 3 products from the shop's catalog (images and links come from the products themselves).
  usesProducts: boolean;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplateSpec[] = [
  {
    id: "community-share",
    label: "Share your experiences",
    description: "Invites people to ask, recommend and keep their journal. Best sent to Club members, since only Club can post.",
    fields: [],
    usesProducts: false,
  },
  {
    id: "winback",
    label: "We miss you",
    description: "Reminds people of their planner, passport and destination guides.",
    fields: [],
    usesProducts: false,
  },
  {
    id: "limited-offer",
    label: "Take this opportunity",
    description: "A general announcement. The text of the offer is whatever you write below.",
    fields: [
      { key: "offer_text", label: "Offer text (optional)", placeholder: "Leave empty for the default sentence", help: "One or two sentences. Only mention offers that are really live." },
      { key: "cta_url", label: "Button link (optional)", placeholder: "https://rodiclub.com/pages/beneficios" },
    ],
    usesProducts: false,
  },
  {
    id: "new-benefits",
    label: "Meet the new benefits",
    description: "Presents the partner benefits (Booking.com, GetYourGuide, Holafly, Plenti, ARQ and useful tools).",
    fields: [],
    usesProducts: false,
  },
  {
    id: "discount-code",
    label: "Discount code",
    description: "Shows a discount code and three products. The code must already exist in Shopify Admin > Discounts.",
    fields: [
      { key: "discount_code", label: "Discount code", required: true, placeholder: "VIAJA20", help: "Letters, numbers, - and _ only." },
      { key: "discount_label", label: "What it gives", required: true, placeholder: "20%", help: "Shown as \"get 20% off\"." },
      { key: "cta_url", label: "Button link (optional)", placeholder: "https://rodiclub.com/pages/objects" },
      { key: "collection", label: "Collection handle (optional)", placeholder: "Leave empty to use the newest products", help: "The products shown come from this collection." },
    ],
    usesProducts: true,
  },
  {
    id: "new-products",
    label: "New products",
    description: "Shows three products from the catalog.",
    fields: [
      { key: "cta_url", label: "Button link (optional)", placeholder: "https://rodiclub.com/pages/objects" },
      { key: "collection", label: "Collection handle (optional)", placeholder: "Leave empty to use the newest products" },
    ],
    usesProducts: true,
  },
  {
    id: "chapter-launch",
    label: "New Chapter",
    description: "Announces a new Chapter (clothing collection built around one place).",
    fields: [
      { key: "chapter_name", label: "Chapter name", required: true, placeholder: "Lisboa" },
      { key: "chapter_url", label: "Chapter link", required: true, placeholder: "https://rodiclub.com/..." },
      { key: "chapter_tagline", label: "Description (optional)", placeholder: "Leave empty for the default sentence" },
      { key: "chapter_image", label: "Image link (optional)", placeholder: "Leave empty to use the default picture" },
    ],
    usesProducts: false,
  },
];

export const CAMPAIGN_AUDIENCES = [
  { id: "subscribed", label: "Everyone subscribed to marketing emails" },
  { id: "club", label: "Only subscribed customers who are Club members" },
] as const;
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number]["id"];

export const isCampaignTemplate = (id: string): id is CampaignTemplateId => CAMPAIGN_TEMPLATES.some((t) => t.id === id);
export const specFor = (id: string) => CAMPAIGN_TEMPLATES.find((t) => t.id === id);
