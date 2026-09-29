// Seed the brand dictionary (real consumer brands, parents and aliases) from data/brands.json.
//   npm run db:seed   (runs this, then seed-sample)
// Idempotent: upserts on the normalized brand key.
// Every parentCompany also gets its own company row (e.g. "Amazon.com, Inc." for Ring), so
// lawsuits against the parent can be linked to it and the matcher can climb Ring -> Amazon.
import "./_env";
import fs from "node:fs";
import { normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import { closePool } from "@/lib/db";

interface BrandSeed {
  name: string;
  parentCompany: string | null;
  category: string | null;
  aliases: string[];
}

export async function seedBrands(file = "data/brands.json"): Promise<number> {
  const brands = JSON.parse(fs.readFileSync(file, "utf8")) as BrandSeed[];
  for (const b of brands) {
    await upsertBrand({
      name: b.name,
      normalized: normalizeBrandKey(b.name),
      parentCompany: b.parentCompany ?? null,
      aliases: b.aliases ?? [],
      category: b.category ?? null,
    });
  }
  // Company rows for parents that are not already brands. Parent-of-parent chains come from
  // brands.json entries whose own parentCompany is set (Nestlé Health Science -> Nestlé).
  const known = new Set(brands.map((b) => normalizeBrandKey(b.name)));
  const companies = new Set<string>();
  for (const b of brands) {
    const parent = b.parentCompany?.trim();
    if (parent && !known.has(normalizeBrandKey(parent))) companies.add(parent);
  }
  for (const name of companies) {
    await upsertBrand({ name, normalized: normalizeBrandKey(name), parentCompany: null, aliases: [], category: "company" });
  }
  return brands.length + companies.size;
}

seedBrands()
  .then((n) => console.log(`Seeded ${n} brands and parent companies from data/brands.json`))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
