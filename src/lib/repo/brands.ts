import { getDb } from "@/lib/db";
import type { Brand } from "@/lib/types";

type Row = Record<string, unknown>;

function toBrand(r: Row): Brand {
  return {
    id: r.id as string,
    name: r.name as string,
    normalized: r.normalized as string,
    parentCompany: (r.parent_company as string) ?? null,
    aliases: JSON.parse((r.aliases as string) ?? "[]"),
    category: (r.category as string) ?? null,
  };
}

export function normalizeBrandKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™©]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function listBrands(): Brand[] {
  return (getDb().prepare("SELECT * FROM brands ORDER BY name").all() as Row[]).map(toBrand);
}

export function getBrandByNormalized(normalized: string): Brand | null {
  const r = getDb()
    .prepare("SELECT * FROM brands WHERE normalized = $normalized")
    .get({ normalized }) as Row | undefined;
  return r ? toBrand(r) : null;
}

/** Brands whose parent_company matches the given brand's name (e.g. Coca-Cola -> Dasani). */
export function getBrandsByParent(parentCompany: string): Brand[] {
  return (
    getDb()
      .prepare("SELECT * FROM brands WHERE parent_company = $parentCompany")
      .all({ parentCompany }) as Row[]
  ).map(toBrand);
}

export function upsertBrand(brand: Omit<Brand, "id"> & { id?: string }): Brand {
  const db = getDb();
  const id = brand.id ?? `brand_${brand.normalized}`;
  db.prepare(
    `INSERT INTO brands (id, name, normalized, parent_company, aliases, category)
     VALUES ($id, $name, $normalized, $parent, $aliases, $category)
     ON CONFLICT(normalized) DO UPDATE SET
       name = excluded.name, parent_company = excluded.parent_company,
       aliases = excluded.aliases, category = excluded.category`,
  ).run({
    id,
    name: brand.name,
    normalized: brand.normalized,
    parent: brand.parentCompany,
    aliases: JSON.stringify(brand.aliases),
    category: brand.category,
  });
  return getBrandByNormalized(brand.normalized)!;
}

export function addToWatchlist(email: string, brandId: string): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO watchlist (email, brand_id) VALUES ($email, $brandId)")
    .run({ email: email.trim().toLowerCase(), brandId });
}
