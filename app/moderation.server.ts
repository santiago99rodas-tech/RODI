// Community content filter: nothing that breaks the Community Guidelines gets published.
// Layer 1 (always on, no network): normalised word lists in ES / EN / PT / FR / IT — hate and slurs, insults and
// profanity, sexual and pornographic content, threats and violence, child sexual exploitation, sexual spam.
// Layer 2 (optional): if OPENAI_API_KEY is set, OpenAI's free moderation endpoint also reviews the text (and images,
// should posts ever carry them). If that call fails the word lists still decide; it never blocks on its own outage.
// The server is the only judge: the theme's live warning asks this same code through op communityCheck.

export type ModerationCategory = "hate" | "harassment" | "sexual" | "violence" | "minors" | "spam";
export type ModerationResult = { ok: true } | { ok: false; category: ModerationCategory };

/**
 * Lower-case, no accents, common look-alike characters mapped back to letters (p3rr4 -> perra, @ -> a, $ -> s),
 * letters repeated three or more times collapsed (puuuuta -> puta), and letters split by dots, dashes or spaces
 * re-joined (p.u.t.a / p u t a -> puta), so the usual tricks do not get past the lists.
 */
export function normalizeForModeration(input: string): string {
  let s = String(input ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const leet: Record<string, string> = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "€": "e" };
  s = s.replace(/[0134578!|@$€9]/g, (c) => leet[c] ?? c);
  // single letters separated by . - _ * or spaces: "p u t a", "p.u.t.a", "p-u-t-a"
  s = s.replace(/\b(?:[a-z][\s._*-]){2,}[a-z]\b/g, (m) => m.replace(/[\s._*-]/g, ""));
  s = s.replace(/[^a-z\s]/g, " ");
  s = s.replace(/([a-z])\1{2,}/g, "$1$1");
  return s.replace(/\s+/g, " ").trim();
}

// Whole words (matched as separate tokens, so "computadora" never trips "puta"). Plural/feminine forms are listed
// where they differ. Ambiguous everyday words (negro, gay, pedo, mono, indio...) are deliberately NOT here: they
// only count inside the hateful phrases further down.
const WORDS: Record<ModerationCategory, string[]> = {
  hate: [
    // Regional slurs (homophobic, racist, classist, ableist) — Spain, Mexico, Caribbean, Andes, Southern Cone
    "marico", "maricos", "mariconcito", "cacorro", "cacorros", "maraco", "maracos", "fleto", "fletos", "rosquete", "rosquetes",
    "trolo", "trolos", "trola", "bugarron", "bugarrones", "bollera", "bolleras", "travelo", "travelos", "sarasa", "mariposon",
    "naco", "nacos", "villero", "villeros", "bolita", "bolitas", "veneco", "venecos", "panchita", "moromierda", "sudacas de mierda",
    "mogolico", "mogolicos", "mongolico", "mongolicos", "retrasado mental", "retrasada mental", "indio patarrajada", "indio de mierda",
    "cholo de mierda", "serrano de mierda", "chino de mierda", "negro de mierda", "negra de mierda", "gitano de mierda",
    // ES
    "sudaca", "sudacas", "maricon", "maricones", "marica", "maricas", "mariconazo", "joto", "jotos", "sidoso", "sidosos",
    "machorra", "machorras", "tortillera", "tortilleras", "negrata", "negratas", "sudaka", "panchito", "panchitos", "moraco", "moracos",
    "moro de mierda", "judio de mierda", "subnormal", "subnormales",
    // EN
    "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "tranny", "trannies", "kike", "kikes",
    "spic", "spics", "wetback", "wetbacks", "chink", "chinks", "gook", "gooks", "raghead", "ragheads", "towelhead", "beaner", "beaners",
    "retard", "retards", "kkk",
    // PT / FR / IT
    "viado", "viados", "sapatao", "bougnoule", "bougnoules", "youpin", "negre", "negres", "frocio", "froci",
    "ricchione", "ricchioni", "terrone", "terroni", "negraccio",
  ],
  harassment: [
    // Regional insults and expletives
    "cojones", "capullo", "capullos", "soplapollas", "chupapollas", "comepollas", "mamapollas", "chupapija", "chupavergas",
    "mamavergas", "mamabicho", "jalabolas", "lameculo", "cagon", "cagona", "me cago en", "me cago en tu madre", "hostia", "hostias",
    "puneta", "punetas", "punetero", "punetera", "golfa", "golfas", "ramera", "rameras", "furcia", "furcias", "puton", "putona",
    "guarra", "guarras", "perra", "perras", "hijo de perra", "cornudo", "cornuda", "bastardo", "bastarda", "lacra", "lacras", "malnacida", "baboso", "babosa",
    "cojudo", "cojuda", "cojudos", "conchudo", "conchuda", "sorete", "soretes", "pajero", "pajeros", "pajera", "pajillero",
    "chingon", "chingona", "chingadera", "chingadazo", "chinguen", "chingues", "pinches", "culeros", "ojete", "ojetes",
    "culiao", "culiado", "culiada", "aweonao", "aweonado", "weona", "weones", "huevona", "huevones", "guevona", "guevones",
    "conchetumare", "conchetumadre", "conchasumadre", "conchesumare", "chuchetumare", "chucha de tu madre", "ctm", "csm", "rctm",
    "hdp", "ptm", "la concha de tu madre", "la concha de la lora", "pirobo", "piroba", "pirobos", "zunga", "culicagado", "culicagada",
    "gonorriento", "carechimba", "hijueputica", "jueputa", "juepucha", "malparidez", "cerote", "cerotes", "pisado", "mamerto de mierda",
    "verguero", "vergazo", "vergazos", "puto el que lo lea", "vete a la mierda", "andate a la mierda", "vete al carajo",
    "chupame", "chupamela", "mamamela", "comeme", "metetela", "metetelo",
    // ES
    "puta", "putas", "puto", "putos", "putita", "hijueputa", "hijueputas", "hpta", "malparido", "malparida", "malparidos",
    "gonorrea", "gonorreas", "carechimba", "chimba de mierda", "pendejo", "pendeja", "pendejos", "cabron", "cabrona", "cabrones",
    "gilipollas", "imbecil", "imbeciles", "idiota", "idiotas", "estupido", "estupida", "mierda", "mierdas", "cagada",     "joder", "jodete", "jodido", "carajo", "verga", "vergas", "pinche", "culero", "culera", "zorra", "zorras",     "huevon", "guevon", "weon", "boludo", "pelotudo", "concha tu madre", "conchatumadre", "chinga", "chingada", "chingar", "chingate",
    "mamon", "mamona", "mamaguevo", "mamahuevo", "comemierda", "hijo de puta", "hija de puta", "hijos de puta", "malnacido",
    "lameculos", "tarado", "tarada", "mongolo", "mongolico", "basura humana", "escoria",
    // EN
    "fuck", "fucking", "fucker", "fuckers", "motherfucker", "motherfuckers", "fck", "shit", "shitty", "bullshit", "bitch", "bitches",
    "bastard", "bastards", "asshole", "assholes", "cunt", "cunts", "dickhead", "dickheads", "twat", "wanker", "wankers", "prick",
    "slut", "sluts", "whore", "whores", "moron", "morons", "stfu", "piece of shit",
    // PT / FR / IT
    "caralho", "merda", "foda se", "fodase", "vai se foder", "filho da puta", "arrombado", "vagabunda", "otario",
    "merde", "putain", "connard", "connards", "connasse", "salope", "salopes", "encule", "enculee", "nique ta mere", "ntm",
    "batard", "fils de pute", "cazzo", "vaffanculo", "stronzo", "stronza", "stronzi", "puttana", "troia", "figlio di puttana", "minchia", "coglione",
  ],
  sexual: [
    // Sexual slang across the Spanish-speaking world (penis / vulva / breasts / buttocks / sex acts)
    "pene", "penes", "pito", "pitos", "polla", "pollas", "verga", "vergota", "vergudo", "pinga", "pingas", "pija", "pijas", "picha",
    "pichas", "pichula", "pichulas", "poronga", "porongas", "chota", "chotas", "nepe", "cipote", "cipotes", 
    "chocho", "chochos", "chichi", "panocha", "panochas", "cuca", "cucas", "chucha", "chuchas", "concha de tu",
    "tetas", "tetitas", "tetona", "tetonas", "chichis", "bubis", "pechugona", "culo", "culos", "culito", "orto", "poto", "potito",
    "follar", "follamos", "follando", "follarte", "follame", "garchar", "garchando", "garche", "singar", "singando", "singao",
    "chingarte", "culear", "culeando", "culiar", "culiando", "cogerte", "te cojo", "cojerte", "echar un polvo", "echamos un polvo",
    "mamada", "mamadas", "mamarla", "chuparla", "chupartela", "paja", "pajas", "pajearse", "hacerse una paja", "correrse", "me corro",
    "corrida", "corridas", "eyacular", "eyaculacion", "semen", "sexo", "cachondo", "cachonda", "caliente y sola",
    "prostituta", "prostitutas", "prostitucion", "puteria", "putiza", "turismo sexual",
    // ES
    "porno", "pornografia", "pornografico", "pornografica", "xxx", "follar", "follando", "follame", "culear", "culeando", "culiar",
    "chupamela", "chupala", "mamada", "mamadas", "felacion", "cunnilingus", "sexo oral", "sexo anal", "pene", "penes",     "vagina", "chocho", "tetas", "tetona", "culo", "culito", "nalgas",     "masturbar", "masturbacion", "pajearse", "eyacular", "orgasmo", "orgia", "orgias", "trio sexual", "cachonda",
    "cachondo", "caliente y sola", "sexting", "manda nudes", "send nudes", "pasa nudes", "pack de fotos", "webcam sex",
    // EN
    "porn", "porno", "pornhub", "xvideos", "xnxx", "xhamster", "redtube", "youporn", "onlyfans", "fansly", "chaturbate", "nsfw",
    "pussy", "pussies", "dick", "dicks", "cock", "cocks", "penis", "vagina", "boobs", "tits", "titties", "blowjob", "blowjobs",
    "handjob", "cumshot", "jizz", "horny", "dildo", "anal", "orgy", "nudes", "naked pics", "sexy pics", "camgirl", "milf",
    "hentai", "bdsm", "gangbang", "creampie",
    // PT / FR / IT
    "buceta", "punheta", "transar", "foder", "chupar pau", "chatte", "branlette", 
    "pompino", "scopare", "tette",
  ],
  violence: [
    "te voy a matar", "los voy a matar", "te mato", "te matare", "voy a matarte", "matar a todos", "hay que matarlos", "muerte a los",
    "muerte a las", "ojala te mueras", "ojala se mueran", "te voy a violar", "violador", "te parto la cara",
    "suicidate", "matate", "cortate las venas",
    "kill you", "i will kill", "kill them all", "kill all", "death to", "rape", "raping", "rapist", "kys", "kill yourself",
    "go die", "shoot up", "bomb threat", "behead",
    "vou te matar", "je vais te tuer", "ti ammazzo", "ti uccido",
  ],
  minors: [
    "pedofilo", "pedofila", "pedofilia", "pederasta", "pedophile", "pedophilia", "paedophile", "pedo bear",     "lolicon", "shotacon", "child porn", "porno infantil", "pornografia infantil", "menores desnudos", "nina desnuda",
    "nino desnudo", "jailbait", "underage sex", "sexo con menores", "pedofilo", "pedopornographie", "pedopornografia",
  ],
  spam: [
    "chica prepago", "chicas prepago", "modelo prepago", "modelos prepago", "escort", "escorts", "scort", "scorts", "putero", "burdel", "webcam girls", "sugar daddy",
    "sugar baby", "hookup", "hook up tonight", "citas calientes", "solteras calientes", "masajes con final feliz",     "vendo coca", "vendo cocaina", "vendo perico", "vendo marihuana", "venta de drogas",
  ],
};

// Phrases that turn an everyday word into an attack (the word alone is fine; this combination is not).
const HATE_PHRASES = [
  /\b(negro|negra|negros|negras|indio|india|indios|chino|china|chinos|judio|judia|judios|moro|mora|moros|gay|gays|gitano|gitanos|veneco|venecos|venezolano|venezolanos|musulman|musulmanes|trans|lesbiana|lesbianas)\s+(de\s+)?(mierda|asqueroso|asquerosa|asquerosos|sucio|sucia|sucios|apestoso|apestosos|inferior|inferiores|basura)\b/,
  /\b(fuera|largo)\s+(los\s+|las\s+)?(negros|indios|chinos|judios|moros|gays|gitanos|venecos|venezolanos|musulmanes|inmigrantes|trans)\b/,
  /\b(todos|todas)\s+los\s+(negros|indios|chinos|judios|moros|gays|gitanos|venecos|venezolanos|musulmanes)\s+(son|deberian)\b/,
  /\b(raza|razas)\s+(inferior|inferiores|superior)\b/,
  /\b(heil\s+hitler|sieg\s+heil|white\s+power|white\s+supremacy|gas\s+the|holocaust\s+(was\s+)?(fake|hoax)|1488)\b/,
  /\b(dirty|filthy)\s+(jew|jews|arab|arabs|mexican|mexicans|immigrant|immigrants|black|blacks)\b/,
];

// Unambiguous stems also caught inside longer words (hijueputisimo, motherfuckin, malparidisimo...).
const STEMS: Array<[ModerationCategory, string]> = [
  ["harassment", "hijueput"], ["harassment", "malparid"], ["harassment", "gonorre"], ["harassment", "motherfuck"],
  ["harassment", "fuck"], ["harassment", "gilipoll"], ["harassment", "conchatumadre"], ["harassment", "vaffancul"],
  ["hate", "nigger"], ["hate", "nigga"], ["hate", "faggot"], ["hate", "maricon"],
  ["sexual", "pornogra"], ["sexual", "pornhub"], ["sexual", "xvideos"], ["sexual", "onlyfans"], ["sexual", "blowjob"],
  ["minors", "pedofil"], ["minors", "pedophil"], ["minors", "paedophil"], ["minors", "lolicon"], ["minors", "pedoporn"],
];

// Everyday phrases that contain a listed word but are innocent; they are removed before the check, so
// "sombrero de paja", "polla mundialista", "corrida de toros" or "Mitsubishi Pajero" can still be written.
const SAFE_PHRASES = [
  "sombrero de paja", "sombreros de paja", "paja toquilla", "techo de paja", "techos de paja", "casa de paja", "casas de paja", "paja seca",
  "polla mundialista", "polla del mundial", "polla de futbol", "polla futbolera", "polla de apuestas", "la polla de la oficina",
  "corrida de toros", "corridas de toros", "plaza de toros", "pito del tren", "tocar el pito", "toco el pito", "pito del arbitro",
  "zona pija", "gente pija", "barrio pijo", "mitsubishi pajero", "pajero sport", "valle del chota", "hostia consagrada",
  "mi perra", "nuestra perra", "perra guia", "sim prepago", "plan prepago", "tarjeta prepago", "playa nudista", "playas nudistas",
];
// Words with "ñ" whose plain spelling is innocent ("coño" vs "cono", a cone): checked on the text before accents are removed.
const RAW_WORDS: Array<[ModerationCategory, string]> = [["harassment", "coño"], ["harassment", "coñazo"], ["harassment", "coñito"], ["harassment", "coñe"]];

const ORDER: ModerationCategory[] = ["minors", "violence", "hate", "sexual", "harassment", "spam"];
const SINGLE: Map<string, ModerationCategory> = new Map();
const MULTI: Array<[string, ModerationCategory]> = [];
for (const cat of ORDER) {
  for (const w of WORDS[cat]) {
    const n = normalizeForModeration(w);
    if (!n) continue;
    if (n.includes(" ")) MULTI.push([n, cat]);
    else if (!SINGLE.has(n)) SINGLE.set(n, cat);
  }
}

const SAFE_NORMALIZED = SAFE_PHRASES.map(normalizeForModeration);

/** Checks one or more texts with the word lists. Pure and synchronous. */
export function checkWords(...texts: unknown[]): ModerationResult {
  for (const raw of texts) {
    let n = normalizeForModeration(String(raw ?? ""));
    if (!n) continue;
    const rawTokens = String(raw ?? "").toLowerCase().split(/[^a-zñ]+/);
    for (const [cat, w] of RAW_WORDS) if (rawTokens.includes(w)) return { ok: false, category: cat };
    for (const safe of SAFE_NORMALIZED) n = ` ${n} `.split(` ${safe} `).join(" ").trim();
    const padded = ` ${n} `;
    const lower = String(raw ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const re of HATE_PHRASES) if (re.test(n) || re.test(lower)) return { ok: false, category: "hate" };
    for (const [phrase, cat] of MULTI) if (padded.includes(` ${phrase} `)) return { ok: false, category: cat };
    const squashed = n.replace(/\s+/g, "");
    for (const tok of n.split(" ")) {
      const cat = SINGLE.get(tok) ?? SINGLE.get(tok.replace(/([a-z])\1+/g, "$1")); // "puuuta" -> "puuta" -> "puta"
      if (cat) return { ok: false, category: cat };
    }
    for (const [cat, stem] of STEMS) if (squashed.includes(stem)) return { ok: false, category: cat };
  }
  return { ok: true };
}

const OPENAI_MAP: Record<string, ModerationCategory> = {
  "sexual/minors": "minors", sexual: "sexual", hate: "hate", "hate/threatening": "hate", harassment: "harassment",
  "harassment/threatening": "violence", violence: "violence", "violence/graphic": "violence", "self-harm": "violence",
  "self-harm/intent": "violence", "self-harm/instructions": "violence", illicit: "spam", "illicit/violent": "violence",
};

async function checkOpenAI(text: string, imageUrls: string[]): Promise<ModerationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || (!text && !imageUrls.length)) return { ok: true };
  try {
    const input: unknown[] = [];
    if (text) input.push({ type: "text", text: text.slice(0, 8000) });
    for (const url of imageUrls.slice(0, 4)) input.push({ type: "image_url", image_url: { url } });
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: true };
    const data = (await res.json()) as { results?: Array<{ flagged: boolean; categories: Record<string, boolean> }> };
    for (const r of data.results ?? []) {
      if (!r.flagged) continue;
      for (const [k, on] of Object.entries(r.categories ?? {})) if (on && OPENAI_MAP[k]) return { ok: false, category: OPENAI_MAP[k] };
      return { ok: false, category: "harassment" };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // outage: the word lists already ran
  }
}

/** Full check used before anything is published: word lists first, then the optional AI review. */
export async function moderate(texts: unknown[], imageUrls: string[] = []): Promise<ModerationResult> {
  const words = checkWords(...texts);
  if (!words.ok) return words;
  return checkOpenAI(texts.map((t) => String(t ?? "")).filter(Boolean).join("\n\n"), imageUrls);
}
