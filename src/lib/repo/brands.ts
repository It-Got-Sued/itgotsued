import { query, queryOne } from "@/lib/db";
import type { Brand } from "@/lib/types";

type Row = Record<string, unknown>;

export function toBrand(r: Row): Brand {
  return {
    id: r.id as string,
    name: r.name as string,
    normalized: r.normalized as string,
    parentCompany: (r.parent_company as string) ?? null,
    aliases: (r.aliases as string[]) ?? [],
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

export async function listBrands(): Promise<Brand[]> {
  return (await query("SELECT * FROM brands ORDER BY name")).map(toBrand);
}

export async function countBrands(): Promise<number> {
  return (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM brands WHERE NOT is_sample"))?.n ?? 0;
}

export async function getBrandByNormalized(normalized: string): Promise<Brand | null> {
  const r = await queryOne("SELECT * FROM brands WHERE normalized = $1", [normalized]);
  return r ? toBrand(r) : null;
}

/** Brands whose parent_company matches the given name (e.g. Coca-Cola -> Dasani). */
export async function getBrandsByParent(parentCompany: string): Promise<Brand[]> {
  return (await query("SELECT * FROM brands WHERE parent_company = $1", [parentCompany])).map(toBrand);
}

export async function upsertBrand(
  brand: Omit<Brand, "id"> & { id?: string; isSample?: boolean },
): Promise<Brand> {
  const id = brand.id ?? `brand_${brand.normalized}`;
  const r = await queryOne(
    `INSERT INTO brands (id, name, normalized, parent_company, aliases, category, is_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (normalized) DO UPDATE SET
       name = EXCLUDED.name, parent_company = EXCLUDED.parent_company,
       aliases = EXCLUDED.aliases, category = EXCLUDED.category, is_sample = EXCLUDED.is_sample
     RETURNING *`,
    [id, brand.name, brand.normalized, brand.parentCompany, brand.aliases, brand.category, brand.isSample ?? false],
  );
  return toBrand(r!);
}

export async function addToWatchlist(email: string, brandId: string): Promise<void> {
  await query("INSERT INTO watchlist (email, brand_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    email.trim().toLowerCase(),
    brandId,
  ]);
}
