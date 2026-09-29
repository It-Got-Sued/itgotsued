import { normalizeBrandKey } from "@/lib/repo/brands";

// String cleanup for brand resolution: bank merchant descriptors, corporate suffixes,
// token helpers and edit distance. Pure functions (no DB) so they are easy to test.

/** Payment processors / aggregators that prefix the real merchant: "SQ *BLUE BOTTLE". */
const PROCESSOR_PREFIX =
  /^(?:paypal|pp|sq|tst|sp|py|cko|fs|paddle|stripe|2co|pmnt|ec|in|ic|bt|pos|dbt|debit|purchase|recurring|chk ?card|checkcard)\s*\*\s*/i;

/** Descriptors that are really a well-known merchant, whatever follows. */
const KNOWN_MERCHANTS: Array<[RegExp, string]> = [
  [/^(?:amzn|amazon)\s*(?:mktp|mktplace|marketplace|digital|retail|\.com|com|prime|pmts|reorder)?\b/i, "Amazon"],
  [/^amazon\b/i, "Amazon"],
  [/^prime\s*video\b/i, "Amazon Prime Video"],
  [/^(?:apple\.com\/bill|apple\.com|apl\*|itunes)/i, "Apple"],
  [/^(?:wm\s+supercenter|wal-?mart|wmt\b)/i, "Walmart"],
  [/^(?:google\s*\*\s*)(youtube\w*)/i, "$1"],
  [/^google\s*\*/i, "Google"],
  [/^(?:uber\s*\*?\s*eats|ubereats)/i, "Uber Eats"],
  [/^uber\b/i, "Uber"],
  [/^(?:dd\s*\*\s*)?doordash/i, "DoorDash"],
  [/^lyft\b/i, "Lyft"],
  [/^(?:msft|microsoft)\b/i, "Microsoft"],
  [/^(?:vz\s*wireless|verizon)/i, "Verizon"],
  [/^(?:att\*|at&t|at ?& ?t)/i, "AT&T"],
  [/^(?:tmobile|t-mobile)/i, "T-Mobile"],
  [/^(?:target|tgt)\s+(?:t-?\d+|\d+|store|\.com)/i, "Target"],
  [/^costco\b/i, "Costco"],
  [/^(?:sbux|starbucks)/i, "Starbucks"],
];

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  ),
);

/**
 * Clean a bank/card merchant descriptor down to the merchant name.
 * "AMZN Mktp US*2K4" -> "Amazon", "SQ *BLUE BOTTLE" -> "BLUE BOTTLE",
 * "PAYPAL *NETFLIX" -> "NETFLIX", "NETFLIX.COM LOS GATOS CA" -> "NETFLIX LOS GATOS".
 * Safe on ordinary brand names ("Coca-Cola" -> "Coca-Cola").
 */
export function cleanMerchantString(input: string): string {
  let s = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  // Strip nested processor prefixes ("PAYPAL *SQ *FOO" is rare but cheap to handle).
  for (let i = 0; i < 3 && PROCESSOR_PREFIX.test(s); i++) s = s.replace(PROCESSOR_PREFIX, "");
  for (const [re, name] of KNOWN_MERCHANTS) {
    const m = s.match(re);
    if (m) return name.replace("$1", m[1] ?? "");
  }
  s = s
    .replace(/\*.*$/, "") // reference codes after '*': "NETFLIX*ABC123"
    .replace(/https?:\/\//gi, "")
    .replace(/\bwww\./gi, "")
    .replace(/\.(com|net|org|co|io|tv|us)\b/gi, "") // "NETFLIX.COM"
    .replace(/#\s*\d+/g, "") // store numbers "#1234"
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "") // phone numbers
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{4,}\b/gi, "") // tokens containing digits: "2K4X9", "00123"
    .replace(/\b\d+\b/g, "")
    .replace(/[_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length >= 2 && US_STATES.has(tokens[tokens.length - 1].toUpperCase())) tokens.pop();
  return stripCorporateSuffix(tokens.join(" ")).trim();
}

const CORP_SUFFIX =
  /[,\s]+(?:the\s+)?(?:company|co|inc|incorporated|corp|corporation|llc|l\.l\.c|ltd|limited|plc|lp|llp|holdings?|group|s\.?a|a\.?g|n\.?v|gmbh)\.?$/i;

/** "The Coca-Cola Company" -> "Coca-Cola", "Procter & Gamble Co." -> "Procter & Gamble". */
export function stripCorporateSuffix(name: string): string {
  let s = name.trim().replace(/^the\s+/i, "");
  for (let i = 0; i < 3; i++) {
    const next = s.replace(CORP_SUFFIX, "").trim();
    if (next === s || !next) break;
    s = next;
  }
  return s;
}

/** Key used to compare company names (parent-company mapping). "Amazon.com, Inc." -> "amazon". */
export function companyKey(name: string): string {
  return normalizeBrandKey(stripCorporateSuffix(name)).replace(/-com$/, "");
}

/** Hyphen-free form so "Coca Cola", "CocaCola" and "Coca-Cola" collide. */
export function compactKey(key: string): string {
  return key.replace(/-/g, "");
}

export function tokensOf(key: string): string[] {
  return key.split("-").filter(Boolean);
}

/** Optimal-string-alignment (Damerau) edit distance, bounded for speed. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/**
 * Words that may trail a brand name in free text / photo labels without changing
 * which brand is meant ("Crest toothpaste", "Nature Made vitamins", "Coke can").
 */
export const GENERIC_PRODUCT_WORDS = new Set(
  (
    "a an the my our of and brand brands product products can cans bottle bottles tube tubes box boxes jar jars pack " +
    "packs bag bags carton container spray stick bar bars pouch tub " +
    "soda pop drink drinks water juice coffee tea beer energy " +
    "toothpaste mouthwash floss toothbrush shampoo conditioner soap bodywash lotion cream moisturizer sunscreen " +
    "deodorant razor razors cleanser serum makeup " +
    "vitamin vitamins supplement supplements multivitamin gummies pills tablets capsules " +
    "cereal snack snacks chips cookies crackers candy chocolate " +
    "detergent cleaner wipes pods paper towels " +
    "phone phones laptop tablet headphones earbuds charger tv speaker " +
    "app subscription account service card plan"
  ).split(" "),
);
