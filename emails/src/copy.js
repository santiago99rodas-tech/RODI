// All email wording, by email id and language (es, en, fr, it). Claims here must match what RODI really offers:
// Club (trip planner, Smart Packing, Split, passport + entry requirements, Emergency Mode, Journal, community, partner
// benefits, early access), Chapters (clothing collections built around one place), travel objects, and Services.
// Do not add offers, prices or perks that are not live in the store.
const LANGS = ["es", "en", "fr", "it"];

const TAGLINE = {
  es: "Tu vida viajera, en un solo lugar",
  en: "Your travel life, in one place",
  fr: "Votre vie de voyageur, en un seul endroit",
  it: "La tua vita da viaggiatore, in un unico posto",
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
    fr: {
      subject: "Posez vos questions, recommandez et partagez avec la communauté",
      preheader: "Votre expérience peut aider le prochain voyageur.",
      h1: "Partagez vos expériences",
      p: "Chaque voyage laisse une histoire. Posez vos questions, recommandez des adresses et racontez à la communauté RODI ce que vous avez appris pour aider d'autres voyageurs.",
      cta: "Aller à la communauté",
      cols: [
        ["Posez une question", "Posez vos questions de voyage et recevez les réponses d'autres membres du Club."],
        ["Recommandez une adresse", "Partagez restaurants, hébergements ou activités qui en valaient la peine."],
        ["Gardez vos souvenirs", "Votre Journal de voyage garde ce que vous avez vécu à chaque voyage, année après année."],
      ],
      quote: "Les belles histoires inspirent les grands voyages.",
    },
    it: {
      subject: "Chiedi, consiglia e condividi con la community",
      preheader: "La tua esperienza può aiutare il prossimo viaggiatore.",
      h1: "Condividi le tue esperienze",
      p: "Ogni viaggio lascia una storia. Fai domande, consiglia luoghi e racconta alla community RODI quello che hai imparato per aiutare altri viaggiatori.",
      cta: "Vai alla community",
      cols: [
        ["Fai una domanda", "Porta i tuoi dubbi di viaggio e ricevi risposte da altri membri del Club."],
        ["Consiglia un posto", "Condividi ristoranti, alloggi o attività che ne valevano la pena."],
        ["Conserva i tuoi ricordi", "Il tuo Diario di viaggio conserva ciò che hai vissuto in ogni viaggio, anno dopo anno."],
      ],
      quote: "Le belle storie ispirano grandi viaggi.",
    },
  },

  referral: {
    es: {
      subject: "Invita a un amigo a RODI Club",
      preheader: "Tu código de invitación, listo para compartir.",
      h1: "Refiere a un amigo",
      p: "<strong>Comparte</strong> RODI Club con quien viaja contigo. Con tu código, tu amigo se une y pueden planear sus viajes en un solo lugar.",
      label: "Tu código de invitación",
      cta: "Compartir código",
      cols: [
        ["Comparte tu código", "Envíalo a quien viaja contigo."],
        ["Tu amigo se une", "Crea su cuenta con tu código."],
        ["Planeen juntos", "Añade a tus compañeros al viaje y dividan los gastos con Split."],
      ],
      quote: "Viajar es mejor en buena compañía.",
    },
    en: {
      subject: "Invite a friend to RODI Club",
      preheader: "Your invitation code, ready to share.",
      h1: "Refer a friend",
      p: "<strong>Share</strong> RODI Club with the people you travel with. With your code, your friend joins and you can plan your trips in one place.",
      label: "Your invitation code",
      cta: "Share code",
      cols: [
        ["Share your code", "Send it to the people you travel with."],
        ["Your friend joins", "They create their account with your code."],
        ["Plan together", "Add your companions to the trip and split expenses with Split."],
      ],
      quote: "Travel is better in good company.",
    },
    fr: {
      subject: "Invitez un ami à RODI Club",
      preheader: "Votre code d'invitation, prêt à partager.",
      h1: "Parrainez un ami",
      p: "<strong>Partagez</strong> RODI Club avec ceux qui voyagent avec vous. Avec votre code, votre ami nous rejoint et vous planifiez vos voyages au même endroit.",
      label: "Votre code d'invitation",
      cta: "Partager le code",
      cols: [
        ["Partagez votre code", "Envoyez-le à ceux qui voyagent avec vous."],
        ["Votre ami nous rejoint", "Il crée son compte avec votre code."],
        ["Planifiez ensemble", "Ajoutez vos compagnons au voyage et partagez les dépenses avec Split."],
      ],
      quote: "Voyager est plus beau en bonne compagnie.",
    },
    it: {
      subject: "Invita un amico a RODI Club",
      preheader: "Il tuo codice d'invito, pronto da condividere.",
      h1: "Invita un amico",
      p: "<strong>Condividi</strong> RODI Club con chi viaggia con te. Con il tuo codice il tuo amico si unisce e potete pianificare i viaggi in un unico posto.",
      label: "Il tuo codice d'invito",
      cta: "Condividi il codice",
      cols: [
        ["Condividi il tuo codice", "Invialo a chi viaggia con te."],
        ["Il tuo amico si unisce", "Crea il suo account con il tuo codice."],
        ["Pianificate insieme", "Aggiungi i compagni al viaggio e dividete le spese con Split."],
      ],
      quote: "Viaggiare è meglio in buona compagnia.",
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
    fr: {
      subject: "Votre prochain voyage vous attend chez RODI",
      preheader: "Votre planificateur, votre passeport et les guides de destinations sont toujours là.",
      h1: "Vous nous manquez",
      p: "Cela fait un moment. Votre planificateur, votre passeport et les guides de destinations vous attendent pour votre prochain voyage.",
      cols: [
        ["Destinations et conditions", "Guides et conditions d'entrée pour votre prochaine destination."],
        ["Avantages du Club", "Des partenaires de confiance pour l'hébergement, les activités et la connectivité."],
        ["Votre planificateur", "Itinéraire, budget, bagages et documents au même endroit."],
      ],
      cta: "Revenir sur RODI",
      quote: "Votre prochain voyage commence ici.",
    },
    it: {
      subject: "Il tuo prossimo viaggio ti aspetta su RODI",
      preheader: "Il tuo planner, il tuo passaporto e le guide delle destinazioni sono sempre qui.",
      h1: "Ci manchi",
      p: "È passato un po'. Il tuo planner, il tuo passaporto e le guide delle destinazioni ti aspettano per il prossimo viaggio.",
      cols: [
        ["Destinazioni e requisiti", "Guide e requisiti d'ingresso per la tua prossima destinazione."],
        ["Vantaggi del Club", "Partner di fiducia per alloggi, attività e connettività."],
        ["Il tuo planner", "Itinerario, budget, bagagli e documenti in un unico posto."],
      ],
      cta: "Torna su RODI",
      quote: "Il tuo prossimo viaggio inizia qui.",
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
    fr: {
      subject: "Une opportunité pour votre prochain voyage",
      preheader: "Découvrez ce que nous avons préparé pour vous.",
      h1: "Profitez de cette opportunité",
      pDefault: "C'est le bon moment pour planifier votre prochain voyage avec RODI. Découvrez ce que nous avons pour vous.",
      cta: "En savoir plus",
      cols: [
        ["Destinations", "Guides, conditions d'entrée et annuaire des ambassades."],
        ["Avantages partenaires", "Des offres de partenaires de confiance comme Booking.com, GetYourGuide ou Holafly."],
        ["Planifiez sans complications", "Itinéraire, budget et liste de bagages au même endroit."],
      ],
      quote: "Votre prochain voyage commence ici.",
    },
    it: {
      subject: "Un'opportunità per il tuo prossimo viaggio",
      preheader: "Scopri cosa abbiamo preparato per te.",
      h1: "Approfitta di questa opportunità",
      pDefault: "È un buon momento per pianificare il prossimo viaggio con RODI. Scopri cosa abbiamo per te.",
      cta: "Scopri di più",
      cols: [
        ["Destinazioni", "Guide, requisiti d'ingresso ed elenco delle ambasciate."],
        ["Vantaggi dei partner", "Offerte di partner di fiducia come Booking.com, GetYourGuide o Holafly."],
        ["Pianifica senza complicazioni", "Itinerario, budget e lista bagagli in un unico posto."],
      ],
      quote: "Il tuo prossimo viaggio inizia qui.",
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
    fr: {
      subject: "Nouveaux avantages du Club",
      preheader: "Des partenaires de confiance et des outils utiles pour votre prochain voyage.",
      side: "Partenaires de confiance<br>Outils utiles<br>Voyages plus simples",
      h1: "Découvrez les nouveaux <em>avantages</em>",
      p: "Nous réunissons au même endroit des partenaires de confiance et des services utiles pour que chaque voyage soit plus simple, plus sûr et plus mémorable.",
      rows: [
        ["Hébergement et activités", "Booking.com pour les hôtels et GetYourGuide pour les visites et billets."],
        ["Connectivité", "eSIM Holafly pour plus de 200 destinations, sans changer de SIM."],
        ["L'argent en voyage", "Plenti et ARQ pour payer, épargner et dépenser à l'étranger en plusieurs devises."],
        ["Outils utiles", "Google Maps, Google Translate, Klook et SmartEX, recommandés pour vous déplacer."],
      ],
      cta: "Voir les avantages",
    },
    it: {
      subject: "Nuovi vantaggi del Club",
      preheader: "Partner di fiducia e strumenti utili per il tuo prossimo viaggio.",
      side: "Partner di fiducia<br>Strumenti utili<br>Viaggi più semplici",
      h1: "Scopri i nuovi <em>vantaggi</em>",
      p: "Riuniamo in un unico posto partner di fiducia e servizi utili perché ogni viaggio sia più facile, sicuro e memorabile.",
      rows: [
        ["Alloggi e attività", "Booking.com per gli hotel e GetYourGuide per tour e biglietti."],
        ["Connettività", "eSIM Holafly per oltre 200 destinazioni, senza cambiare SIM."],
        ["Soldi in viaggio", "Plenti e ARQ per pagare, risparmiare e spendere all'estero in più valute."],
        ["Strumenti utili", "Google Maps, Google Translate, Klook e SmartEX, consigliati per muoverti."],
      ],
      cta: "Vedi i vantaggi",
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
    fr: {
      subject: "Une remise pour votre prochain achat",
      preheader: "Utilisez votre code lors de votre prochain achat.",
      h1: "Nous avons une remise pour vous",
      sub: "Objets de voyage<br>et vêtements RODI.",
      p: "Utilisez votre code sur une sélection de nos objets de voyage et vêtements.",
      label: "Votre code de réduction",
      note: "Utilisez-le lors de votre prochain achat<br>et obtenez {{ discount_label }} de réduction.",
      cta: "Utiliser ma remise",
    },
    it: {
      subject: "Uno sconto per il tuo prossimo acquisto",
      preheader: "Usa il tuo codice al prossimo acquisto.",
      h1: "Abbiamo uno sconto per te",
      sub: "Oggetti da viaggio<br>e abiti RODI.",
      p: "Usa il tuo codice su una selezione dei nostri oggetti da viaggio e abiti.",
      label: "Il tuo codice sconto",
      note: "Usalo al tuo prossimo acquisto<br>e ottieni {{ discount_label }} di sconto.",
      cta: "Usa il mio sconto",
    },
  },

  "new-products": {
    es: { subject: "Nuevo en RODI", preheader: "Piezas nuevas para acompañarte en cada destino.", eyebrow: "Novedades", h1: "Descubre los nuevos productos", p: "Piezas nuevas para acompañarte en cada destino.", badge: "Nuevo", cta: "Ver novedades" },
    en: { subject: "New at RODI", preheader: "New pieces to go with you to every destination.", eyebrow: "What's new", h1: "Discover the new products", p: "New pieces to go with you to every destination.", badge: "New", cta: "See what's new" },
    fr: { subject: "Nouveau chez RODI", preheader: "De nouvelles pièces pour vous accompagner dans chaque destination.", eyebrow: "Nouveautés", h1: "Découvrez les nouveaux produits", p: "De nouvelles pièces pour vous accompagner dans chaque destination.", badge: "Nouveau", cta: "Voir les nouveautés" },
    it: { subject: "Novità da RODI", preheader: "Nuovi pezzi per accompagnarti in ogni destinazione.", eyebrow: "Novità", h1: "Scopri i nuovi prodotti", p: "Nuovi pezzi per accompagnarti in ogni destinazione.", badge: "Nuovo", cta: "Scopri le novità" },
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
    fr: {
      subject: "Nouveau Chapter : {{ chapter.name }}",
      preheader: "Une collection de vêtements inspirée d'un lieu.",
      h1: "Découvrez le nouveau Chapter",
      tagline: "Une collection de vêtements construite autour d'un lieu : sa couleur, sa texture, son rythme.",
      p2: "Séries limitées, liées à ce lieu et à ce moment.",
      cta: "Découvrir le Chapter",
    },
    it: {
      subject: "Nuovo Chapter: {{ chapter.name }}",
      preheader: "Una collezione di abiti ispirata a un luogo.",
      h1: "Scopri il nuovo Chapter",
      tagline: "Una collezione di abiti costruita attorno a un luogo: il suo colore, la sua texture, il suo ritmo.",
      p2: "Edizioni limitate, legate a quel luogo e a quel momento.",
      cta: "Esplora il Chapter",
    },
  },

  "abandoned-checkout": {
    es: {
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
      h1: "Your cart is still waiting",
      p: "You still have special pieces in your cart. Complete your purchase and get ready for your next adventure.",
      cta: "Back to my cart",
      trust: [["truck", "Shipping cost<br>shown before you pay"], ["box", "Right of withdrawal<br>per your country"], ["globe", "Designed for<br>modern travelers"]],
    },
    fr: {
      subject: "Votre panier vous attend",
      preheader: "Finalisez votre achat et préparez votre prochaine aventure.",
      h1: "Votre panier vous attend",
      p: "Il vous reste des articles dans votre panier. Finalisez votre achat et préparez votre prochaine aventure.",
      cta: "Retourner au panier",
      trust: [["truck", "Frais de livraison<br>affichés avant le paiement"], ["box", "Droit de rétractation<br>selon votre pays"], ["globe", "Conçu pour les<br>voyageurs modernes"]],
    },
    it: {
      subject: "Il tuo carrello ti aspetta",
      preheader: "Completa l'acquisto e preparati alla tua prossima avventura.",
      h1: "Il tuo carrello ti aspetta",
      p: "Hai ancora degli articoli nel carrello. Completa l'acquisto e preparati alla tua prossima avventura.",
      cta: "Torna al carrello",
      trust: [["truck", "Costo di spedizione<br>mostrato prima del pagamento"], ["box", "Diritto di recesso<br>secondo il tuo paese"], ["globe", "Pensato per i<br>viaggiatori moderni"]],
    },
  },

  "order-confirmation": {
    es: { subject: "Tu compra fue exitosa. Pedido {{ order_name }}", preheader: "Hemos recibido tu pedido y ya está en proceso de preparación.", eyebrow: "Gracias por ser parte de RODI", h1: "Tu compra fue exitosa", p: "Hemos recibido tu pedido y ya está en proceso de preparación. Te enviaremos un correo cuando sea despachado.", summary: "Resumen del pedido", order: "Pedido", subtotal: "Subtotal", discount: "Descuento", shipping: "Envío", free: "Gratis", taxes: "Impuestos", total: "Total", shipTo: "Enviar a", cta: "Ver pedido" },
    en: { subject: "Your purchase was successful. Order {{ order_name }}", preheader: "We have received your order and it is being prepared.", eyebrow: "Thank you for being part of RODI", h1: "Your purchase was successful", p: "We have received your order and it is being prepared. We will email you when it ships.", summary: "Order summary", order: "Order", subtotal: "Subtotal", discount: "Discount", shipping: "Shipping", free: "Free", taxes: "Taxes", total: "Total", shipTo: "Ship to", cta: "View order" },
    fr: { subject: "Votre achat a bien été effectué. Commande {{ order_name }}", preheader: "Nous avons bien reçu votre commande et elle est en cours de préparation.", eyebrow: "Merci de faire partie de RODI", h1: "Votre achat a bien été effectué", p: "Nous avons bien reçu votre commande et elle est en cours de préparation. Nous vous enverrons un e-mail lors de son expédition.", summary: "Récapitulatif de la commande", order: "Commande", subtotal: "Sous-total", discount: "Réduction", shipping: "Livraison", free: "Gratuite", taxes: "Taxes", total: "Total", shipTo: "Livrer à", cta: "Voir la commande" },
    it: { subject: "Il tuo acquisto è andato a buon fine. Ordine {{ order_name }}", preheader: "Abbiamo ricevuto il tuo ordine ed è in preparazione.", eyebrow: "Grazie di far parte di RODI", h1: "Il tuo acquisto è andato a buon fine", p: "Abbiamo ricevuto il tuo ordine ed è in preparazione. Ti invieremo un'email quando verrà spedito.", summary: "Riepilogo dell'ordine", order: "Ordine", subtotal: "Subtotale", discount: "Sconto", shipping: "Spedizione", free: "Gratuita", taxes: "Imposte", total: "Totale", shipTo: "Spedire a", cta: "Vedi l'ordine" },
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
    fr: {
      subject: "Bienvenue chez RODI Club",
      preheader: "Votre planificateur de voyages, votre passeport et vos avantages, au même endroit.",
      h1: "Bienvenue chez<br>RODI Club",
      p: "Nous sommes ravis de vous compter parmi nous. RODI Club est votre espace pour planifier vos voyages, enregistrer vos destinations et accéder aux avantages et aux nouveautés de RODI.",
      cols: [
        ["Planifiez votre voyage", "Itinéraire, budget, Smart Packing et documents avec alertes."],
        ["Votre passeport", "Vos nationalités et les conditions d'entrée pour toute destination."],
        ["Avantages et communauté", "Offres de partenaires, communauté du Club et accès anticipé aux sorties."],
      ],
      cta: "Commencer",
    },
    it: {
      subject: "Benvenuto in RODI Club",
      preheader: "Il tuo planner di viaggio, il tuo passaporto e i tuoi vantaggi, in un unico posto.",
      h1: "Benvenuto in<br>RODI Club",
      p: "Siamo felici di averti con noi. RODI Club è il tuo spazio per pianificare i viaggi, salvare le destinazioni e accedere ai vantaggi e alle novità di RODI.",
      cols: [
        ["Pianifica il viaggio", "Itinerario, budget, Smart Packing e documenti con avvisi."],
        ["Il tuo passaporto", "Le tue nazionalità e i requisiti d'ingresso per qualsiasi destinazione."],
        ["Vantaggi e community", "Offerte dei partner, community del Club e accesso anticipato alle novità."],
      ],
      cta: "Inizia",
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
    fr: {
      subject: "Votre compte est prêt",
      preheader: "Vous avez un accès complet à RODI Club, offert.",
      eyebrow: "Bienvenue chez RODI Club",
      h1: "Votre compte est prêt",
      p: "Vous bénéficiez de {{ promo_months }} mois d'accès complet à RODI Club, sans frais.",
      until: "Disponible jusqu'au {{ access_until }}.",
      items: [
        ["plane", "Voyages illimités", "Planifiez autant de voyages que vous le souhaitez, avec budget et partage des dépenses."],
        ["briefcase", "Smart Packing et Toolkit", "Des listes de bagages intelligentes et la boîte à outils de voyage complète."],
        ["bell", "Mode urgence", "Contacts personnalisés et ambassades de votre nationalité au Portugal et au Maroc."],
        ["globe", "Journal et communauté", "Journal de voyage, carte des souvenirs et communauté du Club pour questionner et recommander."],
      ],
      cta: "Découvrir RODI Club",
    },
    it: {
      subject: "Il tuo account è pronto",
      preheader: "Hai accesso completo a RODI Club, in omaggio.",
      eyebrow: "Benvenuto in RODI Club",
      h1: "Il tuo account è pronto",
      p: "Hai {{ promo_months }} {% if promo_months == 1 %}mese{% else %}mesi{% endif %} di accesso completo a RODI Club, senza costi.",
      until: "Disponibile fino al {{ access_until }}.",
      items: [
        ["plane", "Viaggi illimitati", "Pianifica quanti viaggi vuoi, con budget e Split delle spese."],
        ["briefcase", "Smart Packing e Toolkit", "Liste bagagli intelligenti e il toolkit di viaggio completo."],
        ["bell", "Modalità emergenza", "Contatti personalizzati e le ambasciate della tua nazionalità in Portogallo e Marocco."],
        ["globe", "Diario e community", "Diario di viaggio, Mappa dei ricordi e la community del Club per chiedere e consigliare."],
      ],
      cta: "Esplora RODI Club",
    },
  },

  "verification-code": {
    es: { subject: "Tu código de verificación", preheader: "Úsalo para verificar tu cuenta en RODI.", h1: "Tu código de<br>verificación", p: "Usa el siguiente código para verificar tu cuenta en RODI y continuar tu experiencia.", once: "Este código solo puede usarse una vez. Expira en {{ expires_in_minutes | default: 15 }} minutos.", cta: "Ir a RODI", didnt: "¿No solicitaste este código?", support: "Contacta a nuestro equipo de soporte." },
    en: { subject: "Your verification code", preheader: "Use it to verify your RODI account.", h1: "Your verification<br>code", p: "Use the code below to verify your RODI account and continue your experience.", once: "This code can only be used once. It expires in {{ expires_in_minutes | default: 15 }} minutes.", cta: "Go to RODI", didnt: "Did not request this code?", support: "Contact our support team." },
    fr: { subject: "Votre code de vérification", preheader: "Utilisez-le pour vérifier votre compte RODI.", h1: "Votre code de<br>vérification", p: "Utilisez le code ci-dessous pour vérifier votre compte RODI et poursuivre.", once: "Ce code ne peut être utilisé qu'une seule fois. Il expire dans {{ expires_in_minutes | default: 15 }} minutes.", cta: "Aller sur RODI", didnt: "Vous n'avez pas demandé ce code ?", support: "Contactez notre équipe d'assistance." },
    it: { subject: "Il tuo codice di verifica", preheader: "Usalo per verificare il tuo account RODI.", h1: "Il tuo codice di<br>verifica", p: "Usa il codice qui sotto per verificare il tuo account RODI e continuare.", once: "Questo codice può essere usato una sola volta. Scade tra {{ expires_in_minutes | default: 15 }} minuti.", cta: "Vai su RODI", didnt: "Non hai richiesto questo codice?", support: "Contatta il nostro team di assistenza." },
  },
};

// copy("id", "es") -> strings; all("id", "subject") -> { es, en, fr, it }
const copy = (id, lang) => COPY[id][lang];
const all = (id, key) => Object.fromEntries(LANGS.map((l) => [l, COPY[id][l][key]]));
const tagline = (lang) => TAGLINE[lang];

module.exports = { LANGS, copy, all, tagline };
