// What each marketing email needs from whoever sends it. Shared by the admin screens (client) and the sender (server),
// so it must stay free of server-only imports.

export type CampaignTemplateId =
  | "community-share"
  | "referral"
  | "winback"
  | "limited-offer"
  | "new-benefits"
  | "discount-code"
  | "new-products"
  | "chapter-launch"
  | "dispatch";

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
  // Pulls up to 3 products (at least 1) from the shop's catalog (images and links come from the products themselves).
  usesProducts: boolean;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplateSpec[] = [
  {
    id: "community-share",
    label: "Comparte tus experiencias",
    description: "Invita a preguntar, recomendar y llevar su diario. Mejor para miembros Club, porque solo Club puede publicar.",
    fields: [],
    usesProducts: false,
  },
  {
    id: "referral",
    label: "Refiere a un amigo",
    description: "Cada persona recibe su propio código y enlace de invitación. Cuando su amigo crea su primer viaje, los dos ganan 1 mes de Club (quien invita, hasta 6 meses en total).",
    fields: [],
    usesProducts: false,
  },
  {
    id: "winback",
    label: "Te extrañamos",
    description: "Recuerda su planificador, su pasaporte y las guías de destinos.",
    fields: [],
    usesProducts: false,
  },
  {
    id: "limited-offer",
    label: "Aprovecha esta oportunidad",
    description: "Un anuncio general. El texto de la oferta es el que escribas abajo.",
    fields: [
      { key: "offer_text", label: "Texto de la oferta (opcional)", placeholder: "Déjalo vacío para usar la frase por defecto", help: "Una o dos frases. Menciona solo ofertas que estén realmente vigentes." },
      { key: "cta_url", label: "Enlace del botón (opcional)", placeholder: "https://rodiclub.com/pages/beneficios" },
    ],
    usesProducts: false,
  },
  {
    id: "new-benefits",
    label: "Conoce los nuevos beneficios",
    description: "Presenta los beneficios de aliados (Booking.com, GetYourGuide, Holafly, Plenti, ARQ y herramientas útiles).",
    fields: [],
    usesProducts: false,
  },
  {
    id: "discount-code",
    label: "Código de descuento",
    description: "Muestra un código de descuento y hasta tres productos. El código ya debe existir en Shopify Admin > Descuentos.",
    fields: [
      { key: "discount_code", label: "Código de descuento", required: true, placeholder: "VIAJA20", help: "Solo letras, números, - y _." },
      { key: "discount_label", label: "Qué da", required: true, placeholder: "20%", help: "Se muestra como \"obtén 20% de descuento\"." },
      { key: "cta_url", label: "Enlace del botón (opcional)", placeholder: "https://rodiclub.com/pages/objects" },
      { key: "collection", label: "Handle de la colección (opcional)", placeholder: "Déjalo vacío para usar los productos más nuevos", help: "Los productos que se muestran salen de esta colección." },
    ],
    usesProducts: true,
  },
  {
    id: "new-products",
    label: "Productos nuevos",
    description: "Muestra hasta tres productos del catálogo.",
    fields: [
      { key: "cta_url", label: "Enlace del botón (opcional)", placeholder: "https://rodiclub.com/pages/objects" },
      { key: "collection", label: "Handle de la colección (opcional)", placeholder: "Déjalo vacío para usar los productos más nuevos" },
    ],
    usesProducts: true,
  },
  {
    id: "chapter-launch",
    label: "Nuevo Chapter",
    description: "Anuncia un nuevo Chapter (colección de ropa construida alrededor de un lugar).",
    fields: [
      { key: "chapter_name", label: "Nombre del Chapter", required: true, placeholder: "Lisboa" },
      { key: "chapter_url", label: "Enlace del Chapter", required: true, placeholder: "https://rodiclub.com/..." },
      { key: "chapter_tagline", label: "Descripción (opcional)", placeholder: "Déjalo vacío para usar la frase por defecto" },
      { key: "chapter_image", label: "Enlace de la imagen (opcional)", placeholder: "Déjalo vacío para usar la imagen por defecto" },
    ],
    usesProducts: false,
  },
  {
    id: "dispatch",
    label: "RODI Dispatch (boletín)",
    description: "El boletín periódico: un título, una breve introducción y hasta tres historias (cada una con enlace opcional). Sin promesas de productos ni descuentos que no sean reales.",
    fields: [
      { key: "dispatch_title", label: "Título (también es el asunto)", required: true, placeholder: "Lisboa, before the light" },
      { key: "dispatch_intro", label: "Introducción", required: true, help: "Dos o tres frases con la voz de RODI: lugares, piezas, viajes." },
      { key: "item1_title", label: "Historia 1 — título", required: true },
      { key: "item1_text", label: "Historia 1 — texto", required: true },
      { key: "item1_url", label: "Historia 1 — enlace (opcional)", placeholder: "https://rodiclub.com/..." },
      { key: "item2_title", label: "Historia 2 — título (opcional)" },
      { key: "item2_text", label: "Historia 2 — texto (opcional)" },
      { key: "item2_url", label: "Historia 2 — enlace (opcional)" },
      { key: "item3_title", label: "Historia 3 — título (opcional)" },
      { key: "item3_text", label: "Historia 3 — texto (opcional)" },
      { key: "item3_url", label: "Historia 3 — enlace (opcional)" },
      { key: "cta_url", label: "Enlace del botón (opcional)", placeholder: "Déjalo vacío para usar la página de inicio" },
    ],
    usesProducts: false,
  },
];

export const CAMPAIGN_AUDIENCES = [
  { id: "subscribed", label: "Todos los suscritos a correos de marketing" },
  { id: "club", label: "Solo suscritos que son miembros Club" },
] as const;
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number]["id"];

export const isCampaignTemplate = (id: string): id is CampaignTemplateId => CAMPAIGN_TEMPLATES.some((t) => t.id === id);
export const specFor = (id: string) => CAMPAIGN_TEMPLATES.find((t) => t.id === id);
