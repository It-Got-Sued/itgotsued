import { listBrands, normalizeBrandKey } from "@/lib/repo/brands";
import type { Brand } from "@/lib/types";
import { companyKey, compactKey, tokensOf } from "./normalize";

// In-memory lookup structure over the brands table. Rebuilt every INDEX_TTL_MS so newly
// seeded brands show up without a restart.

export type KeyKind = "exact" | "alias";

export interface BrandIndex {
  brands: Brand[];
  byId: Map<string, Brand>;
  /** normalized key -> brands, with how the key was derived (name/normalized vs alias). */
  byKey: Map<string, Array<{ brand: Brand; kind: KeyKind }>>;
  /** hyphen-free key -> brands (only non-ambiguous exact keys). */
  byCompact: Map<string, Array<{ brand: Brand; kind: KeyKind }>>;
  /** company key of a parent_company value -> child brands. */
  childrenByCompany: Map<string, Brand[]>;
  /** company key -> brands representing that company (by name/normalized/alias). */
  brandsByCompany: Map<string, Brand[]>;
  /** Longest brand key in tokens (bounds span search). */
  maxKeyTokens: number;
}

const INDEX_TTL_MS = 30_000;
let cached: { index: BrandIndex; at: number } | null = null;

let inflight: Promise<BrandIndex> | null = null;

export async function getBrandIndex(): Promise<BrandIndex> {
  if (cached && Date.now() - cached.at <= INDEX_TTL_MS) return cached.index;
  // One rebuild at a time; concurrent requests share it.
  inflight ??= listBrands()
    .then((brands) => {
      const index = buildBrandIndex(brands);
      cached = { index, at: Date.now() };
      return index;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function invalidateBrandIndex(): void {
  cached = null;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildBrandIndex(brands: Brand[]): BrandIndex {
  const byId = new Map<string, Brand>();
  const byKey = new Map<string, Array<{ brand: Brand; kind: KeyKind }>>();
  const byCompact = new Map<string, Array<{ brand: Brand; kind: KeyKind }>>();
  const childrenByCompany = new Map<string, Brand[]>();
  const brandsByCompany = new Map<string, Brand[]>();
  let maxKeyTokens = 1;

  const addKey = (key: string, brand: Brand, kind: KeyKind) => {
    if (!key) return;
    const list = byKey.get(key) ?? [];
    if (!list.some((e) => e.brand.id === brand.id)) list.push({ brand, kind });
    byKey.set(key, list);
    const ck = compactKey(key);
    const clist = byCompact.get(ck) ?? [];
    if (!clist.some((e) => e.brand.id === brand.id)) clist.push({ brand, kind });
    byCompact.set(ck, clist);
    maxKeyTokens = Math.max(maxKeyTokens, tokensOf(key).length);
  };

  for (const brand of brands) {
    byId.set(brand.id, brand);
    addKey(brand.normalized, brand, "exact");
    addKey(normalizeBrandKey(brand.name), brand, "exact");
    for (const alias of brand.aliases) addKey(normalizeBrandKey(alias), brand, "alias");

    const companyKeys = new Set([companyKey(brand.name), companyKey(brand.normalized)]);
    for (const alias of brand.aliases) companyKeys.add(companyKey(alias));
    for (const k of companyKeys) if (k) push(brandsByCompany, k, brand);
    if (brand.parentCompany) push(childrenByCompany, companyKey(brand.parentCompany), brand);
  }

  // Exact keys win over alias keys when both point at the key (an alias that collides with
  // another brand's real name must not shadow it).
  for (const map of [byKey, byCompact]) {
    for (const [k, list] of map) {
      if (list.some((e) => e.kind === "exact")) map.set(k, list.filter((e) => e.kind === "exact"));
    }
  }

  return { brands, byId, byKey, byCompact, childrenByCompany, brandsByCompany, maxKeyTokens };
}

/**
 * Brands that stand for `brand.parentCompany`: the company entity itself (e.g. "Amazon.com, Inc.")
 * plus the company's namesake brand ("Amazon" for Ring, "Coca-Cola" for Dasani). Lawsuits against
 * the parent are often linked to the namesake brand, so both are climbed so none are missed.
 */
export function parentBrandsOf(index: BrandIndex, brand: Brand): Brand[] {
  if (!brand.parentCompany) return [];
  const out = new Map<string, Brand>();
  for (const e of index.byKey.get(normalizeBrandKey(brand.parentCompany)) ?? []) {
    if (e.kind === "exact") out.set(e.brand.id, e.brand);
  }
  for (const b of index.brandsByCompany.get(companyKey(brand.parentCompany)) ?? []) out.set(b.id, b);
  out.delete(brand.id);
  return [...out.values()];
}

/**
 * A product line named after its own parent ("Coca-Cola" soda under "The Coca-Cola Company",
 * "Amazon" under "Amazon.com, Inc."), as opposed to the company entity.
 */
function isNamesakeProduct(b: Brand): boolean {
  if (!b.parentCompany) return false;
  if (normalizeBrandKey(b.parentCompany) === normalizeBrandKey(b.name)) return false;
  const parentKey = companyKey(b.parentCompany);
  return companyKey(b.name) === parentKey || b.aliases.some((a) => companyKey(a) === parentKey);
}

/**
 * Brands whose parent_company is this brand (e.g. The Coca-Cola Company -> Dasani,
 * Nestlé -> Nestlé Health Science). Call again on the results to walk further down.
 */
export function childBrandsOf(index: BrandIndex, brand: Brand): Brand[] {
  // "Coca-Cola" soda is a product line, not the company: expanding it downward would
  // surface siblings (Dasani for a Coke drinker).
  if (isNamesakeProduct(brand)) return [];
  const keys = new Set([companyKey(brand.name), companyKey(brand.normalized)]);
  const out = new Map<string, Brand>();
  for (const k of keys) for (const child of index.childrenByCompany.get(k) ?? []) {
    if (child.id !== brand.id) out.set(child.id, child);
  }
  return [...out.values()];
}
