// Seed the brand dictionary (real consumer brands, parents and aliases) from data/brands.json.
//   npm run db:seed   (runs this, then seed-sample)
// Idempotent: upserts on the normalized brand key.
import "./_env";
import fs from "node:fs";
import { normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";

interface BrandSeed {
  name: string;
  parentCompany: string | null;
  category: string | null;
  aliases: string[];
}

export function seedBrands(file = "data/brands.json"): number {
  const brands = JSON.parse(fs.readFileSync(file, "utf8")) as BrandSeed[];
  for (const b of brands) {
    upsertBrand({
      name: b.name,
      normalized: normalizeBrandKey(b.name),
      parentCompany: b.parentCompany ?? null,
      aliases: b.aliases ?? [],
      category: b.category ?? null,
    });
  }
  return brands.length;
}

console.log(`Seeded ${seedBrands()} brands from data/brands.json`);
