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

export function getBrandIndex(): BrandIndex {
  const now = Date.now();
  if (!cached || now - cached.at > INDEX_TTL_MS) cached = { index: buildBrandIndex(listBrands()), at: now };
  return cached.index;
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

/** Brand entities that represent `brand.parentCompany` (e.g. Dasani -> The Coca-Cola Company). */
export function parentBrandsOf(index: BrandIndex, brand: Brand): Brand[] {
  if (!brand.parentCompany) return [];
  const exact = index.byKey.get(normalizeBrandKey(brand.parentCompany)) ?? [];
  const exactBrands = exact.filter((e) => e.kind === "exact").map((e) => e.brand);
  if (exactBrands.length) return exactBrands.filter((b) => b.id !== brand.id);
  // Fuzzy company match ("Coca-Cola" for "The Coca-Cola Company"), but never a sibling:
  // a product brand that itself sits under the same parent (Coke soda for Dasani).
  const parentKey = companyKey(brand.parentCompany);
  return (index.brandsByCompany.get(parentKey) ?? []).filter(
    (b) => b.id !== brand.id && !(b.parentCompany && companyKey(b.parentCompany) === parentKey && isProductBrand(b)),
  );
}

/** A brand named after its own parent company is the product line, not the company entity. */
function isProductBrand(b: Brand): boolean {
  return Boolean(b.parentCompany) && normalizeBrandKey(b.parentCompany!) !== normalizeBrandKey(b.name);
}

/** Brands whose parent_company is this brand (e.g. The Coca-Cola Company -> Dasani). */
export function childBrandsOf(index: BrandIndex, brand: Brand): Brand[] {
  // "Coca-Cola" soda whose parent is "The Coca-Cola Company" is a product line, not the
  // company: expanding it downward would surface siblings (Dasani for a Coke drinker).
  if (isProductBrand(brand)) return [];
  const keys = new Set([companyKey(brand.name), companyKey(brand.normalized)]);
  const out = new Map<string, Brand>();
  for (const k of keys) for (const child of index.childrenByCompany.get(k) ?? []) {
    if (child.id !== brand.id) out.set(child.id, child);
  }
  return [...out.values()];
}
