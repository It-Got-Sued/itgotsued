import { normalizeBrandKey } from "@/lib/repo/brands";
import { findCasesByBrandIds } from "@/lib/repo/cases";
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
// Then expand via parent company both ways and attach cases.

export type MatchMethod = "exact" | "alias" | "compact" | "token" | "fuzzy";
/** direct = the detected brand; parent = its parent company; subsidiary = a brand the detected company owns. */
export type BrandRelation = "direct" | "parent" | "subsidiary";

export interface RankedBrandMatch extends BrandMatch {
  relation: BrandRelation;
  /** Display names of the directly detected brands that led here (for parent/subsidiary). */
  via: string[];
  method: MatchMethod;
  confidence: number;
}

export interface MatchOptions {
  /** Only keep cases in ACTIVE_STATUSES (filed, certified, settlement_pending, claims_open). */
  activeOnly?: boolean;
  /** Minimum combined confidence for non-manual detections. */
  minConfidence?: number;
  /** Injected for tests; defaults to the brands table. */
  index?: BrandIndex;
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
const RELATION_WEIGHT: Record<BrandRelation, number> = { direct: 1, parent: 0.95, subsidiary: 0.75 };
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
  index: BrandIndex = getBrandIndex(),
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
  manual: boolean;
}

export function matchDetections(detections: BrandDetection[], options: MatchOptions = {}): RankedBrandMatch[] {
  const index = options.index ?? getBrandIndex();
  const minConfidence = options.minConfidence ?? MIN_MATCH_CONFIDENCE;
  const acc = new Map<string, Accum>();

  const add = (brand: Brand, relation: BrandRelation, method: MatchMethod, d: BrandDetection, score: number, via?: string) => {
    const cur = acc.get(brand.id);
    const manual = d.source === "manual";
    if (!cur) {
      acc.set(brand.id, {
        brand, relation, method, detections: [d], scores: [score], via: new Set(via ? [via] : []), manual,
      });
      return;
    }
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

    // Up: parent company chain (Dasani -> The Coca-Cola Company), max 3 levels.
    const seen = new Set([res.brand.id]);
    let frontier = [res.brand];
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
      const next: Brand[] = [];
      for (const b of frontier) for (const parent of parentBrandsOf(index, b)) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        add(parent, "parent", res.method, d, base * RELATION_WEIGHT.parent, res.brand.name);
        next.push(parent);
      }
      frontier = next;
    }
    // Down: a detected company surfaces its brands' cases (one level).
    for (const child of childBrandsOf(index, res.brand)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      add(child, "subsidiary", res.method, d, base * RELATION_WEIGHT.subsidiary, res.brand.name);
    }
  }

  const kept = [...acc.values()]
    .map((a) => ({ ...a, confidence: combine(a.scores) }))
    .filter((a) => a.manual || a.confidence >= minConfidence);

  const casesByBrand = findCasesByBrandIds(kept.map((a) => a.brand.id));
  const active = new Set(ACTIVE_STATUSES);

  // A case linked to several matched brands is shown once, under the closest relation.
  kept.sort((a, b) => RELATION_RANK[a.relation] - RELATION_RANK[b.relation] || b.confidence - a.confidence);
  const shownCases = new Set<string>();
  const results: RankedBrandMatch[] = [];
  for (const a of kept) {
    let cases: CaseSummary[] = casesByBrand.get(a.brand.id) ?? [];
    if (options.activeOnly) cases = cases.filter((c) => active.has(c.status));
    cases = cases.filter((c) => !shownCases.has(c.id));
    if (!cases.length) continue;
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
