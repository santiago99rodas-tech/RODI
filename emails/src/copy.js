// All email wording, by email id and language (es, en, fr, it). Claims here must match what RODI really offers:
// Club (trip planner, Smart Packing, Split, passport + entry requirements, Emergency Mode, Journal, community, partner
// benefits, early access), Chapters (clothing collections built around one place), travel objects, and Services.
// Do not add offers, prices or perks that are not live in the store.
const LANGS = ["es", "en"];

const TAGLINE = {
  es: "Hecho para ir a lugares",
  en: "Made for going places",
};

const COPY = {
  "community-share": {
    es: {
      subject: "Pregunta, recomienda y comparte con la comunidad",
      preheader: "Tu experiencia puede ayudar al próximo viajero.",
      h1: "Comparte tus experiencias",
      p: "Cada viaje deja una historia. Pregunta, recomienda y cuéntale a la comunidad RODI lo que aprendiste para ayudar a otros viajeros.",
      cta: "Ir a la comunidad",
      cols: [
        ["Haz una pregunta", "Plantea tus dudas de viaje y recibe respuestas de otros miembros del Club."],
        ["Recomienda un lugar", "Comparte restaurantes, alojamientos o actividades que valieron la pena."],
        ["Guarda tus recuerdos", "Tu Diario de viaje guarda lo vivido en cada viaje, año tras año."],
      ],
      quote: "Buenas historias inspiran grandes viajes.",
    },
    en: {
      subject: "Ask, recommend and share with the community",
      preheader: "Your experience can help the next traveler.",
      h1: "Share your experiences",
      p: "Every trip leaves a story. Ask questions, recommend places and tell the RODI community what you learned to help other travelers.",
      cta: "Go to the community",
      cols: [
        ["Ask a question", "Bring your travel questions and get answers from other Club members."],
        ["Recommend a place", "Share restaurants, stays or activities that were worth it."],
        ["Keep your memories", "Your Travel Journal keeps what you lived on every trip, year after year."],
      ],
      quote: "Great stories inspire great journeys.",
    },
  },

  referral: {
    es: {
      subject: "Invita a un amigo a RODI Club",
      preheader: "Tu código de invitación, listo para compartir.",
      h1: "Refiere a un amigo",
      p: "<strong>Comparte</strong> RODI Club con quien viaja contigo. Cuando tu amigo se une con tu enlace y crea su primer viaje, <strong>los dos ganan 1 mes de Club</strong>.",
      label: "Tu código de invitación",
      cta: "Compartir mi enlace",
      cols: [
        ["Comparte tu enlace", "Envíalo a quien viaja contigo."],
        ["Tu amigo planea", "Se une con tu enlace y crea su primer viaje."],
        ["Ganan 1 mes de Club", "Los dos reciben 1 mes. Tú puedes sumar hasta 6 meses."],
      ],
      quote: "Viajar es mejor en buena compañía.",
    },
    en: {
      subject: "Invite a friend to RODI Club",
      preheader: "Your invitation code, ready to share.",
      h1: "Refer a friend",
      p: "<strong>Share</strong> RODI Club with the people you travel with. When your friend joins with your link and creates their first trip, <strong>you both get 1 month of Club</strong>.",
      label: "Your invitation code",
      cta: "Share my link",
      cols: [
        ["Share your link", "Send it to the people you travel with."],
        ["Your friend plans", "They join with your link and create their first trip."],
        ["You both get 1 month of Club", "You each get 1 month. You can earn up to 6 months."],
      ],
      quote: "Travel is better in good company.",
    },
  },

  winback: {
    es: {
      subject: "Tu próximo viaje te espera en RODI",
      preheader: "Tu planificador, tu pasaporte y las guías de destinos siguen aquí.",
      h1: "Te extrañamos",
      p: "Hace un tiempo que no nos vemos. Tu planificador, tu pasaporte y las guías de destinos te esperan para tu próximo viaje.",
      cols: [
        ["Destinos y requisitos", "Guías y requisitos de entrada para tu próximo destino."],
        ["Beneficios del Club", "Socios de confianza para alojamiento, actividades y conectividad."],
        ["Tu planificador", "Itinerario, presupuesto, equipaje y documentos en un solo lugar."],
      ],
      cta: "Volver a RODI",
      quote: "Tu próximo viaje empieza aquí.",
    },
    en: {
      subject: "Your next trip is waiting at RODI",
      preheader: "Your planner, your passport and the destination guides are still here.",
      h1: "We miss you",
      p: "It has been a while. Your planner, your passport and the destination guides are waiting for your next trip.",
      cols: [
        ["Destinations and requirements", "Guides and entry requirements for your next destination."],
        ["Club benefits", "Trusted partners for stays, activities and connectivity."],
        ["Your planner", "Itinerary, budget, packing and documents in one place."],
      ],
      cta: "Back to RODI",
      quote: "Your next trip starts here.",
    },
  },

  "limited-offer": {
    es: {
      subject: "Una oportunidad para tu próximo viaje",
      preheader: "Mira lo que preparamos para ti.",
      h1: "Aprovecha esta oportunidad",
      pDefault: "Es un buen momento para planificar tu próximo viaje con RODI. Mira lo que tenemos para ti.",
      cta: "Ver más",
      cols: [
        ["Destinos", "Guías, requisitos de entrada y directorio de embajadas."],
        ["Beneficios de socios", "Ofertas de socios de confianza como Booking.com, GetYourGuide o Holafly."],
        ["Planifica sin complicaciones", "Itinerario, presupuesto y lista de equipaje en un solo lugar."],
      ],
      quote: "Tu próximo viaje empieza aquí.",
    },
    en: {
      subject: "An opportunity for your next trip",
      preheader: "See what we have prepared for you.",
      h1: "Take this opportunity",
      pDefault: "It is a good moment to plan your next trip with RODI. See what we have for you.",
      cta: "See more",
      cols: [
        ["Destinations", "Guides, entry requirements and embassy directory."],
        ["Partner benefits", "Offers from trusted partners such as Booking.com, GetYourGuide or Holafly."],
        ["Plan with ease", "Itinerary, budget and packing list in one place."],
      ],
      quote: "Your next trip starts here.",
    },
  },

  "new-benefits": {
    es: {
      subject: "Nuevos beneficios del Club",
      preheader: "Socios de confianza y herramientas útiles para tu próximo viaje.",
      side: "Socios de confianza<br>Herramientas útiles<br>Viajes más fáciles",
      h1: "Conoce los nuevos <em>beneficios</em>",
      p: "Reunimos en un solo lugar socios de confianza y servicios útiles para que cada viaje sea más fácil, seguro y memorable.",
      rows: [
        ["Alojamiento y actividades", "Booking.com para hoteles y GetYourGuide para tours y entradas."],
        ["Conectividad", "eSIM de Holafly para más de 200 destinos, sin cambiar de SIM."],
        ["Dinero en viaje", "Plenti y ARQ para pagar, ahorrar y gastar en el extranjero en varias monedas."],
        ["Herramientas útiles", "Google Maps, Google Translate, Klook y SmartEX, recomendados para moverte."],
      ],
      cta: "Ver beneficios",
    },
    en: {
      subject: "New Club benefits",
      preheader: "Trusted partners and useful tools for your next trip.",
      side: "Trusted partners<br>Useful tools<br>Easier trips",
      h1: "Meet the new <em>benefits</em>",
      p: "We bring trusted partners and useful services together so every trip is easier, safer and more memorable.",
      rows: [
        ["Stays and activities", "Booking.com for hotels and GetYourGuide for tours and tickets."],
        ["Connectivity", "Holafly eSIM for 200+ destinations, no SIM swap needed."],
        ["Money abroad", "Plenti and ARQ to pay, save and spend abroad in multiple currencies."],
        ["Useful tools", "Google Maps, Google Translate, Klook and SmartEX, recommended to get around."],
      ],
      cta: "See benefits",
    },
  },

  "discount-code": {
    es: {
      subject: "Un descuento para tu próxima compra",
      preheader: "Usa tu código en tu próxima compra.",
      h1: "Tenemos un descuento para ti",
      sub: "Objetos de viaje<br>y prendas RODI.",
      p: "Usa tu código en una selección de nuestros objetos de viaje y prendas.",
      label: "Tu código de descuento",
      note: "Utilízalo en tu próxima compra<br>y obtén {{ discount_label }} de descuento.",
      cta: "Usar mi descuento",
    },
    en: {
      subject: "A discount for your next purchase",
      preheader: "Use your code on your next purchase.",
      h1: "We have a discount for you",
      sub: "Travel objects<br>and RODI clothing.",
      p: "Use your code on a selection of our travel objects and clothing.",
      label: "Your discount code",
      note: "Use it on your next purchase<br>and get {{ discount_label }} off.",
      cta: "Use my discount",
    },
  },

  "new-products": {
    es: { subject: "Nuevo en RODI", preheader: "Piezas nuevas para acompañarte en cada destino.", eyebrow: "Novedades", h1: "Descubre los nuevos productos", p: "Piezas nuevas para acompañarte en cada destino.", badge: "Nuevo", cta: "Ver novedades" },
    en: { subject: "New at RODI", preheader: "New pieces to go with you to every destination.", eyebrow: "What's new", h1: "Discover the new products", p: "New pieces to go with you to every destination.", badge: "New", cta: "See what's new" },
  },

  "chapter-launch": {
    es: {
      subject: "Nuevo Chapter: {{ chapter.name }}",
      preheader: "Una colección de ropa inspirada en un lugar.",
      h1: "Descubre el nuevo Chapter",
      tagline: "Una colección de ropa construida alrededor de un lugar: su color, su textura, su ritmo.",
      p2: "Series limitadas, ligadas a ese lugar y a ese momento.",
      cta: "Explorar Chapter",
    },
    en: {
      subject: "New Chapter: {{ chapter.name }}",
      preheader: "A clothing collection inspired by one place.",
      h1: "Discover the new Chapter",
      tagline: "A clothing collection built around one place: its colour, its texture, its pace.",
      p2: "Limited runs, tied to that place and that moment.",
      cta: "Explore Chapter",
    },
  },

  "abandoned-checkout": {
    es: {
      why: "Recibes este correo porque dejaste productos en tu carrito de RODI.",
      subject: "Tu carrito sigue esperándote",
      preheader: "Completa tu compra y prepárate para tu próxima aventura.",
      h1: "Tu carrito sigue esperándote",
      p: "Aún tienes piezas especiales en tu carrito. Completa tu compra y prepárate para tu próxima aventura.",
      cta: "Volver al carrito",
      trust: [["truck", "Costo de envío<br>visible antes de pagar"], ["box", "Derecho de retracto<br>según tu país"], ["globe", "Diseñado para<br>viajeros modernos"]],
    },
    en: {
      subject: "Your cart is still waiting",
      preheader: "Complete your purchase and get ready for your next adventure.",
      why: "You are receiving this email because you left items in your RODI cart.",
      h1: "Your cart is still waiting",
      p: "You still have special pieces in your cart. Complete your purchase and get ready for your next adventure.",
      cta: "Back to my cart",
      trust: [["truck", "Shipping cost<br>shown before you pay"], ["box", "Right of withdrawal<br>per your country"], ["globe", "Designed for<br>modern travelers"]],
    },
  },

  "order-confirmation": {
    es: { subject: "Tu compra fue exitosa. Pedido {{ order_name }}", preheader: "Hemos recibido tu pedido y ya está en proceso de preparación.", eyebrow: "Gracias por ser parte de RODI", h1: "Tu compra fue exitosa", p: "Hemos recibido tu pedido y ya está en proceso de preparación. Te enviaremos un correo cuando sea despachado.", summary: "Resumen del pedido", order: "Pedido", subtotal: "Subtotal", discount: "Descuento", shipping: "Envío", free: "Gratis", taxes: "Impuestos", total: "Total", shipTo: "Enviar a", cta: "Ver pedido" },
    en: { subject: "Your purchase was successful. Order {{ order_name }}", preheader: "We have received your order and it is being prepared.", eyebrow: "Thank you for being part of RODI", h1: "Your purchase was successful", p: "We have received your order and it is being prepared. We will email you when it ships.", summary: "Order summary", order: "Order", subtotal: "Subtotal", discount: "Discount", shipping: "Shipping", free: "Free", taxes: "Taxes", total: "Total", shipTo: "Ship to", cta: "View order" },
  },

  "welcome-club": {
    es: {
      subject: "Bienvenido a RODI Club",
      preheader: "Tu planificador de viajes, tu pasaporte y tus beneficios, en un solo lugar.",
      h1: "Bienvenido a<br>RODI Club",
      p: "Nos alegra tenerte con nosotros. RODI Club es tu espacio para planificar tus viajes, guardar tus destinos y acceder a los beneficios y lanzamientos de RODI.",
      cols: [
        ["Planifica tu viaje", "Itinerario, presupuesto, Smart Packing y documentos con alertas."],
        ["Tu pasaporte", "Tus nacionalidades y los requisitos de entrada para cualquier destino."],
        ["Beneficios y comunidad", "Ofertas de socios, la comunidad del Club y acceso anticipado a lanzamientos."],
      ],
      cta: "Comenzar",
    },
    en: {
      subject: "Welcome to RODI Club",
      preheader: "Your trip planner, your passport and your benefits, in one place.",
      h1: "Welcome to<br>RODI Club",
      p: "We are glad to have you with us. RODI Club is your space to plan your trips, save your destinations and access RODI's benefits and releases.",
      cols: [
        ["Plan your trip", "Itinerary, budget, Smart Packing and documents with alerts."],
        ["Your passport", "Your nationalities and the entry requirements for any destination."],
        ["Benefits and community", "Partner offers, the Club community and early access to releases."],
      ],
      cta: "Get started",
    },
  },

  "account-ready": {
    es: {
      subject: "Tu cuenta ya está lista",
      preheader: "Tienes acceso completo a RODI Club sin costo.",
      eyebrow: "Bienvenido a RODI Club",
      h1: "Tu cuenta ya está lista",
      p: "Tienes {{ promo_months }} {% if promo_months == 1 %}mes{% else %}meses{% endif %} de acceso completo a RODI Club sin costo.",
      until: "Disponible hasta el {{ access_until }}.",
      items: [
        ["plane", "Viajes sin límite", "Planifica todos los viajes que quieras, con presupuesto y Split de gastos."],
        ["briefcase", "Smart Packing y Toolkit", "Listas de equipaje inteligentes y el toolkit de viaje completo."],
        ["bell", "Modo emergencia", "Contactos personalizados y las embajadas de tu nacionalidad en Portugal y Marruecos."],
        ["globe", "Diario y comunidad", "Diario de viaje, Mapa de memorias y la comunidad del Club para preguntar y recomendar."],
      ],
      cta: "Explorar RODI Club",
    },
    en: {
      subject: "Your account is ready",
      preheader: "You have full RODI Club access at no cost.",
      eyebrow: "Welcome to RODI Club",
      h1: "Your account is ready",
      p: "You have {{ promo_months }} {% if promo_months == 1 %}month{% else %}months{% endif %} of full RODI Club access at no cost.",
      until: "Available until {{ access_until }}.",
      items: [
        ["plane", "Unlimited trips", "Plan as many trips as you like, with budget and Split Expenses."],
        ["briefcase", "Smart Packing and Toolkit", "Smart packing lists and the full travel toolkit."],
        ["bell", "Emergency Mode", "Personalized contacts and your nationality's embassies in Portugal and Morocco."],
        ["globe", "Journal and community", "Travel Journal, Memory Map and the Club community to ask and recommend."],
      ],
      cta: "Explore RODI Club",
    },
  },

  "verification-code": {
    es: { subject: "Tu código de verificación", preheader: "Úsalo para verificar tu cuenta en RODI.", h1: "Tu código de<br>verificación", p: "Usa el siguiente código para verificar tu cuenta en RODI y continuar tu experiencia.", once: "Este código solo puede usarse una vez. Expira en {{ expires_in_minutes | default: 15 }} minutos.", cta: "Ir a RODI", didnt: "¿No solicitaste este código?", support: "Contacta a nuestro equipo de soporte." },
    en: { subject: "Your verification code", preheader: "Use it to verify your RODI account.", h1: "Your verification<br>code", p: "Use the code below to verify your RODI account and continue your experience.", once: "This code can only be used once. It expires in {{ expires_in_minutes | default: 15 }} minutes.", cta: "Go to RODI", didnt: "Did not request this code?", support: "Contact our support team." },
  },
};

// Double opt-in confirmation (Shopify notification "Customer marketing confirmation"). {{ customer.subscribe_url }} is
// Shopify's own confirmation link; the person is only subscribed after clicking it.
COPY["marketing-confirmation"] = {
  es: {
    subject: "Confirma tu suscripción a RODI",
    preheader: "Un clic y listo: te avisaremos de lanzamientos y novedades.",
    eyebrow: "Un último paso",
    h1: "Confirma tu<br>suscripción",
    p: "Pediste recibir correos de RODI: el aviso cuando abra la venta de una pieza, nuevos Chapters y novedades del Club. Confirma con un clic para que podamos escribirte.",
    cta: "Confirmar suscripción",
    ignore: "Si no fuiste tú, ignora este correo: no te suscribiremos y no volverás a recibirlo.",
    unsub: "Puedes darte de baja en cualquier correo que te enviemos.",
  },
  en: {
    subject: "Confirm your RODI subscription",
    preheader: "One click and you're in: we'll tell you about launches and news.",
    eyebrow: "One last step",
    h1: "Confirm your<br>subscription",
    p: "You asked to receive emails from RODI: a note when a piece goes on sale, new Chapters and Club news. Confirm with one click so we can write to you.",
    cta: "Confirm subscription",
    ignore: "If this wasn't you, ignore this email: we won't subscribe you and you won't get it again.",
    unsub: "You can unsubscribe from any email we send.",
  },
};

// copy("id", "es") -> strings; all("id", "subject") -> { es, en, fr, it }
const copy = (id, lang) => COPY[id][lang];
// C8 (DEC-050) — RODI Dispatch: periodic newsletter. Title, intro and up to three stories are written per issue
// in the app (Campaigns); only the fixed labels live here.
COPY["dispatch"] = {
  es: { subject: "{{ dispatch.title }}", preheader: "El despacho de RODI: lugares, piezas y viajes.", eyebrow: "RODI Dispatch", read: "Leer más", cta: "Explorar RODI", quote: "Hecho para ir a lugares." },
  en: { subject: "{{ dispatch.title }}", preheader: "The RODI dispatch: places, pieces and journeys.", eyebrow: "RODI Dispatch", read: "Read more", cta: "Explore RODI", quote: "Made for going places." },
};

// Parent/guardian authorization for a member aged 15-17 (sent by the app, see app/legal.server.ts). {{ member_name }} is
// the member's first name and may be blank; {{ consent_url }} is the signed link to the authorization page.
COPY["guardian-consent"] = {
  es: {
    subject: "Autorización para la cuenta de un menor en RODI Club",
    preheader: "Necesitamos tu autorización antes de activar su cuenta.",
    h1: "Tu autorización",
    named: "{{ member_name | escape }} creó una cuenta en RODI Club e indicó que eres su madre, padre o tutor legal.",
    anon: "Una persona menor de edad creó una cuenta en RODI Club e indicó que eres su madre, padre o tutor legal.",
    p: "Como tiene entre 15 y 17 años, su cuenta queda en pausa hasta que la autorices. En la página verás qué datos tratamos, las restricciones que aplicamos a los menores y podrás aceptar o rechazar.",
    cta: "Revisar y responder",
    expires: "El enlace vence en 30 días. Si no esperabas este correo, puedes ignorarlo: la cuenta seguirá en pausa.",
  },
  en: {
    subject: "Authorization for a minor's RODI Club account",
    preheader: "We need your authorization before their account is activated.",
    h1: "Your authorization",
    named: "{{ member_name | escape }} created a RODI Club account and named you as their parent or legal guardian.",
    anon: "A minor created a RODI Club account and named you as their parent or legal guardian.",
    p: "Because they are between 15 and 17, their account stays paused until you authorize it. The page explains what data we process and the restrictions we apply to minors, and lets you accept or decline.",
    cta: "Review and respond",
    expires: "The link expires in 30 days. If you were not expecting this email you can ignore it: the account will stay paused.",
  },
};

// Sender identification line in every footer ("Operado por <legal name> · NIT <tax id> · <address>"). The values come
// from LEGAL_NAME / LEGAL_TAX_ID / LEGAL_ADDRESS (see lib/components.js); only the labels live here.
const LEGAL_FOOTER = {
  es: { operatedBy: "Operado por", taxId: "NIT" },
  en: { operatedBy: "Operated by", taxId: "NIT" },
};

const all = (id, key) => Object.fromEntries(LANGS.map((l) => [l, COPY[id][l][key]]));
const tagline = (lang) => TAGLINE[lang];

module.exports = { LANGS, copy, all, tagline, LEGAL_FOOTER };
