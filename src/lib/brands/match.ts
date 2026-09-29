import { normalizeBrandKey } from "@/lib/repo/brands";
import { findCasesByBrandIds, getCaseEvidence, type CaseEvidence } from "@/lib/repo/cases";
import { ACTIVE_STATUSES } from "@/lib/types";
import type { Brand, BrandDetection, BrandMatch, CaseSummary } from "@/lib/types";
import { type BrandIndex, childBrandsOf, getBrandIndex, parentBrandsOf } from "./brand-index";
import { round2 } from "./claude";
import {
  cleanMerchantString,
  compactKey,
  editDistance,
  GENERIC_PRODUCT_WORDS,
  stripCorporateSuffix,
  tokensOf,
} from "./normalize";

// Detections -> brands -> cases.
//
// Resolution order per detection string (first hit wins):
//   1. exact key  (brand.normalized / name, also with corporate suffix stripped)
//   2. alias key
//   3. compact key (hyphens removed: "Coca Cola" / "CocaCola")
//   4. token span: a brand key inside a longer label ("Crest toothpaste", "my peloton bike",
//      "NETFLIX LOS GATOS"); rules depend on the source (see spanAllowed)
//   5. conservative fuzzy: OSA edit distance on the whole key, >= 6 chars, same first
//      letter, distance 1 (<= 2 for >= 9 chars), unique best candidate
// Then expand through the ownership chain both ways (all parents up, all subsidiaries down)
// and attach cases.

export type MatchMethod = "exact" | "alias" | "compact" | "token" | "fuzzy";
/** direct = the detected brand; parent = its parent company; subsidiary = a brand the detected company owns. */
export type BrandRelation = "direct" | "parent" | "subsidiary";

export interface RankedBrandMatch extends BrandMatch {
  relation: BrandRelation;
  /** Display names of the directly detected brands that led here (for parent/subsidiary). */
  via: string[];
  method: MatchMethod;
  confidence: number;
  /**
   * Parent-company matches only: case id -> the brand name found in that case's filings,
   * showing why the parent's lawsuit applies to the brand the user owns.
   */
  mentions?: Record<string, string>;
  /**
   * Parent-company matches only: lawsuits against the parent whose filings we have don't name
   * the user's brand. They are left out of `cases` (not shown as applicable).
   */
  unverifiedCount?: number;
}

export interface MatchOptions {
  /** Only keep cases in ACTIVE_STATUSES (filed, certified, settlement_pending, claims_open). */
  activeOnly?: boolean;
  /** Minimum combined confidence for non-manual detections. */
  minConfidence?: number;
  /** Injected for tests; defaults to the brands table. */
  index?: BrandIndex;
  /** Injected for tests; defaults to findCasesByBrandIds against the database. */
  casesByBrand?: (brandIds: string[]) => Map<string, CaseSummary[]> | Promise<Map<string, CaseSummary[]>>;
  /** Injected for tests; defaults to getCaseEvidence against the database. */
  caseEvidence?: (caseIds: string[]) => Map<string, CaseEvidence> | Promise<Map<string, CaseEvidence>>;
}

export const MIN_MATCH_CONFIDENCE = 0.5;
export const MAX_DETECTIONS = 200;

const METHOD_WEIGHT: Record<MatchMethod, number> = {
  exact: 1,
  alias: 0.97,
  compact: 0.95,
  token: 0.9,
  fuzzy: 0.8,
};
/** Per hop: a grandparent scores parent^2, and so on. */
const RELATION_WEIGHT: Record<BrandRelation, number> = { direct: 1, parent: 0.95, subsidiary: 0.75 };
/** Ownership levels walked each way; also guards against parent_company cycles. */
const MAX_CHAIN_DEPTH = 6;
const RELATION_RANK: Record<BrandRelation, number> = { direct: 0, parent: 1, subsidiary: 2 };

export interface Resolution {
  brand: Brand;
  method: MatchMethod;
}

/** Leading words that never belong to a brand in a typed label: "my", "our", "a". */
const LEADING_FILLER = new Set(["my", "our", "a", "an", "the", "some", "i", "use", "have", "own", "bought"]);
/** Extra trailing nouns for owned-item labels (manual list). */
const ITEM_WORDS = new Set([
  "bike", "treadmill", "car", "truck", "vehicle", "suv", "shoes", "sneakers", "jacket", "shirt",
  "watch", "camera", "console", "printer", "router", "fridge", "refrigerator", "washer", "dryer",
  "dishwasher", "oven", "microwave", "vacuum", "mattress", "stroller", "car-seat", "seat",
]);

function isGeneric(token: string): boolean {
  return GENERIC_PRODUCT_WORDS.has(token) || ITEM_WORDS.has(token) || LEADING_FILLER.has(token) || /^\d+$/.test(token);
}

/** Trim filler/generic words from both ends: "my-peloton-bike" -> ["peloton"]. */
function coreTokens(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && isGeneric(tokens[start])) start++;
  while (end > start && isGeneric(tokens[end - 1])) end--;
  return tokens.slice(start, end);
}

function lookupKey(index: BrandIndex, key: string): Resolution | null {
  if (!key) return null;
  const hits = index.byKey.get(key);
  if (hits?.length === 1) return { brand: hits[0].brand, method: hits[0].kind === "alias" ? "alias" : "exact" };
  if (hits && hits.length > 1) {
    // Ambiguous key: only accept if exactly one is an exact (name) hit.
    const exact = hits.filter((h) => h.kind === "exact");
    return exact.length === 1 ? { brand: exact[0].brand, method: "exact" } : null;
  }
  const compact = index.byCompact.get(compactKey(key));
  if (compact?.length === 1 && compactKey(key).length >= 4) return { brand: compact[0].brand, method: "compact" };
  return null;
}

function fuzzyLookup(index: BrandIndex, key: string): Resolution | null {
  const ck = compactKey(key);
  if (ck.length < 6 || /\d/.test(ck)) return null;
  const maxDist = ck.length >= 9 ? 2 : 1;
  let best: { brand: Brand; dist: number } | null = null;
  let tie = false;
  for (const [candKey, entries] of index.byCompact) {
    if (candKey.length < 6 || candKey[0] !== ck[0] || /\d/.test(candKey)) continue;
    // Length difference alone must not be the edit ("dove" vs "dover" is excluded by the
    // >= 6 floor; also refuse pure prefix/suffix extensions like "tide" -> "tides").
    if (candKey.startsWith(ck) || ck.startsWith(candKey)) continue;
    const allowed = Math.min(maxDist, candKey.length >= 9 ? 2 : 1);
    const d = editDistance(ck, candKey, allowed);
    if (d > allowed) continue;
    const brandIds = new Set(entries.map((e) => e.brand.id));
    if (!best || d < best.dist) {
      best = { brand: entries[0].brand, dist: d };
      tie = brandIds.size > 1;
    } else if (d === best.dist && !brandIds.has(best.brand.id)) {
      tie = true;
    }
  }
  return best && !tie ? { brand: best.brand, method: "fuzzy" } : null;
}

type SpanMode = "strict" | "prefix" | "any";

function spanAllowed(mode: SpanMode, start: number, end: number, tokens: string[]): boolean {
  const rest = [...tokens.slice(0, start), ...tokens.slice(end)];
  if (mode === "any") return true;
  if (mode === "prefix") return start === 0 || rest.slice(0, start).every(isGeneric);
  return rest.every(isGeneric);
}

/** Brand keys inside a multi-word label. Prefers more tokens, then leftmost, then longer. */
function spanLookup(index: BrandIndex, tokens: string[], mode: SpanMode): Resolution | null {
  let best: { res: Resolution; len: number; start: number; chars: number } | null = null;
  const maxLen = Math.min(index.maxKeyTokens, tokens.length);
  for (let len = maxLen; len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const span = tokens.slice(start, start + len);
      if (span.every(isGeneric)) continue;
      const key = span.join("-");
      if (compactKey(key).length < 3) continue;
      const hits = index.byKey.get(key);
      if (!hits || hits.length !== 1) continue;
      if (!spanAllowed(mode, start, start + len, tokens)) continue;
      const cand = { res: { brand: hits[0].brand, method: "token" as const }, len, start, chars: key.length };
      if (
        !best ||
        cand.len > best.len ||
        (cand.len === best.len && (cand.start === 0) !== (best.start === 0) && cand.start === 0) ||
        (cand.len === best.len && (cand.start === 0) === (best.start === 0) && cand.chars > best.chars)
      ) {
        best = cand;
      }
    }
  }
  return best?.res ?? null;
}

function looksLikeMerchant(s: string): boolean {
  return /[*#]|\.com\b|\b(?:mktp|pos|purchase)\b/i.test(s) || /^[A-Z0-9 .*#&'/-]{6,}$/.test(s.trim());
}

/** Resolve one raw brand/label string to a Brand, or null. */
export function resolveBrandString(
  raw: string,
  source: BrandDetection["source"],
  index: BrandIndex,
): Resolution | null {
  const isBankish = source === "bank" || source === "receipt";
  const candidates = [raw];
  if (isBankish || looksLikeMerchant(raw)) candidates.push(cleanMerchantString(raw));
  candidates.push(stripCorporateSuffix(raw));

  const keys = [...new Set(candidates.map(normalizeBrandKey).filter(Boolean))];
  // 1-3. whole-string key lookups
  for (const key of keys) {
    const hit = lookupKey(index, key);
    if (hit) return hit;
  }
  // 4. spans inside the label, after trimming filler words.
  const mode: SpanMode = source === "manual" ? "any" : isBankish ? "prefix" : "strict";
  for (const key of keys) {
    const tokens = tokensOf(key);
    const core = coreTokens(tokens);
    if (core.length && core.length < tokens.length) {
      const hit = lookupKey(index, core.join("-"));
      if (hit) return hit;
    }
    if (tokens.length > 1) {
      const hit = spanLookup(index, tokens, mode);
      if (hit) return hit;
    }
  }
  // 5. fuzzy, on the trimmed core of each candidate (never on spans).
  for (const key of keys) {
    const core = coreTokens(tokensOf(key)).join("-");
    const hit = fuzzyLookup(index, core || key);
    if (hit) return hit;
  }
  return null;
}

function resolveDetection(d: BrandDetection, index: BrandIndex): Resolution | null {
  const byBrand = resolveBrandString(d.brand, d.source, index);
  if (byBrand) return byBrand;
  if (d.product) {
    const byProduct = resolveBrandString(d.product, d.source, index);
    if (byProduct) return { ...byProduct, method: byProduct.method === "exact" ? "alias" : byProduct.method };
  }
  return null;
}

/** Noisy-OR: independent sightings of the same brand raise confidence. */
function combine(confidences: number[]): number {
  return Math.min(0.99, 1 - confidences.reduce((acc, c) => acc * (1 - Math.min(Math.max(c, 0), 1)), 1));
}

interface Accum {
  brand: Brand;
  relation: BrandRelation;
  method: MatchMethod;
  detections: BrandDetection[];
  scores: number[];
  via: Set<string>;
  /** Parent matches: the owned brands below this company that led here (for applicability). */
  viaBrands: Map<string, Brand>;
  manual: boolean;
}

/** Lowercase, punctuation-free, space-padded text for whole-word "mentions" checks. */
function wordText(s: string): string {
  return ` ${s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** The first of `brands` (by name or alias) that `text` names as a whole word, if any. */
export function mentionedBrand(text: string, brands: Brand[]): string | null {
  const hay = wordText(text);
  for (const b of brands) {
    for (const term of [b.name, stripCorporateSuffix(b.name), ...b.aliases]) {
      const needle = wordText(term);
      if (needle.trim().length >= 3 && hay.includes(needle)) return b.name;
    }
  }
  return null;
}

export async function matchDetections(
  detections: BrandDetection[],
  options: MatchOptions = {},
): Promise<RankedBrandMatch[]> {
  const index = options.index ?? (await getBrandIndex());
  const minConfidence = options.minConfidence ?? MIN_MATCH_CONFIDENCE;
  const acc = new Map<string, Accum>();

  const add = (
    brand: Brand,
    relation: BrandRelation,
    method: MatchMethod,
    d: BrandDetection,
    score: number,
    via?: string,
    viaBrands: Brand[] = [],
  ) => {
    const cur = acc.get(brand.id);
    const manual = d.source === "manual";
    if (!cur) {
      acc.set(brand.id, {
        brand, relation, method, detections: [d], scores: [score], via: new Set(via ? [via] : []),
        viaBrands: new Map(viaBrands.map((b) => [b.id, b])), manual,
      });
      return;
    }
    for (const b of viaBrands) cur.viaBrands.set(b.id, b);
    if (RELATION_RANK[relation] < RELATION_RANK[cur.relation]) {
      cur.relation = relation;
      cur.method = method;
    } else if (relation === cur.relation && METHOD_WEIGHT[method] > METHOD_WEIGHT[cur.method]) {
      cur.method = method;
    }
    if (!cur.detections.includes(d)) cur.detections.push(d);
    cur.scores.push(score);
    if (via) cur.via.add(via);
    cur.manual ||= manual;
  };

  for (const d of detections.slice(0, MAX_DETECTIONS)) {
    const res = resolveDetection(d, index);
    if (!res) continue;
    const base = (d.source === "manual" ? 1 : d.confidence) * METHOD_WEIGHT[res.method];
    add(res.brand, "direct", res.method, d, base);

    // Up: climb the whole ownership chain (Ring -> Amazon.com, Inc. / Amazon, Pure
    // Encapsulations -> Nestlé Health Science -> Nestlé) so parent-company cases are never missed.
    // Each step remembers the owned brands below it, so a grandparent's lawsuit can be
    // checked for a mention of the brand itself or any company in between.
    const seen = new Set([res.brand.id]);
    let chain: Array<{ brand: Brand; below: Brand[] }> = [{ brand: res.brand, below: [] }];
    let score = base;
    for (let depth = 0; depth < MAX_CHAIN_DEPTH && chain.length; depth++) {
      score *= RELATION_WEIGHT.parent;
      const next: typeof chain = [];
      for (const { brand: b, below } of chain) for (const parent of parentBrandsOf(index, b)) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        const path = [...below, b];
        add(parent, "parent", res.method, d, score, res.brand.name, path);
        next.push({ brand: parent, below: path });
      }
      chain = next;
    }
    // Down: a detected company surfaces its brands' cases, through every level it owns.
    // Always applicable: the company the user named owns the brand that was sued.
    let frontier = [res.brand];
    score = base;
    for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length; depth++) {
      score *= RELATION_WEIGHT.subsidiary;
      const next: Brand[] = [];
      for (const b of frontier) for (const child of childBrandsOf(index, b)) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        add(child, "subsidiary", res.method, d, score, res.brand.name);
        next.push(child);
      }
      frontier = next;
    }
  }

  const kept = [...acc.values()]
    .map((a) => ({ ...a, confidence: combine(a.scores) }))
    .filter((a) => a.manual || a.confidence >= minConfidence);

  const casesByBrand = await (options.casesByBrand ?? findCasesByBrandIds)(kept.map((a) => a.brand.id));
  const active = new Set(ACTIVE_STATUSES);
  if (options.activeOnly) {
    for (const [id, list] of casesByBrand) casesByBrand.set(id, list.filter((c) => active.has(c.status)));
  }

  // Parent-company lawsuits apply only when their filings name the user's brand (or a company
  // between it and the parent). "Walsh v. PepsiCo" naming The Gatorade Company applies to
  // Gatorade, not to Cheetos.
  const parentCaseIds = [
    ...new Set(kept.filter((a) => a.relation === "parent").flatMap((a) => (casesByBrand.get(a.brand.id) ?? []).map((c) => c.id))),
  ];
  const evidence = parentCaseIds.length
    ? await (options.caseEvidence ?? getCaseEvidence)(parentCaseIds)
    : new Map<string, CaseEvidence>();

  // A case linked to several matched brands is shown once, under the closest relation.
  kept.sort((a, b) => RELATION_RANK[a.relation] - RELATION_RANK[b.relation] || b.confidence - a.confidence);
  const shownCases = new Set<string>();
  const results: RankedBrandMatch[] = [];
  for (const a of kept) {
    let cases: CaseSummary[] = (casesByBrand.get(a.brand.id) ?? []).filter((c) => !shownCases.has(c.id));
    let mentions: Record<string, string> | undefined;
    let unverifiedCount: number | undefined;
    if (a.relation === "parent") {
      mentions = {};
      unverifiedCount = 0;
      const below = [...a.viaBrands.values()];
      cases = cases.filter((c) => {
        const found = mentionedBrand(evidence.get(c.id)?.text ?? c.caseName ?? "", below);
        if (found) mentions![c.id] = found;
        else unverifiedCount!++;
        return Boolean(found);
      });
    }
    if (!cases.length && !unverifiedCount) continue;
    for (const c of cases) shownCases.add(c.id);
    const via = [...a.via].filter((v) => v !== a.brand.name);
    results.push({
      brand: a.brand,
      detections: a.detections,
      cases,
      relation: a.relation,
      via,
      method: a.method,
      confidence: round2(a.manual ? Math.max(a.confidence, 0.99) : a.confidence),
      ...(mentions ? { mentions, unverifiedCount } : {}),
    });
  }

  const openCount = (m: RankedBrandMatch) => m.cases.filter((c) => c.status === "claims_open").length;
  return results.sort(
    (a, b) =>
      Number(openCount(b) > 0) - Number(openCount(a) > 0) ||
      openCount(b) - openCount(a) ||
      b.cases.length - a.cases.length ||
      RELATION_RANK[a.relation] - RELATION_RANK[b.relation] ||
      b.confidence - a.confidence ||
      a.brand.name.localeCompare(b.brand.name),
  );
}
