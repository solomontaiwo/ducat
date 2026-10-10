/**
 * Suggests a category from a free-text description. The user's own history
 * wins (how they classified similar movements before); a small keyword list
 * of common Italian merchants covers the first uses. Everything runs locally
 * on data already loaded, so it costs no extra database reads.
 */

const STOPWORDS = new Set([
  "pagamento", "pagam", "pos", "carta", "bonifico", "addebito", "accredito", "sdd", "sepa",
  "del", "della", "dello", "dei", "delle", "per", "con", "the", "and", "srl", "spa", "snc",
  "via", "presso", "operazione", "acquisto", "ordine", "n", "nr", "num", "online", "www", "com",
]);

const KEYWORDS = {
  expense: {
    supermercato: ["esselunga", "coop", "conad", "carrefour", "lidl", "eurospin", "aldi", "penny", "bennet", "despar", "tigros", "iper", "supermercato", "spesa", "pam", "famila", "md"],
    alimentazione: ["bar", "caffe", "caffetteria", "ristorante", "pizzeria", "pizza", "sushi", "trattoria", "osteria", "mcdonald", "mcdonalds", "burger", "kebab", "deliveroo", "glovo", "justeat", "aperitivo", "pranzo", "cena", "colazione", "gelateria", "pasticceria", "starbucks"],
    trasporti: ["trenitalia", "italo", "atm", "atac", "gtt", "metro", "treno", "bus", "taxi", "uber", "benzina", "carburante", "eni", "q8", "esso", "tamoil", "autostrada", "autostrade", "telepass", "parcheggio", "freenow", "bolt", "flixbus", "car sharing", "enjoy", "share now"],
    casa: ["affitto", "mutuo", "condominio", "enel", "bolletta", "luce", "gas", "acqua", "hera", "iren", "a2a", "ikea", "internet", "fastweb", "vodafone", "iliad", "windtre", "tim", "leroy merlin"],
    abbonamenti: ["netflix", "spotify", "disney", "amazon prime", "prime video", "icloud", "apple music", "youtube", "dazn", "chatgpt", "openai", "claude", "abbonamento", "audible", "crunchyroll"],
    shopping: ["amazon", "zalando", "zara", "shein", "decathlon", "mediaworld", "unieuro", "euronics", "vestiti", "scarpe", "primark", "uniqlo", "h&m", "hm"],
    salute: ["farmacia", "medico", "dentista", "visita", "ospedale", "ticket sanitario", "analisi", "palestra", "ottico", "fisioterapia", "parafarmacia"],
    intrattenimento: ["cinema", "teatro", "concerto", "steam", "playstation", "xbox", "nintendo", "libri", "libreria", "museo", "ticketone", "feltrinelli"],
    viaggi: ["hotel", "booking", "airbnb", "ryanair", "easyjet", "volo", "aereo", "vacanza", "ita airways", "wizz", "volotea", "ostello"],
    tasse: ["f24", "imu", "tari", "bollo", "commissione", "commissioni", "canone", "multa", "tasse", "inps", "agenzia entrate"],
  },
  income: {
    stipendio: ["stipendio", "busta paga", "salario", "emolumenti", "cedolino"],
    freelance: ["fattura", "freelance", "consulenza", "parcella", "compenso"],
    bonus: ["bonus", "premio", "tredicesima", "quattordicesima"],
    vendite: ["vinted", "vendita", "ebay", "subito"],
    rimborso: ["rimborso", "reso", "storno"],
    investimenti: ["dividendo", "dividendi", "interessi", "cedola", "plusvalenza"],
    regalo: ["regalo", "compleanno"],
  },
};

/** Lowercase, strip accents and punctuation, collapse spaces. */
export const normalizeDescription = (text = "") =>
  String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();

/** Significant tokens: no digits-only chunks, no stopwords, at least 3 chars. */
export const descriptionTokens = (text) =>
  normalizeDescription(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !STOPWORDS.has(token));

const matchKeyword = (normalized, type, allowed) => {
  const table = KEYWORDS[type] || {};
  const padded = ` ${normalized} `;
  let best = null;
  for (const [category, words] of Object.entries(table)) {
    if (!allowed.has(category)) continue;
    for (const word of words) {
      // Longer keywords win so "amazon prime" beats "amazon".
      if (padded.includes(` ${word} `) && (!best || word.length > best.word.length)) {
        best = { category, word };
      }
    }
  }
  return best?.category || null;
};

/**
 * @param {string} description
 * @param {{ type: "expense"|"income", history?: Array, categories: string[] }} options
 * @returns {{ category: string, source: "history"|"keyword", count: number } | null}
 */
export const suggestCategory = (description, { type, history = [], categories = [] }) => {
  const normalized = normalizeDescription(description);
  if (normalized.length < 3) return null;
  const allowed = new Set(categories.filter((value) => value !== "altro"));
  const tokens = new Set(descriptionTokens(description));

  const votes = new Map();
  for (const transaction of history) {
    if (transaction?.type !== type || !allowed.has(transaction.category)) continue;
    const other = normalizeDescription(transaction.description);
    if (!other) continue;
    let score = 0;
    if (other === normalized) {
      score = 3;
    } else if (tokens.size) {
      for (const token of descriptionTokens(transaction.description)) {
        if (tokens.has(token)) score += 1;
      }
    }
    if (!score) continue;
    const entry = votes.get(transaction.category) || { score: 0, count: 0 };
    entry.score += score;
    entry.count += 1;
    votes.set(transaction.category, entry);
  }

  if (votes.size) {
    const [category, { count }] = [...votes.entries()].sort((a, b) => b[1].score - a[1].score || b[1].count - a[1].count)[0];
    return { category, source: "history", count };
  }

  const keywordCategory = matchKeyword(normalized, type, allowed);
  return keywordCategory ? { category: keywordCategory, source: "keyword", count: 0 } : null;
};
