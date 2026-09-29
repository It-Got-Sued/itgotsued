// Pure mapping: Plaid transactions -> BrandDetection[] (source "bank").
//
// Privacy: `toSignal()` reduces each Plaid transaction to the few fields needed to
// identify a brand the moment it arrives. Amounts, dates, account ids, locations,
// and raw descriptions beyond the merchant name are never retained.

import type { Transaction } from "plaid";
import type { BrandDetection } from "@/lib/types";

/** The only data we keep per transaction while a scan is running. */
export interface TxnSignal {
  id: string;
  pending: boolean;
  pendingTransactionId: string | null;
  isOutflow: boolean; // money left the account (Plaid: amount > 0)
  merchantName: string | null;
  rawName: string | null; // Plaid `name`, used only as last-resort fallback
  counterparties: { name: string; type: string; confidence: string | null }[];
  pfcPrimary: string | null;
  pfcDetailed: string | null;
}

/** Minimal Plaid-shaped input so tests can pass plain fixtures. */
export type PlaidTxnLike = Pick<
  Transaction,
  "transaction_id" | "pending" | "amount" | "merchant_name" | "name"
> & {
  pending_transaction_id?: string | null;
  counterparties?: Transaction["counterparties"];
  personal_finance_category?: Transaction["personal_finance_category"];
};

export function toSignal(t: PlaidTxnLike): TxnSignal {
  return {
    id: t.transaction_id,
    pending: Boolean(t.pending),
    pendingTransactionId: t.pending_transaction_id ?? null,
    isOutflow: typeof t.amount === "number" && t.amount > 0,
    merchantName: t.merchant_name?.trim() || null,
    rawName: t.name?.trim() || null,
    counterparties: (t.counterparties ?? []).map((c) => ({
      name: c.name,
      type: String(c.type),
      confidence: c.confidence_level ?? null,
    })),
    pfcPrimary: t.personal_finance_category?.primary ?? null,
    pfcDetailed: t.personal_finance_category?.detailed ?? null,
  };
}

// --- Noise filters ----------------------------------------------------------
// Primary categories (PFC v1 and v2) that are never purchases from a brand.
const EXCLUDED_PRIMARY = new Set([
  "INCOME", // payroll, interest earned, refunds of tax, benefits
  "TRANSFER_IN",
  "TRANSFER_OUT", // account transfers, ATM withdrawals, P2P app transfers
  "LOAN_DISBURSEMENTS",
  "BANK_FEES", // ATM fees, overdraft, interest charges
]);

const EXCLUDED_DETAILED = new Set([
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", // paying your own card
  "LOAN_PAYMENTS_OTHER_PAYMENT",
  "RENT_AND_UTILITIES_RENT",
  "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT",
  "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES",
  "GOVERNMENT_AND_NON_PROFIT_DONATIONS",
]);

// Person-to-person apps: excluded unless Plaid names the underlying merchant.
const P2P_RE =
  /\b(venmo|zelle|cash\s?app|square\s?cash|apple\s?cash|popmoney|paypal\s+(transfer|inst\s*xfer)|google\s?pay\s+transfer)\b/i;

// Fallback noise filter for transactions Plaid did not categorize.
const RAW_NOISE_RE =
  /\b(atm|withdrawal|payroll|direct\s?dep(osit)?|deposit|interest|transfer|xfer|overdraft|fee|irs|us\s?treas(ury)?|tax\s?(pmt|payment)|franchise\s?tax|rent\s?(pmt|payment)|online\s?banking|mobile\s?deposit|check\s?#?\d*)\b/i;

// Counterparty types that are brands a user bought from.
const BRAND_COUNTERPARTY_TYPES = new Set(["merchant", "marketplace"]);

// --- Name handling ----------------------------------------------------------
const PROCESSOR_PREFIX_RE =
  /^(sq|tst|sp|pp|paypal|py|in|cko|dd|bt|wpy|pos|ach|debit|purchase|checkcard|recurring)\s*\*\s*/i;

/** Clean a raw bank descriptor like "SQ *BLUE BOTTLE 0423 CA" -> "Blue Bottle". */
export function cleanRawName(raw: string): string | null {
  let s = raw.replace(PROCESSOR_PREFIX_RE, "");
  s = s.replace(/\b(pos|debit|purchase|card|checkcard|recurring|ach|web|pmt|payment|online|visa|mc)\b/gi, " ");
  s = s.replace(/[#*]?\d[\d\-/*.#]*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+[A-Z]{2}$/, ""); // trailing US state code
  if ((s.match(/[a-z]/gi) ?? []).length < 3) return null;
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return s;
}

/** Grouping key: "Amazon.com, Inc." and "AMAZON" collapse together. */
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.(com|net|org|co)\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function counterpartyBase(confidence: string | null): number {
  switch ((confidence ?? "").toUpperCase()) {
    case "VERY_HIGH":
      return 0.95;
    case "HIGH":
      return 0.9;
    case "MEDIUM":
      return 0.75;
    case "LOW":
      return 0.55;
    default:
      return 0.8;
  }
}

/** Human category from PFC, e.g. FOOD_AND_DRINK_COFFEE -> "coffee". */
export function humanCategory(primary: string | null, detailed: string | null): string | undefined {
  if (!primary && !detailed) return undefined;
  let s = detailed ?? primary ?? "";
  if (primary && detailed?.startsWith(primary + "_")) s = detailed.slice(primary.length + 1);
  s = s.replace(/^OTHER_/, "");
  if (!s || s === "OTHER") s = primary ?? "";
  return s.toLowerCase().replace(/_/g, " ").trim() || undefined;
}

interface Candidate {
  name: string;
  base: number; // quality of the identification, 0..1
}

/** Brand names implied by one transaction (0..n), or [] if it is noise. */
export function brandCandidates(s: TxnSignal): Candidate[] {
  if (!s.isOutflow) return []; // income, refunds, deposits
  if (s.pfcPrimary && EXCLUDED_PRIMARY.has(s.pfcPrimary)) return [];
  if (s.pfcDetailed && EXCLUDED_DETAILED.has(s.pfcDetailed)) return [];

  // 1. Counterparties: merchant + marketplace (e.g. Chipotle via DoorDash -> both).
  //    Payment apps / processors / terminals / income sources are skipped, so
  //    "PayPal *Spotify" yields Spotify when Plaid identifies it.
  const fromCounterparties = s.counterparties
    .filter((c) => BRAND_COUNTERPARTY_TYPES.has(c.type) && c.name.trim())
    .map((c) => ({ name: c.name.trim(), base: counterpartyBase(c.confidence) }));
  if (fromCounterparties.length > 0) return fromCounterparties;

  const onlyPaymentApp = s.counterparties.some((c) => c.type === "payment_app");
  const text = `${s.merchantName ?? ""} ${s.rawName ?? ""}`;
  if (P2P_RE.test(text)) return [];
  if (!s.pfcPrimary && RAW_NOISE_RE.test(text)) return [];
  if (s.pfcPrimary === "OTHER" && !s.merchantName) return [];

  // 2. Plaid's enriched merchant_name.
  if (s.merchantName) {
    return [{ name: s.merchantName, base: onlyPaymentApp ? 0.6 : 0.8 }];
  }

  // 3. Last resort: cleaned raw descriptor, lower confidence.
  if (s.rawName && !RAW_NOISE_RE.test(s.rawName)) {
    const cleaned = cleanRawName(s.rawName);
    if (cleaned) return [{ name: cleaned, base: 0.45 }];
  }
  return [];
}

/** More purchases -> more confident: 1 -> 0.70x, 2 -> 0.85x, 3 -> 0.90x, 10 -> 0.97x. */
export function countFactor(count: number): number {
  return 0.7 + 0.3 * (1 - 1 / Math.max(1, count));
}

export const MAX_DETECTIONS = 250;

/**
 * Aggregate signals into unique brands. The output carries only brand name,
 * category, and confidence — no amounts, dates, counts, or account data.
 */
export function signalsToDetections(signals: Iterable<TxnSignal>): BrandDetection[] {
  const list = [...signals];
  // Drop pending transactions that already posted (posted row references them).
  const superseded = new Set(
    list.filter((s) => !s.pending && s.pendingTransactionId).map((s) => s.pendingTransactionId),
  );

  const groups = new Map<
    string,
    { names: Map<string, number>; cats: Map<string, number>; count: number; base: number }
  >();

  for (const s of list) {
    if (s.pending && superseded.has(s.id)) continue;
    const category = humanCategory(s.pfcPrimary, s.pfcDetailed);
    for (const c of brandCandidates(s)) {
      const key = brandKey(c.name);
      if (key.length < 2) continue;
      let g = groups.get(key);
      if (!g) {
        g = { names: new Map(), cats: new Map(), count: 0, base: 0 };
        groups.set(key, g);
      }
      g.count += 1;
      g.base = Math.max(g.base, c.base);
      g.names.set(c.name, (g.names.get(c.name) ?? 0) + 1);
      if (category) g.cats.set(category, (g.cats.get(category) ?? 0) + 1);
    }
  }

  const mostCommon = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  const out = [...groups.values()].map((g) => {
    const detection: BrandDetection = {
      brand: mostCommon(g.names)!,
      confidence: Math.round(Math.min(0.99, g.base * countFactor(g.count)) * 100) / 100,
      source: "bank",
    };
    const category = mostCommon(g.cats);
    if (category) detection.category = category;
    return { detection, count: g.count };
  });

  out.sort(
    (a, b) =>
      b.count - a.count ||
      b.detection.confidence - a.detection.confidence ||
      a.detection.brand.localeCompare(b.detection.brand),
  );
  return out.slice(0, MAX_DETECTIONS).map((o) => o.detection);
}

export function transactionsToDetections(txns: PlaidTxnLike[]): BrandDetection[] {
  return signalsToDetections(txns.map(toSignal));
}
